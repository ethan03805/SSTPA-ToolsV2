// HID (Hierarchical Identifier) identity model, SRS §3.3.8.
// Format: {TYPE}_{INDEX}_{SEQUENCE}, e.g. SYS_1.2.3_0.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package schema

import (
	"fmt"
	"regexp"
	"strings"
)

// HID is a parsed Hierarchical Identifier.
type HID struct {
	TypePrefix string // node type identifier, e.g. "SYS" (§3.3.8.1)
	Index      string // sub-graph (SoI) index, e.g. "1.2.3"; empty for Capability (§3.3.8.2)
	Sequence   int    // sequence number within the SoI (§3.3.8.3)
}

// Index segments are normally dotted integers (§3.3.8.2). Example Data uses an
// alpha-prefixed namespace (e.g. "FS1.1.1") to partition exemplars from the
// working Capability without HID collisions (REQUIREMENTS-NOTES I-13), so
// segments may be alphanumeric.
var hidRe = regexp.MustCompile(`^([A-Z]{1,4})_([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)?_([0-9]+)$`)

// ParseHID parses a canonical HID string.
func ParseHID(s string) (HID, error) {
	m := hidRe.FindStringSubmatch(s)
	if m == nil {
		return HID{}, fmt.Errorf("invalid HID %q: expected {TYPE}_{INDEX}_{SEQUENCE}", s)
	}
	var seq int
	if _, err := fmt.Sscanf(m[3], "%d", &seq); err != nil {
		return HID{}, fmt.Errorf("invalid HID sequence in %q", s)
	}
	return HID{TypePrefix: m[1], Index: m[2], Sequence: seq}, nil
}

// String renders the canonical HID form.
func (h HID) String() string {
	return fmt.Sprintf("%s_%s_%d", h.TypePrefix, h.Index, h.Sequence)
}

// ChildSystemIndex computes the HID Index for a (:System) created as a child
// of an (:Component): parent Component's index concatenated with "." and the
// Component's sequence number (§3.3.8.2). Example: Component EL_1.2.3_4 →
// child System index "1.2.3.4".
func ChildSystemIndex(componentHID HID) string {
	if componentHID.Index == "" {
		return fmt.Sprintf("%d", componentHID.Sequence)
	}
	return fmt.Sprintf("%s.%d", componentHID.Index, componentHID.Sequence)
}

// SoIKey returns the SoI membership key for a node: its HID Index (§3.3.1.1).
func (h HID) SoIKey() string { return h.Index }

// ValidIndex reports whether an index string is well-formed (dotted integers).
func ValidIndex(idx string) bool {
	if idx == "" {
		return true // Capability root has null index (§3.3.8.2)
	}
	for _, part := range strings.Split(idx, ".") {
		if part == "" {
			return false
		}
		for _, c := range part {
			if !((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
				return false
			}
		}
	}
	return true
}
