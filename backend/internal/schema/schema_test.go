// Schema and identity model tests (SRS §3.3.3, §3.3.4, §3.3.8).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package schema

import "testing"

func mustLoad(t *testing.T) *Schema {
	t.Helper()
	s, err := Load()
	if err != nil {
		t.Fatalf("schema load: %v", err)
	}
	return s
}

func TestLoadSchema(t *testing.T) {
	s := mustLoad(t)
	if len(s.NodeTypes) < 35 {
		t.Errorf("expected ≥35 node labels, got %d", len(s.NodeTypes))
	}
	if len(s.Relationships) < 100 {
		t.Errorf("expected ≥100 relationship triples, got %d", len(s.Relationships))
	}
	// Canonical labels from SRS §3.3.3 must exist.
	for _, l := range []string{"Project", "System", "Component", "SystemFunction",
		"Interface", "Connection", "Purpose", "State", "Asset", "Loss", "Attack",
		"Countermeasure", "SecurityControl", "ControlsBaseline", "Requirement", "UseCase", "GsnGoal"} {
		if !s.ValidLabel(l) {
			t.Errorf("missing canonical label %s", l)
		}
	}
}

func TestHIDPrefixes(t *testing.T) {
	s := mustLoad(t)
	want := map[string]string{
		"System": "SYS", "Component": "EL", "SystemFunction": "FUN",
		"Interface": "INT", "Requirement": "REQ", "Asset": "AST",
		"Project": "CAP", "Loss": "LOS", "SecurityControl": "CTRL",
		"ControlsBaseline": "CBL",
	}
	for label, prefix := range want {
		if s.NodeTypes[label].HIDPrefix != prefix {
			t.Errorf("%s: want prefix %s, got %s", label, prefix, s.NodeTypes[label].HIDPrefix)
		}
		got, ok := s.LabelForHIDPrefix(prefix)
		if !ok || got != label {
			t.Errorf("prefix %s: want label %s, got %s (%v)", prefix, label, got, ok)
		}
	}
}

func TestRelationshipAllowed(t *testing.T) {
	s := mustLoad(t)
	valid := [][3]string{
		{"HAS_SYSTEM", "Project", "System"},
		{"PARENTS", "Component", "System"},
		{"PARENTS", "Requirement", "Requirement"},
		{"HAS_REQUIREMENT", "Purpose", "Requirement"},
		{"HOLDS", "Interface", "Asset"},
		{"USES", "Component", "Asset"},
		{"TRANSITIONS_TO", "State", "State"},
		{"SATISFIES", "Countermeasure", "SecurityControl"},
		{"THREATENS", "Hazard", "Asset"},
		{"EXPLOITS", "Attack", "Component"},
		{"PARTICIPATES_IN", "Interface", "Connection"},
		{"HAS_CONTROLS_BASELINE", "System", "ControlsBaseline"},
		{"SUPPORTED_BY", "GsnGoal", "GsnStrategy"},
	}
	for _, v := range valid {
		if !s.RelationshipAllowed(v[0], v[1], v[2]) {
			t.Errorf("expected (:%s)-[:%s]->(:%s) to be allowed", v[1], v[0], v[2])
		}
	}
	invalid := [][3]string{
		{"HAS_SYSTEM", "System", "Project"},   // wrong direction
		{"CONTAINS", "Component", "Asset"},    // retired by §3.3.4.5
		{"PARENTS", "System", "System"},       // not authorized
		{"HOLDS", "Purpose", "Asset"},         // wrong source
		{"MADE_UP_REL", "System", "Purpose"},  // unknown type
		{"TRANSITIONS_TO", "State", "System"}, // wrong target
	}
	for _, v := range invalid {
		if s.RelationshipAllowed(v[0], v[1], v[2]) {
			t.Errorf("expected (:%s)-[:%s]->(:%s) to be rejected", v[1], v[0], v[2])
		}
	}
}

func TestAcyclicGovernance(t *testing.T) {
	s := mustLoad(t)
	for _, rel := range []string{"PARENTS", "SUPPORTED_BY", "AT_RELATES_TO", "SUBORDINATE_TO", "EXTENDS", "INCLUDES_UC"} {
		if !s.IsAcyclic(rel) {
			t.Errorf("expected %s to be governed acyclic (SRS §3.3.6)", rel)
		}
	}
	for _, rel := range []string{"TRANSITIONS_TO", "FLOWS_TO_FUNCTION"} {
		if s.IsAcyclic(rel) {
			t.Errorf("expected %s to be cyclic-by-design (SRS §3.3.6)", rel)
		}
	}
}

func TestParseHID(t *testing.T) {
	h, err := ParseHID("SYS_1.2.3_0")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if h.TypePrefix != "SYS" || h.Index != "1.2.3" || h.Sequence != 0 {
		t.Errorf("unexpected parse result: %+v", h)
	}
	if h.String() != "SYS_1.2.3_0" {
		t.Errorf("round-trip failed: %s", h.String())
	}
	if h.SoIKey() != "1.2.3" {
		t.Errorf("SoI key: %s", h.SoIKey())
	}

	// Capability root: null index (§3.3.8.2).
	cap, err := ParseHID("CAP__0")
	if err != nil {
		t.Fatalf("capability HID: %v", err)
	}
	if cap.Index != "" {
		t.Errorf("capability index should be empty, got %q", cap.Index)
	}

	for _, bad := range []string{"", "SYS", "SYS_1.2", "sys_1_0", "SYS_1.2.3_x", "SYS_a.b_0"} {
		if _, err := ParseHID(bad); err == nil {
			t.Errorf("expected parse failure for %q", bad)
		}
	}
}

func TestChildSystemIndex(t *testing.T) {
	// SRS §3.3.8.2 example: Component EL_1.2.3_4 → child System SYS_1.2.3.4_0.
	el, _ := ParseHID("EL_1.2.3_4")
	if got := ChildSystemIndex(el); got != "1.2.3.4" {
		t.Errorf("want 1.2.3.4, got %s", got)
	}
	// Tier-1 component EL_1_2 → child system index "1.2".
	el2, _ := ParseHID("EL_1_2")
	if got := ChildSystemIndex(el2); got != "1.2" {
		t.Errorf("want 1.2, got %s", got)
	}
}

func TestPropertyDef(t *testing.T) {
	s := mustLoad(t)
	// Common property (§3.3.9).
	p, ok := s.PropertyDef("System", "Name")
	if !ok || p.Type != "String" {
		t.Errorf("Name property: ok=%v def=%+v", ok, p)
	}
	// Type-specific property (§3.3.10): Requirement RStatement.
	if _, ok := s.PropertyDef("Requirement", "RStatement"); !ok {
		t.Error("Requirement.RStatement missing")
	}
	// Unknown property rejected.
	if _, ok := s.PropertyDef("System", "NotARealProperty"); ok {
		t.Error("unexpected property def for NotARealProperty")
	}
}
