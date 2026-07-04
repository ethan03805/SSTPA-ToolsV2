// G2M KERML-domain emitters (SRS §3.7.5 Table 2, §3.7.6 Table 2): analysis
// features typed by SSTPA Profile classifiers, plus cross-domain connectors.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package model

import (
	"fmt"
	"strings"
)

// profileClassifier maps a KERML-domain label to its SSTPA Profile classifier.
var profileClassifier = map[string]string{
	"Asset": "Asset", "DerivedAsset": "DerivedAsset", "Regime": "Regime",
	"Hazard": "Hazard", "Loss": "Loss", "Attack": "Attack",
	"Countermeasure": "Countermeasure", "SecurityControl": "SecurityControl",
	"GsnGoal": "GsnGoal", "GsnStrategy": "GsnStrategy", "GsnContext": "GsnContext",
	"GsnAssumption": "GsnAssumption", "GsnJustification": "GsnJustification",
	"GsnSolution": "GsnSolution",
	"ControlAlgorithm": "ControlAlgorithm", "ControlledProcess": "ControlledProcess",
	"ControlAction": "ControlAction", "ProcessModel": "ProcessModel", "Feedback": "Feedback",
}

// Criticality/Assurance flags emitted as attribute values (engineering results, §3.7.7).
var critAssurFlags = []string{
	"SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical",
	"Confidentiality", "Availability", "Authenticity", "NonRepudiation",
	"Certifiable", "Privacy", "Trustworthy",
}

func (g *G2M) emitKerMLNode(b *strings.Builder, n Node, depth int) {
	id := indent(depth)
	switch n.Label {
	case "Security":
		b.WriteString(fmt.Sprintf("%spackage %s { doc /* Security view */ }\n", id, unrestricted("Security")))
		return
	case "ControlStructure":
		b.WriteString(fmt.Sprintf("%spackage %s {\n", id, head(n)))
		b.WriteString(id + "}\n")
		return
	}
	cls := profileClassifier[n.Label]
	if cls == "" {
		cls = n.Label
	}
	b.WriteString(fmt.Sprintf("%sfeature %s : %s {\n", id, head(n), cls))
	g.docLines(b, n, depth+1)
	// Attribute-valued statements / flags.
	if s := prop(n, "GoalStatement"); s != "" {
		b.WriteString(fmt.Sprintf("%sdoc /* %s */\n", indent(depth+1), escapeDoc(s)))
	}
	for _, f := range critAssurFlags {
		if boolProp(n, f) {
			b.WriteString(fmt.Sprintf("%sattribute %s = true;\n", indent(depth+1), lowerFirst(f)))
		}
	}
	g.emitExternalRefs(b, n, depth+1)
	// Owned analysis relationships expressed as nested connectors.
	g.emitKermlOwnedRels(b, n, depth+1)
	b.WriteString(id + "}\n")
}

// emitKermlOwnedRels emits Asset→Loss/Goal/Regime, GSN support/context etc.
func (g *G2M) emitKermlOwnedRels(b *strings.Builder, n Node, depth int) {
	for _, r := range g.relsBy[n.HID] {
		assoc := kermlAssoc(r.Type)
		if assoc == "" {
			continue
		}
		if t, ok := g.byHID[r.TargetHID]; ok {
			b.WriteString(fmt.Sprintf("%sconnect %s to %s; // %s\n",
				indent(depth), unrestricted(n.HID), unrestricted(t.HID), assoc))
		}
	}
}

// kermlAssoc maps a Core relationship type to its Profile assoc name (§3.7.6 T2).
func kermlAssoc(relType string) string {
	switch relType {
	case "HAS_LOSS":
		return "HasLoss"
	case "HAS_GOAL":
		return "HasGoal"
	case "HAS_REGIME":
		return "HasRegime"
	case "DERIVES", "DERIVED_FROM":
		return "Derives"
	case "THREATENS":
		return "Threatens"
	case "VIOLATES":
		return "Violates"
	case "USES_ATTACK":
		return "UsesAttack"
	case "SUBORDINATE_TO":
		return "SubordinateTo"
	case "TARGETS_LOSS":
		return "TargetsLoss"
	case "ENFORCES":
		return "Enforces"
	case "MITIGATES":
		return "Mitigates"
	case "SATISFIES":
		return "Satisfies"
	case "SUPPORTED_BY":
		return "SupportedBy"
	case "IN_CONTEXT_OF":
		return "InContextOf"
	case "HAS_VALIDATION", "HAS_VERIFICATION":
		return "SolutionEvidence"
	case "GENERATES":
		return "Generates"
	case "COMMANDS":
		return "Commands"
	case "CAUSES":
		return "Causes"
	case "PRODUCES":
		return "Produces"
	case "INFORMS":
		return "Informs"
	case "TUNES":
		return "Tunes"
	case "IMPLEMENTS":
		return "Implements"
	}
	return ""
}

// emitAnalysisConnectors emits cross-domain connectors referencing SysML
// elements by qualified name (§3.7.4): Exploits, Defeats, Blocks, AppliesTo.
func (g *G2M) emitAnalysisConnectors(b *strings.Builder, depth int) {
	id := indent(depth)
	crossTypes := map[string]string{
		"EXPLOITS": "Exploits", "DEFEATS": "Defeats", "BLOCKS": "Blocks",
		"APPLIES_TO_FUNCTION": "AppliesTo", "APPLIES_TO_INTERFACE": "AppliesTo",
		"APPLIES_TO_ELEMENT": "AppliesTo", "APPLIES_TO_STATE": "AppliesTo",
		"APPLIES_TO_FEEDBACK": "AppliesTo",
	}
	var lines []string
	for _, r := range g.rels {
		assoc, ok := crossTypes[r.Type]
		if !ok {
			continue
		}
		s, sok := g.byHID[r.SourceHID]
		t, tok := g.byHID[r.TargetHID]
		if !sok || !tok {
			continue
		}
		lines = append(lines, fmt.Sprintf("%sconnect %s to %s; // %s",
			id, unrestricted(s.HID), unrestricted(t.HID), assoc))
	}
	if len(lines) > 0 {
		b.WriteString("\n" + id + "// Cross-domain analysis connectors (§3.7.4)\n")
		for _, l := range lines {
			b.WriteString(l + "\n")
		}
	}
}

func lowerFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(s[:1]) + s[1:]
}
