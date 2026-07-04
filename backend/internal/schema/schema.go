// Package schema embeds the machine-readable Core Data Model extracted from
// the SRS (docs/schema/*.json, copied to data/ at build time) and provides
// validation primitives used by the Backend: node labels, property
// definitions, relationship rules, cross-SoI rules, and recursion governance
// (SRS §3.3).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package schema

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed data/*.json
var dataFS embed.FS

// Property is one property definition from SRS §3.3.9/§3.3.10.
type Property struct {
	Name        string   `json:"name"`
	DisplayName string   `json:"displayName"`
	Type        string   `json:"type"` // String|Boolean|Integer|Float|datetime|Enum|JSON|Structure
	EnumValues  []string `json:"enumValues,omitempty"`
	Edit        string   `json:"edit"` // edit|fixed|admin
	Default     any      `json:"default"`
	Ambiguity   string   `json:"ambiguity,omitempty"`
}

// PropertyGroup is a named display grouping of properties (SRS §3.3.9).
type PropertyGroup struct {
	GroupName   string     `json:"groupName"`
	SRSLines    string     `json:"srsLines,omitempty"`
	Properties  []Property `json:"properties"`
	Constraints []string   `json:"constraints,omitempty"`
}

// NodeType merges the canonical label table (§3.3.3), HID prefixes (§3.3.8.1)
// and per-type property groups (§3.3.10).
type NodeType struct {
	Label              string          `json:"label"`
	DisplayName        string          `json:"displayName"`
	ModelDomain        string          `json:"modelDomain"` // SYSML|KERML|NONE
	HIDPrefix          string          `json:"hidPrefix"`
	Category           string          `json:"category"`
	Description        string          `json:"description,omitempty"`
	PropertyGroups     []PropertyGroup `json:"propertyGroups"`
	RelationshipGroups []string        `json:"relationshipGroups,omitempty"`
}

// RelationshipDef is one authorized (source)-[:TYPE]->(target) triple.
type RelationshipDef struct {
	Type       string     `json:"type"`
	Source     string     `json:"source"`
	Target     string     `json:"target"`
	SRSSection string     `json:"srsSection,omitempty"`
	Properties []Property `json:"properties,omitempty"`
}

// Schema is the full compiled Core Data Model schema.
type Schema struct {
	SchemaVersion        string
	CommonPropertyGroups []PropertyGroup
	NodeTypes            map[string]*NodeType // by label
	Relationships        []RelationshipDef
	relIndex             map[string]map[string]map[string]bool // type -> source -> target
	relByType            map[string][]RelationshipDef
	CrossSoIAllowed      []string
	CrossSoIProhibited   []string
	Acyclic              []string
	CyclicBounded        []string
	SystemCreation       []string
	DBIndexes            []string
}

type nodePropertiesFile struct {
	SchemaVersion        string          `json:"schemaVersion"`
	CommonPropertyGroups []PropertyGroup `json:"commonPropertyGroups"`
	NodeTypes            map[string]struct {
		SRSLines           string          `json:"srsLines"`
		DisplayName        string          `json:"displayName"`
		Description        string          `json:"description"`
		PropertyGroups     []PropertyGroup `json:"propertyGroups"`
		RelationshipGroups []string        `json:"relationshipGroups"`
	} `json:"nodeTypes"`
}

type relationshipsFile struct {
	SchemaVersion string `json:"schemaVersion"`
	NodeLabels    []struct {
		Label       string `json:"label"`
		DisplayName string `json:"displayName"`
		ModelDomain string `json:"modelDomain"`
		HIDPrefix   string `json:"hidPrefix"`
		Category    string `json:"category"`
	} `json:"nodeLabels"`
	Relationships []RelationshipDef `json:"relationships"`
	CrossSoIRules struct {
		Allowed    []string `json:"allowed"`
		Prohibited []string `json:"prohibited"`
		Notes      []string `json:"notes"`
	} `json:"crossSoIRules"`
	RecursiveGovernance struct {
		Acyclic       []string `json:"acyclic"`
		CyclicBounded []string `json:"cyclicBounded"`
		Notes         []string `json:"notes"`
	} `json:"recursiveGovernance"`
	SystemCreationBehavior []string `json:"systemCreationBehavior"`
	IdentityModel          struct {
		HIDFormat     string   `json:"hidFormat"`
		Example       string   `json:"example"`
		IndexRules    []string `json:"indexRules"`
		SequenceRules []string `json:"sequenceRules"`
		DBIndexes     []string `json:"dbIndexes"`
	} `json:"identityModel"`
}

// Load parses the embedded schema files and builds lookup indexes.
func Load() (*Schema, error) {
	var npf nodePropertiesFile
	if err := readJSON("data/node-properties.json", &npf); err != nil {
		return nil, err
	}
	var rf relationshipsFile
	if err := readJSON("data/relationships.json", &rf); err != nil {
		return nil, err
	}

	s := &Schema{
		SchemaVersion:        npf.SchemaVersion,
		CommonPropertyGroups: npf.CommonPropertyGroups,
		NodeTypes:            map[string]*NodeType{},
		Relationships:        rf.Relationships,
		relIndex:             map[string]map[string]map[string]bool{},
		relByType:            map[string][]RelationshipDef{},
		CrossSoIAllowed:      rf.CrossSoIRules.Allowed,
		CrossSoIProhibited:   rf.CrossSoIRules.Prohibited,
		Acyclic:              rf.RecursiveGovernance.Acyclic,
		CyclicBounded:        rf.RecursiveGovernance.CyclicBounded,
		SystemCreation:       rf.SystemCreationBehavior,
		DBIndexes:            rf.IdentityModel.DBIndexes,
	}

	for _, nl := range rf.NodeLabels {
		s.NodeTypes[nl.Label] = &NodeType{
			Label:       nl.Label,
			DisplayName: nl.DisplayName,
			ModelDomain: nl.ModelDomain,
			HIDPrefix:   nl.HIDPrefix,
			Category:    nl.Category,
		}
	}
	for label, nt := range npf.NodeTypes {
		t, ok := s.NodeTypes[label]
		if !ok {
			t = &NodeType{Label: label}
			s.NodeTypes[label] = t
		}
		if t.DisplayName == "" {
			t.DisplayName = nt.DisplayName
		}
		t.Description = nt.Description
		t.PropertyGroups = nt.PropertyGroups
		t.RelationshipGroups = nt.RelationshipGroups
	}

	for _, r := range rf.Relationships {
		byType, ok := s.relIndex[r.Type]
		if !ok {
			byType = map[string]map[string]bool{}
			s.relIndex[r.Type] = byType
		}
		bySource, ok := byType[r.Source]
		if !ok {
			bySource = map[string]bool{}
			byType[r.Source] = bySource
		}
		bySource[r.Target] = true
		s.relByType[r.Type] = append(s.relByType[r.Type], r)
	}
	return s, nil
}

func readJSON(path string, v any) error {
	b, err := dataFS.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read embedded %s: %w", path, err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	return nil
}

// ValidLabel reports whether label is a canonical Core Data Model node label.
func (s *Schema) ValidLabel(label string) bool {
	_, ok := s.NodeTypes[label]
	return ok
}

// RelationshipAllowed reports whether (source)-[:relType]->(target) is
// authorized by the canonical relationship model (SRS §3.3.4). The special
// source/target "any" in the schema matches every label.
func (s *Schema) RelationshipAllowed(relType, source, target string) bool {
	byType, ok := s.relIndex[relType]
	if !ok {
		return false
	}
	for _, src := range []string{source, "any"} {
		if bySource, ok := byType[src]; ok {
			if bySource[target] || bySource["any"] {
				return true
			}
		}
	}
	return false
}

// RelationshipDefs returns all authorized triples for a relationship type.
func (s *Schema) RelationshipDefs(relType string) []RelationshipDef {
	return s.relByType[relType]
}

// RelationshipsFrom returns all authorized relationship defs whose source is label.
func (s *Schema) RelationshipsFrom(label string) []RelationshipDef {
	var out []RelationshipDef
	for _, r := range s.Relationships {
		if r.Source == label {
			out = append(out, r)
		}
	}
	return out
}

// IsAcyclic reports whether relType is governed as acyclic (SRS §3.3.6).
func (s *Schema) IsAcyclic(relType string) bool {
	for _, a := range s.Acyclic {
		if strings.Contains(a, relType) {
			return true
		}
	}
	return false
}

// PropertyDef finds a property definition on a node type, searching
// type-specific groups first, then the common groups.
func (s *Schema) PropertyDef(label, property string) (*Property, bool) {
	if nt, ok := s.NodeTypes[label]; ok {
		for i := range nt.PropertyGroups {
			for j := range nt.PropertyGroups[i].Properties {
				if nt.PropertyGroups[i].Properties[j].Name == property {
					return &nt.PropertyGroups[i].Properties[j], true
				}
			}
		}
	}
	for i := range s.CommonPropertyGroups {
		for j := range s.CommonPropertyGroups[i].Properties {
			if s.CommonPropertyGroups[i].Properties[j].Name == property {
				return &s.CommonPropertyGroups[i].Properties[j], true
			}
		}
	}
	return nil, false
}

// LabelForHIDPrefix resolves a HID type identifier (e.g. "SYS") to its label.
func (s *Schema) LabelForHIDPrefix(prefix string) (string, bool) {
	for label, nt := range s.NodeTypes {
		if nt.HIDPrefix == prefix {
			return label, true
		}
	}
	return "", false
}
