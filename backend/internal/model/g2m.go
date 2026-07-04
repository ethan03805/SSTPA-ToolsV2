// G2M translator (SRS §3.7.5–§3.7.8): Core Data Model graph → SysML 2.0 /
// KerML 1.0 textual notation. Deterministic and idempotent: identical input
// graphs yield byte-identical output, ordered by HID type-identifier order
// (§3.3.8.1) then Sequence Number (§3.7.8).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package model

import (
	"fmt"
	"sort"
	"strings"
)

// Node is a Core Data Model node projected for translation.
type Node struct {
	HID      string
	UUID     string
	Label    string // canonical node label, e.g. "SystemFunction"
	Props    map[string]any
}

// Rel is a projected relationship.
type Rel struct {
	Type      string
	SourceHID string
	TargetHID string
	Props     map[string]any
}

// Domain classifies a node label as SYSML, KERML, or NONE (§3.3.3 table).
func Domain(label string) string {
	switch label {
	case "Project", "Sandbox", "System", "Environment", "Connection", "Interface",
		"SystemFunction", "Component", "State", "Purpose", "UseCase", "Constraint",
		"Requirement", "Validation", "Verification", "FunctionalFlow":
		return "SYSML"
	case "Perspective":
		return "NONE"
	default:
		return "KERML"
	}
}

// HID type-identifier ordering for deterministic output (§3.3.8.1 order).
var typeOrder = map[string]int{
	"CAP": 0, "SB": 1, "SYS": 2, "ENV": 3, "CNN": 4, "INT": 5, "FUN": 6,
	"EL": 7, "PUR": 8, "ST": 9, "CS": 10, "AST": 11, "CST": 12, "REQ": 13,
	"VAL": 14, "CTRL": 15, "CM": 16, "VER": 17, "CAL": 18, "PM": 19, "ACT": 20,
	"FB": 21, "CP": 22, "HAZ": 23, "CBL": 24, "LOS": 25, "ATK": 26, "REG": 27,
	"G": 28, "SGY": 29, "CX": 30, "ASM": 31, "JUS": 32, "SOL": 33, "UC": 34,
	"PRS": 35, "SEC": 36, "FF": 37, "DA": 38,
}

func hidPrefix(hid string) string {
	if i := strings.Index(hid, "_"); i > 0 {
		return hid[:i]
	}
	return hid
}

func hidSequence(hid string) int {
	parts := strings.Split(hid, "_")
	if len(parts) < 3 {
		return 0
	}
	var n int
	fmt.Sscanf(parts[len(parts)-1], "%d", &n)
	return n
}

// sortNodes orders nodes by HID type-identifier order then sequence (§3.7.8).
func sortNodes(nodes []Node) {
	sort.SliceStable(nodes, func(i, j int) bool {
		oi := typeOrder[hidPrefix(nodes[i].HID)]
		oj := typeOrder[hidPrefix(nodes[j].HID)]
		if oi != oj {
			return oi < oj
		}
		return hidSequence(nodes[i].HID) < hidSequence(nodes[j].HID)
	})
}

// prop returns a non-default string property or "".
func prop(n Node, key string) string {
	v, ok := n.Props[key]
	if !ok || v == nil {
		return ""
	}
	s := fmt.Sprintf("%v", v)
	if s == "null" || s == "Null" || s == "N/A" {
		return ""
	}
	return s
}

func boolProp(n Node, key string) bool {
	v, ok := n.Props[key]
	if !ok {
		return false
	}
	b, _ := v.(bool)
	return b
}

// unrestricted emits a KerML unrestricted name (single-quoted) — used for HIDs
// (contain ".") and for declaredName when not a legal basic name (§3.7.4).
func unrestricted(s string) string {
	if s == "" {
		return "''"
	}
	if isBasicName(s) {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", "\\'") + "'"
}

func isBasicName(s string) bool {
	for i, r := range s {
		if r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			continue
		}
		if i > 0 && r >= '0' && r <= '9' {
			continue
		}
		return false
	}
	return len(s) > 0 && !reservedWords[strings.ToLower(s)]
}

var reservedWords = map[string]bool{
	"part": true, "port": true, "action": true, "state": true, "item": true,
	"attribute": true, "requirement": true, "constraint": true, "package": true,
	"connection": true, "interface": true, "use": true, "case": true, "def": true,
	"end": true, "in": true, "out": true, "ref": true, "doc": true,
}

// Scope selects the translation extent (§3.7.8).
type Scope string

const (
	ScopeCapability Scope = "CAPABILITY"
	ScopeSoI        Scope = "SOI"
	ScopeNodeSet    Scope = "NODESET"
)

// G2M holds the graph projection and produces SysML/KerML text.
type G2M struct {
	nodes   []Node
	byHID   map[string]Node
	rels    []Rel
	relsBy  map[string][]Rel // outgoing rels by source HID
	soiName string
	soiHID  string
}

// NewG2M builds a translator over a node/relationship projection.
func NewG2M(nodes []Node, rels []Rel, soiHID, soiName string) *G2M {
	g := &G2M{
		byHID:   map[string]Node{},
		relsBy:  map[string][]Rel{},
		soiHID:  soiHID,
		soiName: soiName,
	}
	g.nodes = append(g.nodes, nodes...)
	for _, n := range nodes {
		g.byHID[n.HID] = n
	}
	g.rels = rels
	for _, r := range rels {
		g.relsBy[r.SourceHID] = append(g.relsBy[r.SourceHID], r)
	}
	return g
}

// SysML emits the SYSML-domain package "<SoI> System Model" (§3.7.4).
func (g *G2M) SysML() string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("// SSTPA G2M — SysML 2.0 projection (SRS §3.7)\n"))
	b.WriteString(fmt.Sprintf("// #sstpa(schemaVersion=\"%s\")\n\n", SSTPAProfileVersion))
	title := g.soiName
	if title == "" {
		title = "SoI"
	}
	b.WriteString(fmt.Sprintf("package %s {\n", unrestricted(title+" System Model")))

	sysNodes := g.filterDomain("SYSML")
	sortNodes(sysNodes)
	for _, n := range sysNodes {
		g.emitSysMLNode(&b, n, 1)
	}
	b.WriteString("}\n")
	return b.String()
}

// KerML emits the KERML-domain package "<SoI> Security Analysis" (§3.7.4).
func (g *G2M) KerML() string {
	var b strings.Builder
	b.WriteString("// SSTPA G2M — KerML 1.0 projection (SRS §3.7)\n")
	b.WriteString(fmt.Sprintf("// #sstpa(schemaVersion=\"%s\")\n\n", SSTPAProfileVersion))
	title := g.soiName
	if title == "" {
		title = "SoI"
	}
	b.WriteString("import 'SSTPA Profile'::*;\n\n")
	b.WriteString(fmt.Sprintf("package %s {\n", unrestricted(title+" Security Analysis")))

	kermlNodes := g.filterDomain("KERML")
	sortNodes(kermlNodes)
	for _, n := range kermlNodes {
		g.emitKerMLNode(&b, n, 1)
	}
	// Cross-domain analysis connectors (Attack exploits, Countermeasure blocks…).
	g.emitAnalysisConnectors(&b, 1)
	b.WriteString("}\n")
	return b.String()
}

func (g *G2M) filterDomain(domain string) []Node {
	var out []Node
	for _, n := range g.nodes {
		if Domain(n.Label) == domain {
			out = append(out, n)
		}
	}
	return out
}

func indent(n int) string { return strings.Repeat("    ", n) }

// docLine emits ShortDescription/LongDescription as SysML doc comments.
func (g *G2M) docLines(b *strings.Builder, n Node, depth int) {
	if s := prop(n, "ShortDescription"); s != "" {
		b.WriteString(fmt.Sprintf("%sdoc Short /* %s */\n", indent(depth), escapeDoc(s)))
	}
	if s := prop(n, "LongDescription"); s != "" {
		b.WriteString(fmt.Sprintf("%sdoc Full /* %s */\n", indent(depth), escapeDoc(s)))
	}
}

func escapeDoc(s string) string {
	return strings.ReplaceAll(s, "*/", "* /")
}

// header emits the KerML short-name/declared-name pair (§3.7.4).
func head(n Node) string {
	name := prop(n, "Name")
	if name == "" {
		name = "New"
	}
	return fmt.Sprintf("<%s> %s", unrestricted(n.HID), unrestricted(name))
}
