// Package api implements the SSTPA Backend REST API (SRS §5.6.6).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/config"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/graph"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/telemetry"
)

// Server bundles the dependencies for all handlers.
type Server struct {
	cfg     config.Config
	db      *graph.DB
	schema  *schema.Schema
	metrics *telemetry.Metrics
}

// NewRouter builds the chi router with all API routes (SRS §5.6.6) and the
// Prometheus /metrics endpoint (SRS §5.6.3).
func NewRouter(cfg config.Config, db *graph.DB, sch *schema.Schema, m *telemetry.Metrics) http.Handler {
	s := &Server{cfg: cfg, db: db, schema: sch, metrics: m}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	// CORS: the Frontend webview (Tauri) and dev servers are separate origins.
	// Placeholder security posture per SRS §5.6.6.9; tightened post-MVP.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			origin := req.Header.Get("Origin")
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			if req.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, req)
		})
	})
	r.Use(m.HTTPMiddleware(func(req *http.Request) string {
		if rc := chi.RouteContext(req.Context()); rc != nil {
			if p := rc.RoutePattern(); p != "" {
				return p
			}
		}
		return "unmatched"
	}))

	r.Handle("/metrics", telemetry.MetricsHandler())
	r.Get("/healthz", s.handleHealth)

	r.Route("/api", func(r chi.Router) {
		// Capability discovery (SRS §6.4): API versions, schema version, features.
		r.Get("/capability", s.handleCapability)

		// Authentication (SRS §4, §3.2 — placeholder security for MVP).
		r.Post("/auth/login", s.handleLogin)
		r.Post("/auth/bootstrap", s.handleBootstrap) // RootAdmin creation on install

		// Authenticated routes.
		r.Group(func(r chi.Router) {
			r.Use(s.authMiddleware)

			// Node retrieval (SRS §5.6.6.2)
			r.Get("/nodes/hid/{hid}", s.handleNodeByHID)
			r.Get("/nodes/uuid/{uuid}", s.handleNodeByUUID)
			r.Get("/nodes/type/{label}", s.handleNodesByType)

			// Hierarchy retrieval (SRS §5.6.6.3)
			r.Get("/hierarchy", s.handleHierarchy)

			// SoI sub-graph retrieval (Main Panel population, SRS §6.3.4)
			r.Get("/soi/{systemHid}", s.handleSoI)

			// Search (SRS §5.6.6.4)
			r.Get("/search", s.handleSearch)

			// Relationship validation (SRS §5.6.6.5)
			r.Post("/relationships/validate", s.handleValidateRelationship)

			// Context retrieval (SRS §5.6.6.6)
			r.Get("/context/{hid}", s.handleContext)

			// Staged commit pipeline (SRS §5.6.6.8, §6.3.5.6)
			r.Post("/commit", s.handleCommit)

			// System creation from Component (SRS §3.3.7)
			r.Post("/systems/create-from-component", s.handleCreateSystemFromComponent)

			// Requirements Tool (SRS §6.5.2.18)
			r.Get("/requirements/lineage/{hid}", s.handleRequirementLineage)
			r.Get("/requirements/soi/{soi}", s.handleRequirementsBySoI)

			// Loss Tool / Attack Tree analysis (SRS §6.5.10)
			r.Get("/loss/{lossHid}/tree", s.handleLossTree)
			r.Get("/loss/{lossHid}/paths", s.handleLossPaths)
			r.Post("/loss/{lossHid}/auto-build", s.handleLossAutoBuild)

			// Messaging (SRS §5.6.6.11)
			r.Get("/messages", s.handleListMessages)
			r.Get("/messages/unread-count", s.handleUnreadCount)
			r.Get("/messages/{messageId}", s.handleGetMessage)
			r.Post("/messages", s.handleSendMessage)
			r.Post("/messages/{messageId}/reply", s.handleReplyMessage)
			r.Post("/messages/{messageId}/read", s.handleMarkRead)
			r.Delete("/messages/{messageId}", s.handleDeleteMessage)

			// Reference framework data (SRS §5.6.6.10, §3.4)
			r.Get("/reference/frameworks", s.handleListFrameworks)
			r.Get("/reference/search", s.handleReferenceSearch)
			r.Get("/reference/node/{uuid}", s.handleReferenceNode)
			r.Post("/reference/clone", s.handleReferenceClone)

			// Admin (SRS §6.5.15, §3.2)
			r.Get("/admin/users", s.handleListUsers)
			r.Post("/admin/users", s.handleCreateUser)
			r.Patch("/admin/users/{userName}", s.handleUpdateUser)

			// Product data (SRS §3.1)
			r.Get("/product", s.handleProduct)

			// Schema introspection for Frontend rendering (SRS §3.3.9/§3.3.10)
			r.Get("/schema/node-types", s.handleSchemaNodeTypes)
			r.Get("/schema/node-types/{label}", s.handleSchemaNodeType)
			r.Get("/schema/relationships", s.handleSchemaRelationships)
		})
	})

	return r
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleCapability implements capability discovery (SRS §6.4): supported API
// versions, endpoint availability, schema version, and feature flags. Also
// surfaces deployment configuration to Startup/Frontend (SRS §5.7.4).
func (s *Server) handleCapability(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"product":       s.cfg.ProductName,
		"version":       s.cfg.Version,
		"build":         s.cfg.BuildNumber,
		"apiVersions":   []string{"v1"},
		"schemaVersion": s.cfg.SchemaVersion,
		"environment":   s.cfg.Environment,
		"capabilities": []string{
			"node.lookup",
			"node.type.list",
			"hierarchy.read",
			"soi.read",
			"search",
			"relationship.validate",
			"context.read",
			"graph.mutate.transactional",
			"system.create-from-component",
			"messaging",
			"reference.read",
			"reference.clone",
			"admin.users",
			"product.read",
			"schema.read",
			"requirement.hierarchy.read",
			"loss.tree.read",
			"loss.tree.auto-build",
			"loss.paths.read",
		},
		"config": map[string]any{
			"httpAddr": s.cfg.HTTPAddr,
			"neo4jURI": s.cfg.Neo4jURI,
		},
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type apiError struct {
	Error  string `json:"error"`
	Detail string `json:"detail,omitempty"`
}

func writeError(w http.ResponseWriter, status int, msg string, detail string) {
	writeJSON(w, status, apiError{Error: msg, Detail: detail})
}
