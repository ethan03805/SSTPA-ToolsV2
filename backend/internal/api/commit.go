// Staged-edit Commit pipeline (SRS §5.6.6.8, §6.3.5.6, §3.3.9.1).
//
// All Frontend and Add-on Tool mutations arrive here as a staged delta and
// execute inside ONE ACID transaction: validation → mutation → ownership
// handling → notification message generation. If any required step fails the
// whole transaction rolls back (SRS §5.6.6.8.1).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

type commitOperation struct {
	Op string `json:"op"` // createNode | updateNode | deleteNode | createRelationship | deleteRelationship | transferOwnership

	// createNode
	TempID string         `json:"tempId,omitempty"`
	Label  string         `json:"label,omitempty"`
	Props  map[string]any `json:"properties,omitempty"`

	// updateNode / deleteNode / transferOwnership
	HID string `json:"hid,omitempty"`

	// transferOwnership (SRS §5.6.6.8.2): explicit user-initiated ownership change
	NewOwner string `json:"newOwner,omitempty"`

	// relationships; source/target accept an HID or a "$tempId" reference
	Type      string `json:"type,omitempty"`
	SourceHID string `json:"sourceHid,omitempty"`
	TargetHID string `json:"targetHid,omitempty"`
}

type commitRequest struct {
	SoIHID     string            `json:"soiHid"` // scope of the commit; "" for hierarchy-level commits
	ToolID     string            `json:"toolId"` // invoking tool, e.g. "gui.datadrawer", "sstpa.loss"
	Operations []commitOperation `json:"operations"`
}

type commitResponse struct {
	CommitID             string            `json:"commitId"`
	NodesChanged         int               `json:"nodesChanged"`
	RelationshipsChanged int               `json:"relationshipsChanged"`
	MessagesGenerated    int               `json:"messagesGenerated"`
	RecipientsNotified   []string          `json:"recipientsNotified"`
	CreatedNodes         map[string]string `json:"createdNodes"` // tempId → HID
}

// systemManagedProps may never be set directly by clients (SRS §3.3.9.1,
// §3.3.4.6.1).
var systemManagedProps = map[string]bool{
	"HID": true, "uuid": true, "TypeName": true,
	"Owner": true, "OwnerEmail": true, "Creator": true, "CreatorEmail": true,
	"Created": true, "LastTouch": true, "VersionID": true,
	"SoIIndex": true, "Sequence": true,
	"TraceVersion": true, "TraceStatus": true, "TraceSessionID": true,
}

func (s *Server) handleCommit(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	var req commitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Operations) == 0 {
		writeError(w, http.StatusBadRequest, "invalid commit payload", "operations are required")
		return
	}

	// Pre-transaction static validation of relationship ops that reference
	// existing nodes (full validation repeats inside the transaction).
	for _, op := range req.Operations {
		switch op.Op {
		case "createNode":
			if !s.schema.ValidLabel(op.Label) {
				writeError(w, http.StatusBadRequest, "unknown node label", op.Label)
				return
			}
		case "createRelationship", "deleteRelationship":
			if op.Type == "" || op.SourceHID == "" || op.TargetHID == "" {
				writeError(w, http.StatusBadRequest, "relationship ops need type, sourceHid, targetHid", "")
				return
			}
			// Relationship types must exist in the canonical schema before they
			// are ever interpolated into Cypher (injection guard; SRS §3.3.4).
			if len(s.schema.RelationshipDefs(op.Type)) == 0 {
				writeError(w, http.StatusBadRequest, "unknown relationship type", op.Type)
				return
			}
			// AT_RELATES_TO is managed exclusively by the Loss Tool (§3.3.4.11).
			if op.Type == "AT_RELATES_TO" && req.ToolID != "sstpa.loss" {
				writeError(w, http.StatusForbidden,
					"[:AT_RELATES_TO] edges are created and managed exclusively by the Loss Tool (SRS §3.3.4.11)", req.ToolID)
				return
			}
		case "updateNode", "deleteNode":
			if op.HID == "" {
				writeError(w, http.StatusBadRequest, op.Op+" needs hid", "")
				return
			}
		case "transferOwnership":
			if op.HID == "" || op.NewOwner == "" {
				writeError(w, http.StatusBadRequest, "transferOwnership needs hid and newOwner", "")
				return
			}
		default:
			writeError(w, http.StatusBadRequest, "unknown operation", op.Op)
			return
		}
	}

	commitID := uuid.NewString()
	result, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		return s.executeCommit(r, tx, user, commitID, req)
	})
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "commit rejected", err.Error())
		return
	}
	// Counters increment after the transaction commits; ExecuteWrite may retry
	// the closure on transient errors, which would over-count inside it.
	if resp, ok := result.(*commitResponse); ok {
		for i := 0; i < resp.MessagesGenerated; i++ {
			s.metrics.OwnershipNotifications.Inc()
		}
	}
	writeJSON(w, http.StatusOK, result)
}

// executeCommit runs the full staged delta inside one managed transaction.
func (s *Server) executeCommit(r *http.Request, tx neo4j.ManagedTransaction, user UserIdentity, commitID string, req commitRequest) (*commitResponse, error) {
	ctx := r.Context()
	resp := &commitResponse{CommitID: commitID, CreatedNodes: map[string]string{}}

	// affected tracks owner-notification bookkeeping per node HID (§5.6.6.8.1).
	type nodeChange struct {
		Owner, OwnerEmail string
		Changes           []string
		OldOwner          string
		NewOwner          string
		OwnershipChanged  bool
	}
	affected := map[string]*nodeChange{}
	touch := func(hid, owner, ownerEmail, change string) *nodeChange {
		nc, ok := affected[hid]
		if !ok {
			nc = &nodeChange{Owner: owner, OwnerEmail: ownerEmail}
			affected[hid] = nc
		}
		nc.Changes = append(nc.Changes, change)
		return nc
	}
	// traceSoIs collects every SoI key whose trace data moved, so derivation
	// recompute (§3.3.4.6.2/.3) runs even when the commit carries no soiHid.
	traceSoIs := map[string]bool{}
	markTrace := func(soiIndex string) {
		if soiIndex != "" {
			traceSoIs[soiIndex] = true
		}
	}

	resolveHID := func(ref string) string {
		if strings.HasPrefix(ref, "$") {
			return resp.CreatedNodes[strings.TrimPrefix(ref, "$")]
		}
		return ref
	}

	for _, op := range req.Operations {
		switch op.Op {

		case "createNode":
			hid, err := s.assignHID(ctx, tx, op.Label, req.SoIHID, op.Props)
			if err != nil {
				return nil, err
			}
			props, err := s.buildCreateProps(op.Label, op.Props, user, hid)
			if err != nil {
				return nil, err
			}
			q := fmt.Sprintf("CREATE (n:SSTPA:%s) SET n = $props, n.Created = datetime(), n.LastTouch = datetime()", op.Label)
			if _, err := tx.Run(ctx, q, map[string]any{"props": props}); err != nil {
				return nil, err
			}
			if op.TempID != "" {
				resp.CreatedNodes[op.TempID] = hid.String()
			}
			resp.NodesChanged++
			// Creator == current user: no notification needed for creations.

			// Every new (:System) receives one default (:Purpose),
			// (:Environment) and (:State) (SRS §3.3.3.1, §3.3.4.2; note I-9).
			if op.Label == "System" {
				n, err := s.createSystemDefaults(ctx, tx, user, hid)
				if err != nil {
					return nil, err
				}
				resp.NodesChanged += n
			}

		case "updateNode":
			cur, err := fetchNodeForUpdate(ctx, tx, op.HID)
			if err != nil {
				return nil, err
			}
			if cur.readOnly {
				return nil, fmt.Errorf("node %s is read-only reference data (SRS §3.4.6.3)", op.HID)
			}
			setProps := map[string]any{}
			for k, v := range op.Props {
				if systemManagedProps[k] {
					return nil, fmt.Errorf("property %s on %s is system-managed and cannot be set by clients", k, op.HID)
				}
				cast, err := s.castProperty(cur.label, k, v)
				if err != nil {
					return nil, fmt.Errorf("node %s: %w", op.HID, err)
				}
				// Admins (non-root) may only commit admin-only properties (§3.2).
				if user.IsAdmin && !user.IsRootAdmin {
					if def, ok := s.schema.PropertyDef(cur.label, k); ok &&
						!strings.Contains(strings.ToLower(def.Edit), "admin") {
						return nil, fmt.Errorf("Admins may only commit Admin-only properties; %s is not (SRS §3.2)", k)
					}
				}
				setProps[k] = cast
			}
			nc := touch(op.HID, cur.owner, cur.ownerEmail, "properties updated: "+joinKeys(setProps))

			params := map[string]any{"hid": op.HID, "props": setProps}
			ownershipClause := ""
			// Ownership transfer on non-owner property commit (§3.2, §3.3.9.1).
			// Example Data owned by "SSTPA Tools" never changes ownership (§3).
			// Admins cannot own data (§3.2).
			if cur.owner != user.UserName && cur.owner != "SSTPA Tools" && (!user.IsAdmin || user.IsRootAdmin) {
				ownershipClause = ", n.Owner = $newOwner, n.OwnerEmail = $newOwnerEmail"
				params["newOwner"] = user.UserName
				params["newOwnerEmail"] = user.Email
				nc.OwnershipChanged = true
				nc.OldOwner = cur.owner
				nc.NewOwner = user.UserName
				nc.Changes = append(nc.Changes, fmt.Sprintf("ownership: %s → %s", cur.owner, user.UserName))
			}
			q := "MATCH (n:SSTPA {HID: $hid}) SET n += $props, n.LastTouch = datetime()" + ownershipClause
			if _, err := tx.Run(ctx, q, params); err != nil {
				return nil, err
			}
			resp.NodesChanged++

		case "deleteNode":
			cur, err := fetchNodeForUpdate(ctx, tx, op.HID)
			if err != nil {
				return nil, err
			}
			if cur.readOnly {
				return nil, fmt.Errorf("node %s is read-only reference data (SRS §3.4.6.3)", op.HID)
			}
			touch(op.HID, cur.owner, cur.ownerEmail, "node deleted")
			// Invalidate trace relationships whose analytical State context is
			// being removed (SRS §3.3.4.6.1 TraceStatus = INVALIDATED).
			if cur.label == "State" {
				if _, err := tx.Run(ctx, `
					MATCH (a:SSTPA)-[rel:HOLDS|TRANSPORTS|USES]->(b:Asset)
					WHERE rel.TraceStateHID = $hid AND rel.TraceStatus = 'CURRENT'
					SET rel.TraceStatus = 'INVALIDATED'`,
					map[string]any{"hid": op.HID}); err != nil {
					return nil, err
				}
				markTrace(cur.soiIndex)
			}
			// Deleting a traced entity or an Asset removes its trace edges with
			// it; derived criticality/assurance and protection Requirements for
			// the SoI must be recomputed (§3.3.4.6.2/.3).
			if cur.label == "Interface" || cur.label == "SystemFunction" ||
				cur.label == "Component" || cur.label == "Asset" {
				markTrace(cur.soiIndex)
			}
			if _, err := tx.Run(ctx,
				`MATCH (n:SSTPA {HID: $hid}) DETACH DELETE n`,
				map[string]any{"hid": op.HID}); err != nil {
				return nil, err
			}
			resp.NodesChanged++

		case "createRelationship":
			src, tgt := resolveHID(op.SourceHID), resolveHID(op.TargetHID)
			if src == "" || tgt == "" {
				return nil, fmt.Errorf("unresolved relationship endpoint (%s → %s)", op.SourceHID, op.TargetHID)
			}
			srcInfo, err := fetchNodeForUpdate(ctx, tx, src)
			if err != nil {
				return nil, err
			}
			tgtInfo, err := fetchNodeForUpdate(ctx, tx, tgt)
			if err != nil {
				return nil, err
			}
			// [:REFERENCES] to reference data is the one authorized Core→REF link.
			if tgtInfo.readOnly && op.Type != "REFERENCES" {
				return nil, fmt.Errorf("reference data may only be linked via [:REFERENCES] (SRS §3.4.6.3)")
			}
			if v := s.validateRelInTx(ctx, tx, op.Type, srcInfo, tgtInfo, src, tgt); v != "" {
				return nil, fmt.Errorf("%s", v)
			}
			relProps, err := s.castRelProps(op.Type, op.Props)
			if err != nil {
				return nil, err
			}
			if op.Type == "AT_RELATES_TO" {
				relProps, err = prepareAttackTreeRel(ctx, tx, src, tgt, srcInfo, tgtInfo, relProps)
				if err != nil {
					return nil, err
				}
			}
			if isTraceRel(op.Type) {
				relProps, err = prepareTraceRel(ctx, tx, src, tgt, commitID, relProps)
				if err != nil {
					return nil, err
				}
			}
			if op.Type == "TRANSITIONS_TO" {
				if err := validateTransitionProps(ctx, tx, relProps, srcInfo.soiIndex); err != nil {
					return nil, err
				}
			}
			q := fmt.Sprintf(`MATCH (a:SSTPA {HID: $src}) MATCH (b {HID: $tgt})
				CREATE (a)-[rel:%s]->(b) SET rel = $props`, op.Type)
			if _, err := tx.Run(ctx, q,
				map[string]any{"src": src, "tgt": tgt, "props": relProps}); err != nil {
				return nil, err
			}
			touch(src, srcInfo.owner, srcInfo.ownerEmail, fmt.Sprintf("relationship created: -[:%s]-> %s", op.Type, tgt))
			if !tgtInfo.readOnly {
				touch(tgt, tgtInfo.owner, tgtInfo.ownerEmail, fmt.Sprintf("relationship created: %s -[:%s]->", src, op.Type))
			}
			if isTraceRel(op.Type) {
				markTrace(srcInfo.soiIndex)
			}
			resp.RelationshipsChanged++

		case "deleteRelationship":
			src, tgt := resolveHID(op.SourceHID), resolveHID(op.TargetHID)
			srcInfo, err := fetchNodeForUpdate(ctx, tx, src)
			if err != nil {
				return nil, err
			}
			tgtInfo, err := fetchNodeForUpdate(ctx, tx, tgt)
			if err != nil {
				return nil, err
			}
			// Trace relationships are never deleted; they are superseded
			// (§3.3.4.6.1). A TraceStateHID in properties scopes the clear to
			// one matrix cell (§6.5.9.6 Phase 1 "cleared cell").
			if isTraceRel(op.Type) {
				stateHid, _ := op.Props["TraceStateHID"].(string)
				q := fmt.Sprintf(`MATCH (a:SSTPA {HID: $src})-[rel:%s]->(b {HID: $tgt})
					WHERE rel.TraceStatus = 'CURRENT'
					  AND ($state = '' OR rel.TraceStateHID = $state)
					SET rel.TraceStatus = 'SUPERSEDED'`, op.Type)
				if _, err := tx.Run(ctx, q, map[string]any{"src": src, "tgt": tgt, "state": stateHid}); err != nil {
					return nil, err
				}
				markTrace(srcInfo.soiIndex)
			} else {
				if op.Type == "AT_RELATES_TO" {
					lossHID, _ := op.Props["LossHID"].(string)
					if lossHID == "" {
						return nil, fmt.Errorf("deleting [:AT_RELATES_TO] requires properties.LossHID so only one Attack Tree edge is removed (SRS §3.3.4.11)")
					}
					if _, err := tx.Run(ctx, `
						MATCH (a:SSTPA {HID: $src})-[rel:AT_RELATES_TO {LossHID: $lossHID}]->(b {HID: $tgt})
						DELETE rel`, map[string]any{"src": src, "tgt": tgt, "lossHID": lossHID}); err != nil {
						return nil, err
					}
				} else {
					q := fmt.Sprintf(`MATCH (a:SSTPA {HID: $src})-[rel:%s]->(b {HID: $tgt}) DELETE rel`, op.Type)
					if _, err := tx.Run(ctx, q, map[string]any{"src": src, "tgt": tgt}); err != nil {
						return nil, err
					}
				}
			}
			touch(src, srcInfo.owner, srcInfo.ownerEmail, fmt.Sprintf("relationship removed: -[:%s]-> %s", op.Type, tgt))
			if !tgtInfo.readOnly {
				touch(tgt, tgtInfo.owner, tgtInfo.ownerEmail, fmt.Sprintf("relationship removed: %s -[:%s]->", src, op.Type))
			}
			resp.RelationshipsChanged++

		case "transferOwnership":
			// Explicit user-initiated ownership change (SRS §5.6.6.8.2). The
			// destination must be an ACTIVE, non-Admin (:User) or the RootAdmin
			// (Admins cannot own Core Data, SRS §3.2).
			cur, err := fetchNodeForUpdate(ctx, tx, op.HID)
			if err != nil {
				return nil, err
			}
			if cur.readOnly {
				return nil, fmt.Errorf("node %s is read-only reference data (SRS §3.4.6.3)", op.HID)
			}
			if cur.owner == "SSTPA Tools" {
				return nil, fmt.Errorf("example data owned by SSTPA Tools never changes ownership (SRS §3)")
			}
			ores, err := tx.Run(ctx, `
				OPTIONAL MATCH (u:User {UserName: $name})
				OPTIONAL MATCH (ra:RootAdmin {UserName: $name})
				RETURN u.Email AS uEmail, coalesce(u.IsAdmin, false) AS uAdmin,
				       coalesce(u.AccountStatus, 'ACTIVE') AS uStatus,
				       ra.Email AS raEmail`,
				map[string]any{"name": op.NewOwner})
			if err != nil {
				return nil, err
			}
			orec, err := ores.Single(ctx)
			if err != nil {
				return nil, err
			}
			om := orec.AsMap()
			var newEmail string
			if e, ok := om["raEmail"].(string); ok && e != "" {
				newEmail = e
			} else if e, ok := om["uEmail"].(string); ok && e != "" {
				if adm, _ := om["uAdmin"].(bool); adm {
					return nil, fmt.Errorf("ownership cannot transfer to an Admin account (SRS §3.2)")
				}
				if st, _ := om["uStatus"].(string); st != "ACTIVE" {
					return nil, fmt.Errorf("ownership destination %s is not an ACTIVE account", op.NewOwner)
				}
				newEmail = e
			} else {
				return nil, fmt.Errorf("ownership destination user %s not found", op.NewOwner)
			}
			if _, err := tx.Run(ctx, `
				MATCH (n:SSTPA {HID: $hid})
				SET n.Owner = $owner, n.OwnerEmail = $email, n.LastTouch = datetime()`,
				map[string]any{"hid": op.HID, "owner": op.NewOwner, "email": newEmail}); err != nil {
				return nil, err
			}
			nc := touch(op.HID, cur.owner, cur.ownerEmail,
				fmt.Sprintf("ownership: %s → %s", cur.owner, op.NewOwner))
			nc.OwnershipChanged = true
			nc.OldOwner = cur.owner
			nc.NewOwner = op.NewOwner
			resp.NodesChanged++
		}
	}

	// Trace-derived recomputation (§3.3.4.6.2, §3.3.4.6.3) for every SoI whose
	// trace data moved in this commit.
	if req.SoIHID != "" && len(traceSoIs) > 0 {
		if h, err := schema.ParseHID(req.SoIHID); err == nil {
			traceSoIs[h.SoIKey()] = true
		}
	}
	for soiKey := range traceSoIs {
		if err := s.recomputeTraceDerivationsForKey(ctx, tx, user, soiKey, commitID); err != nil {
			return nil, fmt.Errorf("trace derivation recompute failed: %w", err)
		}
	}

	// Ownership notifications (§5.6.6.8.1): aggregate per owner, one message
	// per owner per commit, created in this same transaction.
	byOwner := map[string][]string{}
	ownerEmail := map[string]string{}
	ownerTransfers := map[string][]string{}
	ownerNewOwner := map[string]string{}
	for hid, nc := range affected {
		if nc.Owner == "" || nc.Owner == user.UserName || nc.Owner == "SSTPA Tools" {
			continue
		}
		for _, c := range nc.Changes {
			byOwner[nc.Owner] = append(byOwner[nc.Owner], hid+": "+c)
		}
		ownerEmail[nc.Owner] = nc.OwnerEmail
		if nc.OwnershipChanged {
			ownerTransfers[nc.Owner] = append(ownerTransfers[nc.Owner], hid)
			ownerNewOwner[nc.Owner] = nc.NewOwner
		}
	}
	for owner, changes := range byOwner {
		sort.Strings(changes)
		body := fmt.Sprintf(
			"User %s committed changes affecting data you own.\n\nCommit: %s\n\nChanges:\n%s",
			user.UserName, commitID, strings.Join(changes, "\n"))
		hids := affectedHIDs(changes)
		transferred := ownerTransfers[owner]
		sort.Strings(transferred)
		res, err := tx.Run(ctx, `
			MATCH (u)-[:OWNS_MAILBOX]->(mb:Mailbox) WHERE u.UserName = $owner
			CREATE (m:Message {
				MessageID: randomUUID(),
				Subject: $subject, Body: $body,
				MessageType: 'CHANGE_NOTIFICATION',
				SentAt: datetime(),
				Sender: $sender, SenderEmail: $senderEmail,
				Recipient: $owner, RecipientEmail: $ownerEmail,
				RelatedNodeHIDs: $hids,
				CommitID: $commitId,
				OldOwner: $oldOwner, CurrentOwner: $currentOwner,
				OwnershipTransferredHIDs: $transferredHids,
				ChangeSummary: $changeSummary,
				IsRead: false, IsDeleted: false,
				RequiresApproval: false, ApprovalStatus: 'NOT_APPLICABLE'
			})
			CREATE (mb)-[:HAS_MESSAGE]->(m)
			SET mb.UnreadCount = coalesce(mb.UnreadCount, 0) + 1,
			    mb.LastTouch = datetime()
			RETURN count(m) AS created`,
			map[string]any{
				"owner": owner, "ownerEmail": ownerEmail[owner],
				"subject":     fmt.Sprintf("Change notification: %d change(s) to your data", len(changes)),
				"body":        body,
				"sender":      user.UserName,
				"senderEmail": user.Email,
				"hids":        hids,
				"commitId":    commitID,
				// Structured owner-change fields (§5.6.6.8.1): machine-readable
				// old/current owner where ownership changed in this commit.
				"oldOwner": func() string {
					if len(transferred) > 0 {
						return owner
					}
					return ""
				}(),
				"currentOwner": ownerNewOwner[owner],
				"transferredHids": transferred,
				"changeSummary":   strings.Join(changes, "; "),
			})
		if err != nil {
			return nil, fmt.Errorf("notification creation failed (rolling back commit, SRS §5.6.6.8.1): %w", err)
		}
		single, err := res.Single(ctx)
		if err != nil {
			return nil, err
		}
		if n, _ := single.Get("created"); n.(int64) != 1 {
			return nil, fmt.Errorf("owner %s has no mailbox; notification required, rolling back (SRS §5.6.6.8.1)", owner)
		}
		resp.MessagesGenerated++
		resp.RecipientsNotified = append(resp.RecipientsNotified, owner)
	}
	sort.Strings(resp.RecipientsNotified)
	return resp, nil
}

func joinKeys(m map[string]any) string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, ", ")
}

func affectedHIDs(changes []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, c := range changes {
		if i := strings.Index(c, ":"); i > 0 {
			hid := c[:i]
			if !seen[hid] {
				seen[hid] = true
				out = append(out, hid)
			}
		}
	}
	sort.Strings(out)
	return out
}

var _ = schema.HID{}
