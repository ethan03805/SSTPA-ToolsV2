# SSTPA Tools — Human Testing & Validation Guide

This guide walks a human tester through validating the SSTPA Tools application.
It assumes the development host (this machine). Estimated time for the full
walkthrough: 30–45 minutes.

---

## 0. What is already running

The Docker backend stack and a frontend preview server are currently up:

| Service | URL / Port | Notes |
|---|---|---|
| Backend API (via Caddy TLS) | `https://localhost:8543/api` | self-signed cert |
| HTTP → HTTPS redirect | `http://localhost:8880` | |
| Grafana dashboards | `https://localhost:8543/grafana/` | telemetry (§5.6.5) |
| Frontend (browser preview) | `http://localhost:4173` | the GUI |
| Neo4j / Prometheus / Tempo / OTel | internal only | not exposed to host (SRS §5.7.3) |

**Login credentials (seeded):**
- RootAdmin — user `boss`, password `sstpa-dev-2026`

If the stack is *not* running, start it:

```bash
cd "/home/netrisk/Projects/SSTPA Tools/deploy"
docker compose up -d
# wait ~40s for neo4j to become healthy, then:
docker compose ps
```

Start the frontend preview if needed:

```bash
cd "/home/netrisk/Projects/SSTPA Tools/frontend"
npm run build          # if not already built
npx vite preview --port 4173
```

---

## 1. Accept the self-signed certificate (one time)

The backend uses Caddy's local CA, so the browser must trust it before the GUI
can call the API.

1. Open **`https://localhost:8543/`** in your browser.
2. Accept / proceed past the certificate warning (Advanced → Proceed).
3. You should see: *"SSTPA Tools Backend. API at /api, dashboards at /grafana."*

If you skip this, the GUI will show **DISCONNECTED** in the top-right and login
will fail with "Cannot reach the Backend."

---

## 2. Open the GUI and sign in

1. Open **`http://localhost:4173`**.
2. Sign in with `boss` / `sstpa-dev-2026`.
3. Confirm the top bar shows **CONNECTED** (green) and the version number, and
   that the Control Panel shows **17 tool icons** plus a red **Shutdown** icon.

> First-run note: on a fresh database with no RootAdmin, click *"First
> installation? Create the RootAdmin account"* and set a username/password/email
> instead. The backend seeds `boss` only if you followed the earlier build.

---

## 3. Guided validation walkthrough

Each step maps to an SRS area. "Expected" is what a correct system shows.

### 3.1 Navigate the FireSat example hierarchy (§3.6, §6.5.1)

1. Click **Navigator** in the Control Panel.
2. **Expected:** a graph with two trees — the **FireSat Capability** tree
   (CAP_FS_0 → SYS_FS1_0 *FireSat* → SYS_FS1.1_0 *Satellite Bus* →
   SYS_FS1.1.1_0 *Infrared Sensor*, three tiers deep) and a separate **Demo
   Capability** tree.
3. Click the **SYS_FS1_0 FireSat** node, then **Select as SoI**.
4. **Expected:** the tool closes; the SoI Panel now reads *FireSat*, and the
   Main Panel lists node-type sections with counts (Environment 2, Element 3,
   Function 2, State 3, Asset 1, Security 2, etc.).

### 3.2 Progressive disclosure & Data Drawer (§6.3.4, §6.3.5)

1. Expand the **Asset** section, expand the **Fire Detection Data** card.
2. **Expected:** its relationship groups appear ([:HAS_LOSS], [:HAS_GOAL],
   [:HAS_REGIME], [:THREATENS] inbound, etc.).
3. Click the ✎ (edit) icon on the asset. The **Data Drawer** slides in from the
   right without covering the Branding/Control panels.
4. **Expected:** property groups (ID, Description, Criticality, Assurances) with
   fixed fields (HID, uuid, Owner) shown read-only and editable fields (Name,
   flags) editable. Owner = *SSTPA Tools* (example data ownership, §3.6).
5. Change **ShortDescription**, click **Commit** → confirm. **Expected:** a
   success banner; the Main Panel refreshes.

### 3.3 Ownership transfer & Message Center (§3.3.9.1, §6.5.14)

1. Open **Admin** tool → **Enroll user** → create `alice` / `alice-pw-2026` /
   `alice@example.com` (not admin). Close Admin.
2. Sign out is not required — instead just observe: edit any node you do **not**
   own as a non-owner in a second session to see a CHANGE_NOTIFICATION. (Simple
   check: as `boss`, the example nodes are owned by *SSTPA Tools*, so editing
   them does **not** transfer ownership — that's correct, example ownership is
   immutable.)
3. Open **Message Center**. **Expected:** the welcome SYSTEM message in the
   inbox; you can compose, reply, mark read, and delete.

### 3.4 Requirements Tool + SysML model text (§6.5.2, §3.7)

1. With FireSat as the SoI, open **Requirements**.
2. **Allocation View** — **Expected:** a table of requirements with Tier,
   allocated-to, and orphan/barren flags.
3. Click ⌘ on a requirement → **Hierarchy View** shows a SysML-style requirement
   block diagram with parent/child depth controls.
4. On the right, the **MODEL TEXT** panel shows the **SysML 2.0** projection of
   the SoI with keyword highlighting (`package`, `part`, `requirement`, `doc`,
   HIDs in `<...>`). **This is the SysML-transformed model display (directive).**

### 3.5 Asset Manager + KerML model text (§6.5.7, §3.7)

1. Open **Asset Manager**. **Expected:** the asset table; expand a row to edit
   Criticality/Assurance and see auto-generated Loss/Goal counts.
2. The **MODEL TEXT** panel shows the **KerML 1.0** projection:
   `import 'SSTPA Profile'`, `feature <AST_FS1_1> ... : Asset`, assurance
   `attribute` values, and `connect ... // HasLoss/HasGoal/Threatens/...`
   analysis connectors. **KerML-transformed model display confirmed.**

### 3.6 Trace Tool — asset trace matrix (§6.5.9)

1. Open **Trace**, select asset **Fire Detection Data**.
2. **Expected:** a matrix of entities (Interfaces/Functions/Elements) × States.
   FireSat already has trace cells (Detect Fires USES the asset in *Detecting*,
   Downlink Radio HOLDS it in *Downlinking*), shown as **U** / **H** with a
   green **Ready** badge in the Loss-Readiness column.
3. Click an empty cell to cycle empty→H→T→U (staged, gold outline). **Commit**
   and confirm the change persists.

### 3.7 Loss Tool — the flagship analytical workflow (§6.5.10)

1. Open **Loss**. Select loss **LOS_FS1_1** (*Compromise FireSat Authenticity*).
2. If prompted, **Auto-build** the tree. **Expected:** a tiered Attack Tree
   canvas: Loss → State (*Downlinking*) → Interface (*Downlink Radio*) → Attack
   (*RF Alert Spoofing*) → Countermeasure (*Digital Signature of Alerts*).
3. Switch to **Attack Path Analysis**. **Expected:** one enumerated path ending
   in **BLOCKED** (the countermeasure blocks the attack — no residual
   vulnerability). Path metrics and RV status are shown.

### 3.8 Reference Tool — MITRE / NIST browsing & cloning (§6.5.4, §3.4)

1. Open **Reference** (Research Mode). Search ExternalID `T1566` (or text
   "phishing"). **Expected:** results from ATT&CK with a read-only inspector
   showing framework, ExternalID, description, source URI.
2. To test cloning: open an **Attack** node in the Data Drawer first, then open
   Reference (Assignment Mode) and assign an ATT&CK Technique → creates a
   `[:REFERENCES]` link and copies Name/description.

### 3.9 Reports (§6.5.3)

1. Open **Reports** → **System Specification** → **Generate**.
2. **Expected:** a Markdown document of requirements grouped by bearer node.
   Try **Gap Analysis** (computes & commits Orphan/Barren), **Controls List**,
   and the **HTML (Word)** / **Print / PDF** export buttons.

### 3.10 Help & Reset (§3.5, §3.6)

1. Click the **gear icon** (top right) → **Hover help & definitions** →
   **Expected:** a searchable catalog of SSTPA terms (Asset, Loss, HID, RV…).
2. Gear → **Reset FireSat example** → **Expected:** "FireSat example reset to
   defaults." Any edits you made to FireSat are reverted.

### 3.11 Under-construction & shutdown (§6.3.2)

1. Gear → **Select style…** → **Expected:** an *"Under Construction"* dialog
   with an OK button (placeholder features behave per §6.3.2).
2. The red **Shutdown** icon prompts a confirm dialog (in the desktop app it
   stops the backend cleanly; in the browser preview it closes the tab).

---

## 4. Telemetry validation (§5.6)

1. Open **`https://localhost:8543/grafana/`**. Anonymous viewer access is on;
   admin login is `admin` / `sstpa-dev-password`.
2. Open the **SSTPA Backend** dashboard. **Expected:** panels populate as you
   use the GUI — API request rate, p95 latency, HTTP status codes, Neo4j
   transaction commit/rollback, and ownership-notification counters.
3. Raw metrics: `https://localhost:8543/metrics-proxy/metrics` (look for
   `sstpa_http_requests_total`, `sstpa_graph_transactions_total`).

---

## 5. Backend API validation (optional, command line)

```bash
BASE=https://localhost:8543
TOKEN=$(curl -sk -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"userName":"boss","password":"sstpa-dev-2026"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
AUTH="Authorization: Bearer $TOKEN"

curl -sk $BASE/api/hierarchy -H "$AUTH"                       # capability tree
curl -sk "$BASE/api/model/sysml?scope=SOI&soi=SYS_FS1_0" -H "$AUTH"   # SysML text
curl -sk "$BASE/api/model/kerml?scope=SOI&soi=SYS_FS1.1.1_0" -H "$AUTH" # deepest SoI
curl -sk -X POST $BASE/api/loss/LOS_FS1_1/auto-build -H "$AUTH"       # build attack tree
curl -sk "$BASE/api/reference/search?externalId=T1059" -H "$AUTH"     # MITRE lookup
```

A malformed relationship should be rejected with an SRS-cited reason, e.g.:

```bash
curl -sk -X POST $BASE/api/commit -H "$AUTH" -H 'Content-Type: application/json' \
 -d '{"toolId":"gui","soiHid":"SYS_FS1_0","operations":[
      {"op":"createRelationship","type":"HAS_SYSTEM","sourceHid":"SYS_FS1_0","targetHid":"CAP_FS_0"}]}'
# → "(:System)-[:HAS_SYSTEM]->(:Project) is not an authorized relationship (SRS §3.3.4)"
```

---

## 6. Automated tests

```bash
# Backend unit tests (schema, G2M translator, Loss engine)
cd "/home/netrisk/Projects/SSTPA Tools/backend" && go vet ./... && go test ./...

# Frontend typecheck + production build
cd "/home/netrisk/Projects/SSTPA Tools/frontend" && npx tsc --noEmit && npm run build

# Sustainment reference-data pipeline (offline stages)
cd "/home/netrisk/Projects/SSTPA Tools/sustainment"
.venv/bin/python -m sstpa_ref.pipeline --config config.yaml --skip-acquire
```

Expected: all Go tests `ok`, `tsc` no errors, `vite build` succeeds, pipeline
ends `VALIDATED: PASS`.

---

## 7. Desktop application (Tauri) path

The browser preview above is the fastest way to test. To run the real desktop
GUI (Startup Software → Backend → Frontend, §4):

```bash
# Startup Software launcher (debug)
cd "/home/netrisk/Projects/SSTPA Tools/startup/src-tauri" && cargo run
```

The Startup dialog starts the backend via Docker Compose, verifies your login,
and launches the Frontend GUI. Note: on this host the Vite *dev* file-watcher
hits the OS inotify limit, so the packaged/preview path is preferred over
`npm run tauri dev`. The installer (`installer/scripts/build-package.sh`)
produces the distributable bundles.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| GUI shows DISCONNECTED | Visit `https://localhost:8543/` and accept the cert (step 1). |
| Login fails | Confirm `docker compose ps` shows backend Up and neo4j healthy. |
| Port already in use | Ports are set in `deploy/.env` (8880/8543 to avoid clashing with an older stack). Change and `docker compose up -d`. |
| Reset FireSat / clean slate | Gear → Reset FireSat, or `docker compose down -v && docker compose up -d` for a full wipe (re-seeds FireSat, but you must reload reference data via `deploy/load-reference-data.sh`). |
| Reference searches empty | Reload: `cd sustainment/artifacts && ../../deploy/load-reference-data.sh sstpa-ref-data-*.tar.gz`. |

---

## 9. Acceptance checklist

- [ ] GUI connects; 17 tools + Shutdown visible.
- [ ] FireSat 3-tier hierarchy navigable; SoI selection works.
- [ ] Data Drawer edits stage and commit; Main Panel refreshes.
- [ ] Model Text Panel shows highlighted SysML **and** KerML across model tools.
- [ ] Trace matrix edits; Loss Tool auto-builds a tree and enumerates a path.
- [ ] Reference search returns MITRE/NIST items; clone creates `[:REFERENCES]`.
- [ ] Reports generate and export; Gap Analysis flags orphan/barren.
- [ ] Grafana dashboard populates; SSTPA metrics present.
- [ ] Invalid relationships rejected with SRS-cited reasons.
- [ ] `go test ./...` and `npm run build` pass.
- [ ] Gear → Reset FireSat restores defaults.
