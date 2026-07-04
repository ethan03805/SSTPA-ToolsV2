// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import "testing"

func TestEnumeratePathsIgnoresNonTerminalLeaves(t *testing.T) {
	tree := map[string]any{
		"loss": map[string]any{"HID": "LOS_1_1"},
		"nodes": []atNode{
			{HID: "LOS_1_1", TypeName: "Loss", Name: "Loss"},
			{HID: "ENV_1_1", TypeName: "Environment", Name: "Environment"},
		},
		"edges": []atEdge{
			{SourceHID: "LOS_1_1", TargetHID: "ENV_1_1", LogicOperator: "AND"},
		},
	}

	paths := enumeratePaths(tree, "LOS_1_1", nil)
	if len(paths) != 0 {
		t.Fatalf("expected no terminal attack paths, got %d", len(paths))
	}
	stats := computeTreeStats(tree, nil)
	if stats.valid {
		t.Fatalf("environment-only tree should not be valid")
	}
}

func TestEnumeratePathsClassifiesAllowedRVAndMetrics(t *testing.T) {
	tree := map[string]any{
		"loss": map[string]any{"HID": "LOS_1_1"},
		"nodes": []atNode{
			{HID: "LOS_1_1", TypeName: "Loss", Name: "Loss"},
			{
				HID: "ATK_1_1", TypeName: "Attack", Name: "Attack",
				Props: map[string]any{"MetricsJSON": `{"AttackCost":7}`},
			},
		},
		"edges": []atEdge{
			{
				SourceHID: "LOS_1_1", TargetHID: "ATK_1_1", LogicOperator: "OR",
				Props: map[string]any{"AllowedRV": true},
			},
		},
	}
	defs := []metricDef{{
		MetricName:      "AttackCost",
		LeafDefault:     1,
		ANDFormula:      "SUM",
		ORFormula:       "MIN",
		SANDFormula:     "SUM",
		MetricDirection: "MINIMIZE",
	}}

	paths := enumeratePaths(tree, "LOS_1_1", defs)
	if len(paths) != 1 {
		t.Fatalf("expected one path, got %d", len(paths))
	}
	if paths[0].RVStatus != "ALLOWED_RV" {
		t.Fatalf("expected ALLOWED_RV, got %q", paths[0].RVStatus)
	}
	if got := paths[0].Metrics["AttackCost"]; got != 7 {
		t.Fatalf("expected AttackCost 7, got %v", got)
	}
}

// TestAssignTiersCounterAttackDepth verifies §6.5.10.6 tier conventions
// through the T5/T6 counter-attack rounds added by the auto-build recursion.
func TestAssignTiersCounterAttackDepth(t *testing.T) {
	edges := []atEdge{
		{SourceHID: "LOS_1_1", TargetHID: "ENV_1_1"}, // T1 Environment
		{SourceHID: "LOS_1_1", TargetHID: "ST_1_1"},  // T1 State
		{SourceHID: "ST_1_1", TargetHID: "INT_1_1"},  // T2 Entity
		{SourceHID: "INT_1_1", TargetHID: "ATK_1_1"}, // T3 Attack
		{SourceHID: "ATK_1_1", TargetHID: "CM_1_1"},  // T4 Countermeasure
		{SourceHID: "CM_1_1", TargetHID: "ATK_1_2"},  // T5 Counter-Attack
		{SourceHID: "ATK_1_2", TargetHID: "CM_1_2"},  // T6 Countermeasure
	}
	tiers := assignTiers("LOS_1_1", edges)
	want := map[string]int{
		"LOS_1_1": 0, "ENV_1_1": 1, "ST_1_1": 1, "INT_1_1": 2,
		"ATK_1_1": 3, "CM_1_1": 4, "ATK_1_2": 5, "CM_1_2": 6,
	}
	for hid, w := range want {
		if got, ok := tiers[hid]; !ok || got != w {
			t.Errorf("tier[%s] = %d (present %v), want %d", hid, got, ok, w)
		}
	}
}

// TestAssignTiersSharedNodeTakesShallowestDepth verifies the DAG convention
// that a node reachable through multiple branches sits at its minimum depth.
func TestAssignTiersSharedNodeTakesShallowestDepth(t *testing.T) {
	edges := []atEdge{
		{SourceHID: "LOS_1_1", TargetHID: "ST_1_1"},
		{SourceHID: "ST_1_1", TargetHID: "INT_1_1"},
		{SourceHID: "INT_1_1", TargetHID: "ATK_1_1"},
		{SourceHID: "ST_1_1", TargetHID: "ATK_1_1"}, // shortcut at T2
	}
	tiers := assignTiers("LOS_1_1", edges)
	if tiers["ATK_1_1"] != 2 {
		t.Fatalf("shared node should take shallowest tier 2, got %d", tiers["ATK_1_1"])
	}
}

// TestReconcileFindings verifies the §6.5.10.12 snapshot-vs-live comparison:
// removed nodes, detached nodes, renamed nodes, invalidated traces, and
// nodes added since the last build.
func TestReconcileFindings(t *testing.T) {
	snap := treeSnapshot{
		Environment: "ENV_1_1",
		Nodes: []snapNode{
			{HID: "ATK_1_1", TypeName: "Attack", Name: "Old Name"},
			{HID: "INT_1_1", TypeName: "Interface", Name: "Bus"},
			{HID: "CM_1_1", TypeName: "Countermeasure", Name: "Guard"},
		},
		Traces: []snapTrace{{EntityHID: "INT_1_1", StateHID: "ST_1_1"}},
	}
	liveNodes := map[string]snapNode{
		// INT_1_1 deleted from the graph. ATK_1_1 renamed. CM_1_1 unchanged
		// but detached from the tree.
		"ATK_1_1": {HID: "ATK_1_1", TypeName: "Attack", Name: "New Name"},
		"CM_1_1":  {HID: "CM_1_1", TypeName: "Countermeasure", Name: "Guard"},
	}
	treeNodes := []atNode{
		{HID: "ATK_1_1", TypeName: "Attack", Name: "New Name"},
		{HID: "ATK_1_9", TypeName: "Attack", Name: "Added Later"},
	}
	treeHids := map[string]bool{"ATK_1_1": true, "ATK_1_9": true}

	findings := reconcileFindings(snap, liveNodes, treeHids, map[string]bool{}, treeNodes)

	byType := map[string]validationFinding{}
	for _, f := range findings {
		byType[f.Type] = f
	}
	if f, ok := byType["ENTITY_REMOVED"]; !ok || f.Severity != "ERROR" || f.NodeHID != "INT_1_1" {
		t.Errorf("expected ERROR ENTITY_REMOVED for INT_1_1, got %+v", f)
	}
	if f, ok := byType["NAME_CHANGED"]; !ok || f.Severity != "INFO" || f.NodeHID != "ATK_1_1" {
		t.Errorf("expected INFO NAME_CHANGED for ATK_1_1, got %+v", f)
	}
	if f, ok := byType["EDGE_REMOVED"]; !ok || f.Severity != "WARNING" || f.NodeHID != "CM_1_1" {
		t.Errorf("expected WARNING EDGE_REMOVED for CM_1_1, got %+v", f)
	}
	if f, ok := byType["TRACE_INVALIDATED"]; !ok || f.Severity != "ERROR" || f.NodeHID != "INT_1_1" {
		t.Errorf("expected ERROR TRACE_INVALIDATED for INT_1_1, got %+v", f)
	}
	if f, ok := byType["NODE_ADDED"]; !ok || f.Severity != "INFO" || f.NodeHID != "ATK_1_9" {
		t.Errorf("expected INFO NODE_ADDED for ATK_1_9, got %+v", f)
	}
	if len(findings) != 5 {
		t.Errorf("expected exactly 5 findings, got %d: %+v", len(findings), findings)
	}
}

// TestReconcileFindingsSkipsEmptySnapshot ensures pre-upgrade AttackTreeJSON
// documents (no node fingerprints) produce no findings noise.
func TestParseTreeSnapshotLegacyFormat(t *testing.T) {
	snap := parseTreeSnapshot(`{"schemaVersion":"1.0","validationSnapshot":{"builtAt":"auto","environment":"ENV_1_1"}}`)
	if snap == nil {
		t.Fatal("expected snapshot to parse")
	}
	if len(snap.Nodes) != 0 {
		t.Fatalf("legacy snapshot should have no node fingerprints, got %d", len(snap.Nodes))
	}
	if parseTreeSnapshot("") != nil {
		t.Fatal("empty AttackTreeJSON should yield nil snapshot")
	}
	if parseTreeSnapshot("{not json") != nil {
		t.Fatal("malformed AttackTreeJSON should yield nil snapshot")
	}
}

// TestEnumeratePathsCounterAttackLeafIsRV verifies a T5 counter-attack leaf
// terminates a path as a Residual Vulnerability (§6.5.10.9).
func TestEnumeratePathsCounterAttackLeafIsRV(t *testing.T) {
	tree := map[string]any{
		"loss": map[string]any{"HID": "LOS_1_1"},
		"nodes": []atNode{
			{HID: "LOS_1_1", TypeName: "Loss", Name: "Loss"},
			{HID: "ATK_1_1", TypeName: "Attack", Name: "Attack"},
			{HID: "CM_1_1", TypeName: "Countermeasure", Name: "Guard"},
			{HID: "ATK_1_2", TypeName: "Attack", Name: "Counter-Attack"},
		},
		"edges": []atEdge{
			{SourceHID: "LOS_1_1", TargetHID: "ATK_1_1", LogicOperator: "OR"},
			{SourceHID: "ATK_1_1", TargetHID: "CM_1_1", LogicOperator: "AND"},
			{SourceHID: "CM_1_1", TargetHID: "ATK_1_2", LogicOperator: "OR"},
		},
	}
	paths := enumeratePaths(tree, "LOS_1_1", nil)
	if len(paths) != 1 {
		t.Fatalf("expected one path, got %d", len(paths))
	}
	if paths[0].RVStatus != "RV" {
		t.Fatalf("counter-attack leaf should be an unaddressed RV, got %q", paths[0].RVStatus)
	}
	if got := len(paths[0].Sequence); got != 4 {
		t.Fatalf("expected 4-node path through the counter-attack tier, got %d", got)
	}
}

func TestEnumeratePathsSkipsTailoredOutEdges(t *testing.T) {
	tree := map[string]any{
		"loss": map[string]any{"HID": "LOS_1_1"},
		"nodes": []atNode{
			{HID: "LOS_1_1", TypeName: "Loss", Name: "Loss"},
			{HID: "ATK_1_1", TypeName: "Attack", Name: "Attack"},
		},
		"edges": []atEdge{
			{SourceHID: "LOS_1_1", TargetHID: "ATK_1_1", LogicOperator: "OR", TailoredOut: true},
		},
	}

	paths := enumeratePaths(tree, "LOS_1_1", nil)
	if len(paths) != 0 {
		t.Fatalf("expected tailored-out edge to be excluded, got %d paths", len(paths))
	}
}
