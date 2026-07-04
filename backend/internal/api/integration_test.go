//go:build integration

// Full-stack integration tests: real router + real Neo4j.
//
// Gated behind the `integration` build tag and the SSTPA_TEST_BOLT
// environment variable so `go test ./...` stays hermetic. Run with
// backend/scripts/integration-test.sh, which provisions a throwaway Neo4j.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/config"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/graph"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/telemetry"
)

type itHarness struct {
	t      *testing.T
	router http.Handler
	tokens map[string]string // userName → bearer token
}

// The router/driver/metrics are built once per process: telemetry.NewMetrics
// registers on the default Prometheus registry and must not run twice.
var (
	itOnce    sync.Once
	itRouter  http.Handler
	itTokens  = map[string]string{}
	itInitErr error
)

type itTxMetrics struct{ m *telemetry.Metrics }

func (t itTxMetrics) TxCommitted()  { t.m.GraphTransactionsTotal.WithLabelValues("commit").Inc() }
func (t itTxMetrics) TxRolledBack() { t.m.GraphTransactionsTotal.WithLabelValues("rollback").Inc() }

func newHarness(t *testing.T) *itHarness {
	t.Helper()
	bolt := os.Getenv("SSTPA_TEST_BOLT")
	if bolt == "" {
		t.Skip("SSTPA_TEST_BOLT not set; run backend/scripts/integration-test.sh")
	}
	itOnce.Do(func() {
		pass := os.Getenv("SSTPA_TEST_NEO4J_PASSWORD")
		if pass == "" {
			pass = "sstpa-it-password"
		}
		cfg := config.Config{
			ProductName: "SSTPA Tools Backend", Version: "it", BuildNumber: "0",
			SchemaVersion: "0.7", Environment: "integration-test",
			Neo4jURI: bolt, Neo4jUser: "neo4j", Neo4jPassword: pass,
		}
		m := telemetry.NewMetrics()
		db, err := graph.Connect(context.Background(), bolt, "neo4j", pass, itTxMetrics{m})
		if err != nil {
			itInitErr = fmt.Errorf("connect neo4j: %w", err)
			return
		}
		if err := db.EnsureIndexes(context.Background()); err != nil {
			itInitErr = fmt.Errorf("ensure indexes: %w", err)
			return
		}
		sch, err := schema.Load()
		if err != nil {
			itInitErr = fmt.Errorf("schema: %w", err)
			return
		}
		itRouter = NewRouter(cfg, db, sch, m)
	})
	if itInitErr != nil {
		t.Fatalf("integration harness: %v", itInitErr)
	}
	return &itHarness{t: t, router: itRouter, tokens: itTokens}
}

// call performs an HTTP request against the full router.
func (h *itHarness) call(method, path, as string, body any) (int, map[string]any) {
	h.t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Content-Type", "application/json")
	if as != "" {
		tok, ok := h.tokens[as]
		if !ok {
			h.t.Fatalf("no token for %s", as)
		}
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	w := httptest.NewRecorder()
	h.router.ServeHTTP(w, req)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func (h *itHarness) login(user, pass string) int {
	h.t.Helper()
	code, res := h.call(http.MethodPost, "/api/auth/login", "", map[string]any{
		"userName": user, "password": pass,
	})
	if code == http.StatusOK {
		h.tokens[user] = res["token"].(string)
	}
	return code
}

func (h *itHarness) mustLogin(user, pass string) {
	h.t.Helper()
	if code := h.login(user, pass); code != http.StatusOK {
		h.t.Fatalf("login %s: %d", user, code)
	}
}

// bootstrapOnce creates (or reuses) the RootAdmin for the test database.
func (h *itHarness) bootstrapOnce() {
	h.t.Helper()
	code, _ := h.call(http.MethodPost, "/api/auth/bootstrap", "", map[string]any{
		"userName": "it-root", "password": "it-root-pass", "email": "it-root@example.test",
	})
	if code != http.StatusCreated && code != http.StatusConflict {
		h.t.Fatalf("bootstrap: %d", code)
	}
	h.mustLogin("it-root", "it-root-pass")
}

func (h *itHarness) commit(as string, soiHid string, ops []map[string]any) (int, map[string]any) {
	return h.call(http.MethodPost, "/api/commit", as, map[string]any{
		"soiHid": soiHid, "toolId": "it-test", "operations": ops,
	})
}

// ensureUser creates an ACTIVE test user, tolerating pre-existence.
func (h *itHarness) ensureUser(name, pass string, isAdmin bool) {
	h.t.Helper()
	body := map[string]any{
		"userName": name, "password": pass, "email": name + "@example.test", "isAdmin": isAdmin,
	}
	if isAdmin {
		body["authorizerPassword"] = "it-root-pass"
	}
	code, _ := h.call(http.MethodPost, "/api/admin/users", "it-root", body)
	if code != http.StatusCreated && code != http.StatusConflict {
		h.t.Fatalf("create user %s: %d", name, code)
	}
	// Reinstate in case a previous run left it suspended/disenrolled.
	h.call(http.MethodPatch, "/api/admin/users/"+name, "it-root", map[string]any{"reinstate": true})
}

func TestIntegrationAuthFlow(t *testing.T) {
	h := newHarness(t)

	code, res := h.call(http.MethodGet, "/api/auth/status", "", nil)
	if code != http.StatusOK {
		t.Fatalf("auth status: %d", code)
	}
	h.bootstrapOnce()

	code, res = h.call(http.MethodGet, "/api/auth/status", "", nil)
	if code != http.StatusOK || res["rootAdminExists"] != true {
		t.Fatalf("auth status after bootstrap: %d %v", code, res)
	}

	// Second bootstrap must 409.
	code, _ = h.call(http.MethodPost, "/api/auth/bootstrap", "", map[string]any{
		"userName": "other", "password": "x", "email": "x@example.test",
	})
	if code != http.StatusConflict {
		t.Fatalf("second bootstrap: got %d, want 409", code)
	}

	if code := h.login("it-root", "wrong-password"); code != http.StatusUnauthorized {
		t.Fatalf("bad login: got %d, want 401", code)
	}

	// Logout revokes the token.
	h.mustLogin("it-root", "it-root-pass")
	tok := h.tokens["it-root"]
	h.call(http.MethodPost, "/api/auth/logout", "it-root", nil)
	req := httptest.NewRequest(http.MethodGet, "/api/hierarchy", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	h.router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("revoked token still valid: %d", w.Code)
	}
	h.mustLogin("it-root", "it-root-pass")
}

// TestIntegrationCommitAndTraceDerivation covers the full §5.6.6.8 commit
// pipeline plus the §3.3.4.6.3 protection-Requirement regression: one commit
// staging trace relationships from TWO entities to one Asset must create TWO
// distinct protection Requirements with unique HIDs (not one — the historic
// LIMIT 1 bug — and not duplicates).
func TestIntegrationCommitAndTraceDerivation(t *testing.T) {
	h := newHarness(t)
	h.bootstrapOnce()

	// 1. Create a System; backend must add default Purpose/Environment/State.
	code, res := h.commit("it-root", "", []map[string]any{
		{"op": "createNode", "tempId": "sys", "label": "System",
			"properties": map[string]any{"Name": "IT Trace System"}},
	})
	if code != http.StatusOK {
		t.Fatalf("create system: %d %v", code, res)
	}
	created := res["createdNodes"].(map[string]any)
	sysHid := created["sys"].(string)
	if res["nodesChanged"].(float64) != 4 { // system + purpose + env + state
		t.Fatalf("system defaults not created: %v", res)
	}

	// 2. In one commit: two entities, one confidential Asset, a State, and
	// CURRENT trace relationships from both entities to the Asset.
	code, res = h.commit("it-root", sysHid, []map[string]any{
		{"op": "createNode", "tempId": "if1", "label": "Interface",
			"properties": map[string]any{"Name": "IT Interface"}},
		{"op": "createNode", "tempId": "fn1", "label": "SystemFunction",
			"properties": map[string]any{"Name": "IT Function"}},
		{"op": "createNode", "tempId": "st1", "label": "State",
			"properties": map[string]any{"Name": "IT State"}},
		{"op": "createNode", "tempId": "ast1", "label": "Asset",
			"properties": map[string]any{"Name": "IT Secret Data", "Confidentiality": true}},
	})
	if code != http.StatusOK {
		t.Fatalf("create entities: %d %v", code, res)
	}
	c2 := res["createdNodes"].(map[string]any)
	ifHid, fnHid := c2["if1"].(string), c2["fn1"].(string)
	stHid, astHid := c2["st1"].(string), c2["ast1"].(string)

	code, res = h.commit("it-root", sysHid, []map[string]any{
		{"op": "createRelationship", "type": "HOLDS", "sourceHid": ifHid, "targetHid": astHid,
			"properties": map[string]any{"TraceStateHID": stHid}},
		{"op": "createRelationship", "type": "USES", "sourceHid": fnHid, "targetHid": astHid,
			"properties": map[string]any{"TraceStateHID": stHid}},
	})
	if code != http.StatusOK {
		t.Fatalf("trace commit: %d %v", code, res)
	}

	// 3. Both entities must now carry derived Confidentiality, and TWO
	// distinct protection Requirements must exist.
	soiCode, soiRes := h.call(http.MethodGet, "/api/soi/"+sysHid, "it-root", nil)
	if soiCode != http.StatusOK {
		t.Fatalf("soi read: %d", soiCode)
	}
	nodes := soiRes["nodes"].([]any)
	reqs := map[string]string{} // HID → RStatement
	confEntities := 0
	for _, n := range nodes {
		nm := n.(map[string]any)
		props, _ := nm["properties"].(map[string]any)
		if nm["typeName"] == "Requirement" {
			if rs, _ := props["RStatement"].(string); rs != "" {
				reqs[nm["hid"].(string)] = rs
			}
		}
		if (nm["hid"] == ifHid || nm["hid"] == fnHid) && props["Confidentiality"] == true {
			confEntities++
		}
	}
	if confEntities != 2 {
		t.Errorf("derived Confidentiality on %d entities, want 2", confEntities)
	}
	protect := 0
	seenStatements := map[string]bool{}
	for hid, rs := range reqs {
		if bytes.Contains([]byte(rs), []byte("SHALL protect the Confidentiality of IT Secret Data")) {
			protect++
			if seenStatements[rs] {
				t.Errorf("duplicate protection requirement statement %q (HID %s)", rs, hid)
			}
			seenStatements[rs] = true
		}
	}
	if protect != 2 {
		t.Errorf("protection requirements: got %d, want 2 (LIMIT 1 regression)", protect)
	}

	// 4. Clearing one trace cell supersedes rather than deletes, and the
	// affected Requirement is flagged Orphan on recompute.
	code, res = h.commit("it-root", sysHid, []map[string]any{
		{"op": "deleteRelationship", "type": "HOLDS", "sourceHid": ifHid, "targetHid": astHid,
			"properties": map[string]any{"TraceStateHID": stHid}},
	})
	if code != http.StatusOK {
		t.Fatalf("supersede commit: %d %v", code, res)
	}
	_, soiRes = h.call(http.MethodGet, "/api/soi/"+sysHid, "it-root", nil)
	orphaned := false
	for _, n := range soiRes["nodes"].([]any) {
		nm := n.(map[string]any)
		props, _ := nm["properties"].(map[string]any)
		if nm["typeName"] == "Requirement" {
			rs, _ := props["RStatement"].(string)
			if rs == "IT Interface SHALL protect the Confidentiality of IT Secret Data." &&
				props["Orphan"] == true {
				orphaned = true
			}
		}
	}
	if !orphaned {
		t.Errorf("superseded trace did not orphan its protection requirement")
	}
}

func TestIntegrationOwnershipTransfer(t *testing.T) {
	h := newHarness(t)
	h.bootstrapOnce()
	h.ensureUser("it-owner", "it-owner-pass", false)
	h.ensureUser("it-admin2", "it-admin2-pass", true)

	code, res := h.commit("it-root", "", []map[string]any{
		{"op": "createNode", "tempId": "sys", "label": "System",
			"properties": map[string]any{"Name": "IT Ownership System"}},
	})
	if code != http.StatusOK {
		t.Fatalf("create: %d %v", code, res)
	}
	sysHid := res["createdNodes"].(map[string]any)["sys"].(string)

	// Transfer to an ACTIVE non-admin user succeeds.
	code, res = h.commit("it-root", "", []map[string]any{
		{"op": "transferOwnership", "hid": sysHid, "newOwner": "it-owner"},
	})
	if code != http.StatusOK {
		t.Fatalf("transfer: %d %v", code, res)
	}
	_, nodeRes := h.call(http.MethodGet, "/api/nodes/hid/"+sysHid, "it-root", nil)
	props := nodeRes["properties"].(map[string]any)
	if props["Owner"] != "it-owner" {
		t.Errorf("owner after transfer: %v", props["Owner"])
	}

	// Transfer to an Admin is rejected (Admins cannot own Core Data, §3.2).
	code, _ = h.commit("it-root", "", []map[string]any{
		{"op": "transferOwnership", "hid": sysHid, "newOwner": "it-admin2"},
	})
	if code != http.StatusUnprocessableEntity {
		t.Errorf("transfer to admin: got %d, want 422", code)
	}
}

func TestIntegrationMessagePerUserDelete(t *testing.T) {
	h := newHarness(t)
	h.bootstrapOnce()
	h.ensureUser("it-sender", "it-sender-pass", false)
	h.mustLogin("it-sender", "it-sender-pass")

	subject := fmt.Sprintf("it-msg-%d", timeNow().UnixNano())
	code, res := h.call(http.MethodPost, "/api/messages", "it-sender", map[string]any{
		"recipient": "it-root", "subject": subject, "body": "per-user delete test",
	})
	if code != http.StatusCreated {
		t.Fatalf("send: %d %v", code, res)
	}
	msgID := res["messageId"].(string)

	// Recipient deletes → gone from recipient's list, still in sender's outbox.
	code, _ = h.call(http.MethodDelete, "/api/messages/"+msgID, "it-root", nil)
	if code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	inList := func(as, box string) bool {
		_, lr := h.call(http.MethodGet, "/api/messages?box="+box, as, nil)
		msgs, _ := lr["messages"].([]any)
		for _, m := range msgs {
			if m.(map[string]any)["subject"] == subject {
				return true
			}
		}
		return false
	}
	if inList("it-root", "inbox") {
		t.Errorf("message still in recipient inbox after delete")
	}
	if !inList("it-sender", "outbox") {
		t.Errorf("message vanished from sender outbox after recipient delete (must be per-user)")
	}
}

// TestIntegrationModelTranslation covers §5.6.6.12: G2M projection of a live
// SoI, the profile endpoint, and the M2G validate→commit property-edit loop.
func TestIntegrationModelTranslation(t *testing.T) {
	h := newHarness(t)
	h.bootstrapOnce()

	code, res := h.commit("it-root", "", []map[string]any{
		{"op": "createNode", "tempId": "sys", "label": "System",
			"properties": map[string]any{"Name": "IT Model System"}},
	})
	if code != http.StatusOK {
		t.Fatalf("create system: %d %v", code, res)
	}
	sysHid := res["createdNodes"].(map[string]any)["sys"].(string)

	// G2M: both languages emit and are deterministic.
	get := func(path string) (int, string) {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+h.tokens["it-root"])
		w := httptest.NewRecorder()
		h.router.ServeHTTP(w, req)
		return w.Code, w.Body.String()
	}
	code1, sysml1 := get("/api/model/sysml?soi=" + sysHid)
	code2, sysml2 := get("/api/model/sysml?soi=" + sysHid)
	if code1 != http.StatusOK || code2 != http.StatusOK {
		t.Fatalf("model sysml: %d/%d %s", code1, code2, sysml1)
	}
	if sysml1 != sysml2 {
		t.Errorf("G2M output not deterministic (SRS §3.7.8)")
	}
	if !bytes.Contains([]byte(sysml1), []byte("IT Model System")) ||
		!bytes.Contains([]byte(sysml1), []byte("#system")) {
		t.Errorf("sysml missing system content: %s", sysml1)
	}
	codeK, kerml := get("/api/model/kerml?soi=" + sysHid)
	if codeK != http.StatusOK || !bytes.Contains([]byte(kerml), []byte("Security Analysis")) {
		t.Errorf("kerml: %d %s", codeK, kerml)
	}
	codeP, profile := get("/api/model/profile")
	if codeP != http.StatusOK || !bytes.Contains([]byte(profile), []byte("SSTPA Profile")) {
		t.Errorf("profile: %d", codeP)
	}

	// M2G: edit a property through model text, validate, then commit.
	edited := fmt.Sprintf(`part <'%s'> 'IT Model System' #system {
	doc Short /* edited via model text */
}`, sysHid)
	code, vres := h.call(http.MethodPost, "/api/model/validate", "it-root",
		map[string]any{"text": edited, "soiHid": sysHid})
	if code != http.StatusOK || vres["valid"] != true {
		t.Fatalf("model validate: %d %v", code, vres)
	}
	changes := vres["changes"].([]any)
	if len(changes) != 1 {
		t.Fatalf("expected 1 staged change, got %v", changes)
	}
	code, cres := h.call(http.MethodPost, "/api/model/commit", "it-root",
		map[string]any{"text": edited, "soiHid": sysHid})
	if code != http.StatusOK {
		t.Fatalf("model commit: %d %v", code, cres)
	}
	_, node := h.call(http.MethodGet, "/api/nodes/hid/"+sysHid, "it-root", nil)
	if p := node["properties"].(map[string]any); p["ShortDescription"] != "edited via model text" {
		t.Errorf("M2G commit did not persist: %v", p["ShortDescription"])
	}

	// Unknown HIDs are rejected with diagnostics, not created (§3.7.9 subset).
	code, vres = h.call(http.MethodPost, "/api/model/validate", "it-root",
		map[string]any{"text": "part <'SYS_999_0'> 'Ghost' #system;", "soiHid": sysHid})
	if code != http.StatusOK || vres["valid"] != false {
		t.Errorf("unknown-HID text should be invalid: %d %v", code, vres)
	}
}

func TestIntegrationAdminLifecycle(t *testing.T) {
	h := newHarness(t)
	h.bootstrapOnce()
	h.ensureUser("it-lifecycle", "it-lc-pass", false)
	h.ensureUser("it-heir", "it-heir-pass", false)

	// ADMIN creation without re-authorization is rejected (§6.5.15.8).
	code, _ := h.call(http.MethodPost, "/api/admin/users", "it-root", map[string]any{
		"userName": "it-rogue", "password": "x", "email": "rogue@example.test", "isAdmin": true,
	})
	if code != http.StatusForbidden {
		t.Errorf("admin creation without authorizer: got %d, want 403", code)
	}

	// Suspend blocks login (§6.5.15.11).
	code, _ = h.call(http.MethodPatch, "/api/admin/users/it-lifecycle", "it-root",
		map[string]any{"suspend": true})
	if code != http.StatusOK {
		t.Fatalf("suspend: %d", code)
	}
	if code := h.login("it-lifecycle", "it-lc-pass"); code != http.StatusForbidden {
		t.Errorf("suspended login: got %d, want 403", code)
	}

	// Reinstate restores login.
	h.call(http.MethodPatch, "/api/admin/users/it-lifecycle", "it-root",
		map[string]any{"reinstate": true})
	if code := h.login("it-lifecycle", "it-lc-pass"); code != http.StatusOK {
		t.Errorf("reinstated login: got %d, want 200", code)
	}

	// Give the user a node, then disenroll: node ownership transfers, the
	// (:User) node is RETAINED with DISENROLLED status (§6.5.15.11).
	code, res := h.commit("it-lifecycle", "", []map[string]any{
		{"op": "createNode", "tempId": "sys", "label": "System",
			"properties": map[string]any{"Name": "IT Lifecycle System"}},
	})
	if code != http.StatusOK {
		t.Fatalf("user create system: %d %v", code, res)
	}
	sysHid := res["createdNodes"].(map[string]any)["sys"].(string)

	// Disenroll to an admin target must fail (§6.5.15.10).
	code, _ = h.call(http.MethodPatch, "/api/admin/users/it-lifecycle", "it-root",
		map[string]any{"disenroll": true, "transferTo": "it-root"})
	if code != http.StatusBadRequest {
		t.Errorf("disenroll to admin/rootadmin: got %d, want 400", code)
	}

	code, res = h.call(http.MethodPatch, "/api/admin/users/it-lifecycle", "it-root",
		map[string]any{"disenroll": true, "transferTo": "it-heir"})
	if code != http.StatusOK {
		t.Fatalf("disenroll: %d %v", code, res)
	}
	if code := h.login("it-lifecycle", "it-lc-pass"); code != http.StatusForbidden {
		t.Errorf("disenrolled login: got %d, want 403", code)
	}
	_, nodeRes := h.call(http.MethodGet, "/api/nodes/hid/"+sysHid, "it-root", nil)
	if p := nodeRes["properties"].(map[string]any); p["Owner"] != "it-heir" {
		t.Errorf("owner after disenroll: %v, want it-heir", p["Owner"])
	}
	// The user node is retained (roster still lists it, DISENROLLED).
	_, users := h.call(http.MethodGet, "/api/admin/users", "it-root", nil)
	found := false
	for _, u := range users["users"].([]any) {
		um := u.(map[string]any)
		if um["userName"] == "it-lifecycle" {
			found = true
			if um["accountStatus"] != "DISENROLLED" {
				t.Errorf("accountStatus: %v, want DISENROLLED", um["accountStatus"])
			}
		}
	}
	if !found {
		t.Errorf("disenrolled user was hard-deleted; SRS §6.5.15.11 requires retention")
	}
}
