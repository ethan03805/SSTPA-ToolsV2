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
	"time"

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

// snapNode is one node fingerprint in the validation snapshot (§6.5.10.12).
type snapNode struct {
	HID      string `json:"hid"`
	TypeName string `json:"typeName"`
	Name     string `json:"name"`
}

// snapTrace is one CURRENT trace (entity, State) pair recorded at build time.
type snapTrace struct {
	EntityHID string `json:"entityHid"`
	StateHID  string `json:"stateHid"`
}

// treeSnapshot is the validationSnapshot section of AttackTreeJSON: a
// fingerprint of the Core Data state at the last successful build/Commit,
// used for change detection on open (§6.5.10.12).
type treeSnapshot struct {
	BuiltAt     string      `json:"builtAt"`
	Environment string      `json:"environment"`
	Nodes       []snapNode  `json:"nodes"`
	Traces      []snapTrace `json:"traces"`
}

// validationFinding is one reconciliation result row (§6.5.10.12/§6.5.10.16).
type validationFinding struct {
	Severity string `json:"severity"` // ERROR | WARNING | INFO
	Type     string `json:"type"`     // e.g. ATTACK_REMOVED, TRACE_INVALIDATED
	NodeHID  string `json:"nodeHid,omitempty"`
	Message  string `json:"message"`
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

	// Tier assignment by BFS from the Loss root (§6.5.10.6 T0..T6+).
	rootHid := lossHid
	if lossProps, ok := m["loss"].(map[string]any); ok {
		addNode(lossProps)
	}
	tier := assignTiers(rootHid, edges)
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

	// Snapshot reconciliation (§6.5.10.12): compare the AttackTreeJSON
	// validationSnapshot against the live graph and emit findings.
	findings := s.reconcileTreeFindings(ctx, tx, lossHid, m["loss"], nodeList)

	return map[string]any{
		"loss":               m["loss"],
		"asset":              m["asset"],
		"environment":        m["env"],
		"nodes":              nodeList,
		"edges":              edges,
		"traceCoverage":      coverage,
		"statesCovered":      statesCovered,
		"statesTotal":        statesTotal,
		"validationFindings": findings,
	}, nil
}

// assignTiers BFS-assigns each node's tier depth from the Loss root
// (§6.5.10.6). A node reachable through several branches takes its shallowest
// depth. Pure helper shared by assembleTree and unit tests.
func assignTiers(rootHid string, edges []atEdge) map[string]int {
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
	return tier
}

// reconcileTreeFindings loads the stored validationSnapshot from the Loss's
// AttackTreeJSON and compares it against the live graph (§6.5.10.12 steps
// 1–6). It returns an empty slice when no comparable snapshot exists.
func (s *Server) reconcileTreeFindings(ctx context.Context, tx neo4j.ManagedTransaction, lossHid string, lossProps any, treeNodes []atNode) []validationFinding {
	props, ok := lossProps.(map[string]any)
	if !ok {
		return []validationFinding{}
	}
	raw, _ := props["AttackTreeJSON"].(string)
	snap := parseTreeSnapshot(raw)
	if snap == nil || len(snap.Nodes) == 0 {
		return []validationFinding{}
	}

	// Live existence + current names for every snapshot node.
	hids := make([]string, 0, len(snap.Nodes))
	for _, n := range snap.Nodes {
		hids = append(hids, n.HID)
	}
	liveNodes := map[string]snapNode{}
	if res, err := tx.Run(ctx, `
		UNWIND $hids AS h
		MATCH (n {HID: h})
		RETURN n.HID AS hid, n.Name AS name, n.TypeName AS typeName`,
		map[string]any{"hids": hids}); err == nil {
		for res.Next(ctx) {
			rm := res.Record().AsMap()
			hid := str2s(rm["hid"])
			liveNodes[hid] = snapNode{HID: hid, Name: str2s(rm["name"]), TypeName: str2s(rm["typeName"])}
		}
	}

	// Live CURRENT trace (entity, State) pairs for the Loss's Asset.
	liveTraces := map[string]bool{}
	if res, err := tx.Run(ctx, `
		MATCH (loss:Loss {HID: $hid})
		MATCH (asset:Asset)-[:HAS_LOSS]->(loss)
		MATCH (e)-[t:HOLDS|TRANSPORTS|USES]->(asset)
		WHERE t.TraceStatus = 'CURRENT'
		RETURN e.HID AS entityHid, t.TraceStateHID AS stateHid`,
		map[string]any{"hid": lossHid}); err == nil {
		for res.Next(ctx) {
			rm := res.Record().AsMap()
			liveTraces[str2s(rm["entityHid"])+"|"+str2s(rm["stateHid"])] = true
		}
	}

	treeHids := map[string]bool{}
	for _, n := range treeNodes {
		treeHids[n.HID] = true
	}
	return reconcileFindings(*snap, liveNodes, treeHids, liveTraces, treeNodes)
}

// reconcileFindings is the pure snapshot-vs-live comparison (§6.5.10.12):
//   - snapshot node gone from graph          → ERROR *_REMOVED
//   - snapshot node in graph but not in tree → WARNING EDGE_REMOVED
//   - snapshot node renamed                  → INFO NAME_CHANGED
//   - snapshot trace no longer CURRENT       → ERROR TRACE_INVALIDATED
//   - tree node absent from snapshot         → INFO NODE_ADDED
func reconcileFindings(snap treeSnapshot, liveNodes map[string]snapNode, treeHids map[string]bool, liveTraces map[string]bool, treeNodes []atNode) []validationFinding {
	findings := []validationFinding{}
	snapSet := map[string]bool{}
	for _, sn := range snap.Nodes {
		snapSet[sn.HID] = true
		live, exists := liveNodes[sn.HID]
		if !exists {
			findings = append(findings, validationFinding{
				Severity: "ERROR",
				Type:     removedFindingType(sn.TypeName),
				NodeHID:  sn.HID,
				Message:  fmt.Sprintf("%s %q (%s) was removed from the graph since the last tree build. Rebuild the tree.", sn.TypeName, sn.Name, sn.HID),
			})
			continue
		}
		if !treeHids[sn.HID] {
			findings = append(findings, validationFinding{
				Severity: "WARNING",
				Type:     "EDGE_REMOVED",
				NodeHID:  sn.HID,
				Message:  fmt.Sprintf("%s %q (%s) still exists but is no longer connected in this Attack Tree.", sn.TypeName, sn.Name, sn.HID),
			})
		}
		if live.Name != sn.Name {
			findings = append(findings, validationFinding{
				Severity: "INFO",
				Type:     "NAME_CHANGED",
				NodeHID:  sn.HID,
				Message:  fmt.Sprintf("%s %s was renamed from %q to %q since the last tree build.", sn.TypeName, sn.HID, sn.Name, live.Name),
			})
		}
	}
	for _, tr := range snap.Traces {
		if !liveTraces[tr.EntityHID+"|"+tr.StateHID] {
			findings = append(findings, validationFinding{
				Severity: "ERROR",
				Type:     "TRACE_INVALIDATED",
				NodeHID:  tr.EntityHID,
				Message:  fmt.Sprintf("Trace for entity %s in State %s is no longer CURRENT. Verify with the Trace Tool, then Rebuild Tree.", tr.EntityHID, tr.StateHID),
			})
		}
	}
	for _, n := range treeNodes {
		if !snapSet[n.HID] {
			findings = append(findings, validationFinding{
				Severity: "INFO",
				Type:     "NODE_ADDED",
				NodeHID:  n.HID,
				Message:  fmt.Sprintf("%s %q (%s) was added to the tree since the last snapshot.", n.TypeName, n.Name, n.HID),
			})
		}
	}
	return findings
}

func removedFindingType(typeName string) string {
	switch typeName {
	case "Attack":
		return "ATTACK_REMOVED"
	case "Countermeasure":
		return "COUNTERMEASURE_REMOVED"
	case "State":
		return "STATE_REMOVED"
	case "Environment":
		return "ENVIRONMENT_REMOVED"
	case "Loss":
		return "LOSS_REMOVED"
	default:
		return "ENTITY_REMOVED"
	}
}

// parseTreeSnapshot extracts the validationSnapshot from an AttackTreeJSON
// document; nil when absent or unparseable.
func parseTreeSnapshot(raw string) *treeSnapshot {
	if raw == "" {
		return nil
	}
	var wrapper struct {
		ValidationSnapshot treeSnapshot `json:"validationSnapshot"`
	}
	if err := json.Unmarshal([]byte(raw), &wrapper); err != nil {
		return nil
	}
	return &wrapper.ValidationSnapshot
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

	// T5+ counter-attack recursion (§6.5.10.6 T5/T6+, §6.5.10.7 step 6):
	// alternate (:Attack)-[:DEFEATS]->(:Countermeasure) counter-attacks and
	// the countermeasures that [:BLOCKS] them, until fixpoint or the maximum
	// tree depth (12 tiers → 4 rounds past T4). The ancestor NOT EXISTS
	// guards keep the per-Loss edge set acyclic.
	counterAttacks := `
		MATCH ()-[:AT_RELATES_TO {LossHID: $hid}]->(cm:Countermeasure)
		MATCH (catk:Attack)-[:DEFEATS]->(cm)
		WITH DISTINCT cm, catk
		WHERE NOT EXISTS { MATCH (cm)-[:AT_RELATES_TO {LossHID: $hid}]->(catk) }
		  AND NOT EXISTS { MATCH (catk)-[:AT_RELATES_TO*1..12 {LossHID: $hid}]->(cm) }
		MERGE (cm)-[ca:AT_RELATES_TO {LossHID: $hid, counterKey: catk.HID}]->(catk)
		ON CREATE SET ca.Lossuuid = $lossUuid, ca.LogicOperator = 'OR', ca.TailoredOut = false
		RETURN count(*) AS created`
	counterBlocks := `
		MATCH (:Countermeasure)-[:AT_RELATES_TO {LossHID: $hid}]->(catk:Attack)
		MATCH (cm2:Countermeasure)-[:BLOCKS]->(catk)
		WITH DISTINCT catk, cm2
		WHERE NOT EXISTS { MATCH (catk)-[:AT_RELATES_TO {LossHID: $hid}]->(cm2) }
		  AND NOT EXISTS { MATCH (cm2)-[:AT_RELATES_TO*1..12 {LossHID: $hid}]->(catk) }
		MERGE (catk)-[ce:AT_RELATES_TO {LossHID: $hid, cmKey: cm2.HID}]->(cm2)
		ON CREATE SET ce.Lossuuid = $lossUuid, ce.LogicOperator = 'AND', ce.TailoredOut = false
		RETURN count(*) AS created`
	for round := 0; round < 4; round++ {
		created := int64(0)
		for _, q := range []string{counterAttacks, counterBlocks} {
			res, err := tx.Run(ctx, q, map[string]any{"hid": lossHid, "lossUuid": lossUUID})
			if err != nil {
				return nil, fmt.Errorf("counter-attack tier construction: %w", err)
			}
			rec, err := res.Single(ctx)
			if err != nil {
				return nil, err
			}
			if n, ok := rec.AsMap()["created"].(int64); ok {
				created += n
			}
		}
		if created == 0 {
			break
		}
	}

	// Post-build computation (§6.5.10.7): compute paths, RVs, validity.
	tree, err := s.assembleTree(ctx, tx, lossHid)
	if err != nil {
		return nil, err
	}
	stats := computeTreeStats(tree, nil)

	// Validation snapshot (§6.5.10.12): fingerprint of the built tree plus
	// the CURRENT trace pairs it was derived from, for change detection.
	treeNodes, _ := tree["nodes"].([]atNode)
	snapshot := treeSnapshot{
		BuiltAt:     timeNow().UTC().Format(time.RFC3339),
		Environment: envHid,
	}
	for _, n := range treeNodes {
		snapshot.Nodes = append(snapshot.Nodes, snapNode{HID: n.HID, TypeName: n.TypeName, Name: n.Name})
	}
	if res, err := tx.Run(ctx, `
		MATCH (loss:Loss {HID: $hid})
		MATCH (asset:Asset)-[:HAS_LOSS]->(loss)
		MATCH (e)-[t:HOLDS|TRANSPORTS|USES]->(asset)
		WHERE t.TraceStatus = 'CURRENT'
		RETURN e.HID AS entityHid, t.TraceStateHID AS stateHid`,
		map[string]any{"hid": lossHid}); err == nil {
		for res.Next(ctx) {
			rm := res.Record().AsMap()
			snapshot.Traces = append(snapshot.Traces, snapTrace{
				EntityHID: str2s(rm["entityHid"]), StateHID: str2s(rm["stateHid"]),
			})
		}
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
		    loss.LastTreeBuild = datetime(),
		    loss.AttackTreeLastModified = datetime(),
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
