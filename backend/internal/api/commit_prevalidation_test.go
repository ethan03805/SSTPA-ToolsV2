// Pre-transaction commit validation tests (SRS §5.6.6.8): requests that must
// be rejected before any database access — malformed operations, unknown
// labels, unknown relationship types (Cypher-injection guard), and Loss Tool
// authority over [:AT_RELATES_TO].
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
)

// newValidationServer builds a Server with the real embedded schema and no
// database; every test case here must be rejected before any DB call.
func newValidationServer(t *testing.T) *Server {
	t.Helper()
	sch, err := schema.Load()
	if err != nil {
		t.Fatalf("schema.Load: %v", err)
	}
	return &Server{schema: sch}
}

func postCommit(t *testing.T, s *Server, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/commit", bytes.NewReader(b))
	w := httptest.NewRecorder()
	s.handleCommit(w, req)
	return w
}

func TestCommitRejectsUnknownRelationshipType(t *testing.T) {
	s := newValidationServer(t)
	// A crafted "type" must never reach Cypher string interpolation.
	for _, typ := range []string{
		"NOT_A_REAL_TYPE",
		"FOO]->(x) DETACH DELETE x //",
		"HOLDS|TRANSPORTS",
		"`HOLDS`",
	} {
		for _, op := range []string{"createRelationship", "deleteRelationship"} {
			w := postCommit(t, s, map[string]any{
				"operations": []map[string]any{{
					"op": op, "type": typ, "sourceHid": "SYS_1_0", "targetHid": "AST_1_1",
				}},
			})
			if w.Code != http.StatusBadRequest {
				t.Errorf("%s with type %q: got %d, want 400", op, typ, w.Code)
			}
		}
	}
}

func TestCommitAcceptsKnownRelationshipTypePastPreValidation(t *testing.T) {
	s := newValidationServer(t)
	// A valid type passes pre-validation and then fails only at the DB layer
	// (nil db → panic caught by the recoverer in production; here we just
	// verify the pre-validation loop does not reject it).
	defer func() { _ = recover() }()
	w := postCommit(t, s, map[string]any{
		"operations": []map[string]any{{
			"op": "deleteRelationship", "type": "HAS_REQUIREMENT",
			"sourceHid": "SYS_1_0", "targetHid": "REQ_1_1",
		}},
	})
	// If we got a response without panicking, it must not be the 400 from the
	// unknown-type guard.
	if w.Code == http.StatusBadRequest {
		t.Errorf("known relationship type rejected in pre-validation: %s", w.Body.String())
	}
}

func TestCommitRejectsUnknownLabel(t *testing.T) {
	s := newValidationServer(t)
	w := postCommit(t, s, map[string]any{
		"operations": []map[string]any{{
			"op": "createNode", "label": "EvilLabel) DETACH DELETE n //",
		}},
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("unknown label: got %d, want 400", w.Code)
	}
}

func TestCommitRejectsATRelatesToFromOtherTools(t *testing.T) {
	s := newValidationServer(t)
	w := postCommit(t, s, map[string]any{
		"toolId": "sstpa.attack",
		"operations": []map[string]any{{
			"op": "createRelationship", "type": "AT_RELATES_TO",
			"sourceHid": "LOS_1_1", "targetHid": "ATT_1_1",
		}},
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("AT_RELATES_TO from non-Loss tool: got %d, want 403", w.Code)
	}
}

func TestCommitRejectsMalformedOps(t *testing.T) {
	s := newValidationServer(t)
	cases := []map[string]any{
		{"op": "transferOwnership", "hid": "SYS_1_0"},              // missing newOwner
		{"op": "transferOwnership", "newOwner": "alice"},           // missing hid
		{"op": "updateNode"},                                       // missing hid
		{"op": "deleteNode"},                                       // missing hid
		{"op": "createRelationship", "type": "HAS_REQUIREMENT"},    // missing endpoints
		{"op": "definitelyNotAnOperation", "hid": "SYS_1_0"},       // unknown op
	}
	for _, c := range cases {
		w := postCommit(t, s, map[string]any{"operations": []map[string]any{c}})
		if w.Code != http.StatusBadRequest {
			t.Errorf("op %v: got %d, want 400", c, w.Code)
		}
	}
}

func TestCommitRejectsEmptyOperations(t *testing.T) {
	s := newValidationServer(t)
	w := postCommit(t, s, map[string]any{"operations": []map[string]any{}})
	if w.Code != http.StatusBadRequest {
		t.Errorf("empty operations: got %d, want 400", w.Code)
	}
}
