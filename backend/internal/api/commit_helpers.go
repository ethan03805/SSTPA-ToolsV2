// Commit pipeline helpers: node lookup, HID assignment (SRS §3.3.8),
// property construction/casting (SRS §3.3.9/§3.3.10), in-transaction
// relationship validation, and trace-derived recomputation (§3.3.4.6.x).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

// timeNow is a seam for tests.
var timeNow = time.Now

type nodeInfo struct {
	label      string
	owner      string
	ownerEmail string
	soiIndex   string
	readOnly   bool
}

// fetchNodeForUpdate reads identity/ownership metadata for a node inside the
// commit transaction. Reference (:REF) nodes report readOnly.
func fetchNodeForUpdate(ctx context.Context, tx neo4j.ManagedTransaction, hid string) (nodeInfo, error) {
	res, err := tx.Run(ctx, `
		MATCH (n {HID: $hid})
		RETURN n.TypeName AS label, n.Owner AS owner, n.OwnerEmail AS ownerEmail,
		       n.SoIIndex AS soi, (n:REF OR coalesce(n._ReadOnly, false)) AS readOnly
		LIMIT 1`,
		map[string]any{"hid": hid})
	if err != nil {
		return nodeInfo{}, err
	}
	single, err := res.Single(ctx)
	if err != nil {
		return nodeInfo{}, fmt.Errorf("node %s not found", hid)
	}
	m := single.AsMap()
	info := nodeInfo{}
	info.label, _ = m["label"].(string)
	info.owner, _ = m["owner"].(string)
	info.ownerEmail, _ = m["ownerEmail"].(string)
	info.soiIndex, _ = m["soi"].(string)
	info.readOnly, _ = m["readOnly"].(bool)
	return info, nil
}

// assignHID computes the next HID for a new node per SRS §3.3.8.
//   - (:Project): index null (empty), sequence 0 — single Capability root.
//   - (:System) at tier 1 (commit-level creation): index = next integer among
//     existing tier-1 systems, sequence 0. Child systems are created only via
//     the dedicated create-from-component endpoint (§3.3.7).
//   - all other labels: index = SoI index of the commit scope, sequence =
//     next highest integer among nodes of the same type in the sub-graph.
func (s *Server) assignHID(ctx context.Context, tx neo4j.ManagedTransaction, label, soiHID string, props map[string]any) (schema.HID, error) {
	nt, ok := s.schema.NodeTypes[label]
	if !ok || nt.HIDPrefix == "" {
		return schema.HID{}, fmt.Errorf("no HID prefix known for label %s", label)
	}

	switch label {
	case "Project":
		return schema.HID{TypePrefix: nt.HIDPrefix, Index: "", Sequence: 0}, nil

	case "System", "Sandbox":
		// Tier-1 index: next highest integer across existing tier-1 systems
		// and sandboxes (indexes with no dot).
		res, err := tx.Run(ctx, `
			MATCH (n) WHERE (n:System OR n:Sandbox) AND n.SoIIndex IS NOT NULL AND NOT n.SoIIndex CONTAINS '.'
			RETURN coalesce(max(toInteger(n.SoIIndex)), 0) AS maxIdx`, nil)
		if err != nil {
			return schema.HID{}, err
		}
		single, err := res.Single(ctx)
		if err != nil {
			return schema.HID{}, err
		}
		maxIdx, _ := single.AsMap()["maxIdx"].(int64)
		return schema.HID{TypePrefix: nt.HIDPrefix, Index: strconv.FormatInt(maxIdx+1, 10), Sequence: 0}, nil

	default:
		if soiHID == "" {
			return schema.HID{}, fmt.Errorf("creating a %s requires a commit soiHid scope", label)
		}
		h, err := schema.ParseHID(soiHID)
		if err != nil {
			return schema.HID{}, fmt.Errorf("invalid soiHid: %w", err)
		}
		soi := h.SoIKey()
		res, err := tx.Run(ctx, fmt.Sprintf(`
			MATCH (n:%s) WHERE n.SoIIndex = $soi
			RETURN coalesce(max(n.Sequence), 0) AS maxSeq`, label),
			map[string]any{"soi": soi})
		if err != nil {
			return schema.HID{}, err
		}
		single, err := res.Single(ctx)
		if err != nil {
			return schema.HID{}, err
		}
		maxSeq, _ := single.AsMap()["maxSeq"].(int64)
		return schema.HID{TypePrefix: nt.HIDPrefix, Index: soi, Sequence: int(maxSeq) + 1}, nil
	}
}

// buildCreateProps assembles the full property map for a new node: common ID
// group (§3.3.9), schema defaults (§3.3.10), then caller-supplied values.
func (s *Server) buildCreateProps(label string, in map[string]any, user UserIdentity, hid schema.HID) (map[string]any, error) {
	props := map[string]any{
		"HID":          hid.String(),
		"uuid":         uuid.NewString(),
		"TypeName":     label,
		"Owner":        user.UserName,
		"OwnerEmail":   user.Email,
		"Creator":      user.UserName,
		"CreatorEmail": user.Email,
		"VersionID":    s.cfg.SchemaVersion,
		"SoIIndex":     hid.Index,
		"Sequence":     hid.Sequence,
		"Name":         "New",
	}

	// Type-specific schema defaults (skip Null/N-A defaults; §3.3.9).
	if nt, ok := s.schema.NodeTypes[label]; ok {
		for _, g := range nt.PropertyGroups {
			for _, p := range g.Properties {
				if p.Default == nil || p.Default == "N/A" || p.Default == "Null" {
					continue
				}
				v, err := castDefault(p)
				if err == nil && v != nil {
					props[p.Name] = v
				}
			}
		}
	}

	// Caller-supplied values override defaults (system-managed rejected).
	for k, v := range in {
		if systemManagedProps[k] {
			return nil, fmt.Errorf("property %s is system-managed and cannot be set on create", k)
		}
		cast, err := s.castProperty(label, k, v)
		if err != nil {
			return nil, err
		}
		props[k] = cast
	}
	return props, nil
}

// castDefault converts a schema default (stored as string/bool/number in the
// extract) to its property type.
func castDefault(p schema.Property) (any, error) {
	switch d := p.Default.(type) {
	case bool, float64, int:
		return d, nil
	case string:
		switch strings.ToLower(p.Type) {
		case "boolean":
			return strings.EqualFold(d, "true"), nil
		case "integer":
			return strconv.Atoi(d)
		case "float":
			return strconv.ParseFloat(d, 64)
		default:
			return d, nil
		}
	}
	return nil, fmt.Errorf("uncastable default")
}

// castProperty validates and converts a caller-supplied value per the schema
// property type (SRS §3.3.9: property types enforced by Backend). Unknown
// properties are rejected.
func (s *Server) castProperty(label, name string, v any) (any, error) {
	def, ok := s.schema.PropertyDef(label, name)
	if !ok {
		return nil, fmt.Errorf("property %s is not defined for node type %s (SRS §3.3.10)", name, label)
	}
	if v == nil {
		return nil, nil // "All properties with no value SHALL use Null" (§3.3.2)
	}
	switch strings.ToLower(def.Type) {
	case "boolean":
		if b, ok := v.(bool); ok {
			return b, nil
		}
		return nil, fmt.Errorf("property %s must be Boolean", name)
	case "integer":
		switch n := v.(type) {
		case float64:
			return int64(n), nil
		case int64:
			return n, nil
		}
		return nil, fmt.Errorf("property %s must be Integer", name)
	case "float":
		if n, ok := v.(float64); ok {
			return n, nil
		}
		return nil, fmt.Errorf("property %s must be Float", name)
	case "enum":
		sv, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("property %s must be a string enum value", name)
		}
		if len(def.EnumValues) > 0 {
			for _, ev := range def.EnumValues {
				if sv == ev {
					return sv, nil
				}
			}
			return nil, fmt.Errorf("property %s value %q not in enum %v", name, sv, def.EnumValues)
		}
		return sv, nil
	case "json":
		switch j := v.(type) {
		case string:
			return j, nil
		default:
			return fmt.Sprintf("%v", j), nil
		}
	default: // String, Structure, datetime
		if sv, ok := v.(string); ok {
			return sv, nil
		}
		return nil, fmt.Errorf("property %s must be a string", name)
	}
}

// castRelProps validates relationship properties against the schema's
// relationship property tables where defined (trace, AT_RELATES_TO,
// TRANSITIONS_TO, EXTENDS).
func (s *Server) castRelProps(relType string, in map[string]any) (map[string]any, error) {
	out := map[string]any{}
	defs := s.schema.RelationshipDefs(relType)
	var propDefs map[string]schema.Property
	for _, d := range defs {
		if len(d.Properties) > 0 {
			propDefs = map[string]schema.Property{}
			for _, p := range d.Properties {
				propDefs[p.Name] = p
			}
			break
		}
	}
	for k, v := range in {
		if propDefs != nil {
			if _, ok := propDefs[k]; !ok {
				return nil, fmt.Errorf("relationship property %s not defined for [:%s]", k, relType)
			}
		}
		out[k] = v
	}
	return out, nil
}

// validateTransitionProps enforces §3.3.4.3 / §6.5.5.14: when TransitionKind
// is COUNTERMEASURE_REQUIRED or BOTH, RequiredByCountermeasureHID (or UUID)
// must identify an existing (:Countermeasure) in the same SoI as the states.
func validateTransitionProps(ctx context.Context, tx neo4j.ManagedTransaction, props map[string]any, soiIndex string) error {
	kind, _ := props["TransitionKind"].(string)
	if kind != "COUNTERMEASURE_REQUIRED" && kind != "BOTH" {
		return nil
	}
	cmHID, _ := props["RequiredByCountermeasureHID"].(string)
	cmUUID, _ := props["RequiredByCountermeasureUUID"].(string)
	if cmHID == "" && cmUUID == "" {
		return fmt.Errorf("TransitionKind %s requires RequiredByCountermeasureHID or RequiredByCountermeasureUUID (SRS §3.3.4.3)", kind)
	}
	res, err := tx.Run(ctx, `
		MATCH (cm:Countermeasure)
		WHERE ($hid <> '' AND cm.HID = $hid) OR ($uuid <> '' AND cm.uuid = $uuid)
		RETURN cm.SoIIndex AS soi LIMIT 1`,
		map[string]any{"hid": cmHID, "uuid": cmUUID})
	if err != nil {
		return err
	}
	single, err := res.Single(ctx)
	if err != nil {
		return fmt.Errorf("referenced (:Countermeasure) %s%s does not exist (SRS §3.3.4.3)", cmHID, cmUUID)
	}
	if cmSoI, _ := single.AsMap()["soi"].(string); soiIndex != "" && cmSoI != soiIndex {
		return fmt.Errorf("governing (:Countermeasure) must belong to the same SoI as the transition (SRS §6.5.5.14)")
	}
	return nil
}

// isTraceRel reports the three state-scoped Asset trace types (§3.3.4.6).
func isTraceRel(relType string) bool {
	return relType == "HOLDS" || relType == "TRANSPORTS" || relType == "USES"
}

// prepareTraceRel enforces §3.3.4.6.1 / §6.5.9.6 Phase-1/2 semantics inside
// the transaction: supersede any CURRENT trace relationship for the same
// (entity, State, Asset) cell (trace relationships are state-scoped —
// different States coexist), compute the next TraceVersion across the
// (entity, Asset) pair, and stamp system-managed trace metadata.
func prepareTraceRel(ctx context.Context, tx neo4j.ManagedTransaction, srcHID, tgtHID, commitID string, props map[string]any) (map[string]any, error) {
	if props == nil {
		props = map[string]any{}
	}
	stateHid, _ := props["TraceStateHID"].(string)
	if stateHid == "" {
		return nil, fmt.Errorf("trace relationships require TraceStateHID (SRS §3.3.4.6.1)")
	}
	res, err := tx.Run(ctx, `
		MATCH (a {HID: $src})-[r:HOLDS|TRANSPORTS|USES]->(b {HID: $tgt})
		WITH collect(r) AS rels, coalesce(max(r.TraceVersion), 0) AS maxV
		FOREACH (r IN [x IN rels WHERE x.TraceStatus = 'CURRENT' AND x.TraceStateHID = $state] |
			SET r.TraceStatus = 'SUPERSEDED')
		RETURN maxV`,
		map[string]any{"src": srcHID, "tgt": tgtHID, "state": stateHid})
	if err != nil {
		return nil, err
	}
	single, err := res.Single(ctx)
	if err != nil {
		return nil, err
	}
	maxV, _ := single.AsMap()["maxV"].(int64)

	props["TraceStatus"] = "CURRENT"
	props["TraceVersion"] = maxV + 1
	props["TraceSessionID"] = commitID
	props["TraceDate"] = neo4j.LocalDateTimeOf(timeNow())
	return props, nil
}

// prepareAttackTreeRel stamps and validates the system-managed properties on a
// Loss Tool edge. [:AT_RELATES_TO] is multiplicity-allowed because LossHID
// scopes the same source/target pair across different attack trees.
func prepareAttackTreeRel(ctx context.Context, tx neo4j.ManagedTransaction, srcHID, tgtHID string, src, tgt nodeInfo, props map[string]any) (map[string]any, error) {
	if props == nil {
		props = map[string]any{}
	}
	lossHID, _ := props["LossHID"].(string)
	if lossHID == "" {
		return nil, fmt.Errorf("[:AT_RELATES_TO] requires LossHID (SRS §3.3.4.11)")
	}
	res, err := tx.Run(ctx, `
		MATCH (loss:Loss {HID: $lossHID})
		RETURN loss.uuid AS uuid, loss.SoIIndex AS soi`,
		map[string]any{"lossHID": lossHID})
	if err != nil {
		return nil, err
	}
	single, err := res.Single(ctx)
	if err != nil {
		return nil, fmt.Errorf("LossHID %s does not identify a (:Loss)", lossHID)
	}
	m := single.AsMap()
	lossUUID, _ := m["uuid"].(string)
	lossSoI, _ := m["soi"].(string)

	if src.label == "Loss" && srcHID != lossHID {
		return nil, fmt.Errorf("[:AT_RELATES_TO] rooted at a (:Loss) must use that same Loss as LossHID (SRS §3.3.4.11)")
	}
	if tgt.label == "Loss" {
		return nil, fmt.Errorf("(:Loss) SHALL NOT appear as the target of [:AT_RELATES_TO] in its own tree (SRS §3.3.4.11)")
	}
	if src.soiIndex != "" && src.soiIndex != lossSoI {
		return nil, fmt.Errorf("[:AT_RELATES_TO] source %s is outside Loss SoI %s (SRS §3.3.4.11)", srcHID, lossSoI)
	}
	if tgt.soiIndex != "" && tgt.soiIndex != lossSoI {
		return nil, fmt.Errorf("[:AT_RELATES_TO] target %s is outside Loss SoI %s (SRS §3.3.4.11)", tgtHID, lossSoI)
	}

	props["Lossuuid"] = lossUUID
	if _, ok := props["TailoredOut"]; !ok {
		props["TailoredOut"] = false
	}
	logic, _ := props["LogicOperator"].(string)
	if logic == "" {
		logic = defaultAttackTreeLogic(src.label, tgt.label)
		props["LogicOperator"] = logic
	}
	if logic != "AND" && logic != "OR" && logic != "SAND" {
		return nil, fmt.Errorf("LogicOperator must be AND, OR, or SAND")
	}
	if logic == "SAND" {
		seq, ok := normalizeInt(props["SANDSequence"])
		if !ok || seq < 0 {
			return nil, fmt.Errorf("SANDSequence must be a non-negative integer when LogicOperator = SAND")
		}
		props["SANDSequence"] = seq
	} else {
		delete(props, "SANDSequence")
	}

	if b, _ := props["TailoredOut"].(bool); b && strings.TrimSpace(strAny(props["TailorReason"])) == "" {
		return nil, fmt.Errorf("TailoredOut = True requires TailorReason (SRS §3.3.4.11)")
	}
	if b, _ := props["CompleteBlock"].(bool); b && strings.TrimSpace(strAny(props["CompleteBlockReason"])) == "" {
		return nil, fmt.Errorf("CompleteBlock = True requires CompleteBlockReason (SRS §3.3.4.11)")
	}
	if b, _ := props["AllowedRV"].(bool); b && len(strings.TrimSpace(strAny(props["AllowedRVReason"]))) < 20 {
		return nil, fmt.Errorf("AllowedRV = True requires AllowedRVReason of at least 20 characters (SRS §6.5.10.16)")
	}

	dup, err := tx.Run(ctx, `
		MATCH (a {HID: $src})-[rel:AT_RELATES_TO {LossHID: $lossHID}]->(b {HID: $tgt})
		RETURN count(rel) AS n`,
		map[string]any{"src": srcHID, "tgt": tgtHID, "lossHID": lossHID})
	if err != nil {
		return nil, err
	}
	dupRec, err := dup.Single(ctx)
	if err != nil {
		return nil, err
	}
	if n, _ := dupRec.AsMap()["n"].(int64); n > 0 {
		return nil, fmt.Errorf("duplicate [:AT_RELATES_TO] edge for LossHID %s between %s and %s", lossHID, srcHID, tgtHID)
	}
	return props, nil
}

func defaultAttackTreeLogic(srcLabel, tgtLabel string) string {
	if srcLabel == "Loss" && tgtLabel == "Environment" {
		return "AND"
	}
	if srcLabel == "Attack" && tgtLabel == "Countermeasure" {
		return "AND"
	}
	return "OR"
}

func normalizeInt(v any) (int64, bool) {
	switch n := v.(type) {
	case int:
		return int64(n), true
	case int64:
		return n, true
	case float64:
		if n == float64(int64(n)) {
			return int64(n), true
		}
	}
	return 0, false
}

func strAny(v any) string {
	s, _ := v.(string)
	return s
}

// validateRelInTx re-validates a staged relationship inside the transaction:
// canonical model, cross-SoI, duplicates, acyclicity. Returns "" when valid.
func (s *Server) validateRelInTx(ctx context.Context, tx neo4j.ManagedTransaction, relType string, src, tgt nodeInfo, srcHID, tgtHID string) string {
	if !s.schema.RelationshipAllowed(relType, src.label, tgt.label) {
		return fmt.Sprintf("(:%s)-[:%s]->(:%s) is not an authorized relationship (SRS §3.3.4)", src.label, relType, tgt.label)
	}
	if src.soiIndex != "" && tgt.soiIndex != "" && src.soiIndex != tgt.soiIndex &&
		!crossSoIAllowed(relType, src.label, tgt.label) {
		return fmt.Sprintf("[:%s] may not cross SoI boundaries (SRS §3.3.5)", relType)
	}
	if !relAllowsMultiplicity(relType) {
		res, err := tx.Run(ctx, fmt.Sprintf(
			`MATCH (a {HID: $src})-[r:%s]->(b {HID: $tgt}) RETURN count(r) AS n`, relType),
			map[string]any{"src": srcHID, "tgt": tgtHID})
		if err != nil {
			return err.Error()
		}
		single, err := res.Single(ctx)
		if err != nil {
			return err.Error()
		}
		if n, _ := single.AsMap()["n"].(int64); n > 0 {
			return fmt.Sprintf("duplicate [:%s] between %s and %s (SRS §3.3.2)", relType, srcHID, tgtHID)
		}
	}
	if s.schema.IsAcyclic(relType) {
		if srcHID == tgtHID {
			return fmt.Sprintf("[:%s] self-loop would create a cycle (SRS §3.3.6)", relType)
		}
		res, err := tx.Run(ctx, fmt.Sprintf(
			`MATCH (b {HID: $tgt}), (a {HID: $src})
			 RETURN EXISTS { MATCH (b)-[:%s*1..50]->(a) } AS cyc`, relType),
			map[string]any{"src": srcHID, "tgt": tgtHID})
		if err != nil {
			return err.Error()
		}
		single, err := res.Single(ctx)
		if err != nil {
			return err.Error()
		}
		if cyc, _ := single.AsMap()["cyc"].(bool); cyc {
			return fmt.Sprintf("[:%s] would create a cycle (SRS §3.3.6)", relType)
		}
	}
	// Each (:Loss) is associated with exactly one (:Environment) (§3.3.4.11).
	if relType == "HAS_ENVIRONMENT" && src.label == "Loss" {
		res, err := tx.Run(ctx,
			`MATCH (l {HID: $src})-[r:HAS_ENVIRONMENT]->() RETURN count(r) AS n`,
			map[string]any{"src": srcHID})
		if err != nil {
			return err.Error()
		}
		single, err := res.Single(ctx)
		if err != nil {
			return err.Error()
		}
		if n, _ := single.AsMap()["n"].(int64); n > 0 {
			return "each (:Loss) SHALL be associated with exactly one (:Environment) via [:HAS_ENVIRONMENT] (SRS §3.3.4.11)"
		}
	}
	// A single (:SystemFunction)/(:Interface) has at most one [:IMPLEMENTS]
	// into an STPA role node (§3.3.4.12).
	if relType == "IMPLEMENTS" {
		res, err := tx.Run(ctx,
			`MATCH (a {HID: $src})-[r:IMPLEMENTS]->() RETURN count(r) AS n`,
			map[string]any{"src": srcHID})
		if err != nil {
			return err.Error()
		}
		single, err := res.Single(ctx)
		if err != nil {
			return err.Error()
		}
		if n, _ := single.AsMap()["n"].(int64); n > 0 {
			return "a single (:SystemFunction) or (:Interface) SHALL have no more than one [:IMPLEMENTS] relationship into an STPA role node (SRS §3.3.4.12)"
		}
	}
	// Component parents at most one System (§3.3.4.1).
	if relType == "PARENTS" && src.label == "Component" && tgt.label == "System" {
		res, err := tx.Run(ctx,
			`MATCH (a {HID: $src})-[r:PARENTS]->(:System) RETURN count(r) AS n`,
			map[string]any{"src": srcHID})
		if err != nil {
			return err.Error()
		}
		single, err := res.Single(ctx)
		if err != nil {
			return err.Error()
		}
		if n, _ := single.AsMap()["n"].(int64); n > 0 {
			return "a (:Component) SHALL parent zero or one child (:System) (SRS §3.3.4.1)"
		}
	}
	return ""
}

// createSystemDefaults creates the default (:Purpose), (:Environment) and
// (:State) for a newly created (:System) and links them (SRS §3.3.3.1,
// §3.3.4.2 constraints; REQUIREMENTS-NOTES I-9). Returns nodes created.
func (s *Server) createSystemDefaults(ctx context.Context, tx neo4j.ManagedTransaction, user UserIdentity, sysHID schema.HID) (int, error) {
	mk := func(label, prefix, name string) map[string]any {
		return map[string]any{
			"HID":          fmt.Sprintf("%s_%s_%d", prefix, sysHID.Index, 1),
			"uuid":         uuid.NewString(),
			"TypeName":     label,
			"Name":         name,
			"Owner":        user.UserName,
			"OwnerEmail":   user.Email,
			"Creator":      user.UserName,
			"CreatorEmail": user.Email,
			"VersionID":    s.cfg.SchemaVersion,
			"SoIIndex":     sysHID.Index,
			"Sequence":     1,
		}
	}
	_, err := tx.Run(ctx, `
		MATCH (sys:System {HID: $sysHid})
		CREATE (p:SSTPA:Purpose) SET p = $purpose, p.Created = datetime(), p.LastTouch = datetime()
		CREATE (sys)-[:REALIZES]->(p)
		CREATE (e:SSTPA:Environment) SET e = $env, e.Created = datetime(), e.LastTouch = datetime()
		CREATE (sys)-[:ACTS_IN]->(e)
		CREATE (st:SSTPA:State) SET st = $state, st.Created = datetime(), st.LastTouch = datetime()
		CREATE (sys)-[:EXHIBITS]->(st)`,
		map[string]any{
			"sysHid":  sysHID.String(),
			"purpose": mk("Purpose", "PUR", "Default Purpose"),
			"env":     mk("Environment", "ENV", "Default Environment"),
			"state":   mk("State", "ST", "Default State"),
		})
	if err != nil {
		return 0, err
	}
	return 3, nil
}

// recomputeTraceDerivations implements SRS §3.3.4.6.2 (criticality/assurance
// OR-union inheritance incl. Connection propagation) and §3.3.4.6.3
// (protection Requirement generation) for one SoI, inside the commit
// transaction.
func (s *Server) recomputeTraceDerivations(ctx context.Context, tx neo4j.ManagedTransaction, user UserIdentity, soiHID, commitID string) error {
	h, err := schema.ParseHID(soiHID)
	if err != nil {
		return err
	}
	soi := h.SoIKey()

	// Note: the SRS assurance set (§3.3.10 Asset Assurances group, §3.3.4.6.2
	// inheritance list, §3.3.4.6.3 labels) deliberately omits Integrity; see
	// docs/REQUIREMENTS-NOTES.md I-8.
	boolProps := []string{"SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical",
		"Confidentiality", "Availability", "Authenticity", "NonRepudiation",
		"Certifiable", "Privacy", "Trustworthy"}
	levelProps := []string{"SafetyLevel", "MissionLevel", "FlightLevel", "SecurityLevel"}

	// 1. Entity inheritance: OR-union across CURRENT trace relationships.
	boolSet := make([]string, 0, len(boolProps))
	for _, p := range boolProps {
		boolSet = append(boolSet,
			fmt.Sprintf("e.%[1]s = size([x IN assets WHERE x.%[1]s = true]) > 0", p))
	}
	levelSet := make([]string, 0, len(levelProps))
	for _, p := range levelProps {
		levelSet = append(levelSet,
			fmt.Sprintf("e.%[1]s = reduce(m = null, x IN assets | CASE WHEN x.%[1]s IS NULL THEN m WHEN m IS NULL OR x.%[1]s > m THEN x.%[1]s ELSE m END)", p))
	}
	q := fmt.Sprintf(`
		MATCH (e:SSTPA) WHERE e.SoIIndex = $soi AND (e:Interface OR e:SystemFunction OR e:Component)
		OPTIONAL MATCH (e)-[r:HOLDS|TRANSPORTS|USES]->(a:Asset)
		WHERE r.TraceStatus = 'CURRENT' AND a.SoIIndex = $soi
		WITH e, collect(a) AS assets
		SET %s, %s`, strings.Join(boolSet, ", "), strings.Join(levelSet, ", "))
	if _, err := tx.Run(ctx, q, map[string]any{"soi": soi}); err != nil {
		return fmt.Errorf("entity inheritance: %w", err)
	}

	// 2. Connection inheritance: OR-union across participating Interfaces
	// that have at least one CURRENT trace relationship (§3.3.4.6.2).
	cBool := make([]string, 0, len(boolProps))
	for _, p := range boolProps {
		cBool = append(cBool,
			fmt.Sprintf("c.%[1]s = size([x IN ifaces WHERE x.%[1]s = true]) > 0", p))
	}
	cLevel := make([]string, 0, len(levelProps))
	for _, p := range levelProps {
		cLevel = append(cLevel,
			fmt.Sprintf("c.%[1]s = reduce(m = null, x IN ifaces | CASE WHEN x.%[1]s IS NULL THEN m WHEN m IS NULL OR x.%[1]s > m THEN x.%[1]s ELSE m END)", p))
	}
	qc := fmt.Sprintf(`
		MATCH (c:Connection)<-[:PARTICIPATES_IN]-(i:Interface)
		WHERE c.SoIIndex = $soi
		AND EXISTS { MATCH (i)-[r:HOLDS|TRANSPORTS|USES]->(:Asset) WHERE r.TraceStatus = 'CURRENT' }
		WITH c, collect(i) AS ifaces
		SET %s, %s`, strings.Join(cBool, ", "), strings.Join(cLevel, ", "))
	if _, err := tx.Run(ctx, qc, map[string]any{"soi": soi}); err != nil {
		return fmt.Errorf("connection inheritance: %w", err)
	}

	// 3. Protection Requirement generation (§3.3.4.6.3): one Requirement per
	// (entity, Asset, true Assurance property) with canonical text; duplicates
	// prevented by exact RStatement match on the entity's [:HAS_REQUIREMENT].
	assurance := map[string]string{
		"Confidentiality": "Confidentiality",
		"Availability":    "Availability",
		"Authenticity":    "Authenticity",
		"NonRepudiation":  "Non-Repudiation",
		"Certifiable":     "Certifiable",
		"Privacy":         "Privacy",
		"Trustworthy":     "Trustworthiness",
	}
	for prop, label := range assurance {
		qr := fmt.Sprintf(`
			MATCH (e:SSTPA)-[r:HOLDS|TRANSPORTS|USES]->(a:Asset)
			WHERE e.SoIIndex = $soi AND a.SoIIndex = $soi
			  AND r.TraceStatus = 'CURRENT' AND a.%s = true
			  AND (e:Interface OR e:SystemFunction OR e:Component)
			WITH e, a, (e.Name + ' SHALL protect the %s of ' + a.Name + '.') AS stmt
			WHERE NOT EXISTS { MATCH (e)-[:HAS_REQUIREMENT]->(x:Requirement) WHERE x.RStatement = stmt }
			MATCH (p:Purpose) WHERE p.SoIIndex = $soi
			WITH e, a, stmt, p ORDER BY p.Sequence LIMIT 1
			MATCH (rq:Requirement) WHERE rq.SoIIndex = $soi
			WITH e, a, stmt, p, coalesce(max(rq.Sequence), 0) AS maxSeq
			CREATE (nr:SSTPA:Requirement {
				HID: 'REQ_' + $soi + '_' + toString(maxSeq + 1),
				uuid: randomUUID(), TypeName: 'Requirement',
				Name: 'Protect ' + a.Name,
				RStatement: stmt, VMethod: 'Inspection',
				Orphan: false, Barren: true,
				Owner: $user, OwnerEmail: $email, Creator: $user, CreatorEmail: $email,
				Created: datetime(), LastTouch: datetime(),
				VersionID: $version, SoIIndex: $soi, Sequence: maxSeq + 1
			})
			CREATE (e)-[:HAS_REQUIREMENT]->(nr)
			CREATE (p)-[:HAS_REQUIREMENT]->(nr)`,
			prop, label)
		if _, err := tx.Run(ctx, qr, map[string]any{
			"soi": soi, "user": user.UserName, "email": user.Email,
			"version": s.cfg.SchemaVersion}); err != nil {
			return fmt.Errorf("protection requirements (%s): %w", prop, err)
		}
	}

	// 4. Orphan detection (§3.3.4.6.3): protection Requirements whose entity
	// no longer has a CURRENT trace relationship to the named Asset.
	qo := `
		MATCH (e:SSTPA)-[:HAS_REQUIREMENT]->(rq:Requirement)
		WHERE rq.SoIIndex = $soi AND rq.RStatement CONTAINS ' SHALL protect the '
		  AND (e:Interface OR e:SystemFunction OR e:Component)
		  AND NOT EXISTS {
			MATCH (e)-[r:HOLDS|TRANSPORTS|USES]->(a:Asset)
			WHERE r.TraceStatus = 'CURRENT'
			  AND rq.RStatement ENDS WITH (' of ' + a.Name + '.')
		  }
		SET rq.Orphan = true`
	if _, err := tx.Run(ctx, qo, map[string]any{"soi": soi}); err != nil {
		return fmt.Errorf("orphan detection: %w", err)
	}
	return nil
}
