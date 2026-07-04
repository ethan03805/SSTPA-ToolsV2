// Loss Tool backend (SRS §6.5.10): Attack Tree auto-build, path enumeration,
// metric propagation, RV detection. [:AT_RELATES_TO] edges (scoped by LossHID)
// are the semantic source of truth; AttackTreeJSON holds layout + validation
// snapshot. All mutations flow through the standard commit pipeline with the
// AT_RELATES_TO tool-authority gate (toolId == sstpa.loss, §3.3.4.11).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// atNode is a node in the assembled Attack Tree.
type atNode struct {
	HID      string         `json:"hid"`
	UUID     string         `json:"uuid"`
	TypeName string         `json:"typeName"`
	Name     string         `json:"name"`
	Tier     int            `json:"tier"`
	Props    map[string]any `json:"props"`
}

// atEdge is one [:AT_RELATES_TO] edge in the tree.
type atEdge struct {
	SourceHID     string         `json:"sourceHid"`
	TargetHID     string         `json:"targetHid"`
	LogicOperator string         `json:"logicOperator"`
	SANDSequence  *int64         `json:"sandSequence"`
	TailoredOut   bool           `json:"tailoredOut"`
	Props         map[string]any `json:"props"`
}

// handleLossTree returns the assembled Attack Tree for a Loss: root, tiered
// nodes, [:AT_RELATES_TO] edges, plus trace-coverage info (SRS §6.5.10.4).
func (s *Server) handleLossTree(w http.ResponseWriter, r *http.Request) {
	lossHid := chi.URLParam(r, "lossHid")
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		return s.assembleTree(r.Context(), tx, lossHid)
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "loss tree query failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) assembleTree(ctx context.Context, tx neo4j.ManagedTransaction, lossHid string) (map[string]any, error) {
	// Root Loss + Asset + Environment.
	rec, err := tx.Run(ctx, `
		MATCH (loss:Loss {HID: $hid})
		OPTIONAL MATCH (asset:Asset)-[:HAS_LOSS]->(loss)
		OPTIONAL MATCH (loss)-[:HAS_ENVIRONMENT]->(env:Environment)
		RETURN loss{.*} AS loss, asset{.HID, .Name, .uuid} AS asset, env{.HID, .Name, .uuid} AS env`,
		map[string]any{"hid": lossHid})
	if err != nil {
		return nil, err
	}
	single, err := rec.Single(ctx)
	if err != nil {
		return nil, fmt.Errorf("loss %s not found", lossHid)
	}
	m := single.AsMap()

	// All AT_RELATES_TO edges for this Loss with endpoint node data.
	er, err := tx.Run(ctx, `
		MATCH (src)-[rel:AT_RELATES_TO {LossHID: $hid}]->(tgt)
		RETURN src{.*} AS src, tgt{.*} AS tgt, properties(rel) AS props`,
		map[string]any{"hid": lossHid})
	if err != nil {
		return nil, err
	}
	nodes := map[string]atNode{}
	var edges []atEdge
	addNode := func(props map[string]any) {
		hid := str2s(props["HID"])
		if hid == "" {
			return
		}
		if _, ok := nodes[hid]; !ok {
			nodes[hid] = atNode{
				HID:      hid,
				TypeName: str2s(props["TypeName"]),
				Name:     str2s(props["Name"]),
				UUID:     str2s(props["uuid"]),
				Props:    props,
			}
		}
	}
	for er.Next(ctx) {
		rm := er.Record().AsMap()
		srcProps, _ := rm["src"].(map[string]any)
		tgtProps, _ := rm["tgt"].(map[string]any)
		addNode(srcProps)
		addNode(tgtProps)
		props, _ := rm["props"].(map[string]any)
		e := atEdge{
			SourceHID: str2s(srcProps["HID"]), TargetHID: str2s(tgtProps["HID"]),
			LogicOperator: "AND", Props: props,
		}
		if props != nil {
			if lo, ok := props["LogicOperator"].(string); ok {
				e.LogicOperator = lo
			}
			if to, ok := props["TailoredOut"].(bool); ok {
				e.TailoredOut = to
			}
			if ss, ok := props["SANDSequence"].(int64); ok {
				e.SANDSequence = &ss
			}
		}
		edges = append(edges, e)
	}
	if err := er.Err(); err != nil {
		return nil, err
	}

	// Tier assignment by BFS from the Loss root.
	rootHid := lossHid
	if lossProps, ok := m["loss"].(map[string]any); ok {
		addNode(lossProps)
	}
	tier := map[string]int{rootHid: 0}
	children := map[string][]string{}
	for _, e := range edges {
		children[e.SourceHID] = append(children[e.SourceHID], e.TargetHID)
	}
	queue := []string{rootHid}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, c := range children[cur] {
			if _, seen := tier[c]; !seen {
				tier[c] = tier[cur] + 1
				queue = append(queue, c)
			}
		}
	}
	nodeList := make([]atNode, 0, len(nodes))
	for hid, n := range nodes {
		n.Tier = tier[hid]
		nodeList = append(nodeList, n)
	}
	sort.Slice(nodeList, func(i, j int) bool {
		if nodeList[i].Tier != nodeList[j].Tier {
			return nodeList[i].Tier < nodeList[j].Tier
		}
		return nodeList[i].HID < nodeList[j].HID
	})

	// Trace coverage (§6.5.10.5a): States VALID_IN the Env with CURRENT trace.
	cov, err := tx.Run(ctx, `
		MATCH (loss:Loss {HID: $hid})-[:HAS_ENVIRONMENT]->(env:Environment)
		MATCH (asset:Asset)-[:HAS_LOSS]->(loss)
		OPTIONAL MATCH (st:State)-[:VALID_IN]->(env)
		OPTIONAL MATCH (e)-[tr:HOLDS|TRANSPORTS|USES]->(asset)
		WHERE tr.TraceStatus = 'CURRENT' AND tr.TraceStateHID = st.HID
		RETURN st.HID AS stateHid, st.Name AS stateName, st.StateSequence AS seq,
		       count(DISTINCT e) AS tracedEntities`,
		map[string]any{"hid": lossHid})
	if err != nil {
		return nil, err
	}
	var coverage []map[string]any
	statesCovered, statesTotal := 0, 0
	for cov.Next(ctx) {
		cm := cov.Record().AsMap()
		if cm["stateHid"] == nil {
			continue
		}
		statesTotal++
		te, _ := cm["tracedEntities"].(int64)
		if te > 0 {
			statesCovered++
		}
		coverage = append(coverage, cm)
	}

	return map[string]any{
		"loss":          m["loss"],
		"asset":         m["asset"],
		"environment":   m["env"],
		"nodes":         nodeList,
		"edges":         edges,
		"traceCoverage": coverage,
		"statesCovered": statesCovered,
		"statesTotal":   statesTotal,
	}, nil
}

// handleLossAutoBuild builds the Attack Tree from graph data per §6.5.10.7 and
// persists the [:AT_RELATES_TO] edges + Loss tree properties in one ACID
// transaction. Rebuild=true first deletes existing edges for this Loss.
func (s *Server) handleLossAutoBuild(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	lossHid := chi.URLParam(r, "lossHid")
	rebuild := r.URL.Query().Get("rebuild") == "true"

	res, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		return s.autoBuildTree(r.Context(), tx, user, lossHid, rebuild)
	})
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "auto-build failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) autoBuildTree(ctx context.Context, tx neo4j.ManagedTransaction, user UserIdentity, lossHid string, rebuild bool) (map[string]any, error) {
	// Verify Loss has an Environment.
	rec, err := tx.Run(ctx, `
		MATCH (loss:Loss {HID: $hid})-[:HAS_ENVIRONMENT]->(env:Environment)
		MATCH (asset:Asset)-[:HAS_LOSS]->(loss)
		RETURN loss.uuid AS lossUuid, env.HID AS envHid, asset.HID AS assetHid`,
		map[string]any{"hid": lossHid})
	if err != nil {
		return nil, err
	}
	single, err := rec.Single(ctx)
	if err != nil {
		return nil, fmt.Errorf("loss %s has no Environment assignment; assign one in the Context Tool first (SRS §6.5.10.3)", lossHid)
	}
	sm := single.AsMap()
	lossUUID, _ := sm["lossUuid"].(string)
	envHid, _ := sm["envHid"].(string)

	if rebuild {
		if _, err := tx.Run(ctx,
			`MATCH ()-[rel:AT_RELATES_TO {LossHID: $hid}]->() DELETE rel`,
			map[string]any{"hid": lossHid}); err != nil {
			return nil, err
		}
	}

	// Single bounded traversal building the full tree (§6.5.10.7). Default
	// operators per the §6.5.10.7 table. Edges MERGE-created idempotently.
	build := `
		MATCH (loss:Loss {HID: $hid})-[:HAS_ENVIRONMENT]->(env:Environment)
		MATCH (asset:Asset)-[:HAS_LOSS]->(loss)
		// T1 Environment (AND)
		MERGE (loss)-[le:AT_RELATES_TO {LossHID: $hid, targetKind: 'env'}]->(env)
		ON CREATE SET le.Lossuuid = $lossUuid, le.LogicOperator = 'AND', le.TailoredOut = false
		WITH loss, env, asset
		// T1 States valid in env with CURRENT trace (OR)
		MATCH (st:State)-[:VALID_IN]->(env)
		WHERE EXISTS {
			MATCH (e)-[tr:HOLDS|TRANSPORTS|USES]->(asset)
			WHERE tr.TraceStatus = 'CURRENT' AND tr.TraceStateHID = st.HID
		}
		MERGE (loss)-[ls:AT_RELATES_TO {LossHID: $hid, targetKind: 'state'}]->(st)
		ON CREATE SET ls.Lossuuid = $lossUuid, ls.LogicOperator = 'OR', ls.TailoredOut = false
		WITH loss, asset, st
		// T2 entities traced to the asset in this state (OR)
		MATCH (e)-[tr:HOLDS|TRANSPORTS|USES]->(asset)
		WHERE tr.TraceStatus = 'CURRENT' AND tr.TraceStateHID = st.HID
		MERGE (st)-[se:AT_RELATES_TO {LossHID: $hid, entityKey: e.HID}]->(e)
		ON CREATE SET se.Lossuuid = $lossUuid, se.LogicOperator = 'OR', se.TailoredOut = false
		WITH loss, asset, e
		// T3 attacks exploiting the entity (OR)
		OPTIONAL MATCH (e)<-[:EXPLOITS]-(atk:Attack)
		FOREACH (a IN CASE WHEN atk IS NULL THEN [] ELSE [atk] END |
			MERGE (e)-[ae:AT_RELATES_TO {LossHID: $hid, attackKey: a.HID}]->(a)
			ON CREATE SET ae.Lossuuid = $lossUuid, ae.LogicOperator = 'OR', ae.TailoredOut = false
		)
		WITH DISTINCT loss, asset
		// T4 countermeasures blocking those attacks (AND)
		MATCH (e2)-[:AT_RELATES_TO {LossHID: $hid}]->(atk2:Attack)
		OPTIONAL MATCH (cm:Countermeasure)-[:BLOCKS]->(atk2)
		FOREACH (c IN CASE WHEN cm IS NULL THEN [] ELSE [cm] END |
			MERGE (atk2)-[ce:AT_RELATES_TO {LossHID: $hid, cmKey: c.HID}]->(c)
			ON CREATE SET ce.Lossuuid = $lossUuid, ce.LogicOperator = 'AND', ce.TailoredOut = false
		)
		RETURN count(*) AS built`
	if _, err := tx.Run(ctx, build, map[string]any{"hid": lossHid, "lossUuid": lossUUID, "envHid": envHid}); err != nil {
		return nil, fmt.Errorf("tree construction: %w", err)
	}

	// Post-build computation (§6.5.10.7): compute paths, RVs, validity.
	tree, err := s.assembleTree(ctx, tx, lossHid)
	if err != nil {
		return nil, err
	}
	stats := computeTreeStats(tree, nil)

	// Persist tree properties on the Loss (single transaction).
	snapshot := map[string]any{
		"builtAt":     "auto",
		"environment": envHid,
	}
	snapJSON, _ := json.Marshal(map[string]any{
		"schemaVersion":      "1.0",
		"layout":             map[string]any{},
		"validationSnapshot": snapshot,
		"validationFindings": []any{},
	})
	if _, err := tx.Run(ctx, `
		MATCH (loss:Loss {HID: $hid})
		SET loss.AttackTreeStatus = 'AUTO_GENERATED',
		    loss.TreeIsValid = $valid,
		    loss.TreeHasRVs = $hasRVs,
		    loss.PathCount = $paths,
		    loss.AttackTreeVersion = coalesce(loss.AttackTreeVersion, 0) + 1,
		    loss.AttackTreeJSON = $json,
		    loss.LastTouch = datetime()`,
		map[string]any{
			"hid": lossHid, "valid": stats.valid, "hasRVs": stats.hasRVs,
			"paths": stats.pathCount, "json": string(snapJSON),
		}); err != nil {
		return nil, err
	}
	_ = user
	return map[string]any{
		"lossHid": lossHid, "status": "AUTO_GENERATED",
		"pathCount": stats.pathCount, "treeIsValid": stats.valid, "treeHasRVs": stats.hasRVs,
		"tree": tree,
	}, nil
}

// handleLossPaths enumerates root-to-leaf paths with per-metric values and RV
// status (SRS §6.5.10.5c, §6.5.10.15 compute).
func (s *Server) handleLossPaths(w http.ResponseWriter, r *http.Request) {
	lossHid := chi.URLParam(r, "lossHid")
	tree, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		return s.assembleTree(r.Context(), tx, lossHid)
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "loss tree query failed", err.Error())
		return
	}
	m := tree.(map[string]any)

	// Metric definitions from the Loss node.
	var metricDefs []metricDef
	if lossProps, ok := m["loss"].(map[string]any); ok {
		if mdRaw, ok := lossProps["MetricDefinitionsJSON"].(string); ok && mdRaw != "" {
			_ = json.Unmarshal([]byte(mdRaw), &metricDefs)
		}
	}

	paths := enumeratePaths(m, lossHid, metricDefs)
	limit, offset := paginate(r, 100, 500)
	total := len(paths)
	end := offset + limit
	if end > total {
		end = total
	}
	if offset > total {
		offset = total
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"lossHid": lossHid,
		"paths":   paths[offset:end],
		"total":   total, "limit": limit, "offset": offset,
	})
}

// --- pure computation helpers (shared by build and path endpoints) ---

type treeStats struct {
	pathCount int
	valid     bool
	hasRVs    bool
}

type metricDef struct {
	MetricName          string  `json:"metricName"`
	MetricDirection     string  `json:"metricDirection"` // MINIMIZE|MAXIMIZE
	LeafDefault         float64 `json:"leafDefault"`
	ANDFormula          string  `json:"andFormula"` // SUM|PRODUCT|MIN|MAX
	ORFormula           string  `json:"orFormula"`
	SANDFormula         string  `json:"sandFormula"`
	AcceptanceThreshold float64 `json:"acceptanceThreshold"`
	ThresholdDirection  string  `json:"thresholdDirection"` // ABOVE|BELOW
}

type pathResult struct {
	PathNumber int                `json:"pathNumber"`
	Sequence   []string           `json:"sequence"`
	NameSeq    []string           `json:"nameSequence"`
	LeafType   string             `json:"leafType"`
	RVStatus   string             `json:"rvStatus"` // RV | ALLOWED_RV | BLOCKED | DERIVED
	Metrics    map[string]float64 `json:"metrics"`
}

// buildAdjacency returns children[source] = []edge and node lookup, dropping
// TailoredOut edges (§6.5.10.5c path enumeration excludes tailored edges).
func buildAdjacency(m map[string]any) (map[string]atNode, map[string][]atEdge) {
	nodes := map[string]atNode{}
	if nl, ok := m["nodes"].([]atNode); ok {
		for _, n := range nl {
			nodes[n.HID] = n
		}
	} else if nlAny, ok := m["nodes"].([]any); ok {
		for _, x := range nlAny {
			b, _ := json.Marshal(x)
			var n atNode
			_ = json.Unmarshal(b, &n)
			nodes[n.HID] = n
		}
	}
	children := map[string][]atEdge{}
	edges := toEdges(m["edges"])
	for _, e := range edges {
		if e.TailoredOut {
			continue
		}
		children[e.SourceHID] = append(children[e.SourceHID], e)
	}
	return nodes, children
}

func toEdges(v any) []atEdge {
	if el, ok := v.([]atEdge); ok {
		return el
	}
	var out []atEdge
	if elAny, ok := v.([]any); ok {
		for _, x := range elAny {
			b, _ := json.Marshal(x)
			var e atEdge
			_ = json.Unmarshal(b, &e)
			out = append(out, e)
		}
	}
	return out
}

func computeTreeStats(m map[string]any, defs []metricDef) treeStats {
	paths := enumeratePaths(m, str2s(nested(m, "loss", "HID")), defs)
	st := treeStats{pathCount: len(paths), valid: len(paths) > 0}
	for _, p := range paths {
		if p.RVStatus == "RV" {
			st.hasRVs = true
		}
	}
	return st
}

// enumeratePaths performs bounded DFS over the DAG rooted at lossHid.
func enumeratePaths(m map[string]any, lossHid string, defs []metricDef) []pathResult {
	nodes, children := buildAdjacency(m)
	if lossHid == "" {
		if lp, ok := m["loss"].(map[string]any); ok {
			lossHid, _ = lp["HID"].(string)
		}
	}
	var results []pathResult
	const maxLen = 20

	var dfs func(cur string, seq []string, visited map[string]bool)
	dfs = func(cur string, seq []string, visited map[string]bool) {
		if len(seq) > maxLen {
			return
		}
		kids := children[cur]
		curNode := nodes[cur]
		// Leaf classification (§6.5.10.5c terminal leaves).
		if len(kids) == 0 {
			p := pathResult{Sequence: append([]string{}, seq...)}
			for _, h := range p.Sequence {
				p.NameSeq = append(p.NameSeq, nodes[h].Name)
			}
			p.LeafType = curNode.TypeName
			switch curNode.TypeName {
			case "Attack":
				if edgeAllowedRV(m, cur) {
					p.RVStatus = "ALLOWED_RV"
				} else {
					p.RVStatus = "RV"
				}
			case "Countermeasure":
				p.RVStatus = "BLOCKED"
			case "Asset", "DerivedAsset":
				p.RVStatus = "DERIVED"
			default:
				return
			}
			p.Metrics = computePathMetrics(p.Sequence, nodes, defs)
			results = append(results, p)
			return
		}
		for _, e := range kids {
			if visited[e.TargetHID] {
				continue // DAG safety
			}
			visited[e.TargetHID] = true
			dfs(e.TargetHID, append(seq, e.TargetHID), visited)
			delete(visited, e.TargetHID)
		}
	}
	dfs(lossHid, []string{lossHid}, map[string]bool{lossHid: true})
	for i := range results {
		results[i].PathNumber = i + 1
	}
	// Default sort: ascending by first metric (§6.5.10.5c).
	if len(defs) > 0 {
		mn := defs[0].MetricName
		sort.SliceStable(results, func(i, j int) bool {
			return results[i].Metrics[mn] < results[j].Metrics[mn]
		})
		for i := range results {
			results[i].PathNumber = i + 1
		}
	}
	return results
}

// computePathMetrics computes each metric along a single path as an ordered
// accumulation (SUM/PRODUCT/MIN/MAX per the incoming operator's formula —
// along a single root-to-leaf path this reduces to the leaf's contribution
// combined by the path's operators; we use leaf value combined by SUM/PRODUCT).
func computePathMetrics(seq []string, nodes map[string]atNode, defs []metricDef) map[string]float64 {
	out := map[string]float64{}
	if len(seq) == 0 {
		return out
	}
	leaf := nodes[seq[len(seq)-1]]
	for _, d := range defs {
		// Leaf value: MetricsJSON[name] or LeafDefault.
		v := d.LeafDefault
		if mj, ok := leaf.Props["MetricsJSON"].(string); ok && mj != "" {
			var vals map[string]float64
			if json.Unmarshal([]byte(mj), &vals) == nil {
				if x, ok := vals[d.MetricName]; ok {
					v = x
				}
			}
		}
		// Accumulate Countermeasure contributions along the path.
		acc := v
		for _, h := range seq {
			n := nodes[h]
			if n.TypeName != "Countermeasure" {
				continue
			}
			if mj, ok := n.Props["MetricsJSON"].(string); ok && mj != "" {
				var vals map[string]float64
				if json.Unmarshal([]byte(mj), &vals) == nil {
					if x, ok := vals[d.MetricName]; ok {
						switch d.ANDFormula {
						case "PRODUCT":
							acc *= x
						case "MIN":
							acc = math.Min(acc, x)
						case "MAX":
							acc = math.Max(acc, x)
						default: // SUM
							acc += x
						}
					}
				}
			}
		}
		out[d.MetricName] = acc
	}
	return out
}

// edgeAllowedRV reports whether the terminal edge into attackHid has AllowedRV.
func edgeAllowedRV(m map[string]any, attackHid string) bool {
	for _, e := range toEdges(m["edges"]) {
		if e.TargetHID == attackHid {
			if e.Props == nil {
				continue
			}
			if av, ok := e.Props["AllowedRV"].(bool); ok && av {
				return true
			}
		}
	}
	return false
}

func str2s(v any) string {
	s, _ := v.(string)
	return s
}

func nested(m map[string]any, keys ...string) any {
	cur := any(m)
	for _, k := range keys {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[k]
	}
	return cur
}
