// SSTPA Tools Backend server (SRS §5).
//
// 2025 Nicholas Triska. All rights reserved.
// The SSTPA Tools software and all associated modules, binaries, and source
// code are proprietary intellectual property of Nicholas Triska. Unauthorized
// reproduction, modification, or distribution is strictly prohibited. Licensed
// copies may be used under specific contractual terms provided by the author.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/api"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/config"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/graph"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/schema"
	"github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/telemetry"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	shutdownTracer, err := telemetry.InitTracer(ctx, cfg.OTLPEndpoint, "sstpa-backend", cfg.Version)
	if err != nil {
		slog.Error("telemetry init failed", "error", err)
		os.Exit(1)
	}
	defer func() {
		sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownTracer(sctx)
	}()

	metrics := telemetry.NewMetrics()

	sch, err := schema.Load()
	if err != nil {
		slog.Error("schema load failed", "error", err)
		os.Exit(1)
	}
	slog.Info("schema loaded", "nodeTypes", len(sch.NodeTypes), "relationships", len(sch.Relationships))

	db, err := graph.Connect(ctx, cfg.Neo4jURI, cfg.Neo4jUser, cfg.Neo4jPassword, txMetrics{metrics})
	if err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close(context.Background())

	if err := db.EnsureIndexes(ctx); err != nil {
		slog.Error("index creation failed", "error", err)
		os.Exit(1)
	}

	// Load Example Data (FireSat) if absent (SRS §3.6).
	if seeded, err := api.SeedExamples(ctx, cfg, db); err != nil {
		slog.Error("example data seeding failed", "error", err)
	} else if seeded {
		slog.Info("example data seeded", "project", "FireSat")
	}

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.NewRouter(cfg, db, sch, metrics),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("sstpa-backend listening", "addr", cfg.HTTPAddr, "version", cfg.Version)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("http server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	sctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(sctx)
}

type txMetrics struct{ m *telemetry.Metrics }

func (t txMetrics) TxCommitted()  { t.m.GraphTransactionsTotal.WithLabelValues("commit").Inc() }
func (t txMetrics) TxRolledBack() { t.m.GraphTransactionsTotal.WithLabelValues("rollback").Inc() }
