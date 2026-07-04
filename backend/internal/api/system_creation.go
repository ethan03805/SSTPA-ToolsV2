// System creation from Component (SRS §3.3.7): creates the child SoI
// sub-graph with default Purpose/Environment/State, clones Requirements and
// Assets, and derives Loss and GsnGoal nodes — all in one ACID transaction.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

type createSystemRequest struct {
	ComponentHID string `json:"componentHid"`
	Name         string `json:"name,omitempty"`
}

func (s *Server) handleCreateSystemFromComponent(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	var req createSystemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ComponentHID == "" {
		writeError(w, http.StatusBadRequest, "componentHid is required", "")
		return
	}
	compHID, err := schema.ParseHID(req.ComponentHID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid componentHid", err.Error())
		return
	}
	if compHID.TypePrefix != "EL" {
		writeError(w, http.StatusBadRequest, "componentHid must identify an (:Component) node (EL_*)", req.ComponentHID)
		return
	}

	result, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		return s.createChildSystem(r.Context(), tx, user, compHID, req.Name)
	})
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "system creation rejected", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// createChildSystem implements the §3.3.7 behavior list.
func (s *Server) createChildSystem(ctx context.Context, tx neo4j.ManagedTransaction, user UserIdentity, compHID schema.HID, name string) (map[string]any, error) {
	// Verify the component exists and has no child System (§3.3.4.1).
	rec, err := tx.Run(ctx, `
		MATCH (el:Component {HID: $hid})
		OPTIONAL MATCH (el)-[r:PARENTS]->(:System)
		RETURN el.Name AS name, count(r) AS children`,
		map[string]any{"hid": compHID.String()})
	if err != nil {
		return nil, err
	}
	single, err := rec.Single(ctx)
	if err != nil {
		return nil, fmt.Errorf("component %s not found", compHID.String())
	}
	m := single.AsMap()
	if n, _ := m["children"].(int64); n > 0 {
		return nil, fmt.Errorf("a (:Component) SHALL parent zero or one child (:System) (SRS §3.3.4.1)")
	}
	compName, _ := m["name"].(string)
	if name == "" {
		name = compName
	}

	// Child SoI index per §3.3.8.2: parent index + "." + component sequence.
	childIndex := schema.ChildSystemIndex(compHID)
	sysHID := schema.HID{TypePrefix: "SYS", Index: childIndex, Sequence: 0}

	newNode := func(label, prefix string, seq int, name string, extra map[string]any) map[string]any {
		props := map[string]any{
			"HID":          fmt.Sprintf("%s_%s_%d", prefix, childIndex, seq),
			"uuid":         uuid.NewString(),
			"TypeName":     label,
			"Name":         name,
			"Owner":        user.UserName,
			"OwnerEmail":   user.Email,
			"Creator":      user.UserName,
			"CreatorEmail": user.Email,
			"VersionID":    s.cfg.SchemaVersion,
			"SoIIndex":     childIndex,
			"Sequence":     seq,
			"Created":      neo4j.LocalDateTimeOf(timeNow()),
			"LastTouch":    neo4j.LocalDateTimeOf(timeNow()),
		}
		for k, v := range extra {
			props[k] = v
		}
		return props
	}

	// 1. Create (:System) + default (:Purpose), (:Environment), (:State) (§3.3.7).
	sysProps := newNode("System", "SYS", 0, name, nil)
	purposeProps := newNode("Purpose", "PUR", 1, "Default Purpose", nil)
	envProps := newNode("Environment", "ENV", 1, "Default Environment", nil)
	stateProps := newNode("State", "ST", 1, "Default State", nil)
	if _, err := tx.Run(ctx, `
		MATCH (el:Component {HID: $compHid})
		CREATE (sys:SSTPA:System) SET sys = $sys
		CREATE (el)-[:PARENTS]->(sys)
		CREATE (p:SSTPA:Purpose) SET p = $purpose
		CREATE (sys)-[:REALIZES]->(p)
		CREATE (e:SSTPA:Environment) SET e = $env
		CREATE (sys)-[:ACTS_IN]->(e)
		CREATE (st:SSTPA:State) SET st = $state
		CREATE (sys)-[:EXHIBITS]->(st)`,
		map[string]any{"compHid": compHID.String(), "sys": sysProps,
			"purpose": purposeProps, "env": envProps, "state": stateProps}); err != nil {
		return nil, err
	}

	// 2. Clone Requirements related to the Component or to Functions/
	// Interfaces allocated to it, under the new Purpose (§3.3.7, §3.3.4.8).
	rec, err = tx.Run(ctx, `
		MATCH (el:Component {HID: $compHid})
		CALL (el) {
			MATCH (el)-[:HAS_REQUIREMENT]->(r:Requirement) RETURN r
			UNION
			MATCH (x)-[:ALLOCATED_TO]->(el), (x)-[:HAS_REQUIREMENT]->(r:Requirement)
			WHERE x:SystemFunction OR x:Interface
			RETURN r
		}
		RETURN DISTINCT r{.*} AS props`,
		map[string]any{"compHid": compHID.String()})
	if err != nil {
		return nil, err
	}
	reqCount := 0
	for rec.Next(ctx) {
		v, _ := rec.Record().Get("props")
		src := v.(map[string]any)
		reqCount++
		clone := newNode("Requirement", "REQ", reqCount, str(src["Name"]), nil)
		for k, val := range src {
			if systemManagedProps[k] || k == "Name" {
				continue
			}
			clone[k] = val
		}
		if _, err := tx.Run(ctx, `
			MATCH (p:Purpose {HID: $pHid})
			CREATE (nr:SSTPA:Requirement) SET nr = $props
			CREATE (p)-[:HAS_REQUIREMENT]->(nr)`,
			map[string]any{"pHid": purposeProps["HID"], "props": clone}); err != nil {
			return nil, err
		}
	}
	if err := rec.Err(); err != nil {
		return nil, err
	}

	// 3. Clone Assets related via CURRENT trace relationships to the
	// Component or its allocated Functions/Interfaces (§3.3.7). Trace
	// relationships are NOT copied; new-SoI trace analysis is independent.
	rec, err = tx.Run(ctx, `
		MATCH (el:Component {HID: $compHid})
		CALL (el) {
			MATCH (el)-[t:HOLDS|TRANSPORTS|USES]->(a:Asset) WHERE t.TraceStatus = 'CURRENT' RETURN a
			UNION
			MATCH (x)-[:ALLOCATED_TO]->(el), (x)-[t:HOLDS|TRANSPORTS|USES]->(a:Asset)
			WHERE (x:SystemFunction OR x:Interface) AND t.TraceStatus = 'CURRENT'
			RETURN a
		}
		RETURN DISTINCT a{.*} AS props`,
		map[string]any{"compHid": compHID.String()})
	if err != nil {
		return nil, err
	}
	assetCount, lossCount, goalCount := 0, 0, 0
	for rec.Next(ctx) {
		v, _ := rec.Record().Get("props")
		src := v.(map[string]any)
		assetCount++
		assetClone := newNode("Asset", "AST", assetCount, str(src["Name"]), nil)
		for k, val := range src {
			if systemManagedProps[k] || k == "Name" {
				continue
			}
			assetClone[k] = val
		}
		// 4. New (:Loss) and (:GsnGoal) derived from each new Asset (§3.3.7).
		lossCount++
		goalCount++
		lossProps := newNode("Loss", "LOS", lossCount, "Loss of "+str(src["Name"]), nil)
		goalProps := newNode("GsnGoal", "G", goalCount,
			str(src["Name"])+" is protected", nil)
		if _, err := tx.Run(ctx, `
			MATCH (sys:System {HID: $sysHid})
			CREATE (a:SSTPA:Asset) SET a = $asset
			CREATE (sys)-[:HAS_ASSET]->(a)
			CREATE (l:SSTPA:Loss) SET l = $loss
			CREATE (a)-[:HAS_LOSS]->(l)
			CREATE (g:SSTPA:GsnGoal) SET g = $goal
			CREATE (a)-[:HAS_GOAL]->(g)`,
			map[string]any{"sysHid": sysHID.String(), "asset": assetClone,
				"loss": lossProps, "goal": goalProps}); err != nil {
			return nil, err
		}
	}
	if err := rec.Err(); err != nil {
		return nil, err
	}

	return map[string]any{
		"systemHid":          sysHID.String(),
		"purposeHid":         purposeProps["HID"],
		"environmentHid":     envProps["HID"],
		"stateHid":           stateProps["HID"],
		"requirementsCloned": reqCount,
		"assetsCloned":       assetCount,
		"lossesCreated":      lossCount,
		"goalsCreated":       goalCount,
	}, nil
}

func str(v any) string {
	s, _ := v.(string)
	if s == "" {
		return "New"
	}
	return s
}
