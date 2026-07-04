// Requirements Tool backend support (SRS §6.5.2.18): requirement hierarchy
// retrieval, parent/child lineage, bearer associations, orphan/barren
// analysis. [:PARENTS] direction: (parent)-[:PARENTS]->(child), consistent
// with (:Component)-[:PARENTS]->(:System) (§3.3.4.1).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// tierOf computes the tier of a requirement from its SoI index (§6.5.2.6):
// Project-level (empty index) → 0; index "1" → 1; "1.2" → 2; etc.
func tierOf(soiIndex string) int {
	if soiIndex == "" {
		return 0
	}
	return strings.Count(soiIndex, ".") + 1
}

type reqNode struct {
	HID        string `json:"hid"`
	UUID       string `json:"uuid"`
	Name       string `json:"name"`
	RStatement string `json:"rStatement,omitempty"`
	VMethod    string `json:"vMethod,omitempty"`
	Tier       int    `json:"tier"`
	SoI        string `json:"soi"`
	Orphan     bool   `json:"orphan"`
	Barren     bool   `json:"barren"`
}

type reqEdge struct {
	Type      string `json:"type"` // PARENTS | HAS_REQUIREMENT | VERIFIED_BY
	SourceHID string `json:"sourceHid"`
	TargetHID string `json:"targetHid"`
}

type bearer struct {
	HID      string `json:"hid"`
	Name     string `json:"name"`
	TypeName string `json:"typeName"`
}

// handleRequirementLineage returns the focused requirement with ancestors and
// descendants to the requested depths, its bearer nodes, and verifications
// (GET /api/requirements/lineage/{hid}?up=N&down=N).
func (s *Server) handleRequirementLineage(w http.ResponseWriter, r *http.Request) {
	hid := chi.URLParam(r, "hid")
	up := boundedDepth(r.URL.Query().Get("up"), 3)
	down := boundedDepth(r.URL.Query().Get("down"), 3)

	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (focus:Requirement {HID: $hid})
			// Ancestors: (parent)-[:PARENTS]->(child); walk incoming edges up.
			OPTIONAL MATCH pUp = (anc:Requirement)-[:PARENTS*1..`+strconv.Itoa(up)+`]->(focus)
			WITH focus, collect(DISTINCT nodes(pUp)) AS upPaths, collect(DISTINCT relationships(pUp)) AS upRels
			OPTIONAL MATCH pDown = (focus)-[:PARENTS*1..`+strconv.Itoa(down)+`]->(desc:Requirement)
			WITH focus, upPaths, upRels, collect(DISTINCT nodes(pDown)) AS downPaths, collect(DISTINCT relationships(pDown)) AS downRels
			RETURN focus, upPaths, upRels, downPaths, downRels`,
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
		writeError(w, http.StatusNotFound, "requirement not found", hid)
		return
	}
	m := res.(map[string]any)

	nodes := map[string]reqNode{}
	var edges []reqEdge
	addNode := func(n neo4j.Node) {
		p := n.Props
		h, _ := p["HID"].(string)
		if _, seen := nodes[h]; seen || h == "" {
			return
		}
		soi, _ := p["SoIIndex"].(string)
		nodes[h] = reqNode{
			HID:  h,
			UUID: str2(p["uuid"]), Name: str2(p["Name"]),
			RStatement: str2(p["RStatement"]), VMethod: str2(p["VMethod"]),
			Tier: tierOf(soi), SoI: soi,
			Orphan: p["Orphan"] == true, Barren: p["Barren"] == true,
		}
	}
	if focus, ok := m["focus"].(neo4j.Node); ok {
		addNode(focus)
	}
	for _, key := range []string{"upPaths", "downPaths"} {
		if paths, ok := m[key].([]any); ok {
			for _, path := range paths {
				if list, ok := path.([]any); ok {
					for _, item := range list {
						if n, ok := item.(neo4j.Node); ok {
							addNode(n)
						}
					}
				}
			}
		}
	}
	seenEdge := map[string]bool{}
	for _, key := range []string{"upRels", "downRels"} {
		if rels, ok := m[key].([]any); ok {
			for _, rel := range rels {
				if list, ok := rel.([]any); ok {
					for _, item := range list {
						if rl, ok := item.(neo4j.Relationship); ok {
							// endpoints resolved below via element IDs — use a
							// second query instead for simplicity
							_ = rl
						}
					}
				}
			}
		}
	}

	// Parentage edges among returned nodes (single query, deduplicated).
	hids := make([]string, 0, len(nodes))
	for h := range nodes {
		hids = append(hids, h)
	}
	res2, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (a:Requirement)-[:PARENTS]->(b:Requirement)
			WHERE a.HID IN $hids AND b.HID IN $hids
			RETURN a.HID AS src, b.HID AS tgt`,
			map[string]any{"hids": hids})
		if err != nil {
			return nil, err
		}
		var out [][2]string
		for rec.Next(r.Context()) {
			m := rec.Record().AsMap()
			out = append(out, [2]string{m["src"].(string), m["tgt"].(string)})
		}
		return out, rec.Err()
	})
	if err == nil {
		for _, e := range res2.([][2]string) {
			key := e[0] + ">" + e[1]
			if !seenEdge[key] {
				seenEdge[key] = true
				edges = append(edges, reqEdge{Type: "PARENTS", SourceHID: e[0], TargetHID: e[1]})
			}
		}
	}

	// Bearers and verifications for the focus requirement.
	res3, _ := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (focus:Requirement {HID: $hid})
			OPTIONAL MATCH (b)-[:HAS_REQUIREMENT]->(focus)
			OPTIONAL MATCH (focus)-[:VERIFIED_BY]->(v:Verification)
			RETURN collect(DISTINCT {hid: b.HID, name: b.Name, typeName: b.TypeName}) AS bearers,
			       collect(DISTINCT {hid: v.HID, name: v.Name, typeName: v.TypeName}) AS verifications`,
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

	nodeList := make([]reqNode, 0, len(nodes))
	for _, n := range nodes {
		nodeList = append(nodeList, n)
	}
	out := map[string]any{"focus": hid, "nodes": nodeList, "edges": edges}
	if m3, ok := res3.(map[string]any); ok {
		out["bearers"] = filterNullMaps(m3["bearers"])
		out["verifications"] = filterNullMaps(m3["verifications"])
	}
	writeJSON(w, http.StatusOK, out)
}

// handleRequirementsBySoI returns all requirements in a SoI with allocation
// (bearer) info and computed orphan/barren analysis (SRS §6.5.2, §3.3.4.7).
func (s *Server) handleRequirementsBySoI(w http.ResponseWriter, r *http.Request) {
	soi := chi.URLParam(r, "soi")
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (rq:Requirement) WHERE rq.SoIIndex = $soi OR ($soi = '' AND rq.SoIIndex IS NULL)
			OPTIONAL MATCH (b)-[:HAS_REQUIREMENT]->(rq)
			OPTIONAL MATCH (rq)-[:PARENTS]->(child:Requirement)
			OPTIONAL MATCH (rq)-[:VERIFIED_BY]->(v:Verification)
			OPTIONAL MATCH (parent:Requirement)-[:PARENTS]->(rq)
			WITH rq, rq{.HID, .uuid, .Name, .RStatement, .VMethod, .SoIIndex} AS req,
			       collect(DISTINCT {hid: b.HID, name: b.Name, typeName: b.TypeName}) AS bearers,
			       count(DISTINCT child) AS children,
			       count(DISTINCT v) AS verifications,
			       collect(DISTINCT parent.HID) AS parents
			ORDER BY rq.HID
			RETURN req, bearers, children, verifications, parents`,
			map[string]any{"soi": soi})
		if err != nil {
			return nil, err
		}
		var out []map[string]any
		for rec.Next(r.Context()) {
			m := rec.Record().AsMap()
			req := m["req"].(map[string]any)
			bearers := filterNullMaps(m["bearers"])
			children, _ := m["children"].(int64)
			verifs, _ := m["verifications"].(int64)
			// Orphan: no bearer other than (:Purpose); Barren: no child and no
			// verification (§3.3.4.7).
			orphan := true
			for _, b := range bearers {
				if tn, _ := b["typeName"].(string); tn != "Purpose" {
					orphan = false
					break
				}
			}
			soiIdx, _ := req["SoIIndex"].(string)
			out = append(out, map[string]any{
				"hid": req["HID"], "uuid": req["uuid"], "name": req["Name"],
				"rStatement": req["RStatement"], "vMethod": req["VMethod"],
				"tier": tierOf(soiIdx), "soi": soiIdx,
				"bearers": bearers, "parents": m["parents"],
				"childCount": children, "verificationCount": verifs,
				"orphan": orphan, "barren": children == 0 && verifs == 0,
			})
		}
		return out, rec.Err()
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "requirements query failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"soi": soi, "requirements": res})
}

func boundedDepth(v string, def int) int {
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return def
	}
	if n > 10 { // bounded traversal (SRS §3.3.2)
		return 10
	}
	return n
}

func str2(v any) string {
	s, _ := v.(string)
	return s
}

func filterNullMaps(v any) []map[string]any {
	var out []map[string]any
	if list, ok := v.([]any); ok {
		for _, item := range list {
			if m, ok := item.(map[string]any); ok && m["hid"] != nil {
				out = append(out, m)
			}
		}
	}
	return out
}
