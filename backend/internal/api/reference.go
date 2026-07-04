// External Reference Framework API (SRS §5.6.6.10, §3.4): read-only browsing
// of ATT&CK / ATLAS / NIST 800-53 / EMB3D graphs and property cloning into
// Core Data nodes.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// authorizedCloneSources implements the SRS §3.4.6.1 table. The (:Attack)
// row is widened to include (:AK_Tactic) and (:EMB3D_Vulnerability) to match
// the more specific Attack Tool requirement (§6.5.16.6), which authorizes
// ATT&CK Tactic/Technique/Sub-Technique, ATLAS Technique, and EMB3D
// Vulnerability as clone sources (see REQUIREMENTS-NOTES I-16).
var authorizedCloneSources = map[string][]string{
	"Attack":          {"AK_Tactic", "AK_Technique", "AT_Technique", "EMB3D_Vulnerability"},
	"Countermeasure":  {"AK_Mitigation", "AK_DetectionStrategy", "AK_Analytic", "AT_Mitigation", "EMB3D_CourseOfAction"},
	"SecurityControl": {"NIST_Control", "NIST_Enhancement"},
	"Component":       {"AK_Software", "AK_Asset", "EMB3D_Device"},
	"Hazard":          {"AK_Technique", "AT_Technique", "EMB3D_Vulnerability"},
	"System":          {"AK_Group", "AK_Campaign"},
}

// handleListFrameworks returns the framework root nodes with version metadata
// (SRS §3.4: identified by a framework root node carrying version metadata).
func (s *Server) handleListFrameworks(w http.ResponseWriter, r *http.Request) {
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (n:REF) WHERE n.IsFrameworkRoot = true
			RETURN n.FrameworkName AS frameworkName, n.FrameworkVersion AS frameworkVersion,
			       n.FrameworkDomain AS frameworkDomain, n.Name AS name,
			       toString(n.ImportedAt) AS importedAt, labels(n) AS labels`, nil)
		if err != nil {
			return nil, err
		}
		var out []map[string]any
		for rec.Next(r.Context()) {
			out = append(out, rec.Record().AsMap())
		}
		return out, rec.Err()
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "framework list failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"frameworks": res})
}

// handleReferenceSearch searches reference nodes by ExternalID (exact) or
// Name/description (partial), optionally filtered by framework/label.
func (s *Server) handleReferenceSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, offset := paginate(r, 50, 500)
	externalID := q.Get("externalId")
	text := q.Get("text")
	framework := q.Get("framework")
	label := q.Get("label")

	if externalID == "" && text == "" {
		writeError(w, http.StatusBadRequest, "externalId or text is required", "")
		return
	}
	if label != "" && !isSafeLabel(label) {
		writeError(w, http.StatusBadRequest, "invalid label", label)
		return
	}

	match := "MATCH (n:REF"
	if label != "" {
		match += ":" + label
	}
	match += ") WHERE coalesce(n.IsFrameworkRoot, false) = false"
	params := map[string]any{"limit": limit, "offset": offset}
	if externalID != "" {
		match += " AND n.ExternalID = $eid"
		params["eid"] = externalID
	}
	if text != "" {
		match += ` AND (toLower(n.Name) CONTAINS toLower($text)
			OR toLower(coalesce(n.ShortDescription,'')) CONTAINS toLower($text)
			OR toLower(coalesce(n.LongDescription,'')) CONTAINS toLower($text))`
		params["text"] = text
	}
	if framework != "" {
		match += " AND n.FrameworkName = $fw"
		params["fw"] = framework
	}

	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), match+`
			RETURN n.uuid AS uuid, n.ExternalID AS externalId, n.Name AS name,
			       n.ShortDescription AS shortDescription, n.FrameworkName AS frameworkName,
			       n.FrameworkVersion AS frameworkVersion, n.FrameworkDomain AS frameworkDomain,
			       [l IN labels(n) WHERE l <> 'REF'] AS labels,
			       coalesce(n.IsDeprecated, false) AS isDeprecated,
			       coalesce(n.IsRevoked, false) AS isRevoked
			ORDER BY n.ExternalID SKIP $offset LIMIT $limit`, params)
		if err != nil {
			return nil, err
		}
		var out []map[string]any
		for rec.Next(r.Context()) {
			out = append(out, rec.Record().AsMap())
		}
		return out, rec.Err()
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "reference search failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": res, "limit": limit, "offset": offset})
}

// handleReferenceNode returns one reference node with all properties and its
// outgoing reference-graph relationships.
func (s *Server) handleReferenceNode(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "uuid")
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (n:REF {uuid: $uuid})
			OPTIONAL MATCH (n)-[rel]->(m:REF)
			RETURN n{.*} AS props, [l IN labels(n) WHERE l <> 'REF'] AS labels,
			       collect({type: type(rel), targetUuid: m.uuid, targetExternalId: m.ExternalID,
			                targetName: m.Name}) AS relationships`,
			map[string]any{"uuid": uid})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		return single.AsMap(), nil
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "reference node not found", uid)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

type referenceCloneRequest struct {
	CoreHID       string `json:"coreHid"`       // target Core Data node
	ReferenceUUID string `json:"referenceUuid"` // source reference node
	Overwrite     bool   `json:"overwrite"`     // explicit overwrite authorization (§3.4.6.2)
}

// handleReferenceClone implements SRS §3.4.6.2 clone behavior: copy shared
// properties, set ReferenceID/ReferenceFramework, create [:REFERENCES], never
// modify the reference node.
func (s *Server) handleReferenceClone(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	var req referenceCloneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		req.CoreHID == "" || req.ReferenceUUID == "" {
		writeError(w, http.StatusBadRequest, "coreHid and referenceUuid are required", "")
		return
	}
	res, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (c:SSTPA {HID: $hid})
			MATCH (ref:REF {uuid: $ruuid})
			RETURN c.TypeName AS coreType, c.Name AS coreName,
			       c.ShortDescription AS coreShort, c.LongDescription AS coreLong,
			       c.Owner AS owner, c.OwnerEmail AS ownerEmail,
			       [l IN labels(ref) WHERE l <> 'REF'] AS refLabels,
			       ref.Name AS refName, ref.ShortDescription AS refShort,
			       ref.LongDescription AS refLong, ref.ExternalID AS refExternalId,
			       ref.FrameworkName AS refFramework`,
			map[string]any{"hid": req.CoreHID, "ruuid": req.ReferenceUUID})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, fmt.Errorf("core node or reference node not found")
		}
		m := single.AsMap()
		coreType, _ := m["coreType"].(string)
		refLabels, _ := m["refLabels"].([]any)

		// Authorization table §3.4.6.1.
		allowed := false
		for _, want := range authorizedCloneSources[coreType] {
			for _, l := range refLabels {
				if l == want {
					allowed = true
				}
			}
		}
		if !allowed {
			return nil, fmt.Errorf("(:%s) may not clone from %v (SRS §3.4.6.1)", coreType, refLabels)
		}

		set := map[string]any{
			"ReferenceID":        m["refExternalId"],
			"ReferenceFramework": m["refFramework"],
		}
		copyIf := func(key string, cur, refVal any) {
			curS, _ := cur.(string)
			isDefault := curS == "" || curS == "New" || strings.EqualFold(curS, "null")
			if req.Overwrite || isDefault {
				if rv, ok := refVal.(string); ok && rv != "" {
					set[key] = rv
				}
			}
		}
		copyIf("Name", m["coreName"], m["refName"])
		copyIf("ShortDescription", m["coreShort"], m["refShort"])
		copyIf("LongDescription", m["coreLong"], m["refLong"])

		if _, err := tx.Run(r.Context(), `
			MATCH (c:SSTPA {HID: $hid})
			MATCH (ref:REF {uuid: $ruuid})
			SET c += $set, c.LastTouch = datetime()
			MERGE (c)-[:REFERENCES]->(ref)`,
			map[string]any{"hid": req.CoreHID, "ruuid": req.ReferenceUUID, "set": set}); err != nil {
			return nil, err
		}

		// Ownership notification when cloning onto someone else's node
		// (§3.3.9.1). The created count is verified so a missing mailbox
		// rolls back the whole clone (SRS §5.6.6.8.1).
		owner, _ := m["owner"].(string)
		ownerEmail, _ := m["ownerEmail"].(string)
		messages := 0
		if owner != "" && owner != user.UserName && owner != "SSTPA Tools" {
			nres, err := tx.Run(r.Context(), `
				MATCH (u)-[:OWNS_MAILBOX]->(mb:Mailbox) WHERE u.UserName = $owner
				CREATE (msg:Message {
					MessageID: randomUUID(),
					Subject: 'Change notification: reference cloned onto your node',
					Body: 'User ' + $sender + ' cloned reference ' + $eid + ' onto node ' + $hid + '.',
					MessageType: 'CHANGE_NOTIFICATION', SentAt: datetime(),
					Sender: $sender, SenderEmail: $senderEmail,
					Recipient: $owner, RecipientEmail: $ownerEmail,
					RelatedNodeHIDs: [$hid],
					IsRead: false, IsDeleted: false,
					RequiresApproval: false, ApprovalStatus: 'NOT_APPLICABLE'
				})
				CREATE (mb)-[:HAS_MESSAGE]->(msg)
				SET mb.UnreadCount = coalesce(mb.UnreadCount,0) + 1, mb.LastTouch = datetime()
				RETURN count(msg) AS created`,
				map[string]any{"owner": owner, "ownerEmail": ownerEmail,
					"sender": user.UserName, "senderEmail": user.Email,
					"eid": m["refExternalId"], "hid": req.CoreHID})
			if err != nil {
				return nil, err
			}
			nrec, err := nres.Single(r.Context())
			if err != nil {
				return nil, err
			}
			if n, _ := nrec.AsMap()["created"].(int64); n != 1 {
				return nil, fmt.Errorf("owner %s has no mailbox; notification required, rolling back (SRS §5.6.6.8.1)", owner)
			}
			messages = 1
		}
		return map[string]any{"cloned": set, "messagesGenerated": messages}, nil
	})
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "clone rejected", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func isSafeLabel(l string) bool {
	for _, c := range l {
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_') {
			return false
		}
	}
	return l != ""
}
