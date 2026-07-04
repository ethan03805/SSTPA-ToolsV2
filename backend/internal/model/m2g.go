// M2G translator — property-edit subset (SRS §3.7.9; scope recorded in
// docs/REQUIREMENTS-NOTES.md): parses SysML/KerML text in the G2M canonical
// form, resolves elements by HID short name, and computes a staged change
// set of PROPERTY and documentation edits on existing elements. Element and
// relationship creation/deletion through model text is not accepted in this
// release; such constructs are ignored (structure) or rejected (unknown
// HIDs) with diagnostics.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package model

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Diagnostic is an M2G parse/validation finding (SRS §3.7.9: diagnostics
// carry line and rule identity).
type Diagnostic struct {
	Line    int    `json:"line"`
	Rule    string `json:"rule"`
	Message string `json:"message"`
	Excerpt string `json:"excerpt"`
}

// ElementEdit is the parsed state of one HID-identified element.
type ElementEdit struct {
	HID       string         `json:"hid"`
	Line      int            `json:"line"`
	Props     map[string]any `json:"properties"`
	ShortDesc *string        `json:"shortDescription,omitempty"`
	LongDesc  *string        `json:"longDescription,omitempty"`
}

// ParseResult carries every element block found plus diagnostics.
type ParseResult struct {
	Elements    []ElementEdit `json:"elements"`
	Diagnostics []Diagnostic  `json:"diagnostics"`
}

var (
	// element header: <kind> <'HID'> ... {  or ...;
	headerRe = regexp.MustCompile(`^\s*(?:package|part|port|action|state|concern|constraint|requirement|verification|connection|view|feature|use case)\s+<'((?:[^'\\]|\\.)*)'>`)
	// attribute/feature value line: attribute 'Name' = value; | feature Name = value;
	attrRe = regexp.MustCompile(`^\s*(?:attribute|feature)\s+(?:'((?:[^'\\]|\\.)*)'|([A-Za-z_][A-Za-z0-9_]*))\s*=\s*(.+?);\s*$`)
	docRe  = regexp.MustCompile(`^\s*doc\s+(Short|Full)\s+/\*\s?(.*?)\s?\*/\s*$`)
)

func unescapeName(s string) string {
	return strings.NewReplacer("\\'", "'", "\\\\", "\\").Replace(s)
}

// Parse extracts HID-identified element blocks and their attribute/doc lines
// from model text. Brace depth tracks which element each line belongs to.
func Parse(text string) ParseResult {
	res := ParseResult{}
	var elems []*ElementEdit
	type frame struct {
		edit *ElementEdit // nil for non-element blocks
	}
	var stack []frame
	current := func() *ElementEdit {
		for i := len(stack) - 1; i >= 0; i-- {
			if stack[i].edit != nil {
				return stack[i].edit
			}
		}
		return nil
	}

	lines := strings.Split(text, "\n")
	for i, raw := range lines {
		lineNo := i + 1
		line := strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "//") {
			continue
		}

		if m := headerRe.FindStringSubmatch(line); m != nil {
			hid := unescapeName(m[1])
			var edit *ElementEdit
			// Package short names carry .SM/.SA suffixes — not node HIDs.
			if !strings.HasSuffix(hid, ".SM") && !strings.HasSuffix(hid, ".SA") {
				edit = &ElementEdit{HID: hid, Line: lineNo, Props: map[string]any{}}
				elems = append(elems, edit)
			}
			if strings.HasSuffix(trimmed, "{") {
				stack = append(stack, frame{edit: edit})
			}
			continue
		}

		if m := attrRe.FindStringSubmatch(line); m != nil {
			el := current()
			if el == nil {
				continue // package-level metadata, imports, etc.
			}
			name := m[2]
			if m[1] != "" {
				name = unescapeName(m[1])
			}
			val, err := parseLiteral(strings.TrimSpace(m[3]))
			if err != nil {
				res.Diagnostics = append(res.Diagnostics, Diagnostic{
					Line: lineNo, Rule: "M2G-LITERAL",
					Message: fmt.Sprintf("cannot parse value for %s: %v", name, err),
					Excerpt: trimmed,
				})
				continue
			}
			el.Props[name] = val
			continue
		}

		if m := docRe.FindStringSubmatch(line); m != nil {
			el := current()
			if el == nil {
				continue
			}
			text := strings.ReplaceAll(m[2], "*\\/", "*/")
			if m[1] == "Short" {
				el.ShortDesc = &text
			} else {
				el.LongDesc = &text
			}
			continue
		}

		// Track brace nesting for anonymous/structural blocks.
		opens := strings.Count(trimmed, "{")
		closes := strings.Count(trimmed, "}")
		for j := 0; j < opens; j++ {
			stack = append(stack, frame{})
		}
		for j := 0; j < closes && len(stack) > 0; j++ {
			stack = stack[:len(stack)-1]
		}
	}
	for _, e := range elems {
		res.Elements = append(res.Elements, *e)
	}
	return res
}

// parseLiteral converts a model-text literal to a Go value.
func parseLiteral(s string) (any, error) {
	switch {
	case s == "true":
		return true, nil
	case s == "false":
		return false, nil
	case s == "null":
		return nil, nil
	case strings.HasPrefix(s, "\""):
		return strconv.Unquote(s)
	default:
		if i, err := strconv.ParseInt(s, 10, 64); err == nil {
			return i, nil
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f, nil
		}
		return nil, fmt.Errorf("unrecognized literal %q", s)
	}
}
