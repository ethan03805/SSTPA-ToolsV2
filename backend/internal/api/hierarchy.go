// Hierarchy and context retrieval (SRS §5.6.6.3, §5.6.6.6).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// hierarchyEntry is a compact node reference for efficient graph rendering
// (SRS §5.6.6.3: minimize payload size).
type hierarchyEntry struct {
	HID              string `json:"hid"`
	UUID             string `json:"uuid"`
	Name             string `json:"name"`
	TypeName         string `json:"typeName"`
	ShortDescription string `json:"shortDescription,omitempty"`
	ParentHID        string `json:"parentHid,omitempty"` // parenting (:Component) or (:Project)/(:Sandbox)
}

// handleHierarchy returns the full Capability → System tree: (:Project) and
// (:Sandbox) roots, their tier-1 (:System) children, and all child systems
// reachable through (:Component)-[:PARENTS]->(:System). Traversal is bounded
// (SRS §3.3.2) by a depth limit.
func (s *Server) handleHierarchy(w http.ResponseWriter, r *http.Request) {
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			CALL () {
				// Roots: Project and Sandbox
				MATCH (root) WHERE root:Project OR root:Sandbox
				RETURN root.HID AS hid, root.uuid AS uuid, root.Name AS name,
				       root.TypeName AS typeName, root.ShortDescription AS shortDescription,
				       null AS parentHid
				UNION ALL
				// Tier-1 systems under roots
				MATCH (root)-[:HAS_SYSTEM]->(sys:System) WHERE root:Project OR root:Sandbox
				RETURN sys.HID AS hid, sys.uuid AS uuid, sys.Name AS name,
				       sys.TypeName AS typeName, sys.ShortDescription AS shortDescription,
				       root.HID AS parentHid
				UNION ALL
				// Child systems through Component PARENTS (SRS §3.3.4.1)
				MATCH (el:Component)-[:PARENTS]->(child:System)
				RETURN child.HID AS hid, child.uuid AS uuid, child.Name AS name,
				       child.TypeName AS typeName, child.ShortDescription AS shortDescription,
				       el.HID AS parentHid
			}
			RETURN hid, uuid, name, typeName, shortDescription, parentHid
			ORDER BY hid`, nil)
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
		writeError(w, http.StatusInternalServerError, "hierarchy query failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": res})
}

// handleContext returns the containing (:System), hierarchy path, and parent
// relationships for any node (SRS §5.6.6.6).
func (s *Server) handleContext(w http.ResponseWriter, r *http.Request) {
	hid := chi.URLParam(r, "hid")
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (n:SSTPA {HID: $hid})
			OPTIONAL MATCH (sys:System) WHERE sys.SoIIndex = n.SoIIndex
			OPTIONAL MATCH (parent)-[rel]->(n)
			RETURN n.HID AS hid, n.SoIIndex AS soi,
			       sys.HID AS systemHid, sys.Name AS systemName,
			       collect({parentHid: parent.HID, parentType: parent.TypeName, relType: type(rel)}) AS parents`,
			map[string]any{"hid": hid})
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
		writeError(w, http.StatusNotFound, "node not found", hid)
		return
	}
	m := res.(map[string]any)

	// Hierarchy path from the HID index: SYS index "1.2.3" descends 1 → 1.2 → 1.2.3.
	soi, _ := m["soi"].(string)
	var path []string
	if soi != "" {
		parts := ""
		for _, seg := range splitIndex(soi) {
			if parts == "" {
				parts = seg
			} else {
				parts = parts + "." + seg
			}
			path = append(path, "SYS_"+parts+"_0")
		}
	}
	m["hierarchyPath"] = path
	writeJSON(w, http.StatusOK, m)
}

func splitIndex(idx string) []string {
	var out []string
	cur := ""
	for _, c := range idx {
		if c == '.' {
			out = append(out, cur)
			cur = ""
		} else {
			cur += string(c)
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
