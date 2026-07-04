// Connection Tool (SRS 6.5.13): create, filter, visualize, validate, and
// export System-owned Connections through participating Interfaces.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode, SoIRelationship } from "../../api/types";
import { useDrawer } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

type Mode = "selection" | "filtering" | "display" | "export";

interface Finding {
  severity: "ERROR" | "WARNING";
  message: string;
  hid?: string;
}

interface EdgeDraft {
  RelationshipNature: string;
  PhysicalType: string;
  LogicalLayer: string;
  Protocol: string;
  FlowDirectionality: string;
  TimingClass: string;
  SecurityClass: string;
}

const REL_NATURE = ["PHYSICAL", "LOGICAL", "BOTH"];
const FLOW_DIRECTION = ["Unidirectional", "Bidirectional", "Multicast"];
const CONNECTION_DIRECTION = ["Unidirectional", "Bidirectional", "Multicast", "Null"];
const LOGICAL_LAYERS = [
  "N/A",
  "Layer 1: Physical",
  "Layer2: Data Link",
  "Layer 3: Network",
  "Layer 4: Transport",
  "Layer 5 Session",
  "Layer 6: Presentation",
  "Layer 7: Application",
];
const BOOL_PROPS = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical", "Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"];
const LEVEL_PROPS = ["SafetyLevel", "MissionLevel", "FlightLevel", "SecurityLevel"];
const TEXT_PROPS = ["Name", "ShortDescription", "Connection_Description", "ConnectionType", "Protocol", "TimingClass", "SecurityClass", "PayloadDescription"];

export default function ConnectionTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const qc = useQueryClient();
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const [mode, setMode] = useState<Mode>("display");
  const [selectedConnection, setSelectedConnection] = useState("");
  const [selectedInterface, setSelectedInterface] = useState("");
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [osiFilter, setOsiFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const systems = nodes.filter((n) => n.typeName === "System");
  const interfaces = nodes.filter((n) => n.typeName === "Interface");
  const connections = nodes.filter((n) => n.typeName === "Connection");
  const requirements = nodes.filter((n) => n.typeName === "Requirement");
  const selected = selectedConnection ? byHid.get(selectedConnection) : undefined;
  const ownerMap = useMemo(() => buildOwnerMap(systems), [systems]);

  useEffect(() => {
    const hid = ctx.drawerNodeHid;
    if (!hid) return;
    const node = byHid.get(hid);
    if (!node) return;
    if (node.typeName === "Connection") setSelectedConnection(hid);
    if (node.typeName === "Interface") {
      setSelectedInterface(hid);
      const linked = connections.find((c) => participatesIn(node, c.hid));
      if (linked) setSelectedConnection(linked.hid);
    }
  }, [byHid, connections, ctx.drawerNodeHid]);

  useEffect(() => {
    if (!selectedConnection && connections[0]) setSelectedConnection(connections[0].hid);
  }, [connections, selectedConnection]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.connection", operations: ops }),
    onSuccess: (res) => {
      setNotice(`Connection commit ${res.commitId.slice(0, 8)} accepted.`);
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice(String(e)),
  });

  const visibleConnections = connections.filter((connection) =>
    connectionMatches(connection, interfaces, ownerMap, byHid, { query, ownerFilter, osiFilter, directionFilter, tierFilter, selectedInterface }),
  );
  const selectedParticipants = selected ? participantInterfaces(selected.hid, interfaces) : [];
  const findings = selected ? validateConnection(selected, selectedParticipants, ownerMap) : [];
  const osiValues = unique(connections.map((c) => String(c.properties.OSILayer ?? "")).filter(Boolean)).sort();
  const tiers = unique(systems.map((s) => String(systemTier(s.hid))).filter(Boolean)).sort();

  if (!ctx.soiHid) return <p style={{ padding: 20 }}>Select a System of Interest first.</p>;

  return (
    <div className="tool-shell" style={{ height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
          borderBottom: "var(--sstpa-border-soft)",
        }}
      >
        <button className="sstpa-button" disabled={systems.length === 0 || interfaces.length < 2} onClick={() => setNewOpen(true)}>New Connection</button>
        <button className={`sstpa-button ${mode === "selection" ? "" : "secondary"}`} onClick={() => setMode("selection")}>Selection</button>
        <button className={`sstpa-button ${mode === "filtering" ? "" : "secondary"}`} onClick={() => setMode("filtering")}>Filtering</button>
        <button className={`sstpa-button ${mode === "display" ? "" : "secondary"}`} onClick={() => setMode("display")}>Display</button>
        <button className={`sstpa-button ${mode === "export" ? "" : "secondary"}`} disabled={!selected} onClick={() => setMode("export")}>Export</button>
        <input className="sstpa-input" style={{ width: 220 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Connections" />
        <span style={{ flex: 1 }} />
        {selected && <button className="icon-button" disabled={drawerOpen} onClick={() => openDrawer({ mode: "edit", hid: selected.hid })}>Open Drawer</button>}
      </div>
      {notice && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          {notice} <button className="icon-button" onClick={() => setNotice(null)}>x</button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <ConnectionList
          connections={visibleConnections}
          interfaces={interfaces}
          ownerMap={ownerMap}
          byHid={byHid}
          selected={selectedConnection}
          onSelect={setSelectedConnection}
        />
        <main style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {mode === "selection" && (
            <SelectionView
              systems={systems}
              connections={visibleConnections}
              ownerMap={ownerMap}
              interfaces={interfaces}
              selected={selectedConnection}
              onSelect={setSelectedConnection}
            />
          )}
          {mode === "filtering" && (
            <FilteringView
              systems={systems}
              interfaces={interfaces}
              osiValues={osiValues}
              tiers={tiers}
              ownerFilter={ownerFilter}
              osiFilter={osiFilter}
              directionFilter={directionFilter}
              tierFilter={tierFilter}
              selectedInterface={selectedInterface}
              onOwner={setOwnerFilter}
              onOsi={setOsiFilter}
              onDirection={setDirectionFilter}
              onTier={setTierFilter}
              onInterface={setSelectedInterface}
            />
          )}
          {mode === "display" && (
            <ConnectionCanvas
              connections={visibleConnections}
              interfaces={interfaces}
              ownerMap={ownerMap}
              byHid={byHid}
              selected={selectedConnection}
              onSelect={setSelectedConnection}
              onSelectInterface={setSelectedInterface}
            />
          )}
          {mode === "export" && selected && (
            <ExportView
              connection={selected}
              owner={ownerMap.get(selected.hid)}
              participants={selectedParticipants}
              findings={findings}
              requirements={relatedNodes(selected, "HAS_REQUIREMENT", byHid)}
            />
          )}
        </main>
        <ConnectionDetail
          connection={selected}
          owner={selected ? ownerMap.get(selected.hid) : undefined}
          systems={systems}
          interfaces={interfaces}
          requirements={requirements}
          participants={selectedParticipants}
          findings={findings}
          drawerOpen={drawerOpen}
          onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })}
          onCommit={(ops) => commit.mutate(ops)}
          onSelectInterface={setSelectedInterface}
        />
      </div>
      {newOpen && (
        <NewConnectionDialog
          systems={systems}
          interfaces={interfaces}
          defaultOwner={ctx.soiHid}
          onClose={() => setNewOpen(false)}
          onCreate={(ops) => {
            commit.mutate(ops);
            setNewOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ConnectionList({
  connections,
  interfaces,
  ownerMap,
  byHid,
  selected,
  onSelect,
}: {
  connections: SoINode[];
  interfaces: SoINode[];
  ownerMap: Map<string, SoINode>;
  byHid: Map<string, SoINode>;
  selected: string;
  onSelect: (hid: string) => void;
}) {
  return (
    <aside style={{ width: 300, borderRight: "var(--sstpa-border)", overflow: "auto", background: "var(--sstpa-surface)" }}>
      {connections.map((connection) => {
        const participants = participantInterfaces(connection.hid, interfaces);
        const owner = ownerMap.get(connection.hid);
        const errors = validateConnection(connection, participants, ownerMap).filter((f) => f.severity === "ERROR").length;
        return (
          <button
            key={connection.hid}
            className="entity-card"
            style={{ width: "calc(100% - 12px)", margin: 6, textAlign: "left", borderColor: selected === connection.hid ? "var(--sstpa-accent)" : undefined }}
            onClick={() => onSelect(connection.hid)}
          >
            <div className="entity-card-header">
              <span className="entity-hid">{connection.hid}</span>
              <span className="type-badge" style={{ background: errors ? "var(--sstpa-status-warn)" : "var(--sstpa-status-ok)" }}>
                {errors ? "Open" : "Valid"}
              </span>
            </div>
            <div style={{ fontWeight: 700 }}>{String(connection.properties.Name ?? "")}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>
              {owner ? String(owner.properties.Name ?? owner.hid) : "No owner"} / {participants.length} interface(s)
            </div>
            <div className="mono" style={{ fontSize: "0.66rem" }}>
              OSI {String(connection.properties.OSILayer ?? "n/a")} / {String(connection.properties.Protocol ?? "protocol n/a")}
            </div>
            <div style={{ fontSize: "0.66rem", color: "var(--sstpa-muted)" }}>
              {participants.map((p) => String(byHid.get(p.hid)?.properties.Name ?? p.hid)).join(", ")}
            </div>
          </button>
        );
      })}
      {connections.length === 0 && <p style={{ padding: 12, color: "var(--sstpa-muted)" }}>No Connections match the current filters.</p>}
    </aside>
  );
}

function SelectionView({
  systems,
  connections,
  ownerMap,
  interfaces,
  selected,
  onSelect,
}: {
  systems: SoINode[];
  connections: SoINode[];
  ownerMap: Map<string, SoINode>;
  interfaces: SoINode[];
  selected: string;
  onSelect: (hid: string) => void;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)" }}>
      {systems.map((system) => {
        const owned = connections.filter((c) => ownerMap.get(c.hid)?.hid === system.hid);
        if (owned.length === 0) return null;
        return (
          <section key={system.hid} style={{ marginBottom: 18 }}>
            <h3 style={{ margin: "0 0 8px" }}>
              Tier {systemTier(system.hid)} / {String(system.properties.Name ?? system.hid)}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {owned.map((connection) => {
                const participants = participantInterfaces(connection.hid, interfaces);
                return (
                  <button
                    key={connection.hid}
                    className="entity-card"
                    style={{ textAlign: "left", borderColor: selected === connection.hid ? "var(--sstpa-accent)" : undefined }}
                    onClick={() => onSelect(connection.hid)}
                  >
                    <div className="entity-card-header">
                      <span className="entity-hid">{connection.hid}</span>
                      <span className="type-badge">{participants.length} ends</span>
                    </div>
                    <strong>{String(connection.properties.Name ?? "")}</strong>
                    <div className="mono" style={{ fontSize: "0.66rem" }}>{participants.map((p) => p.hid).join(" / ")}</div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FilteringView({
  systems,
  interfaces,
  osiValues,
  tiers,
  ownerFilter,
  osiFilter,
  directionFilter,
  tierFilter,
  selectedInterface,
  onOwner,
  onOsi,
  onDirection,
  onTier,
  onInterface,
}: {
  systems: SoINode[];
  interfaces: SoINode[];
  osiValues: string[];
  tiers: string[];
  ownerFilter: string;
  osiFilter: string;
  directionFilter: string;
  tierFilter: string;
  selectedInterface: string;
  onOwner: (value: string) => void;
  onOsi: (value: string) => void;
  onDirection: (value: string) => void;
  onTier: (value: string) => void;
  onInterface: (value: string) => void;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)", display: "grid", gap: 12, alignContent: "start" }}>
      <h3 style={{ margin: 0 }}>Connection Filters</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Owner System
          <select className="sstpa-input" value={ownerFilter} onChange={(e) => onOwner(e.target.value)}>
            <option value="">All Systems</option>
            {systems.map((s) => <option key={s.hid} value={s.hid}>{s.hid} - {String(s.properties.Name ?? "")}</option>)}
          </select>
        </label>
        <label style={labelStyle}>System Tier
          <select className="sstpa-input" value={tierFilter} onChange={(e) => onTier(e.target.value)}>
            <option value="">All Tiers</option>
            {tiers.map((t) => <option key={t} value={t}>Tier {t}</option>)}
          </select>
        </label>
        <label style={labelStyle}>OSI Layer
          <select className="sstpa-input" value={osiFilter} onChange={(e) => onOsi(e.target.value)}>
            <option value="">All OSI Layers</option>
            {osiValues.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Directionality
          <select className="sstpa-input" value={directionFilter} onChange={(e) => onDirection(e.target.value)}>
            <option value="">All Directions</option>
            {CONNECTION_DIRECTION.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Participating Interface
          <select className="sstpa-input" value={selectedInterface} onChange={(e) => onInterface(e.target.value)}>
            <option value="">Any Interface</option>
            {interfaces.map((i) => <option key={i.hid} value={i.hid}>{i.hid} - {String(i.properties.Name ?? "")}</option>)}
          </select>
        </label>
      </div>
      <button
        className="sstpa-button secondary"
        onClick={() => {
          onOwner("");
          onOsi("");
          onDirection("");
          onTier("");
          onInterface("");
        }}
      >
        Clear Filters
      </button>
    </div>
  );
}

function ConnectionCanvas({
  connections,
  interfaces,
  ownerMap,
  byHid,
  selected,
  onSelect,
  onSelectInterface,
}: {
  connections: SoINode[];
  interfaces: SoINode[];
  ownerMap: Map<string, SoINode>;
  byHid: Map<string, SoINode>;
  selected: string;
  onSelect: (hid: string) => void;
  onSelectInterface: (hid: string) => void;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)", background: "linear-gradient(0deg, rgba(255,255,255,0.4), rgba(255,255,255,0.4))" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {connections.map((connection) => {
          const owner = ownerMap.get(connection.hid);
          const participants = participantInterfaces(connection.hid, interfaces);
          return (
            <section
              key={connection.hid}
              className="sstpa-frame"
              style={{ padding: "var(--sstpa-sp-3)", borderColor: selected === connection.hid ? "var(--sstpa-accent)" : undefined }}
            >
              <button className="entity-card" style={{ width: "100%", textAlign: "center", borderRadius: 4 }} onClick={() => onSelect(connection.hid)}>
                <div className="entity-hid">{connection.hid}</div>
                <div style={{ fontWeight: 800 }}>{String(connection.properties.Name ?? "")}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
                  {String(connection.properties.ConnectionType ?? "Connection")} / OSI {String(connection.properties.OSILayer ?? "n/a")}
                </div>
              </button>
              <div style={{ textAlign: "center", margin: "8px 0", color: "var(--sstpa-muted)", fontSize: "0.74rem" }}>
                Owner: {owner ? String(owner.properties.Name ?? owner.hid) : "Unassigned"}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {participants.map((iface) => {
                  const rel = participantRel(iface, connection.hid);
                  const ownerSystem = owningSystemForInterface(iface, byHid);
                  return (
                    <button key={iface.hid} className="entity-card" style={{ width: "100%", textAlign: "left" }} onClick={() => onSelectInterface(iface.hid)}>
                      <div className="entity-card-header">
                        <span className="entity-hid">{iface.hid}</span>
                        <span className="type-badge">{String(rel?.props?.FlowDirectionality ?? "Unspecified")}</span>
                      </div>
                      <div style={{ fontWeight: 700 }}>{String(iface.properties.Name ?? "")}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--sstpa-muted)" }}>
                        {ownerSystem ? String(ownerSystem.properties.Name ?? ownerSystem.hid) : "System n/a"} / {String(rel?.props?.RelationshipNature ?? "LOGICAL")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {connections.length === 0 && <p style={{ color: "var(--sstpa-muted)" }}>No Connections to display.</p>}
    </div>
  );
}

function ConnectionDetail({
  connection,
  owner,
  systems,
  interfaces,
  requirements,
  participants,
  findings,
  drawerOpen,
  onOpenDrawer,
  onCommit,
  onSelectInterface,
}: {
  connection?: SoINode;
  owner?: SoINode;
  systems: SoINode[];
  interfaces: SoINode[];
  requirements: SoINode[];
  participants: SoINode[];
  findings: Finding[];
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onCommit: (ops: CommitOperation[]) => void;
  onSelectInterface: (hid: string) => void;
}) {
  const [textEdit, setTextEdit] = useState<Record<string, string>>({});
  const [boolEdit, setBoolEdit] = useState<Record<string, boolean>>({});
  const [levelEdit, setLevelEdit] = useState<Record<string, string>>({});
  const [ownerToSet, setOwnerToSet] = useState("");
  const [interfaceToAdd, setInterfaceToAdd] = useState("");
  const [requirementToAdd, setRequirementToAdd] = useState("");
  const [edgeDrafts, setEdgeDrafts] = useState<Record<string, EdgeDraft>>({});

  useEffect(() => {
    if (!connection) return;
    setTextEdit({
      ...Object.fromEntries(TEXT_PROPS.map((k) => [k, String(connection.properties[k] ?? "")])),
      Directionality: String(connection.properties.Directionality ?? ""),
    });
    setBoolEdit(Object.fromEntries(BOOL_PROPS.map((k) => [k, Boolean(connection.properties[k])])));
    setLevelEdit({
      ...Object.fromEntries(LEVEL_PROPS.map((k) => [k, String(connection.properties[k] ?? "")])),
      OSILayer: String(connection.properties.OSILayer ?? ""),
    });
    setOwnerToSet(owner?.hid ?? "");
    setEdgeDrafts(Object.fromEntries(participants.map((p) => [p.hid, edgeDraft(participantRel(p, connection.hid))])));
  }, [connection, owner?.hid, participants]);

  if (!connection) {
    return <aside style={{ width: 380, borderLeft: "var(--sstpa-border)", padding: "var(--sstpa-sp-3)" }}>Select a Connection.</aside>;
  }

  const availableInterfaces = interfaces.filter((i) => !participants.some((p) => p.hid === i.hid));
  const connectionRequirements = relatedNodes(connection, "HAS_REQUIREMENT", new Map(requirements.map((r) => [r.hid, r])));

  return (
    <aside style={{ width: 390, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)", background: "var(--sstpa-surface)" }}>
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>{connection.hid}</div>
      <h3 style={{ margin: "4px 0 8px" }}>{String(connection.properties.Name ?? "")}</h3>
      <button className="sstpa-button" disabled={drawerOpen} onClick={() => onOpenDrawer(connection.hid)}>Open Drawer</button>

      <h4>Validation</h4>
      {findings.slice(0, 4).map((finding, i) => (
        <div key={i} className="sstpa-alert-warning" style={{ marginBottom: 6 }}>
          <strong>{finding.severity}</strong> {finding.message}
        </div>
      ))}
      {findings.length === 0 && <p className="state-ok">Connection is structurally valid.</p>}

      <h4>Owner</h4>
      <div style={{ display: "flex", gap: 6 }}>
        <select className="sstpa-input" value={ownerToSet} onChange={(e) => setOwnerToSet(e.target.value)}>
          <option value="">Owner System</option>
          {systems.map((s) => <option key={s.hid} value={s.hid}>{s.hid} - {String(s.properties.Name ?? "")}</option>)}
        </select>
        <button
          className="sstpa-button"
          disabled={!ownerToSet || ownerToSet === owner?.hid}
          onClick={() => {
            const ops: CommitOperation[] = [];
            if (owner) ops.push({ op: "deleteRelationship", type: "HAS_CONNECTION", sourceHid: owner.hid, targetHid: connection.hid });
            ops.push({ op: "createRelationship", type: "HAS_CONNECTION", sourceHid: ownerToSet, targetHid: connection.hid });
            onCommit(ops);
          }}
        >
          Assign
        </button>
      </div>

      <h4>Properties</h4>
      {TEXT_PROPS.map((k) => (
        <label key={k} style={labelStyle}>
          {propertyLabel(k)}
          <textarea
            className="sstpa-input"
            rows={k.includes("Description") ? 3 : 1}
            value={textEdit[k] ?? ""}
            onChange={(e) => setTextEdit((x) => ({ ...x, [k]: e.target.value }))}
          />
        </label>
      ))}
      <label style={labelStyle}>OSI Layer<input className="sstpa-input" type="number" min={1} max={7} value={levelEdit.OSILayer ?? String(connection.properties.OSILayer ?? "")} onChange={(e) => setLevelEdit((x) => ({ ...x, OSILayer: e.target.value }))} /></label>
      <label style={labelStyle}>Directionality
        <select className="sstpa-input" value={String(textEdit.Directionality ?? connection.properties.Directionality ?? "")} onChange={(e) => setTextEdit((x) => ({ ...x, Directionality: e.target.value }))}>
          <option value="">Unset</option>
          {CONNECTION_DIRECTION.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <button
        className="sstpa-button"
        onClick={() =>
          onCommit([
            {
              op: "updateNode",
              hid: connection.hid,
              properties: {
                ...textEdit,
                OSILayer: parseNullableInt(levelEdit.OSILayer),
                SafetyLevel: parseNullableInt(levelEdit.SafetyLevel),
                MissionLevel: parseNullableInt(levelEdit.MissionLevel),
                FlightLevel: parseNullableInt(levelEdit.FlightLevel),
                SecurityLevel: parseNullableInt(levelEdit.SecurityLevel),
                ...boolEdit,
              },
            },
          ])
        }
      >
        Commit Properties
      </button>

      <h4>Criticality and Assurance</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4 }}>
        {BOOL_PROPS.map((k) => (
          <label key={k} style={{ fontSize: "0.7rem" }}>
            <input type="checkbox" checked={Boolean(boolEdit[k])} onChange={(e) => setBoolEdit((x) => ({ ...x, [k]: e.target.checked }))} /> {k}
          </label>
        ))}
      </div>
      {LEVEL_PROPS.map((k) => (
        <label key={k} style={labelStyle}>{k}<input className="sstpa-input" type="number" value={levelEdit[k] ?? ""} onChange={(e) => setLevelEdit((x) => ({ ...x, [k]: e.target.value }))} /></label>
      ))}

      <h4>Participating Interfaces</h4>
      {participants.map((iface) => {
        const draft = edgeDrafts[iface.hid] ?? edgeDraft(participantRel(iface, connection.hid));
        return (
          <div key={iface.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)", padding: "6px 0" }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button className="icon-button" onClick={() => onSelectInterface(iface.hid)}>{iface.hid}</button>
              <span style={{ flex: 1, fontSize: "0.74rem" }}>{String(iface.properties.Name ?? "")}</span>
              <button className="icon-button danger" onClick={() => onCommit([{ op: "deleteRelationship", type: "PARTICIPATES_IN", sourceHid: iface.hid, targetHid: connection.hid }])}>Remove</button>
            </div>
            <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
              <select className="sstpa-input" value={draft.RelationshipNature} onChange={(e) => setEdgeDrafts((x) => ({ ...x, [iface.hid]: { ...draft, RelationshipNature: e.target.value } }))}>
                {REL_NATURE.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select className="sstpa-input" value={draft.LogicalLayer} onChange={(e) => setEdgeDrafts((x) => ({ ...x, [iface.hid]: { ...draft, LogicalLayer: e.target.value } }))}>
                <option value="">Logical Layer</option>
                {LOGICAL_LAYERS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <input className="sstpa-input" placeholder="Protocol" value={draft.Protocol} onChange={(e) => setEdgeDrafts((x) => ({ ...x, [iface.hid]: { ...draft, Protocol: e.target.value } }))} />
              <input className="sstpa-input" placeholder="Physical type" value={draft.PhysicalType} onChange={(e) => setEdgeDrafts((x) => ({ ...x, [iface.hid]: { ...draft, PhysicalType: e.target.value } }))} />
              <select className="sstpa-input" value={draft.FlowDirectionality} onChange={(e) => setEdgeDrafts((x) => ({ ...x, [iface.hid]: { ...draft, FlowDirectionality: e.target.value } }))}>
                {FLOW_DIRECTION.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <div style={{ display: "flex", gap: 4 }}>
                <input className="sstpa-input" placeholder="Timing" value={draft.TimingClass} onChange={(e) => setEdgeDrafts((x) => ({ ...x, [iface.hid]: { ...draft, TimingClass: e.target.value } }))} />
                <input className="sstpa-input" placeholder="Security" value={draft.SecurityClass} onChange={(e) => setEdgeDrafts((x) => ({ ...x, [iface.hid]: { ...draft, SecurityClass: e.target.value } }))} />
              </div>
              <button
                className="sstpa-button secondary"
                onClick={() =>
                  onCommit([
                    { op: "deleteRelationship", type: "PARTICIPATES_IN", sourceHid: iface.hid, targetHid: connection.hid },
                    { op: "createRelationship", type: "PARTICIPATES_IN", sourceHid: iface.hid, targetHid: connection.hid, properties: cleanEdgeProps(draft) },
                  ])
                }
              >
                Save Edge
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <select className="sstpa-input" value={interfaceToAdd} onChange={(e) => setInterfaceToAdd(e.target.value)}>
          <option value="">Add Interface</option>
          {availableInterfaces.map((i) => <option key={i.hid} value={i.hid}>{i.hid} - {String(i.properties.Name ?? "")}</option>)}
        </select>
        <button
          className="sstpa-button"
          disabled={!interfaceToAdd}
          onClick={() =>
            onCommit([{ op: "createRelationship", type: "PARTICIPATES_IN", sourceHid: interfaceToAdd, targetHid: connection.hid, properties: cleanEdgeProps(edgeDraft()) }])
          }
        >
          Add
        </button>
      </div>

      <h4>Requirements</h4>
      {connectionRequirements.map((r) => (
        <div key={r.hid} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          <button className="icon-button" onClick={() => onOpenDrawer(r.hid)}>{r.hid}</button>
          <span style={{ flex: 1, fontSize: "0.72rem" }}>{String(r.properties.Name ?? "")}</span>
          <button className="icon-button danger" onClick={() => onCommit([{ op: "deleteRelationship", type: "HAS_REQUIREMENT", sourceHid: connection.hid, targetHid: r.hid }])}>Remove</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6 }}>
        <select className="sstpa-input" value={requirementToAdd} onChange={(e) => setRequirementToAdd(e.target.value)}>
          <option value="">Existing Requirement</option>
          {requirements.filter((r) => !connectionRequirements.some((cr) => cr.hid === r.hid)).map((r) => (
            <option key={r.hid} value={r.hid}>{r.hid} - {String(r.properties.Name ?? "")}</option>
          ))}
        </select>
        <button className="sstpa-button" disabled={!requirementToAdd} onClick={() => onCommit([{ op: "createRelationship", type: "HAS_REQUIREMENT", sourceHid: connection.hid, targetHid: requirementToAdd }])}>Add</button>
      </div>
      <button
        className="sstpa-button secondary"
        style={{ marginTop: 6 }}
        onClick={() =>
          onCommit([
            { op: "createNode", tempId: "req", label: "Requirement", properties: { Name: "New Connection Requirement", RStatement: "TBD", Orphan: true, Barren: true } },
            { op: "createRelationship", type: "HAS_REQUIREMENT", sourceHid: connection.hid, targetHid: "$req" },
          ])
        }
      >
        New Requirement
      </button>
    </aside>
  );
}

function ExportView({
  connection,
  owner,
  participants,
  findings,
  requirements,
}: {
  connection: SoINode;
  owner?: SoINode;
  participants: SoINode[];
  findings: Finding[];
  requirements: SoINode[];
}) {
  const md = connectionMarkdown(connection, owner, participants, requirements, findings);
  const sysml = connectionSysml(connection, owner, participants);
  const json = JSON.stringify({ connection, ownerHid: owner?.hid, participants, requirements, findings }, null, 2);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)" }}>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${connection.hid}-connection.md`, md, "text/markdown")}>Markdown</button>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${connection.hid}-connection.sysml`, sysml, "text/plain")}>SysML</button>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${connection.hid}-connection.json`, json, "application/json")}>JSON</button>
      </div>
      <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "var(--sstpa-sp-3)", whiteSpace: "pre-wrap", fontSize: "0.76rem" }}>{md}</pre>
    </div>
  );
}

function NewConnectionDialog({
  systems,
  interfaces,
  defaultOwner,
  onClose,
  onCreate,
}: {
  systems: SoINode[];
  interfaces: SoINode[];
  defaultOwner?: string | null;
  onClose: () => void;
  onCreate: (ops: CommitOperation[]) => void;
}) {
  const [owner, setOwner] = useState(defaultOwner ?? systems[0]?.hid ?? "");
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState("");
  const [osi, setOsi] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const canCreate = owner && name.trim() && participants.length >= 2;
  return (
    <div className="sstpa-dialog-overlay" onClick={onClose}>
      <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New Connection</h2>
        <label style={labelStyle}>Owner System
          <select className="sstpa-input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {systems.map((s) => <option key={s.hid} value={s.hid}>{s.hid} - {String(s.properties.Name ?? "")}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Name<input className="sstpa-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={labelStyle}>Protocol<input className="sstpa-input" value={protocol} onChange={(e) => setProtocol(e.target.value)} /></label>
          <label style={labelStyle}>OSI Layer<input className="sstpa-input" type="number" min={1} max={7} value={osi} onChange={(e) => setOsi(e.target.value)} /></label>
        </div>
        <h4>Interfaces</h4>
        <div style={{ maxHeight: 220, overflow: "auto", border: "var(--sstpa-border-soft)", padding: 6 }}>
          {interfaces.map((iface) => (
            <label key={iface.hid} style={{ display: "block", fontSize: "0.76rem", marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={participants.includes(iface.hid)}
                onChange={(e) => setParticipants((prev) => e.target.checked ? [...prev, iface.hid] : prev.filter((hid) => hid !== iface.hid))}
              />{" "}
              <span className="mono">{iface.hid}</span> {String(iface.properties.Name ?? "")}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="sstpa-button secondary" onClick={onClose}>Cancel</button>
          <button
            className="sstpa-button"
            disabled={!canCreate}
            onClick={() => {
              const ops: CommitOperation[] = [
                {
                  op: "createNode",
                  tempId: "connection",
                  label: "Connection",
                  properties: {
                    Name: name,
                    Protocol: protocol,
                    OSILayer: parseNullableInt(osi),
                    Directionality: "Bidirectional",
                  },
                },
                { op: "createRelationship", type: "HAS_CONNECTION", sourceHid: owner, targetHid: "$connection" },
                ...participants.map((hid) => ({
                  op: "createRelationship" as const,
                  type: "PARTICIPATES_IN",
                  sourceHid: hid,
                  targetHid: "$connection",
                  properties: cleanEdgeProps(edgeDraft()),
                })),
              ];
              onCreate(ops);
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: "0.76rem", marginTop: 8 };

function buildOwnerMap(systems: SoINode[]): Map<string, SoINode> {
  const owners = new Map<string, SoINode>();
  for (const system of systems) {
    for (const rel of system.relationships ?? []) {
      if (rel.type === "HAS_CONNECTION") owners.set(rel.targetHID, system);
    }
  }
  return owners;
}

function participantInterfaces(connectionHid: string, interfaces: SoINode[]): SoINode[] {
  return interfaces.filter((iface) => participatesIn(iface, connectionHid));
}

function participatesIn(iface: SoINode, connectionHid: string): boolean {
  return (iface.relationships ?? []).some((rel) => rel.type === "PARTICIPATES_IN" && rel.targetHID === connectionHid);
}

function participantRel(iface: SoINode, connectionHid: string): SoIRelationship | undefined {
  return (iface.relationships ?? []).find((rel) => rel.type === "PARTICIPATES_IN" && rel.targetHID === connectionHid);
}

function owningSystemForInterface(iface: SoINode, byHid: Map<string, SoINode>): SoINode | undefined {
  return [...byHid.values()].find((node) => node.typeName === "System" && (node.relationships ?? []).some((rel) => rel.type === "HAS_INTERFACE" && rel.targetHID === iface.hid));
}

function relatedNodes(node: SoINode, relType: string, byHid: Map<string, SoINode>): SoINode[] {
  return (node.relationships ?? []).filter((rel) => rel.type === relType).map((rel) => byHid.get(rel.targetHID)).filter((n): n is SoINode => !!n);
}

function validateConnection(connection: SoINode, participants: SoINode[], ownerMap: Map<string, SoINode>): Finding[] {
  const findings: Finding[] = [];
  if (!ownerMap.has(connection.hid)) findings.push({ severity: "ERROR", hid: connection.hid, message: "Connection must be owned by exactly one System through HAS_CONNECTION." });
  if (participants.length < 2) findings.push({ severity: "ERROR", hid: connection.hid, message: "Connection must have at least two participating Interfaces." });
  if (!String(connection.properties.Name ?? "").trim()) findings.push({ severity: "WARNING", hid: connection.hid, message: "Connection should have a Name." });
  if (!(connection.relationships ?? []).some((rel) => rel.type === "HAS_REQUIREMENT")) findings.push({ severity: "WARNING", hid: connection.hid, message: "Connection has no direct Requirement allocation." });
  for (const iface of participants) {
    const rel = participantRel(iface, connection.hid);
    if (!rel?.props?.RelationshipNature) findings.push({ severity: "WARNING", hid: iface.hid, message: `${iface.hid} participation has no RelationshipNature.` });
    if (!rel?.props?.FlowDirectionality) findings.push({ severity: "WARNING", hid: iface.hid, message: `${iface.hid} participation has no FlowDirectionality.` });
  }
  return findings;
}

function connectionMatches(
  connection: SoINode,
  interfaces: SoINode[],
  ownerMap: Map<string, SoINode>,
  byHid: Map<string, SoINode>,
  filters: {
    query: string;
    ownerFilter: string;
    osiFilter: string;
    directionFilter: string;
    tierFilter: string;
    selectedInterface: string;
  },
): boolean {
  const owner = ownerMap.get(connection.hid);
  const participants = participantInterfaces(connection.hid, interfaces);
  if (filters.ownerFilter && owner?.hid !== filters.ownerFilter) return false;
  if (filters.osiFilter && String(connection.properties.OSILayer ?? "") !== filters.osiFilter) return false;
  if (filters.directionFilter && String(connection.properties.Directionality ?? "") !== filters.directionFilter) return false;
  if (filters.tierFilter && String(systemTier(owner?.hid ?? "")) !== filters.tierFilter) return false;
  if (filters.selectedInterface && !participants.some((p) => p.hid === filters.selectedInterface)) return false;
  if (!filters.query.trim()) return true;
  const haystack = [
    connection.hid,
    connection.uuid,
    connection.properties.Name,
    connection.properties.ConnectionType,
    connection.properties.Protocol,
    connection.properties.PayloadDescription,
    owner?.hid,
    owner?.properties.Name,
    participants.map((p) => `${p.hid} ${String(p.properties.Name ?? "")} ${owningSystemForInterface(p, byHid)?.properties.Name ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  return haystack.includes(filters.query.toLowerCase());
}

function edgeDraft(rel?: SoIRelationship): EdgeDraft {
  return {
    RelationshipNature: String(rel?.props?.RelationshipNature ?? "LOGICAL"),
    PhysicalType: String(rel?.props?.PhysicalType ?? ""),
    LogicalLayer: String(rel?.props?.LogicalLayer ?? "N/A"),
    Protocol: String(rel?.props?.Protocol ?? ""),
    FlowDirectionality: String(rel?.props?.FlowDirectionality ?? "Bidirectional"),
    TimingClass: String(rel?.props?.TimingClass ?? ""),
    SecurityClass: String(rel?.props?.SecurityClass ?? ""),
  };
}

function cleanEdgeProps(draft: EdgeDraft): Record<string, unknown> {
  return Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== ""));
}

function parseNullableInt(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function propertyLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function systemTier(hid: string): number {
  const parts = hid.split("_");
  if (parts.length < 3) return 1;
  return parts[1].split(".").filter(Boolean).length;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function connectionMarkdown(connection: SoINode, owner: SoINode | undefined, participants: SoINode[], requirements: SoINode[], findings: Finding[]): string {
  let md = `# Connection ${connection.hid} - ${String(connection.properties.Name ?? "")}\n\n`;
  md += `Owner System: ${owner ? `${owner.hid} ${String(owner.properties.Name ?? "")}` : "Unassigned"}\n\n`;
  for (const key of ["Connection_Description", "ConnectionType", "OSILayer", "Protocol", "Directionality", "TimingClass", "SecurityClass", "PayloadDescription"]) {
    md += `- ${propertyLabel(key)}: ${String(connection.properties[key] ?? "")}\n`;
  }
  md += "\n## Interfaces\n\n";
  for (const iface of participants) {
    const rel = participantRel(iface, connection.hid);
    md += `- ${iface.hid}: ${String(iface.properties.Name ?? "")}`;
    md += ` (${String(rel?.props?.RelationshipNature ?? "LOGICAL")}, ${String(rel?.props?.FlowDirectionality ?? "Bidirectional")})\n`;
  }
  md += "\n## Requirements\n\n";
  for (const req of requirements) md += `- ${req.hid}: ${String(req.properties.Name ?? "")}\n`;
  md += "\n## Validation\n\n";
  if (findings.length === 0) md += "Valid.\n";
  for (const finding of findings) md += `- ${finding.severity}: ${finding.hid ? `${finding.hid} ` : ""}${finding.message}\n`;
  return md;
}

function connectionSysml(connection: SoINode, owner: SoINode | undefined, participants: SoINode[]): string {
  const safeName = String(connection.properties.Name ?? connection.hid).replace(/[^A-Za-z0-9_]/g, "_");
  let text = `connection ${safeName} {\n`;
  text += `  metadata SSTPA::hid = "${connection.hid}";\n`;
  if (owner) text += `  metadata SSTPA::ownerSystem = "${owner.hid}";\n`;
  text += `  attribute protocol = "${String(connection.properties.Protocol ?? "")}";\n`;
  text += `  attribute osiLayer = "${String(connection.properties.OSILayer ?? "")}";\n`;
  for (const iface of participants) text += `  end ${iface.hid.replace(/[^A-Za-z0-9_]/g, "_")} : ${String(iface.properties.Name ?? iface.hid).replace(/[^A-Za-z0-9_]/g, "_")};\n`;
  text += "}\n";
  return text;
}

function downloadText(filename: string, text: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
