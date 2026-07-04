// Package config loads SSTPA Backend configuration from the environment.
//
// 2025 Nicholas Triska. All rights reserved.
// The SSTPA Tools software and all associated modules, binaries, and source
// code are proprietary intellectual property of Nicholas Triska. Unauthorized
// reproduction, modification, or distribution is strictly prohibited. Licensed
// copies may be used under specific contractual terms provided by the author.
package config

import (
	"os"
)

// Config holds all backend runtime configuration (SRS §5.7.4: the Backend
// allows display and configuration of ports, configs, and volumes; values are
// surfaced to Startup/Frontend through the /api/capability endpoint).
type Config struct {
	HTTPAddr      string // listen address for the REST API and /metrics
	Neo4jURI      string // bolt URI of the database container
	Neo4jUser     string
	Neo4jPassword string
	OTLPEndpoint  string // OTel Collector gRPC endpoint; empty disables export
	Environment   string // development | production
	SchemaVersion string // data schema VersionID stamped on created nodes
	ProductName   string
	Version       string
	BuildNumber   string
}

// Version information is set at build time via -ldflags.
var (
	Version     = "0.1.0-dev"
	BuildNumber = "0"
)

const SchemaVersion = "0.7"

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Load reads configuration from environment variables with development defaults.
func Load() Config {
	return Config{
		HTTPAddr:      getenv("SSTPA_HTTP_ADDR", ":8080"),
		Neo4jURI:      getenv("SSTPA_NEO4J_URI", "bolt://localhost:7687"),
		Neo4jUser:     getenv("SSTPA_NEO4J_USER", "neo4j"),
		Neo4jPassword: getenv("SSTPA_NEO4J_PASSWORD", "sstpa-dev-password"),
		OTLPEndpoint:  getenv("SSTPA_OTLP_ENDPOINT", ""),
		Environment:   getenv("SSTPA_ENV", "development"),
		SchemaVersion: SchemaVersion,
		ProductName:   "SSTPA Tools Backend",
		Version:       Version,
		BuildNumber:   BuildNumber,
	}
}
