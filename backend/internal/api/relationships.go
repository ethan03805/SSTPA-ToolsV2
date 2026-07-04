// Relationship validation endpoint (SRS §5.6.6.5): confirms allowed node
// types, enforces relationship rules, prevents invalid associations; returns
// valid/invalid with the reason for invalidity.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

type validateRelationshipRequest struct {
	Type      string `json:"type"`
	SourceHID string `json:"sourceHid"`
	TargetHID string `json:"targetHid"`
	// Labels may be supplied for not-yet-created nodes (staged edits).
	SourceLabel string `json:"sourceLabel,omitempty"`
	TargetLabel string `json:"targetLabel,omitempty"`
}

type validateRelationshipResponse struct {
	Valid  bool   `json:"valid"`
	Reason string `json:"reason,omitempty"`
}

func (s *Server) handleValidateRelationship(w http.ResponseWriter, r *http.Request) {
	var req validateRelationshipRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Type == "" {
		writeError(w, http.StatusBadRequest, "invalid payload", "type is required")
		return
	}
	resp := s.validateRelationship(r, req)
	writeJSON(w, http.StatusOK, resp)
}

// validateRelationship applies the canonical relationship model (§3.3.4),
// cross-SoI rules (§3.3.5), duplicate prevention (§3.3.2), and acyclicity
// governance (§3.3.6).
func (s *Server) validateRelationship(r *http.Request, req validateRelationshipRequest) validateRelationshipResponse {
	invalid := func(format string, a ...any) validateRelationshipResponse {
		return validateRelationshipResponse{Valid: false, Reason: fmt.Sprintf(format, a...)}
	}

	srcLabel, tgtLabel := req.SourceLabel, req.TargetLabel
	var srcSoI, tgtSoI string

	// Resolve labels and SoI membership from the graph when HIDs are given.
	if req.SourceHID != "" || req.TargetHID != "" {
		res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
			rec, err := tx.Run(r.Context(), `
				OPTIONAL MATCH (src:SSTPA {HID: $src})
				OPTIONAL MATCH (tgt:SSTPA {HID: $tgt})
				RETURN src.TypeName AS srcType, src.SoIIndex AS srcSoI,
				       tgt.TypeName AS tgtType, tgt.SoIIndex AS tgtSoI,
				       src IS NOT NULL AS srcFound, tgt IS NOT NULL AS tgtFound`,
				map[string]any{"src": req.SourceHID, "tgt": req.TargetHID})
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
			return invalid("lookup failed: %v", err)
		}
		m := res.(map[string]any)
		if req.SourceHID != "" {
			if found, _ := m["srcFound"].(bool); !found {
				return invalid("source node %s not found", req.SourceHID)
			}
			srcLabel, _ = m["srcType"].(string)
			srcSoI, _ = m["srcSoI"].(string)
		}
		if req.TargetHID != "" {
			if found, _ := m["tgtFound"].(bool); !found {
				return invalid("target node %s not found", req.TargetHID)
			}
			tgtLabel, _ = m["tgtType"].(string)
			tgtSoI, _ = m["tgtSoI"].(string)
		}
	}

	if srcLabel == "" || tgtLabel == "" {
		return invalid("source and target labels could not be resolved")
	}
	if !s.schema.ValidLabel(srcLabel) {
		return invalid("unknown source label %s", srcLabel)
	}
	if !s.schema.ValidLabel(tgtLabel) {
		return invalid("unknown target label %s", tgtLabel)
	}

	// Canonical relationship model (§3.3.4).
	if !s.schema.RelationshipAllowed(req.Type, srcLabel, tgtLabel) {
		return invalid("(:%s)-[:%s]->(:%s) is not an authorized relationship (SRS §3.3.4)", srcLabel, req.Type, tgtLabel)
	}

	// Cross-SoI enforcement (§3.3.5): only PARTICIPATES_IN, Requirement
	// PARENTS, and Component PARENTS System may cross SoI boundaries.
	if srcSoI != "" && tgtSoI != "" && srcSoI != tgtSoI {
		if !crossSoIAllowed(req.Type, srcLabel, tgtLabel) {
			return invalid("[:%s] may not cross SoI boundaries (%s → %s) (SRS §3.3.5)", req.Type, srcSoI, tgtSoI)
		}
	}

	// Duplicate prevention (§3.3.2) and acyclicity (§3.3.6) for existing nodes.
	if req.SourceHID != "" && req.TargetHID != "" {
		res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
			q := fmt.Sprintf(`
				MATCH (src:SSTPA {HID: $src}), (tgt:SSTPA {HID: $tgt})
				OPTIONAL MATCH (src)-[dup:%s]->(tgt)
				RETURN dup IS NOT NULL AS dupExists`, req.Type)
			rec, err := tx.Run(r.Context(), q, map[string]any{"src": req.SourceHID, "tgt": req.TargetHID})
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
			return invalid("duplicate check failed: %v", err)
		}
		if dup, _ := res.(map[string]any)["dupExists"].(bool); dup && !relAllowsMultiplicity(req.Type) {
			return invalid("duplicate [:%s] between %s and %s (SRS §3.3.2)", req.Type, req.SourceHID, req.TargetHID)
		}

		if s.schema.IsAcyclic(req.Type) {
			cyc, err := s.wouldCreateCycle(r, req.Type, req.SourceHID, req.TargetHID)
			if err != nil {
				return invalid("cycle check failed: %v", err)
			}
			if cyc {
				return invalid("[:%s] from %s to %s would create a cycle (SRS §3.3.6)", req.Type, req.SourceHID, req.TargetHID)
			}
		}
	}

	return validateRelationshipResponse{Valid: true}
}

// crossSoIAllowed implements SRS §3.3.5's allowed list plus the inherent
// hierarchy crossing of (:Component)-[:PARENTS]->(:System).
func crossSoIAllowed(relType, srcLabel, tgtLabel string) bool {
	switch relType {
	case "PARTICIPATES_IN":
		return srcLabel == "Interface" && tgtLabel == "Connection"
	case "PARENTS":
		return (srcLabel == "Requirement" && tgtLabel == "Requirement") ||
			(srcLabel == "Component" && tgtLabel == "System")
	case "RELATES_TO": // messages may reference any node (§3.2.4)
		return true
	}
	return false
}

// relAllowsMultiplicity reports relationship types where duplicates are
// distinguished by relationship properties (SRS §3.3.2): AT_RELATES_TO is
// scoped by LossHID; trace relationships are versioned (only one CURRENT,
// enforced by supersession in prepareTraceRel).
func relAllowsMultiplicity(relType string) bool {
	return relType == "AT_RELATES_TO" || isTraceRel(relType)
}

// wouldCreateCycle checks whether target reaches source via relType
// (bounded depth per §3.3.2/§3.3.6).
func (s *Server) wouldCreateCycle(r *http.Request, relType, sourceHID, targetHID string) (bool, error) {
	if sourceHID == targetHID {
		return true, nil
	}
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		q := fmt.Sprintf(`
			MATCH (tgt:SSTPA {HID: $tgt}), (src:SSTPA {HID: $src})
			RETURN EXISTS { MATCH (tgt)-[:%s*1..50]->(src) } AS cyc`, relType)
		rec, err := tx.Run(r.Context(), q, map[string]any{"src": sourceHID, "tgt": targetHID})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		v, _ := single.Get("cyc")
		b, _ := v.(bool)
		return b, nil
	})
	if err != nil {
		return false, err
	}
	return res.(bool), nil
}

var _ = schema.HID{} // keep schema import for future use in this file
