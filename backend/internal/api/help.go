// Help Data Model (SRS §3.5): terms and definitions for Hover Help, GUI field
// help, and tutorial information, accessed through the Gear Icon (§3.5, §6.3.1).
// Served read-only from an embedded catalog.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import "net/http"

// helpEntry is one Hover Help / definitions record (SRS §3.5).
type helpEntry struct {
	Term       string `json:"term"`
	Definition string `json:"definition"`
	Category   string `json:"category"` // Terminology | Field | Tutorial
}

// helpCatalog is the SSTPA terminology and field-help set. Sourced from the
// SRS definitions (§1, §3.3.1) and the Resource.md imperative glossary.
var helpCatalog = []helpEntry{
	{"SSTPA", "Systems Security-Theoretic Process Analysis — a systems security engineering methodology derived from STPA, extending it with Assets, Criticality, and Security Assurances.", "Terminology"},
	{"System of Interest (SoI)", "The analytical sub-graph rooted at exactly one (:System) node. All nodes created as part of an SoI share the same HID Index. The GUI presents one SoI at a time.", "Terminology"},
	{"Asset", "Something valuable that has Criticality and requires Assurance. Loss occurs when the Security Assurance on an Asset is compromised.", "Terminology"},
	{"Hazard", "A system or environmental condition that can make compromise of an Asset possible — including the presence of a Threat Actor or an internal Control Action.", "Terminology"},
	{"Attack", "An action, technique, tactic, procedure, or exploit path that acts on an Element, Function, or Interface, or defeats a Countermeasure. An Attack is a projection of a Hazard into the System.", "Terminology"},
	{"Loss", "A specific unacceptable compromise case for one Asset, one Criticality, one Assurance property, and one Environment. The root of an Attack Tree.", "Terminology"},
	{"Control (SecurityControl)", "An abstract security or assurance objective that must be integrated for the system to be acceptable.", "Terminology"},
	{"Countermeasure", "A concrete feature, design element, procedure, or mechanism that satisfies one or more Controls.", "Terminology"},
	{"Requirement", "A specification statement that realizes Purpose, Constraint, Countermeasure, Interface, Function, Element, Connection, or Capability intent, verified by a Verification.", "Terminology"},
	{"Verification", "A procedure confirming that a Requirement is implemented correctly.", "Terminology"},
	{"Validation", "A procedure confirming that the realized System satisfies its intended Purpose in its intended Environment.", "Terminology"},
	{"Criticality", "A regime — an environment with decision makers, shared values, and accepted rules. SSTPA criticalities include Safety, Mission, Flight, and Security.", "Terminology"},
	{"Assurance", "A security attribute demanded of an Asset: Confidentiality, Availability, Authenticity, Non-Repudiation, Certifiable, Privacy, or Trustworthiness.", "Terminology"},
	{"HID", "Hierarchical Identifier — {TYPE}_{INDEX}_{SEQUENCE} (e.g. SYS_1.2.3_0). Encodes a node's type, its SoI sub-graph, and its sequence within that sub-graph.", "Terminology"},
	{"Derived Asset", "An Asset whose value derives from enabling compromise of a Primary Asset. Inherits Criticality from the Primary Asset and may add Assurance requirements.", "Terminology"},
	{"Trace", "Assignment of state-scoped [:HOLDS], [:TRANSPORTS], or [:USES] relationships between an entity and an Asset, performed in the Trace Tool. Drives Criticality/Assurance inheritance and protection-Requirement generation.", "Terminology"},
	{"HOLDS", "Trace relationship: the entity contains the Asset for the full duration of the State but does not require it to perform its purpose.", "Field"},
	{"TRANSPORTS", "Trace relationship: the entity has a transient relationship with the Asset; it does not contain it for the full State and does not require it.", "Field"},
	{"USES", "Trace relationship: the entity requires the Asset to perform its purpose during the associated State.", "Field"},
	{"TransitionKind", "FUNCTIONAL, COUNTERMEASURE_REQUIRED, or BOTH. Countermeasure-required transitions must identify a governing Countermeasure.", "Field"},
	{"Residual Vulnerability (RV)", "An attack path terminating in a leaf Attack with no blocking Countermeasure. Allowed RVs are explicitly reviewed and documented for certification.", "Terminology"},
	{"Owner / Creator", "Every node is owned by a User (via email). Editing a node you do not own transfers ownership to you and notifies the previous owner via the Message Center.", "Field"},
	{"Model Text Panel", "Shows the SysML 2.0 / KerML 1.0 projection (G2M) of the current tool scope. Read-only; the graph is authoritative.", "Field"},
	{"FireSat Example", "A built-in example project illustrating an expansive, deeply nested system. Modify it freely, then Reset it from the gear menu.", "Tutorial"},
}

// handleHelp returns the Help Data catalog (SRS §3.5). Supports optional
// ?term= exact lookup for Hover Help.
func (s *Server) handleHelp(w http.ResponseWriter, r *http.Request) {
	term := r.URL.Query().Get("term")
	if term != "" {
		for _, e := range helpCatalog {
			if e.Term == term {
				writeJSON(w, http.StatusOK, e)
				return
			}
		}
		writeError(w, http.StatusNotFound, "no help for term", term)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"help": helpCatalog})
}
