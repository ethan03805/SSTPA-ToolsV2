// Model translation unit tests (SRS §3.7.8 determinism, §3.7.4 identity
// rules, §3.7.9 M2G parse subset).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package model

import (
	"strings"
	"testing"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

func testGraph() *Graph {
	return &Graph{
		SoIHID:  "SYS_1_0",
		SoIName: "Coastal Radar",
		Nodes: []Node{
			{HID: "AST_1_1", Label: "Asset", Props: map[string]any{
				"Name": "Track Data", "Confidentiality": true,
				"ShortDescription": "Fused track picture",
			}},
			{HID: "SYS_1_0", Label: "System", Props: map[string]any{
				"Name": "Coastal Radar", "ShortDescription": "Shore surveillance radar",
			}},
			{HID: "INT_1_1", Label: "Interface", Props: map[string]any{
				"Name": "Track Feed",
			}},
			{HID: "PUR_1_1", Label: "Purpose", Props: map[string]any{
				"Name": "Default Purpose",
			}},
			{HID: "REQ_1_1", Label: "Requirement", Props: map[string]any{
				"Name":       "Protect Track Data",
				"RStatement": "Track Feed SHALL protect the Confidentiality of Track Data.",
			}},
			{HID: "ST_1_1", Label: "State", Props: map[string]any{
				"Name": "Operate",
			}},
			{HID: "LOS_1_1", Label: "Loss", Props: map[string]any{
				"Name": "Loss of Track Data",
			}},
		},
		Rels: []Rel{
			{Type: "HAS_INTERFACE", Source: "SYS_1_0", Target: "INT_1_1"},
			{Type: "REALIZES", Source: "SYS_1_0", Target: "PUR_1_1"},
			{Type: "EXHIBITS", Source: "SYS_1_0", Target: "ST_1_1"},
			{Type: "HAS_REQUIREMENT", Source: "INT_1_1", Target: "REQ_1_1"},
			{Type: "HOLDS", Source: "INT_1_1", Target: "AST_1_1", Props: map[string]any{
				"TraceStatus": "CURRENT", "TraceStateHID": "ST_1_1", "TraceVersion": int64(1),
			}},
			{Type: "HAS_LOSS", Source: "AST_1_1", Target: "LOS_1_1"},
			{Type: "REFERENCES", Source: "AST_1_1",
				RefFramework: "ATT&CK", RefExternalID: "T1005", RefSourceURI: "https://attack.mitre.org"},
		},
	}
}

func loadSchema(t *testing.T) *schema.Schema {
	t.Helper()
	sch, err := schema.Load()
	if err != nil {
		t.Fatalf("schema.Load: %v", err)
	}
	return sch
}

func TestG2MDeterministic(t *testing.T) {
	sch := loadSchema(t)
	s1, k1 := EmitSoI(sch, testGraph(), "0.7")
	s2, k2 := EmitSoI(sch, testGraph(), "0.7")
	if s1 != s2 || k1 != k2 {
		t.Fatal("G2M output is not deterministic across runs (SRS §3.7.8)")
	}
}

func TestG2MSysMLStructure(t *testing.T) {
	sch := loadSchema(t)
	sysml, kerml := EmitSoI(sch, testGraph(), "0.7")

	for _, want := range []string{
		"package <'SYS_1_0.SM'> 'Coastal Radar System Model'",
		"#sstpa { schemaVersion = \"0.7\" }",
		"part <'SYS_1_0'> 'Coastal Radar' #system",
		"port <'INT_1_1'> 'Track Feed'",
		"requirement <'REQ_1_1'> 'Protect Track Data'",
		"concern <'PUR_1_1'> 'Default Purpose' #purpose;",
		"doc Short /* Shore surveillance radar */",
	} {
		if !strings.Contains(sysml, want) {
			t.Errorf("SysML output missing %q\n---\n%s", want, sysml)
		}
	}
	// KERML content stays out of the SysML package.
	if strings.Contains(sysml, "AST_1_1") {
		t.Errorf("Asset leaked into the SysML System Model package")
	}

	for _, want := range []string{
		"package <'SYS_1_0.SA'> 'Coastal Radar Security Analysis'",
		"import 'Coastal Radar System Model'::*;",
		"import 'SSTPA Profile'::*;",
		"feature <'AST_1_1'> 'Track Data' : Asset",
		"feature Confidentiality = true;",
		"connector : Holds ( 'INT_1_1', 'AST_1_1' )",
		"connector : HasLoss ( 'AST_1_1', 'LOS_1_1' );",
		"#externalref { framework = \"ATT&CK\"; externalId = \"T1005\"; sourceUri = \"https://attack.mitre.org\"; }",
	} {
		if !strings.Contains(kerml, want) {
			t.Errorf("KerML output missing %q\n---\n%s", want, kerml)
		}
	}
	// Reference content is annotation-only (§3.7.2).
	if strings.Contains(kerml, "T1005 content") {
		t.Errorf("reference content embedded")
	}
}

func TestG2MOmitsSupersededTrace(t *testing.T) {
	sch := loadSchema(t)
	g := testGraph()
	g.Rels = append(g.Rels, Rel{
		Type: "HOLDS", Source: "INT_1_1", Target: "AST_1_1",
		Props: map[string]any{"TraceStatus": "SUPERSEDED", "TraceStateHID": "ST_1_1"},
	})
	_, kerml := EmitSoI(sch, g, "0.7")
	if strings.Count(kerml, "connector : Holds") != 1 {
		t.Errorf("superseded trace relationship was emitted (SRS §3.7.2)\n%s", kerml)
	}
}

func TestG2MOmitsBookkeeping(t *testing.T) {
	sch := loadSchema(t)
	g := testGraph()
	g.Nodes[0].Props["Owner"] = "alice"
	g.Nodes[0].Props["AttackTreeJSON"] = "{}"
	sysml, kerml := EmitSoI(sch, g, "0.7")
	all := sysml + kerml
	if strings.Contains(all, "alice") || strings.Contains(all, "AttackTreeJSON") {
		t.Errorf("bookkeeping or tool-state property emitted (SRS §3.7.2)")
	}
}

func TestUnrestrictedNames(t *testing.T) {
	if quoteName("Coastal Radar") != "'Coastal Radar'" {
		t.Errorf("space-bearing name must be unrestricted")
	}
	if quoteName("state") != "'state'" {
		t.Errorf("reserved word must be unrestricted")
	}
	if quoteName("Radar42") != "Radar42" {
		t.Errorf("legal basic name should not be quoted")
	}
	if shortName("SYS_1.2_0") != "<'SYS_1.2_0'>" {
		t.Errorf("HID short names are always unrestricted")
	}
	if quoteName("it's") != `'it\'s'` {
		t.Errorf("quote escaping wrong: %s", quoteName("it's"))
	}
}

func TestM2GParseRoundTrip(t *testing.T) {
	sch := loadSchema(t)
	sysml, kerml := EmitSoI(sch, testGraph(), "0.7")

	parsed := Parse(sysml + kerml)
	if len(parsed.Diagnostics) > 0 {
		t.Fatalf("canonical G2M output produced diagnostics: %+v", parsed.Diagnostics)
	}
	byHid := map[string]ElementEdit{}
	for _, el := range parsed.Elements {
		byHid[el.HID] = el
	}
	if _, ok := byHid["SYS_1_0"]; !ok {
		t.Errorf("system element not parsed")
	}
	ast, ok := byHid["AST_1_1"]
	if !ok {
		t.Fatalf("asset element not parsed; got %v", parsed.Elements)
	}
	if ast.Props["Confidentiality"] != true {
		t.Errorf("asset Confidentiality not parsed: %+v", ast.Props)
	}
	if ast.ShortDesc == nil || *ast.ShortDesc != "Fused track picture" {
		t.Errorf("asset Short doc not parsed: %+v", ast.ShortDesc)
	}
}

func TestM2GParseEdit(t *testing.T) {
	text := `package <'SYS_1_0.SM'> 'X System Model' {
	part <'SYS_1_0'> 'Coastal Radar' #system {
		doc Short /* updated short */
		attribute 'SystemType' = "CYBER_PHYSICAL";
	}
}`
	parsed := Parse(text)
	if len(parsed.Elements) != 1 {
		t.Fatalf("expected 1 element, got %d", len(parsed.Elements))
	}
	el := parsed.Elements[0]
	if el.HID != "SYS_1_0" || el.Props["SystemType"] != "CYBER_PHYSICAL" {
		t.Errorf("edit not parsed: %+v", el)
	}
	if el.ShortDesc == nil || *el.ShortDesc != "updated short" {
		t.Errorf("doc edit not parsed")
	}
}

func TestM2GBadLiteralDiagnostic(t *testing.T) {
	text := `part <'SYS_1_0'> 'X' {
	attribute 'Foo' = not-a-literal!;
}`
	parsed := Parse(text)
	if len(parsed.Diagnostics) != 1 || parsed.Diagnostics[0].Rule != "M2G-LITERAL" {
		t.Errorf("expected one M2G-LITERAL diagnostic, got %+v", parsed.Diagnostics)
	}
	if parsed.Diagnostics[0].Line != 2 {
		t.Errorf("diagnostic line = %d, want 2", parsed.Diagnostics[0].Line)
	}
}

func TestProfileLibraryVersionBinding(t *testing.T) {
	p := ProfileLibrary("0.7")
	if !strings.Contains(p, `schemaVersion = "0.7"`) {
		t.Errorf("profile not bound to schema version (SRS §3.7.3)")
	}
	for _, want := range []string{"classifier Asset", "assoc AtSand specializes AtRefinement", "metadata def <'#externalref'>"} {
		if !strings.Contains(p, want) {
			t.Errorf("profile missing %q", want)
		}
	}
}
