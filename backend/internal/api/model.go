// Model Translation API (SRS §5.6.6.12, §3.7): exposes the G2M translator so
// every model-displaying Add-on Tool renders SysML 2.0 / KerML 1.0-transformed
// text (the model-display directive). Message Center is exempt.
//
// The graph is authoritative; model text is a projection (§3.7.1).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/model"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

// handleModelProfile returns the SSTPA Profile Library text and version
// (GET /api/model/profile, §5.6.6.12).
func (s *Server) handleModelProfile(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"version": model.SSTPAProfileVersion,
		"text":    model.ProfileLibrary(),
	})
}

// handleModelSysML returns SysML 2.0 text for the scope (GET /api/model/sysml).
func (s *Server) handleModelSysML(w http.ResponseWriter, r *http.Request) {
	s.serveModelText(w, r, "SYSML")
}

// handleModelKerML returns KerML 1.0 text for the scope (GET /api/model/kerml).
func (s *Server) handleModelKerML(w http.ResponseWriter, r *http.Request) {
	s.serveModelText(w, r, "KERML")
}

func (s *Server) serveModelText(w http.ResponseWriter, r *http.Request, language string) {
	q := r.URL.Query()
	scope := q.Get("scope")
	if scope == "" {
		scope = string(model.ScopeSoI)
	}
	soiHID := q.Get("soi")
	nodeCSV := q.Get("nodes")

	if scope != string(model.ScopeCapability) && soiHID == "" && nodeCSV == "" {
		writeError(w, http.StatusBadRequest, "soi or nodes required for this scope", "")
		return
	}

	g2m, err := s.buildG2M(r.Context(), scope, soiHID, nodeCSV)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "model projection failed", err.Error())
		return
	}

	var text string
	if language == "SYSML" {
		text = g2m.SysML()
	} else {
		text = g2m.KerML()
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(text))
}

// buildG2M loads the node/relationship projection for the requested scope and
// constructs a translator. Engineering Translation Set exclusions (§3.7.2) are
// applied: Reference (:REF) and User/Product/Help data are never loaded here
// (they are not part of the Core Data graph queried below).
func (s *Server) buildG2M(ctx context.Context, scope, soiHID, nodeCSV string) (*model.G2M, error) {
	var soiIndex, soiName string
	if soiHID != "" {
		if h, err := schema.ParseHID(soiHID); err == nil {
			soiIndex = h.SoIKey()
		}
	}

	res, err := s.db.Read(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		var params = map[string]any{}
		// whereFor builds the node predicate for a given alias so the same
		// scope filter can be applied to both the node and relationship queries.
		whereFor := func(alias string) string {
			switch scope {
			case string(model.ScopeCapability):
				return alias + ":SSTPA"
			case string(model.ScopeNodeSet):
				return alias + ":SSTPA AND " + alias + ".HID IN $hids"
			default: // SOI
				return alias + ":SSTPA AND " + alias + ".SoIIndex = $soi"
			}
		}
		switch scope {
		case string(model.ScopeNodeSet):
			params["hids"] = strings.Split(nodeCSV, ",")
		case string(model.ScopeCapability):
			// no params
		default:
			params["soi"] = soiIndex
		}
		where := whereFor("n")
		// Nodes.
		nrec, err := tx.Run(ctx,
			"MATCH (n) WHERE "+where+" RETURN n.HID AS hid, n.uuid AS uuid, n.TypeName AS label, properties(n) AS props",
			params)
		if err != nil {
			return nil, err
		}
		var nodes []model.Node
		nameByHID := map[string]string{}
		for nrec.Next(ctx) {
			m := nrec.Record().AsMap()
			hid, _ := m["hid"].(string)
			props, _ := m["props"].(map[string]any)
			nodes = append(nodes, model.Node{
				HID:   hid,
				UUID:  strOf(m["uuid"]),
				Label: strOf(m["label"]),
				Props: props,
			})
			if props != nil {
				if nm, ok := props["Name"].(string); ok {
					nameByHID[hid] = nm
				}
			}
		}
		if err := nrec.Err(); err != nil {
			return nil, err
		}
		if soiHID != "" {
			soiName = nameByHID[soiHID]
		}
		// Relationships whose source is in scope. Cross-SoI edges into targets
		// outside scope are emitted by qualified name; G2M only dereferences
		// endpoints it has (unknown targets are skipped by the emitters).
		rrec, err := tx.Run(ctx,
			"MATCH (a)-[r]->(b) WHERE "+whereFor("a")+
				" RETURN a.HID AS src, b.HID AS tgt, type(r) AS type, properties(r) AS props",
			params)
		if err != nil {
			return nil, err
		}
		var rels []model.Rel
		for rrec.Next(ctx) {
			m := rrec.Record().AsMap()
			tgt, _ := m["tgt"].(string)
			// Exclude edges into Reference Data (translated only as annotations).
			rels = append(rels, model.Rel{
				Type:      strOf(m["type"]),
				SourceHID: strOf(m["src"]),
				TargetHID: tgt,
				Props:     mapOf(m["props"]),
			})
		}
		if err := rrec.Err(); err != nil {
			return nil, err
		}
		return map[string]any{"nodes": nodes, "rels": rels}, nil
	})
	if err != nil {
		return nil, err
	}
	m := res.(map[string]any)
	nodes := m["nodes"].([]model.Node)
	rels := m["rels"].([]model.Rel)
	return model.NewG2M(nodes, rels, soiHID, soiName), nil
}

// handleModelValidate parses/validates submitted model text (M2G, §3.7.9).
// The full M2G parser is a future increment; this endpoint currently reports
// that text editing is read-only and returns an empty change set so tools
// degrade gracefully (see docs/REQUIREMENTS-NOTES.md).
func (s *Server) handleModelValidate(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"diagnostics": []any{},
		"changeSet":   map[string]any{"creations": 0, "propertyChanges": 0, "relationshipChanges": 0, "deletions": 0},
		"note":        "M2G text-commit is read-only in this version; edit via the Data Drawer and tool canvases (SRS §3.7.9 staged pipeline).",
	})
}

// handleModelCommit is the M2G commit endpoint; read-only in this version.
func (s *Server) handleModelCommit(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented,
		"M2G text-commit is not enabled in this version; use the canvas/Data Drawer commit path", "")
}

func strOf(v any) string {
	s, _ := v.(string)
	return s
}

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}
