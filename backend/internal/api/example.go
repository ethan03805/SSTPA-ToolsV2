// Example Data — the FireSat exemplar (SRS §3.6, §3.6.1). Same schema and
// rules as Core System Data, but Created and Owned by "SSTPA Tools" with
// ownership that cannot change; Users may modify it and Reset it to default.
// FireSat is "expansive and deep in hierarchy" (§3.6.1).
//
// Example nodes are namespaced by an "FS"-prefixed HID index so the exemplar
// is a separate partition that never collides with the working Capability
// (see docs/REQUIREMENTS-NOTES.md I-13). Every node carries
// IsExampleData=true and ExampleProject="FireSat" for reset scoping.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"context"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

const exampleOwner = "SSTPA Tools"
const exampleOwnerEmail = "nihlo2025@proton.me"
const fireSatProject = "FireSat"

type exNode struct {
	hid   string
	label string
	name  string
	props map[string]any
}

type exRel struct {
	relType string
	src     string
	tgt     string
	props   map[string]any
}

// fireSatData returns the full FireSat node and relationship set.
func fireSatData() ([]exNode, []exRel) {
	n := func(hid, label, name string, props map[string]any) exNode {
		if props == nil {
			props = map[string]any{}
		}
		return exNode{hid: hid, label: label, name: name, props: props}
	}
	crit := func(m map[string]any) map[string]any { return m } // readability helper

	nodes := []exNode{
		// --- Capability root (namespaced index "FS") ---
		n("CAP_FS_0", "Project", "FireSat Capability", map[string]any{
			"ShortDescription": "Wildfire detection and reporting satellite constellation (SSTPA example project).",
		}),

		// ============ Tier 1: FireSat System (index FS1) ============
		n("SYS_FS1_0", "System", "FireSat", map[string]any{
			"ShortDescription": "Space system that detects wildfires and downlinks alerts to ground stations.",
		}),
		n("PUR_FS1_1", "Purpose", "Detect and report wildfires", crit(map[string]any{
			"ShortDescription": "Provide timely, trustworthy wildfire detection to emergency responders.",
		})),
		n("ENV_FS1_1", "Environment", "On Orbit", map[string]any{"ShortDescription": "Low Earth orbit operational environment."}),
		n("ENV_FS1_2", "Environment", "Ground Operations", map[string]any{"ShortDescription": "Ground segment operational environment."}),
		n("ST_FS1_1", "State", "Standby", map[string]any{"StateSequence": int64(0)}),
		n("ST_FS1_2", "State", "Detecting", map[string]any{"StateSequence": int64(1)}),
		n("ST_FS1_3", "State", "Downlinking", map[string]any{"StateSequence": int64(2)}),
		n("EL_FS1_1", "Component", "Space Segment", map[string]any{"ShortDescription": "The satellite constellation."}),
		n("EL_FS1_2", "Component", "Ground Segment", map[string]any{"ShortDescription": "Ground stations and mission operations."}),
		n("EL_FS1_3", "Component", "Launch Segment", map[string]any{"ShortDescription": "Launch vehicle and integration."}),
		n("FUN_FS1_1", "SystemFunction", "Detect Fires", map[string]any{"ShortDescription": "Infrared detection of thermal anomalies."}),
		n("FUN_FS1_2", "SystemFunction", "Downlink Alerts", map[string]any{"ShortDescription": "Transmit detection data to ground."}),
		n("INT_FS1_1", "Interface", "Downlink Radio", map[string]any{"ShortDescription": "S-band downlink transmitter."}),
		n("INT_FS1_2", "Interface", "Ground Uplink", map[string]any{"ShortDescription": "Command uplink receiver."}),
		n("CNN_FS1_1", "Connection", "Space-Ground Link", map[string]any{"Protocol": "CCSDS", "ShortDescription": "RF link between space and ground segments."}),
		n("AST_FS1_1", "Asset", "Fire Detection Data", crit(map[string]any{
			"AssetType": "PRIMARY", "MissionCritical": true, "SecurityCritical": true,
			"Availability": true, "Authenticity": true, "NonRepudiation": true,
			"ShortDescription": "The wildfire alert data product — the mission's reason for being.",
		})),
		n("REG_FS1_1", "Regime", "Mission Assurance", map[string]any{"Authority": "Program Office", "Standard": "Mission SoW"}),
		n("HAZ_FS1_1", "Hazard", "Spoofed Alert Injection", map[string]any{"ShortDescription": "Adversary injects false or suppresses true fire alerts."}),
		n("CTRL_FS1_1", "SecurityControl", "Alert Authenticity Control", map[string]any{"ShortDescription": "Detection data must be authenticated end-to-end."}),
		n("CM_FS1_1", "Countermeasure", "Digital Signature of Alerts", map[string]any{"ShortDescription": "Sign each alert with the payload's private key."}),
		n("ATK_FS1_1", "Attack", "RF Alert Spoofing", map[string]any{"AttackLevel": "TACTIC", "ShortDescription": "Transmit forged downlink frames."}),
		n("LOS_FS1_1", "Loss", "Compromise FireSat Authenticity in On Orbit", map[string]any{
			"MissionCritical": true, "Authenticity": true,
			"AttackTreeStatus": "NOT_BUILT", "TreeIsValid": false, "TreeHasRVs": false,
			"ShortDescription": "Loss of Authenticity of Fire Detection Data on orbit.",
		}),
		n("G_FS1_1", "GsnGoal", "FireSat alert authenticity is acceptable", map[string]any{
			"GoalStatement": "The MissionCritical Authenticity of Fire Detection Data is acceptable.",
		}),
		n("REQ_FS1_1", "Requirement", "Detection latency", map[string]any{
			"RStatement": "FireSat SHALL report a detected wildfire within 15 minutes of ignition.", "VMethod": "Test",
		}),
		n("REQ_FS1_2", "Requirement", "Alert authenticity", map[string]any{
			"RStatement": "FireSat SHALL cryptographically authenticate every downlinked alert.", "VMethod": "Analysis",
		}),

		// ============ Tier 2: Satellite Bus (child of EL_FS1_1, index FS1.1) ============
		n("SYS_FS1.1_0", "System", "Satellite Bus", map[string]any{"ShortDescription": "A single FireSat spacecraft."}),
		n("PUR_FS1.1_1", "Purpose", "Host and operate the fire payload", nil),
		n("ENV_FS1.1_1", "Environment", "On Orbit", nil),
		n("ST_FS1.1_1", "State", "Safe Mode", map[string]any{"StateSequence": int64(0)}),
		n("ST_FS1.1_2", "State", "Nominal", map[string]any{"StateSequence": int64(1)}),
		n("EL_FS1.1_1", "Component", "Infrared Payload", map[string]any{"ShortDescription": "The fire-detection sensor package."}),
		n("EL_FS1.1_2", "Component", "Attitude Control (ADCS)", map[string]any{"ShortDescription": "Pointing and stabilization."}),
		n("EL_FS1.1_3", "Component", "Flight Computer", map[string]any{"ShortDescription": "Onboard command and data handling."}),
		n("FUN_FS1.1_1", "SystemFunction", "Point Payload", nil),
		n("INT_FS1.1_1", "Interface", "Payload Data Bus", map[string]any{"Protocol": "SpaceWire"}),
		n("AST_FS1.1_1", "Asset", "Signing Private Key", crit(map[string]any{
			"AssetType": "DERIVED", "SecurityCritical": true, "Confidentiality": true,
			"ShortDescription": "Private key used to sign alerts — a derived asset protecting Authenticity via Confidentiality.",
		})),
		n("REQ_FS1.1_1", "Requirement", "Key protection", map[string]any{
			"RStatement": "The Satellite Bus SHALL store the signing private key in tamper-resistant hardware.", "VMethod": "Inspection",
		}),

		// ============ Tier 3: Infrared Sensor (child of EL_FS1.1_1, index FS1.1.1) ============
		n("SYS_FS1.1.1_0", "System", "Infrared Sensor", map[string]any{"ShortDescription": "The IR focal-plane detector assembly."}),
		n("PUR_FS1.1.1_1", "Purpose", "Sense thermal anomalies", nil),
		n("ENV_FS1.1.1_1", "Environment", "On Orbit", nil),
		n("ST_FS1.1.1_1", "State", "Imaging", map[string]any{"StateSequence": int64(0)}),
		n("EL_FS1.1.1_1", "Component", "Focal Plane Array", nil),
		n("EL_FS1.1.1_2", "Component", "Cryocooler", nil),
		n("FUN_FS1.1.1_1", "SystemFunction", "Capture IR Frame", nil),
		n("AST_FS1.1.1_1", "Asset", "Raw IR Imagery", crit(map[string]any{
			"AssetType": "PRIMARY", "MissionCritical": true, "Availability": true, "Integrity": false,
		})),
	}

	rels := []exRel{
		// Capability → tier-1 system
		{"HAS_SYSTEM", "CAP_FS_0", "SYS_FS1_0", nil},
		// FireSat composition
		{"REALIZES", "SYS_FS1_0", "PUR_FS1_1", nil},
		{"ACTS_IN", "SYS_FS1_0", "ENV_FS1_1", nil},
		{"ACTS_IN", "SYS_FS1_0", "ENV_FS1_2", nil},
		{"EXHIBITS", "SYS_FS1_0", "ST_FS1_1", nil},
		{"EXHIBITS", "SYS_FS1_0", "ST_FS1_2", nil},
		{"EXHIBITS", "SYS_FS1_0", "ST_FS1_3", nil},
		{"HAS_ELEMENT", "SYS_FS1_0", "EL_FS1_1", nil},
		{"HAS_ELEMENT", "SYS_FS1_0", "EL_FS1_2", nil},
		{"HAS_ELEMENT", "SYS_FS1_0", "EL_FS1_3", nil},
		{"HAS_FUNCTION", "SYS_FS1_0", "FUN_FS1_1", nil},
		{"HAS_FUNCTION", "SYS_FS1_0", "FUN_FS1_2", nil},
		{"HAS_INTERFACE", "SYS_FS1_0", "INT_FS1_1", nil},
		{"HAS_INTERFACE", "SYS_FS1_0", "INT_FS1_2", nil},
		{"HAS_CONNECTION", "SYS_FS1_0", "CNN_FS1_1", nil},
		{"HAS_ASSET", "SYS_FS1_0", "AST_FS1_1", nil},
		// state transitions
		{"TRANSITIONS_TO", "ST_FS1_1", "ST_FS1_2", map[string]any{"TransitionKind": "FUNCTIONAL", "Trigger": "Thermal anomaly detected"}},
		{"TRANSITIONS_TO", "ST_FS1_2", "ST_FS1_3", map[string]any{"TransitionKind": "FUNCTIONAL", "Trigger": "Alert ready"}},
		{"TRANSITIONS_TO", "ST_FS1_3", "ST_FS1_1", map[string]any{"TransitionKind": "FUNCTIONAL", "Trigger": "Downlink complete"}},
		{"VALID_IN", "ST_FS1_2", "ENV_FS1_1", nil},
		{"VALID_IN", "ST_FS1_3", "ENV_FS1_1", nil},
		// allocation and flow
		{"ALLOCATED_TO", "FUN_FS1_1", "EL_FS1_1", nil},
		{"ALLOCATED_TO", "FUN_FS1_2", "EL_FS1_1", nil},
		{"ALLOCATED_TO", "INT_FS1_1", "EL_FS1_1", nil},
		{"FLOWS_TO_FUNCTION", "FUN_FS1_1", "FUN_FS1_2", nil},
		{"FLOWS_TO_INTERFACE", "FUN_FS1_2", "INT_FS1_1", nil},
		{"PARTICIPATES_IN", "INT_FS1_1", "CNN_FS1_1", nil},
		{"PARTICIPATES_IN", "INT_FS1_2", "CNN_FS1_1", nil},
		// trace: function USES the asset in the Detecting state
		{"USES", "FUN_FS1_1", "AST_FS1_1", map[string]any{"TraceStateHID": "ST_FS1_2", "TraceStatus": "CURRENT", "TraceVersion": int64(1)}},
		{"HOLDS", "INT_FS1_1", "AST_FS1_1", map[string]any{"TraceStateHID": "ST_FS1_3", "TraceStatus": "CURRENT", "TraceVersion": int64(1)}},
		// security analysis chain
		{"HAS_HAZARD", "ENV_FS1_1", "HAZ_FS1_1", nil},
		{"THREATENS", "HAZ_FS1_1", "AST_FS1_1", nil},
		{"HAS_REGIME", "AST_FS1_1", "REG_FS1_1", nil},
		{"HAS_LOSS", "AST_FS1_1", "LOS_FS1_1", nil},
		{"HAS_GOAL", "AST_FS1_1", "G_FS1_1", nil},
		{"HAS_ENVIRONMENT", "LOS_FS1_1", "ENV_FS1_1", nil},
		{"HAS_PERSPECTIVE", "SYS_FS1_0", "", nil}, // placeholder skipped (no Perspective node)
		{"MITIGATES", "CTRL_FS1_1", "HAZ_FS1_1", nil},
		{"SATISFIES", "CM_FS1_1", "CTRL_FS1_1", nil},
		{"BLOCKS", "CM_FS1_1", "ATK_FS1_1", nil},
		{"USES_ATTACK", "HAZ_FS1_1", "ATK_FS1_1", nil},
		{"EXPLOITS", "ATK_FS1_1", "INT_FS1_1", nil},
		{"TARGETS_LOSS", "ATK_FS1_1", "LOS_FS1_1", nil},
		// requirements
		{"HAS_REQUIREMENT", "PUR_FS1_1", "REQ_FS1_1", nil},
		{"HAS_REQUIREMENT", "FUN_FS1_1", "REQ_FS1_1", nil},
		{"HAS_REQUIREMENT", "CM_FS1_1", "REQ_FS1_2", nil},
		{"HAS_REQUIREMENT", "INT_FS1_1", "REQ_FS1_2", nil},

		// Tier-2 child system through EL_FS1_1 PARENTS SYS_FS1.1_0
		{"PARENTS", "EL_FS1_1", "SYS_FS1.1_0", nil},
		{"REALIZES", "SYS_FS1.1_0", "PUR_FS1.1_1", nil},
		{"ACTS_IN", "SYS_FS1.1_0", "ENV_FS1.1_1", nil},
		{"EXHIBITS", "SYS_FS1.1_0", "ST_FS1.1_1", nil},
		{"EXHIBITS", "SYS_FS1.1_0", "ST_FS1.1_2", nil},
		{"HAS_ELEMENT", "SYS_FS1.1_0", "EL_FS1.1_1", nil},
		{"HAS_ELEMENT", "SYS_FS1.1_0", "EL_FS1.1_2", nil},
		{"HAS_ELEMENT", "SYS_FS1.1_0", "EL_FS1.1_3", nil},
		{"HAS_FUNCTION", "SYS_FS1.1_0", "FUN_FS1.1_1", nil},
		{"HAS_INTERFACE", "SYS_FS1.1_0", "INT_FS1.1_1", nil},
		{"HAS_ASSET", "SYS_FS1.1_0", "AST_FS1.1_1", nil},
		{"TRANSITIONS_TO", "ST_FS1.1_1", "ST_FS1.1_2", map[string]any{"TransitionKind": "FUNCTIONAL"}},
		{"ALLOCATED_TO", "FUN_FS1.1_1", "EL_FS1.1_2", nil},
		{"USES", "EL_FS1.1_1", "AST_FS1.1_1", map[string]any{"TraceStateHID": "ST_FS1.1_2", "TraceStatus": "CURRENT", "TraceVersion": int64(1)}},
		{"DERIVED_FROM", "AST_FS1.1_1", "AST_FS1_1", nil},
		{"HAS_REQUIREMENT", "EL_FS1.1_1", "REQ_FS1.1_1", nil},

		// Tier-3 child system through EL_FS1.1_1 PARENTS SYS_FS1.1.1_0
		{"PARENTS", "EL_FS1.1_1", "SYS_FS1.1.1_0", nil},
		{"REALIZES", "SYS_FS1.1.1_0", "PUR_FS1.1.1_1", nil},
		{"ACTS_IN", "SYS_FS1.1.1_0", "ENV_FS1.1.1_1", nil},
		{"EXHIBITS", "SYS_FS1.1.1_0", "ST_FS1.1.1_1", nil},
		{"HAS_ELEMENT", "SYS_FS1.1.1_0", "EL_FS1.1.1_1", nil},
		{"HAS_ELEMENT", "SYS_FS1.1.1_0", "EL_FS1.1.1_2", nil},
		{"HAS_FUNCTION", "SYS_FS1.1.1_0", "FUN_FS1.1.1_1", nil},
		{"HAS_ASSET", "SYS_FS1.1.1_0", "AST_FS1.1.1_1", nil},
		{"ALLOCATED_TO", "FUN_FS1.1.1_1", "EL_FS1.1.1_1", nil},
	}
	return nodes, rels
}

// soiIndexFromHID extracts the index between the first and last underscore.
func soiIndexFromHID(hid string) string {
	first := -1
	last := -1
	for i, c := range hid {
		if c == '_' {
			if first == -1 {
				first = i
			}
			last = i
		}
	}
	if first == -1 || last == first {
		return ""
	}
	return hid[first+1 : last]
}

// seedFireSat loads the FireSat example if it is not already present.
func (s *Server) seedFireSat(ctx context.Context) (bool, error) {
	existing, err := s.db.Read(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(ctx, `MATCH (n {ExampleProject: $p}) RETURN count(n) AS c`,
			map[string]any{"p": fireSatProject})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(ctx)
		if err != nil {
			return nil, err
		}
		c, _ := single.AsMap()["c"].(int64)
		return c, nil
	})
	if err != nil {
		return false, err
	}
	if existing.(int64) > 0 {
		return false, nil
	}
	return true, s.loadFireSat(ctx)
}

// loadFireSat writes the FireSat graph in one transaction.
func (s *Server) loadFireSat(ctx context.Context) error {
	nodes, rels := fireSatData()
	_, err := s.db.Write(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for _, nd := range nodes {
			props := map[string]any{
				"HID": nd.hid, "uuid": uuid.NewString(), "TypeName": nd.label,
				"Name": nd.name, "Owner": exampleOwner, "OwnerEmail": exampleOwnerEmail,
				"Creator": exampleOwner, "CreatorEmail": exampleOwnerEmail,
				"VersionID": s.cfg.SchemaVersion, "SoIIndex": soiIndexFromHID(nd.hid),
				"IsExampleData": true, "ExampleProject": fireSatProject,
			}
			// Sequence from HID.
			if h, err := parseSeq(nd.hid); err == nil {
				props["Sequence"] = h
			}
			for k, v := range nd.props {
				props[k] = v
			}
			q := fmt.Sprintf("CREATE (n:SSTPA:%s) SET n = $props, n.Created = datetime(), n.LastTouch = datetime()", nd.label)
			if _, err := tx.Run(ctx, q, map[string]any{"props": props}); err != nil {
				return nil, fmt.Errorf("create %s: %w", nd.hid, err)
			}
		}
		for _, rl := range rels {
			if rl.tgt == "" {
				continue // placeholder edge
			}
			rprops := map[string]any{}
			for k, v := range rl.props {
				rprops[k] = v
			}
			q := fmt.Sprintf(`MATCH (a {HID: $src}) MATCH (b {HID: $tgt})
				CREATE (a)-[r:%s]->(b) SET r = $props`, rl.relType)
			if _, err := tx.Run(ctx, q, map[string]any{"src": rl.src, "tgt": rl.tgt, "props": rprops}); err != nil {
				return nil, fmt.Errorf("rel %s %s->%s: %w", rl.relType, rl.src, rl.tgt, err)
			}
		}
		return nil, nil
	})
	return err
}

func parseSeq(hid string) (int64, error) {
	var n int64
	// last underscore-separated token
	last := 0
	for i := 0; i < len(hid); i++ {
		if hid[i] == '_' {
			last = i + 1
		}
	}
	_, err := fmt.Sscanf(hid[last:], "%d", &n)
	return n, err
}

// handleExampleReset deletes and reloads a named example project (SRS §3.6:
// Frontend commands Reset via the gear icon). Idempotent.
func (s *Server) handleExampleReset(w http.ResponseWriter, r *http.Request) {
	project := r.URL.Query().Get("project")
	if project == "" {
		project = fireSatProject
	}
	if project != fireSatProject {
		writeError(w, http.StatusNotFound, "unknown example project", project)
		return
	}
	_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(r.Context(), `MATCH (n {ExampleProject: $p}) DETACH DELETE n`,
			map[string]any{"p": project})
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "example reset failed", err.Error())
		return
	}
	if err := s.loadFireSat(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "example reload failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reset", "project": project})
}

// handleExampleList reports available example projects (SRS §3.6).
func (s *Server) handleExampleList(w http.ResponseWriter, r *http.Request) {
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (p:Project {ExampleProject: $p})
			RETURN p.HID AS hid, p.Name AS name, p.ShortDescription AS description`,
			map[string]any{"p": fireSatProject})
		if err != nil {
			return nil, err
		}
		var out []map[string]any
		for rec.Next(r.Context()) {
			out = append(out, rec.Record().AsMap())
		}
		return out, rec.Err()
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "example list failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"examples": res})
}
