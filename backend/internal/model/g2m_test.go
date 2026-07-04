// G2M determinism and mapping tests (SRS §3.7.5–§3.7.8).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package model

import (
	"strings"
	"testing"
)

func sampleGraph() ([]Node, []Rel) {
	nodes := []Node{
		{HID: "SYS_1_0", Label: "System", Props: map[string]any{"Name": "Coastal Radar"}},
		{HID: "FUN_1_1", Label: "SystemFunction", Props: map[string]any{"Name": "Track Targets"}},
		{HID: "EL_1_1", Label: "Component", Props: map[string]any{"Name": "Signal Processor"}},
		{HID: "AST_1_1", Label: "Asset", Props: map[string]any{"Name": "Track Data", "Confidentiality": true}},
		{HID: "REQ_1_1", Label: "Requirement", Props: map[string]any{"Name": "Track accuracy", "RStatement": "The system SHALL be accurate."}},
	}
	rels := []Rel{
		{Type: "ALLOCATED_TO", SourceHID: "FUN_1_1", TargetHID: "EL_1_1"},
		{Type: "USES", SourceHID: "FUN_1_1", TargetHID: "AST_1_1", Props: map[string]any{"TraceStatus": "CURRENT"}},
		{Type: "HAS_REQUIREMENT", SourceHID: "EL_1_1", TargetHID: "REQ_1_1"},
	}
	return nodes, rels
}

func TestG2MDeterministic(t *testing.T) {
	n, r := sampleGraph()
	a := NewG2M(n, r, "SYS_1_0", "Coastal Radar").SysML()
	// Shuffle node order — output must be byte-identical (§3.7.8).
	n2 := []Node{n[4], n[0], n[3], n[1], n[2]}
	b := NewG2M(n2, r, "SYS_1_0", "Coastal Radar").SysML()
	if a != b {
		t.Errorf("G2M output not deterministic:\n--- A ---\n%s\n--- B ---\n%s", a, b)
	}
}

func TestG2MSysMLMappings(t *testing.T) {
	n, r := sampleGraph()
	out := NewG2M(n, r, "SYS_1_0", "Coastal Radar").SysML()
	wants := []string{
		"package 'Coastal Radar System Model'",
		"#system part <SYS_1_0> 'Coastal Radar'",  // §3.7.5 System→part #system
		"action <FUN_1_1> 'Track Targets'",         // SystemFunction→action
		"#element part <EL_1_1> 'Signal Processor'", // Component→part #element
		"allocate FUN_1_1 to EL_1_1",                // ALLOCATED_TO→allocate
		"requirement <REQ_1_1> 'Track accuracy'",    // Requirement→requirement usage
		"doc /* The system SHALL be accurate. */",   // RStatement→doc
		`#sstpa(schemaVersion="0.7")`,               // profile annotation §3.7.3
	}
	for _, w := range wants {
		if !strings.Contains(out, w) {
			t.Errorf("SysML output missing %q\n---\n%s", w, out)
		}
	}
}

func TestG2MKerMLMappings(t *testing.T) {
	n, r := sampleGraph()
	out := NewG2M(n, r, "SYS_1_0", "Coastal Radar").KerML()
	wants := []string{
		"import 'SSTPA Profile'::*;",                 // §3.7.4 analysis package imports profile
		"package 'Coastal Radar Security Analysis'",  // §3.7.4 KerML package name
		"feature <AST_1_1> 'Track Data' : Asset",     // §3.7.5 T2 Asset→feature : classifier
		"attribute confidentiality = true;",          // assurance flag emitted (§3.7.7)
	}
	for _, w := range wants {
		if !strings.Contains(out, w) {
			t.Errorf("KerML output missing %q\n---\n%s", w, out)
		}
	}
}

func TestDomainClassification(t *testing.T) {
	cases := map[string]string{
		"System": "SYSML", "Requirement": "SYSML", "Interface": "SYSML",
		"Asset": "KERML", "Loss": "KERML", "Attack": "KERML", "GsnGoal": "KERML",
		"Perspective": "NONE",
	}
	for label, want := range cases {
		if got := Domain(label); got != want {
			t.Errorf("Domain(%s) = %s, want %s", label, got, want)
		}
	}
}

func TestUnrestrictedNames(t *testing.T) {
	// HIDs contain "." and must be single-quoted unrestricted (§3.7.4).
	if got := unrestricted("SYS_1.2_0"); got != "'SYS_1.2_0'" {
		t.Errorf("unrestricted HID: got %s", got)
	}
	// Reserved words must be quoted.
	if got := unrestricted("part"); got != "'part'" {
		t.Errorf("reserved word: got %s", got)
	}
	// Basic names pass through.
	if got := unrestricted("Engine"); got != "Engine" {
		t.Errorf("basic name: got %s", got)
	}
}
