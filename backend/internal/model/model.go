// Package model implements the SysML 2.0 / KerML 1.0 textual projection of
// the Core Data Model (SRS §3.7): the G2M translator (graph → model text),
// the SSTPA Profile Library, and the M2G property-edit subset (model text →
// staged mutations).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package model

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

// Node is a graph node in the translation scope.
type Node struct {
	HID   string
	Label string
	Props map[string]any
}

// Rel is a relationship in the translation scope. For [:REFERENCES] edges,
// RefFramework/RefExternalID/RefSourceURI carry the annotation content
// (reference item content itself is never embedded, SRS §3.7.2).
type Rel struct {
	Type   string
	Source string
	Target string
	Props  map[string]any

	RefFramework  string
	RefExternalID string
	RefSourceURI  string
}

// Graph is the translation input: one SoI sub-graph (SRS §3.7.8 SOI scope).
type Graph struct {
	SoIHID  string
	SoIName string
	Nodes   []Node
	Rels    []Rel
}

// hidOrder is the §3.3.8.1 node type identifier order, which G2M uses as the
// deterministic emission order (SRS §3.7.8).
var hidOrder = []string{
	"CAP", "SB", "SYS", "ENV", "CNN", "INT", "FUN", "EL", "PUR", "ST",
	"CS", "AST", "CST", "REQ", "VAL", "CTRL", "CM", "VER", "CAL", "PM",
	"ACT", "FB", "CP", "HAZ", "CBL", "LOS", "ATK", "REG", "G", "SGY",
	"CX", "ASM", "JUS", "SOL", "UC", "PRS", "SEC", "FF", "DA",
}

var hidRank = func() map[string]int {
	m := map[string]int{}
	for i, p := range hidOrder {
		m[p] = i
	}
	return m
}()

type hidKey struct {
	rank  int
	index string
	seq   int
	raw   string
}

func parseHIDKey(hid string) hidKey {
	k := hidKey{rank: len(hidOrder), raw: hid}
	parts := strings.Split(hid, "_")
	if len(parts) == 3 {
		if r, ok := hidRank[parts[0]]; ok {
			k.rank = r
		}
		k.index = parts[1]
		k.seq, _ = strconv.Atoi(parts[2])
	}
	return k
}

func hidLess(a, b string) bool {
	ka, kb := parseHIDKey(a), parseHIDKey(b)
	if ka.rank != kb.rank {
		return ka.rank < kb.rank
	}
	if ka.index != kb.index {
		return ka.index < kb.index
	}
	if ka.seq != kb.seq {
		return ka.seq < kb.seq
	}
	return ka.raw < kb.raw
}

// sortNodes orders nodes per §3.7.8 (HID type identifier order, then index,
// then sequence).
func sortNodes(nodes []Node) {
	sort.Slice(nodes, func(i, j int) bool { return hidLess(nodes[i].HID, nodes[j].HID) })
}

func sortRels(rels []Rel) {
	sort.Slice(rels, func(i, j int) bool {
		if rels[i].Type != rels[j].Type {
			return rels[i].Type < rels[j].Type
		}
		if rels[i].Source != rels[j].Source {
			return hidLess(rels[i].Source, rels[j].Source)
		}
		return hidLess(rels[i].Target, rels[j].Target)
	})
}

var basicName = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// reservedWords covers the SysML 2.0 / KerML 1.0 keywords that force
// unrestricted-name quoting (§3.7.4).
var reservedWords = map[string]bool{
	"about": true, "abstract": true, "action": true, "actor": true,
	"attribute": true, "binding": true, "case": true, "comment": true,
	"connect": true, "connection": true, "connector": true, "constraint": true,
	"datatype": true, "dependency": true, "doc": true, "end": true,
	"entry": true, "exit": true, "feature": true, "first": true, "flow": true,
	"import": true, "in": true, "include": true, "interface": true,
	"item": true, "metadata": true, "out": true, "package": true, "part": true,
	"perform": true, "port": true, "private": true, "protected": true,
	"public": true, "ref": true, "requirement": true, "state": true,
	"struct": true, "subject": true, "succession": true, "then": true,
	"transition": true, "type": true, "use": true, "verification": true,
	"verify": true, "view": true, "concern": true, "allocate": true,
	"assoc": true, "behavior": true, "classifier": true, "step": true,
}

// quoteName emits a declared name: a basic name when legal, otherwise the
// KerML unrestricted (single-quoted) form (§3.7.4).
func quoteName(name string) string {
	if basicName.MatchString(name) && !reservedWords[strings.ToLower(name)] {
		return name
	}
	return "'" + strings.NewReplacer("\\", "\\\\", "'", "\\'").Replace(name) + "'"
}

// shortName emits the HID as a declaredShortName, always unrestricted
// (§3.7.4: HIDs contain characters not legal in basic names).
func shortName(hid string) string {
	return "<'" + strings.NewReplacer("\\", "\\\\", "'", "\\'").Replace(hid) + "'>"
}

// literal renders a property value as a model-text literal.
func literal(v any) string {
	switch t := v.(type) {
	case nil:
		return "null"
	case bool:
		if t {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'g', -1, 64)
	case string:
		return strconv.Quote(t)
	default:
		return strconv.Quote(fmt.Sprintf("%v", t))
	}
}

// bookkeepingProps are never translated (SRS §3.7.2).
var bookkeepingProps = map[string]bool{
	"Owner": true, "OwnerEmail": true, "Creator": true, "CreatorEmail": true,
	"Created": true, "LastTouch": true, "VersionID": true,
	"HID": true, "uuid": true, "TypeName": true, "Name": true,
	"ShortDescription": true, "LongDescription": true,
	"SoIIndex": true, "Sequence": true,
}

// toolStateProps are tool-state JSON never translated (SRS §3.7.2).
var toolStateProps = map[string]bool{
	"AttackTreeJSON": true, "UseCaseDiagramJSON": true,
	"ControlStructureJSON": true, "FunctionalFlowJSON": true,
	"GoalStructure": true, "MetricCacheJSON": true,
}

// emitProps returns the deterministic attribute lines for a node, omitting
// bookkeeping, tool-state, null values, and schema defaults (§3.7.7).
func emitProps(sch *schema.Schema, n Node, keyword string) []string {
	names := make([]string, 0, len(n.Props))
	for k := range n.Props {
		names = append(names, k)
	}
	sort.Strings(names)
	var out []string
	for _, k := range names {
		if bookkeepingProps[k] || toolStateProps[k] {
			continue
		}
		v := n.Props[k]
		if v == nil {
			continue
		}
		if s, ok := v.(string); ok && (s == "" || strings.EqualFold(s, "null")) {
			continue
		}
		// Omit values equal to the declared schema default (§3.7.7).
		if def, ok := sch.PropertyDef(n.Label, k); ok && def.Default != nil {
			if fmt.Sprintf("%v", def.Default) == fmt.Sprintf("%v", v) {
				continue
			}
		}
		out = append(out, fmt.Sprintf("%s %s = %s;", keyword, quoteName(k), literal(v)))
	}
	return out
}

// docLines renders the Short/Full documentation bodies (§3.7.4).
func docLines(n Node) []string {
	var out []string
	if s, ok := n.Props["ShortDescription"].(string); ok && s != "" && !strings.EqualFold(s, "null") {
		out = append(out, "doc Short /* "+sanitizeComment(s)+" */")
	}
	if s, ok := n.Props["LongDescription"].(string); ok && s != "" && !strings.EqualFold(s, "null") {
		out = append(out, "doc Full /* "+sanitizeComment(s)+" */")
	}
	return out
}

func sanitizeComment(s string) string {
	return strings.ReplaceAll(s, "*/", "*\\/")
}

// writer builds indented deterministic output.
type writer struct {
	b      strings.Builder
	indent int
}

func (w *writer) line(format string, args ...any) {
	w.b.WriteString(strings.Repeat("\t", w.indent))
	fmt.Fprintf(&w.b, format, args...)
	w.b.WriteString("\n")
}

func (w *writer) open(format string, args ...any) {
	w.line(format+" {", args...)
	w.indent++
}

func (w *writer) close() {
	w.indent--
	w.line("}")
}

func (w *writer) String() string { return w.b.String() }

func nodeName(n Node) string {
	if s, ok := n.Props["Name"].(string); ok && s != "" {
		return s
	}
	return n.HID
}
