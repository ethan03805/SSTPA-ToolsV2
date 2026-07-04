// Node retrieval endpoints (SRS §5.6.6.2) and SoI sub-graph retrieval.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

// nodeResponse is the standard node payload: all properties plus identity and
// containing SoI (SRS §5.6.6.2).
type nodeResponse struct {
	HID        string         `json:"hid"`
	UUID       string         `json:"uuid"`
	TypeName   string         `json:"typeName"`
	SoI        string         `json:"soi"` // HID Index of the containing SoI
	Labels     []string       `json:"labels"`
	Properties map[string]any `json:"properties"`
}

func nodeToResponse(n neo4j.Node) nodeResponse {
	props := n.Props
	hid, _ := props["HID"].(string)
	uid, _ := props["uuid"].(string)
	tn, _ := props["TypeName"].(string)
	soi := ""
	if h, err := schema.ParseHID(hid); err == nil {
		soi = h.SoIKey()
	}
	labels := make([]string, 0, len(n.Labels))
	for _, l := range n.Labels {
		if l != "SSTPA" { // internal indexing label, not part of the data model
			labels = append(labels, l)
		}
	}
	return nodeResponse{HID: hid, UUID: uid, TypeName: tn, SoI: soi, Labels: labels, Properties: props}
}

func (s *Server) handleNodeByHID(w http.ResponseWriter, r *http.Request) {
	hid := chi.URLParam(r, "hid")
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `MATCH (n:SSTPA {HID: $hid}) RETURN n LIMIT 1`,
			map[string]any{"hid": hid})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		v, _ := single.Get("n")
		return v.(neo4j.Node), nil
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "node not found", hid)
		return
	}
	writeJSON(w, http.StatusOK, nodeToResponse(res.(neo4j.Node)))
}

func (s *Server) handleNodeByUUID(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "uuid")
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `MATCH (n:SSTPA {uuid: $uuid}) RETURN n LIMIT 1`,
			map[string]any{"uuid": uid})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		v, _ := single.Get("n")
		return v.(neo4j.Node), nil
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "node not found", uid)
		return
	}
	writeJSON(w, http.StatusOK, nodeToResponse(res.(neo4j.Node)))
}

// handleNodesByType lists nodes of a label, paginated (SRS §3.3.2: all
// list-returning endpoints support pagination and maximum result limits).
func (s *Server) handleNodesByType(w http.ResponseWriter, r *http.Request) {
	label := chi.URLParam(r, "label")
	if !s.schema.ValidLabel(label) {
		writeError(w, http.StatusBadRequest, "unknown node label", label)
		return
	}
	limit, offset := paginate(r, 100, 500)
	soi := r.URL.Query().Get("soi")

	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		q := `MATCH (n:` + label + `) `
		params := map[string]any{"limit": limit, "offset": offset}
		if soi != "" {
			q += `WHERE n.HID CONTAINS ('_' + $soi + '_') AND split(split(n.HID,'_')[1],'_')[0] = $soi `
			params["soi"] = soi
		}
		q += `RETURN n ORDER BY n.HID SKIP $offset LIMIT $limit`
		rec, err := tx.Run(r.Context(), q, params)
		if err != nil {
			return nil, err
		}
		var out []nodeResponse
		for rec.Next(r.Context()) {
			v, _ := rec.Record().Get("n")
			out = append(out, nodeToResponse(v.(neo4j.Node)))
		}
		return out, rec.Err()
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"nodes": res, "limit": limit, "offset": offset})
}

// handleSoI returns the full sub-graph for one SoI: all nodes sharing the
// System's HID Index and all relationships among them (SRS §3.3.1.1, §6.3.4).
func (s *Server) handleSoI(w http.ResponseWriter, r *http.Request) {
	sysHid := chi.URLParam(r, "systemHid")
	h, err := schema.ParseHID(sysHid)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid system HID", err.Error())
		return
	}
	soi := h.SoIKey()

	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (n:SSTPA) WHERE n.SoIIndex = $soi
			OPTIONAL MATCH (n)-[rel]->(m:SSTPA) WHERE m.SoIIndex = $soi OR type(rel) IN $crossSoI
			RETURN n, collect({type: type(rel), targetHID: m.HID, targetUUID: m.uuid, props: properties(rel)}) AS rels`,
			map[string]any{"soi": soi, "crossSoI": []string{"PARTICIPATES_IN", "PARENTS"}})
		if err != nil {
			return nil, err
		}
		type soiNode struct {
			nodeResponse
			Relationships []map[string]any `json:"relationships"`
		}
		var out []soiNode
		for rec.Next(r.Context()) {
			record := rec.Record()
			v, _ := record.Get("n")
			relsV, _ := record.Get("rels")
			var rels []map[string]any
			if list, ok := relsV.([]any); ok {
				for _, item := range list {
					if m, ok := item.(map[string]any); ok && m["type"] != nil {
						rels = append(rels, m)
					}
				}
			}
			out = append(out, soiNode{nodeResponse: nodeToResponse(v.(neo4j.Node)), Relationships: rels})
		}
		return out, rec.Err()
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SoI query failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"soi": soi, "systemHid": sysHid, "nodes": res})
}

// paginate reads limit/offset query params with a default and hard maximum
// (SRS §3.3.2).
func paginate(r *http.Request, def, max int) (limit, offset int) {
	limit = def
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		limit = v
	}
	if limit > max {
		limit = max
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && v >= 0 {
		offset = v
	}
	return limit, offset
}
