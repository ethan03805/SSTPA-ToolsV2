// Package graph provides the Neo4j access layer for the SSTPA Backend.
// All Core Data Model mutations flow through this package's transactional
// helpers so that ACID, validation-before-commit, and ownership-notification
// guarantees hold (SRS §5.6.6.8).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package graph

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// DB wraps the Neo4j driver.
type DB struct {
	driver  neo4j.DriverWithContext
	metrics TxMetrics
}

// TxMetrics is implemented by telemetry.Metrics to count transaction outcomes.
type TxMetrics interface {
	TxCommitted()
	TxRolledBack()
}

type noopMetrics struct{}

func (noopMetrics) TxCommitted()  {}
func (noopMetrics) TxRolledBack() {}

// Connect opens the Neo4j driver and verifies connectivity, retrying while the
// database container starts up.
func Connect(ctx context.Context, uri, user, password string, metrics TxMetrics) (*DB, error) {
	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("create neo4j driver: %w", err)
	}
	if metrics == nil {
		metrics = noopMetrics{}
	}
	db := &DB{driver: driver, metrics: metrics}

	deadline := time.Now().Add(120 * time.Second)
	for {
		err = driver.VerifyConnectivity(ctx)
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("neo4j connectivity: %w", err)
		}
		slog.Info("graph: waiting for neo4j", "error", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
	return db, nil
}

// Close shuts the driver down.
func (db *DB) Close(ctx context.Context) error { return db.driver.Close(ctx) }

// Read runs fn in a read transaction.
func (db *DB) Read(ctx context.Context, fn func(tx neo4j.ManagedTransaction) (any, error)) (any, error) {
	session := db.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)
	return session.ExecuteRead(ctx, fn)
}

// Write runs fn in a single ACID write transaction (SRS §5.6.6.8). If fn
// returns an error the entire transaction rolls back, including any
// notification messages staged inside it (SRS §5.6.6.8.1).
func (db *DB) Write(ctx context.Context, fn func(tx neo4j.ManagedTransaction) (any, error)) (any, error) {
	session := db.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)
	res, err := session.ExecuteWrite(ctx, fn)
	if err != nil {
		db.metrics.TxRolledBack()
		return nil, err
	}
	db.metrics.TxCommitted()
	return res, nil
}

// EnsureIndexes creates the indexes required by SRS §3.3.8.2.1 and the
// uniqueness supports used by the identity model.
func (db *DB) EnsureIndexes(ctx context.Context) error {
	stmts := []string{
		"CREATE INDEX node_hid_index IF NOT EXISTS FOR (n:SSTPA) ON (n.HID)",
		"CREATE INDEX node_uuid_index IF NOT EXISTS FOR (n:SSTPA) ON (n.uuid)",
		"CREATE INDEX node_name_index IF NOT EXISTS FOR (n:SSTPA) ON (n.Name)",
		"CREATE INDEX node_type_index IF NOT EXISTS FOR (n:SSTPA) ON (n.TypeName)",
		"CREATE INDEX ref_external_id_index IF NOT EXISTS FOR (n:REF) ON (n.ExternalID)",
		"CREATE INDEX user_name_index IF NOT EXISTS FOR (n:User) ON (n.UserName)",
	}
	session := db.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)
	for _, s := range stmts {
		if _, err := session.Run(ctx, s, nil); err != nil {
			return fmt.Errorf("ensure index %q: %w", s, err)
		}
	}
	return nil
}
