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
