// Product Data (SRS §3.1) and schema introspection for the Frontend
// (SRS §3.3.9/§3.3.10 property groups drive Data Drawer rendering).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// handleProduct returns the (:Product) node and its related open-source
// component nodes, read-only (SRS §3.1).
func (s *Server) handleProduct(w http.ResponseWriter, r *http.Request) {
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (p:Product)
			OPTIONAL MATCH (p)-[:INTEGRATES]->(c:OpenSourceComponent)
			RETURN p{.*} AS product,
			       collect(c{.Name, .Version, .Source, .License}) AS components`, nil)
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
		// Product data is written by the development pipeline (§3.1); absence
		// is reported rather than fatal.
		writeJSON(w, http.StatusOK, map[string]any{
			"product": map[string]any{
				"Name": s.cfg.ProductName, "Version": s.cfg.Version,
				"BuildNumber": s.cfg.BuildNumber, "OwnerEmail": "nihlo2025@proton.me",
			},
			"components": []any{},
			"note":       "Product node not yet written to the database",
		})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// handleSchemaNodeTypes lists all canonical node types with display names,
// HID prefixes and model domains (SRS §3.3.3, §3.3.8.1).
func (s *Server) handleSchemaNodeTypes(w http.ResponseWriter, r *http.Request) {
	type entry struct {
		Label       string `json:"label"`
		DisplayName string `json:"displayName"`
		ModelDomain string `json:"modelDomain"`
		HIDPrefix   string `json:"hidPrefix"`
		Category    string `json:"category"`
	}
	var out []entry
	for _, nt := range s.schema.NodeTypes {
		out = append(out, entry{
			Label: nt.Label, DisplayName: nt.DisplayName,
			ModelDomain: nt.ModelDomain, HIDPrefix: nt.HIDPrefix, Category: nt.Category,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Label < out[j].Label })
	writeJSON(w, http.StatusOK, map[string]any{"nodeTypes": out, "schemaVersion": s.schema.SchemaVersion})
}

// handleSchemaNodeType returns the full property-group definition for one
// node type: common groups first, then type-specific (SRS §3.3.9).
func (s *Server) handleSchemaNodeType(w http.ResponseWriter, r *http.Request) {
	label := chi.URLParam(r, "label")
	nt, ok := s.schema.NodeTypes[label]
	if !ok {
		writeError(w, http.StatusNotFound, "unknown node label", label)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"label":                label,
		"displayName":          nt.DisplayName,
		"modelDomain":          nt.ModelDomain,
		"hidPrefix":            nt.HIDPrefix,
		"description":          nt.Description,
		"commonPropertyGroups": s.schema.CommonPropertyGroups,
		"propertyGroups":       nt.PropertyGroups,
		"relationshipGroups":   nt.RelationshipGroups,
		"outgoingRelationships": func() []map[string]string {
			var rels []map[string]string
			for _, rd := range s.schema.RelationshipsFrom(label) {
				rels = append(rels, map[string]string{
					"type": rd.Type, "target": rd.Target, "srsSection": rd.SRSSection,
				})
			}
			return rels
		}(),
	})
}

// handleSchemaRelationships lists every authorized relationship triple.
func (s *Server) handleSchemaRelationships(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"relationships": s.schema.Relationships})
}

var _ = neo4j.Node{}
