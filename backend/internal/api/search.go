// Search endpoint (SRS §5.6.6.4).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"net/http"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// handleSearch supports: HID (exact), uuid (exact), Name (partial),
// ShortDescription (partial), node-type filtering. Results include node
// metadata, containing SoI, and node type (SRS §5.6.6.4). Paginated (§3.3.2).
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, offset := paginate(r, 50, 500)

	hid := q.Get("hid")
	uid := q.Get("uuid")
	name := q.Get("name")
	desc := q.Get("shortDescription")
	label := q.Get("type")

	if label != "" && !s.schema.ValidLabel(label) {
		writeError(w, http.StatusBadRequest, "unknown node label", label)
		return
	}
	if hid == "" && uid == "" && name == "" && desc == "" {
		writeError(w, http.StatusBadRequest, "at least one of hid, uuid, name, shortDescription is required", "")
		return
	}

	match := "MATCH (n:SSTPA"
	if label != "" {
		match += ":" + label
	}
	match += ")"

	where := " WHERE 1=1"
	params := map[string]any{"limit": limit, "offset": offset}
	if hid != "" {
		where += " AND n.HID = $hid"
		params["hid"] = hid
	}
	if uid != "" {
		where += " AND n.uuid = $uuid"
		params["uuid"] = uid
	}
	if name != "" {
		where += " AND toLower(n.Name) CONTAINS toLower($name)"
		params["name"] = name
	}
	if desc != "" {
		where += " AND toLower(n.ShortDescription) CONTAINS toLower($desc)"
		params["desc"] = desc
	}

	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(),
			match+where+` RETURN n ORDER BY n.HID SKIP $offset LIMIT $limit`, params)
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
		writeError(w, http.StatusInternalServerError, "search failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": res, "limit": limit, "offset": offset})
}
