// G2M per-node emitters for SYSML and KERML domains (SRS §3.7.5 Tables 1 & 2,
// §3.7.6 relationship mapping).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package model

import (
	"fmt"
	"sort"
	"strings"
)

// emitSysMLNode maps a SYSML-domain node to its SysML 2.0 construct (§3.7.5 T1).
func (g *G2M) emitSysMLNode(b *strings.Builder, n Node, depth int) {
	id := indent(depth)
	switch n.Label {
	case "Project":
		b.WriteString(fmt.Sprintf("%s#capability package %s {\n", id, head(n)))
		g.docLines(b, n, depth+1)
		b.WriteString(id + "}\n")
	case "Sandbox":
		b.WriteString(fmt.Sprintf("%s#sandbox package %s {\n", id, head(n)))
		b.WriteString(id + "}\n")
	case "System":
		b.WriteString(fmt.Sprintf("%s#system part %s {\n", id, head(n)))
		g.docLines(b, n, depth+1)
		b.WriteString(id + "}\n")
	case "Component":
		b.WriteString(fmt.Sprintf("%s#element part %s {", id, head(n)))
		g.emitAllocations(b, n, depth+1)
		b.WriteString("\n" + id + "}\n")
	case "Environment":
		b.WriteString(fmt.Sprintf("%s#environment part %s;\n", id, head(n)))
	case "Interface":
		// SSTPA Interface → SysML 2.0 port (§3.7.5).
		b.WriteString(fmt.Sprintf("%sport %s;\n", id, head(n)))
	case "Connection":
		g.emitConnection(b, n, depth)
	case "SystemFunction":
		b.WriteString(fmt.Sprintf("%saction %s {", id, head(n)))
		g.emitFlows(b, n, depth+1)
		b.WriteString("\n" + id + "}\n")
	case "State":
		g.emitState(b, n, depth)
	case "Purpose":
		b.WriteString(fmt.Sprintf("%s#purpose concern %s {\n", id, head(n)))
		g.docLines(b, n, depth+1)
		g.emitPurposeMembers(b, n, depth+1)
		b.WriteString(id + "}\n")
	case "Constraint":
		b.WriteString(fmt.Sprintf("%sconstraint %s {\n", id, head(n)))
		if s := prop(n, "CStatement"); s != "" {
			b.WriteString(fmt.Sprintf("%sdoc /* %s */\n", indent(depth+1), escapeDoc(s)))
		}
		b.WriteString(id + "}\n")
	case "Requirement":
		g.emitRequirement(b, n, depth)
	case "Verification":
		b.WriteString(fmt.Sprintf("%sverification %s {\n", id, head(n)))
		if s := prop(n, "Procedure"); s != "" {
			b.WriteString(fmt.Sprintf("%sdoc /* %s */\n", indent(depth+1), escapeDoc(s)))
		}
		b.WriteString(id + "}\n")
	case "Validation":
		b.WriteString(fmt.Sprintf("%s#validation verification %s;\n", id, head(n)))
	case "UseCase":
		g.emitUseCase(b, n, depth)
	case "FunctionalFlow":
		b.WriteString(fmt.Sprintf("%sview %s {\n", id, head(n)))
		for _, r := range g.relsBy[n.HID] {
			if r.Type == "CONTAINS" {
				if t, ok := g.byHID[r.TargetHID]; ok {
					b.WriteString(fmt.Sprintf("%sexpose %s;\n", indent(depth+1), unrestricted(t.HID)))
				}
			}
		}
		b.WriteString(id + "}\n")
	}
}

func (g *G2M) emitAllocations(b *strings.Builder, n Node, depth int) {
	// Functions/Interfaces ALLOCATED_TO this Component appear as allocations.
	for _, r := range g.rels {
		if r.Type == "ALLOCATED_TO" && r.TargetHID == n.HID {
			if src, ok := g.byHID[r.SourceHID]; ok {
				b.WriteString(fmt.Sprintf("\n%sallocate %s to %s;",
					indent(depth), unrestricted(src.HID), unrestricted(n.HID)))
			}
		}
	}
}

func (g *G2M) emitFlows(b *strings.Builder, n Node, depth int) {
	for _, r := range g.relsBy[n.HID] {
		if r.Type == "FLOWS_TO_FUNCTION" || r.Type == "FLOWS_TO_INTERFACE" {
			if t, ok := g.byHID[r.TargetHID]; ok {
				b.WriteString(fmt.Sprintf("\n%ssuccession flow to %s;", indent(depth), unrestricted(t.HID)))
			}
		}
	}
}

func (g *G2M) emitConnection(b *strings.Builder, n Node, depth int) {
	id := indent(depth)
	var ends []string
	for _, r := range g.rels {
		if r.Type == "PARTICIPATES_IN" && r.TargetHID == n.HID {
			if src, ok := g.byHID[r.SourceHID]; ok {
				ends = append(ends, unrestricted(src.HID))
			}
		}
	}
	sort.Strings(ends)
	b.WriteString(fmt.Sprintf("%sconnection %s {\n", id, head(n)))
	if p := prop(n, "Protocol"); p != "" {
		b.WriteString(fmt.Sprintf("%sattribute protocol = \"%s\";\n", indent(depth+1), p))
	}
	for _, e := range ends {
		b.WriteString(fmt.Sprintf("%send %s;\n", indent(depth+1), e))
	}
	b.WriteString(id + "}\n")
}

func (g *G2M) emitState(b *strings.Builder, n Node, depth int) {
	id := indent(depth)
	b.WriteString(fmt.Sprintf("%sstate %s {\n", id, head(n)))
	// Transitions: transition first <source> then <target> (§3.7.6).
	for _, r := range g.relsBy[n.HID] {
		if r.Type != "TRANSITIONS_TO" {
			continue
		}
		t, ok := g.byHID[r.TargetHID]
		if !ok {
			continue
		}
		b.WriteString(fmt.Sprintf("%stransition first %s then %s {\n",
			indent(depth+1), unrestricted(n.HID), unrestricted(t.HID)))
		if k, _ := r.Props["TransitionKind"].(string); k != "" {
			b.WriteString(fmt.Sprintf("%sattribute transitionKind = \"%s\";\n", indent(depth+2), k))
		}
		if trig, _ := r.Props["Trigger"].(string); trig != "" && trig != "null" {
			b.WriteString(fmt.Sprintf("%sattribute trigger = \"%s\";\n", indent(depth+2), trig))
		}
		if gc, _ := r.Props["GuardCondition"].(string); gc != "" && gc != "null" {
			b.WriteString(fmt.Sprintf("%sattribute guard = \"%s\";\n", indent(depth+2), gc))
		}
		b.WriteString(indent(depth+1) + "}\n")
	}
	b.WriteString(id + "}\n")
}

func (g *G2M) emitPurposeMembers(b *strings.Builder, n Node, depth int) {
	for _, r := range g.relsBy[n.HID] {
		switch r.Type {
		case "HAS_CONSTRAINT":
			if t, ok := g.byHID[r.TargetHID]; ok {
				b.WriteString(fmt.Sprintf("%sconstraint %s;\n", indent(depth), unrestricted(t.HID)))
			}
		}
	}
}

func (g *G2M) emitRequirement(b *strings.Builder, n Node, depth int) {
	id := indent(depth)
	b.WriteString(fmt.Sprintf("%srequirement %s {\n", id, head(n)))
	if s := prop(n, "RStatement"); s != "" {
		b.WriteString(fmt.Sprintf("%sdoc /* %s */\n", indent(depth+1), escapeDoc(s)))
	}
	if vm := prop(n, "VMethod"); vm != "" {
		b.WriteString(fmt.Sprintf("%sattribute verificationMethod = \"%s\";\n", indent(depth+1), vm))
	}
	if boolProp(n, "Orphan") {
		b.WriteString(fmt.Sprintf("%sattribute orphan = true;\n", indent(depth+1)))
	}
	if boolProp(n, "Barren") {
		b.WriteString(fmt.Sprintf("%sattribute barren = true;\n", indent(depth+1)))
	}
	// #parents dependencies (§3.7.6): (parent)-[:PARENTS]->(child).
	for _, r := range g.rels {
		if r.Type == "PARENTS" && r.TargetHID == n.HID {
			if p, ok := g.byHID[r.SourceHID]; ok {
				b.WriteString(fmt.Sprintf("%s#parents dependency from %s to %s;\n",
					indent(depth+1), unrestricted(p.HID), unrestricted(n.HID)))
			}
		}
	}
	// verify relationships from VERIFIED_BY.
	for _, r := range g.relsBy[n.HID] {
		if r.Type == "VERIFIED_BY" {
			if v, ok := g.byHID[r.TargetHID]; ok {
				b.WriteString(fmt.Sprintf("%sverify %s;\n", indent(depth+1), unrestricted(v.HID)))
			}
		}
	}
	g.emitExternalRefs(b, n, depth+1)
	b.WriteString(id + "}\n")
}

func (g *G2M) emitUseCase(b *strings.Builder, n Node, depth int) {
	id := indent(depth)
	b.WriteString(fmt.Sprintf("%suse case %s {\n", id, head(n)))
	if s := prop(n, "UCStatement"); s != "" {
		b.WriteString(fmt.Sprintf("%sdoc /* %s */\n", indent(depth+1), escapeDoc(s)))
	}
	for _, r := range g.relsBy[n.HID] {
		switch r.Type {
		case "INCLUDES": // UseCase→SystemFunction perform (§3.7.6)
			if t, ok := g.byHID[r.TargetHID]; ok {
				b.WriteString(fmt.Sprintf("%sperform %s;\n", indent(depth+1), unrestricted(t.HID)))
			}
		case "INVOLVES":
			if t, ok := g.byHID[r.TargetHID]; ok {
				b.WriteString(fmt.Sprintf("%s#involves dependency to %s;\n", indent(depth+1), unrestricted(t.HID)))
			}
		case "INCLUDES_UC":
			if t, ok := g.byHID[r.TargetHID]; ok {
				b.WriteString(fmt.Sprintf("%sinclude use case %s;\n", indent(depth+1), unrestricted(t.HID)))
			}
		case "EXTENDS":
			if t, ok := g.byHID[r.TargetHID]; ok {
				ep, _ := r.Props["ExtensionPoint"].(string)
				b.WriteString(fmt.Sprintf("%s#extend(extensionPoint=\"%s\") specialization %s;\n",
					indent(depth+1), ep, unrestricted(t.HID)))
			}
		}
	}
	b.WriteString(id + "}\n")
}

func (g *G2M) emitExternalRefs(b *strings.Builder, n Node, depth int) {
	// [:REFERENCES] → #externalref annotation (never a model ref into Reference
	// Data; license preservation, §3.7.2/§3.7.6).
	if rid := prop(n, "ReferenceID"); rid != "" {
		fw := prop(n, "ReferenceFramework")
		b.WriteString(fmt.Sprintf("%s#externalref(framework=\"%s\", externalId=\"%s\")\n",
			indent(depth), fw, rid))
	}
}
