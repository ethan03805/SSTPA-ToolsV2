// Use-Case Tool (SRS §6.5.12): SysML-style Use Case creation, actor
// management, Interface/Function association, requirement allocation, validation,
// diagram persistence, and exports.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import { useDrawer } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

type Mode = "diagram" | "validation" | "export";
type ActorType = "Human" | "System" | "ExternalSystem" | "Device" | "Organization";

interface ActorEntry {
  ActorID: string;
  ActorName: string;
  ActorType: ActorType;
  ActorDescription: string;
  InterfaceHIDs: string[];
}

interface Finding {
  severity: "ERROR" | "WARNING";
  message: string;
  hid?: string;
}

const ACTOR_TYPES: ActorType[] = ["Human", "System", "ExternalSystem", "Device", "Organization"];

export default function UseCaseTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const qc = useQueryClient();
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const [mode, setMode] = useState<Mode>("diagram");
  const [selectedUseCase, setSelectedUseCase] = useState("");
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const system = ctx.soiHid ? byHid.get(ctx.soiHid) : undefined;
  const purposes = nodes.filter((n) => n.typeName === "Purpose");
  const activePurpose = purposeForSystem(system, byHid) ?? purposes[0];
  const useCases = nodes.filter((n) => n.typeName === "UseCase");
  const interfaces = nodes.filter((n) => n.typeName === "Interface");
  const functions = nodes.filter((n) => n.typeName === "SystemFunction");
  const requirements = nodes.filter((n) => n.typeName === "Requirement");
  const selected = selectedUseCase ? byHid.get(selectedUseCase) : undefined;

  useEffect(() => {
    const hid = ctx.drawerNodeHid;
    if (!hid) return;
    const node = byHid.get(hid);
    if (!node) return;
    if (node.typeName === "UseCase") setSelectedUseCase(hid);
    if (node.typeName === "Purpose") {
      const first = useCases.find((u) => (node.relationships ?? []).some((r) => r.type === "HAS_USECASE" && r.targetHID === u.hid));
      if (first) setSelectedUseCase(first.hid);
    }
    if (node.typeName === "SystemFunction" || node.typeName === "Interface") {
      const containing = useCases.find((u) => (u.relationships ?? []).some((r) => r.targetHID === hid));
      if (containing) setSelectedUseCase(containing.hid);
      setSelectedElement(hid);
    }
  }, [byHid, ctx.drawerNodeHid, useCases]);

  useEffect(() => {
    if (!selectedUseCase && useCases[0]) setSelectedUseCase(useCases[0].hid);
  }, [selectedUseCase, useCases]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.usecase", operations: ops }),
    onSuccess: (res) => {
      setNotice(`Use-Case commit ${res.commitId.slice(0, 8)} accepted.`);
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice(String(e)),
  });

  const actors = parseActors(selected?.properties.ActorList);
  const participantInterfaces = selected ? relatedNodes(selected, "INVOLVES", byHid) : [];
  const participantFunctions = selected ? relatedNodes(selected, "INCLUDES", byHid) : [];
  const includedUseCases = selected ? relatedNodes(selected, "INCLUDES_UC", byHid) : [];
  const extendedUseCases = selected ? relatedNodes(selected, "EXTENDS", byHid) : [];
  const findings = selected ? validateUseCase(selected, actors, participantInterfaces, participantFunctions) : [];
  const visibleUseCases = useCases.filter((u) => useCaseMatches(u, search, byHid));

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
        <button className="sstpa-button" disabled={!activePurpose} onClick={() => setNewOpen(true)}>New Use Case</button>
        <button className={`sstpa-button ${mode === "diagram" ? "" : "secondary"}`} onClick={() => setMode("diagram")}>Diagram</button>
        <button className={`sstpa-button ${mode === "validation" ? "" : "secondary"}`} onClick={() => setMode("validation")}>
          Validation {findings.some((f) => f.severity === "ERROR") ? "!" : ""}
        </button>
        <button className={`sstpa-button ${mode === "export" ? "" : "secondary"}`} onClick={() => setMode("export")}>Export</button>
        <input className="sstpa-input" style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Use Cases" />
        <span style={{ flex: 1 }} />
        <button
          className="icon-button"
          disabled={!selected}
          onClick={() =>
            selected &&
            commit.mutate([
              {
                op: "updateNode",
                hid: selected.hid,
                properties: useCaseComputedProps(selected, actors, participantInterfaces, participantFunctions, includedUseCases, extendedUseCases, system),
              },
            ])
          }
        >
          Save Diagram
        </button>
      </div>
      {notice && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          {notice} <button className="icon-button" onClick={() => setNotice(null)}>x</button>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <UseCaseList
          useCases={visibleUseCases}
          byHid={byHid}
          selected={selectedUseCase}
          onSelect={(hid) => {
            setSelectedUseCase(hid);
            setSelectedElement(hid);
          }}
        />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {mode === "diagram" && selected && (
            <DiagramView
              system={system}
              useCase={selected}
              actors={actors}
              interfaces={participantInterfaces}
              functions={participantFunctions}
              includedUseCases={includedUseCases}
              extendedUseCases={extendedUseCases}
              selectedElement={selectedElement}
              onSelect={setSelectedElement}
            />
          )}
          {mode === "validation" && selected && <ValidationView findings={findings} onSelect={setSelectedElement} />}
          {mode === "export" && selected && (
            <ExportView
              useCase={selected}
              actors={actors}
              interfaces={participantInterfaces}
              functions={participantFunctions}
              includedUseCases={includedUseCases}
              extendedUseCases={extendedUseCases}
              findings={findings}
              system={system}
            />
          )}
          {!selected && <p style={{ padding: 20, color: "var(--sstpa-navy-muted)" }}>No Use Case selected.</p>}
        </div>
        <DetailPanel
          useCase={selected}
          selectedElement={selectedElement ? byHid.get(selectedElement) : undefined}
          actors={actors}
          interfaces={interfaces}
          functions={functions}
          requirements={requirements}
          allUseCases={useCases}
          participantInterfaces={participantInterfaces}
          participantFunctions={participantFunctions}
          includedUseCases={includedUseCases}
          extendedUseCases={extendedUseCases}
          drawerOpen={drawerOpen}
          onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })}
          onCommit={(ops) => commit.mutate(ops)}
          onUpdateActors={(next) => selected && commit.mutate([{ op: "updateNode", hid: selected.hid, properties: { ActorList: JSON.stringify(next) } }])}
          onSelect={setSelectedElement}
        />
      </div>
      {newOpen && activePurpose && (
        <NewUseCaseDialog
          purpose={activePurpose}
          system={system}
          onClose={() => setNewOpen(false)}
          onCreate={(props) => {
            commit.mutate([
              { op: "createNode", tempId: "uc", label: "UseCase", properties: props },
              { op: "createRelationship", type: "HAS_USECASE", sourceHid: activePurpose.hid, targetHid: "$uc" },
            ]);
            setNewOpen(false);
          }}
        />
      )}
    </div>
  );
}

function UseCaseList({
  useCases,
  byHid,
  selected,
  onSelect,
}: {
  useCases: SoINode[];
  byHid: Map<string, SoINode>;
  selected: string;
  onSelect: (hid: string) => void;
}) {
  return (
    <div style={{ width: 285, borderRight: "var(--sstpa-border)", overflow: "auto" }}>
      {useCases.map((u) => {
        const actors = parseActors(u.properties.ActorList);
        const interfaces = relatedNodes(u, "INVOLVES", byHid);
        const functions = relatedNodes(u, "INCLUDES", byHid);
        const complete = validateUseCase(u, actors, interfaces, functions).filter((f) => f.severity === "ERROR").length === 0;
        return (
          <button
            key={u.hid}
            className="entity-card"
            style={{ width: "calc(100% - 12px)", margin: 6, textAlign: "left", borderColor: selected === u.hid ? "var(--sstpa-gold)" : undefined }}
            onClick={() => onSelect(u.hid)}
          >
            <div className="entity-card-header">
              <span className="entity-hid">{u.hid}</span>
              <span className="type-badge" style={{ background: complete ? "var(--sstpa-status-ok)" : "var(--sstpa-status-warn)" }}>
                {complete ? "Complete" : "Open"}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{String(u.properties.Name ?? "")}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--sstpa-navy-muted)" }}>
              {actors.length} actor(s), {interfaces.length} interface(s), {functions.length} function(s)
            </div>
          </button>
        );
      })}
      {useCases.length === 0 && <p style={{ padding: 12, color: "var(--sstpa-navy-muted)" }}>No Use Cases in this SoI.</p>}
    </div>
  );
}

function DiagramView({
  system,
  useCase,
  actors,
  interfaces,
  functions,
  includedUseCases,
  extendedUseCases,
  selectedElement,
  onSelect,
}: {
  system?: SoINode;
  useCase: SoINode;
  actors: ActorEntry[];
  interfaces: SoINode[];
  functions: SoINode[];
  includedUseCases: SoINode[];
  extendedUseCases: SoINode[];
  selectedElement: string | null;
  onSelect: (hid: string) => void;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)" }}>
      <div
        style={{
          border: "2px solid var(--sstpa-navy)",
          minHeight: 460,
          position: "relative",
          padding: 24,
          background: "var(--sstpa-ivory-raised)",
        }}
      >
        <div style={{ position: "absolute", top: 6, left: 12, fontFamily: "var(--sstpa-font-brand)", fontSize: "1.1rem" }}>
          {String(system?.properties.Name ?? system?.hid ?? "System Boundary")}
        </div>
        <button
          className="entity-card"
          style={{
            width: 260,
            minHeight: 120,
            borderRadius: 999,
            textAlign: "center",
            margin: "90px auto 30px",
            borderColor: selectedElement === useCase.hid ? "var(--sstpa-gold)" : undefined,
          }}
          onClick={() => onSelect(useCase.hid)}
        >
          <div className="entity-hid">{useCase.hid}</div>
          <div style={{ fontWeight: 700 }}>{String(useCase.properties.Name ?? "")}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>{String(useCase.properties.UCStatement ?? "")}</div>
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div>
            <h4>Interfaces</h4>
            {interfaces.map((n) => <DiagramNode key={n.hid} node={n} selected={selectedElement === n.hid} onSelect={onSelect} />)}
          </div>
          <div>
            <h4>Functions</h4>
            {functions.map((n) => <DiagramNode key={n.hid} node={n} selected={selectedElement === n.hid} onSelect={onSelect} />)}
          </div>
        </div>
        {(includedUseCases.length > 0 || extendedUseCases.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
            <div>
              <h4>Includes Use Cases</h4>
              {includedUseCases.map((n) => <DiagramNode key={n.hid} node={n} selected={selectedElement === n.hid} onSelect={onSelect} />)}
            </div>
            <div>
              <h4>Extends Use Cases</h4>
              {extendedUseCases.map((n) => <DiagramNode key={n.hid} node={n} selected={selectedElement === n.hid} onSelect={onSelect} />)}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        {actors.map((a) => (
          <div key={a.ActorID} className="entity-card" style={{ width: 180, textAlign: "center", borderRadius: a.ActorType === "Human" ? 999 : 4 }}>
            <div className="type-badge" style={{ background: "var(--sstpa-node-purpose)" }}>{a.ActorType}</div>
            <div style={{ fontWeight: 700 }}>{a.ActorName}</div>
            <div className="mono" style={{ fontSize: "0.66rem" }}>{a.InterfaceHIDs.join(", ") || "No Interface"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagramNode({ node, selected, onSelect }: { node: SoINode; selected: boolean; onSelect: (hid: string) => void }) {
  return (
    <button
      className="entity-card"
      style={{ width: "100%", marginBottom: 8, textAlign: "left", borderColor: selected ? "var(--sstpa-gold)" : undefined }}
      onClick={() => onSelect(node.hid)}
    >
      <div className="entity-card-header">
        <span className="entity-hid">{node.hid}</span>
        <span className="type-badge" style={{ background: node.typeName === "Interface" ? "var(--sstpa-node-interface)" : "var(--sstpa-node-function)" }}>{node.typeName}</span>
      </div>
      <div style={{ fontWeight: 700 }}>{String(node.properties.Name ?? "")}</div>
    </button>
  );
}

function DetailPanel({
  useCase,
  selectedElement,
  actors,
  interfaces,
  functions,
  requirements,
  allUseCases,
  participantInterfaces,
  participantFunctions,
  includedUseCases,
  extendedUseCases,
  drawerOpen,
  onOpenDrawer,
  onCommit,
  onUpdateActors,
  onSelect,
}: {
  useCase?: SoINode;
  selectedElement?: SoINode;
  actors: ActorEntry[];
  interfaces: SoINode[];
  functions: SoINode[];
  requirements: SoINode[];
  allUseCases: SoINode[];
  participantInterfaces: SoINode[];
  participantFunctions: SoINode[];
  includedUseCases: SoINode[];
  extendedUseCases: SoINode[];
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onCommit: (ops: CommitOperation[]) => void;
  onUpdateActors: (actors: ActorEntry[]) => void;
  onSelect: (hid: string) => void;
}) {
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [actorDraft, setActorDraft] = useState({ name: "", type: "Human" as ActorType, description: "", interfaceHid: "" });
  const [interfaceToAdd, setInterfaceToAdd] = useState("");
  const [functionToAdd, setFunctionToAdd] = useState("");
  const [includeUseCaseToAdd, setIncludeUseCaseToAdd] = useState("");
  const [extendUseCaseToAdd, setExtendUseCaseToAdd] = useState("");
  const [extensionPoint, setExtensionPoint] = useState("");
  const [actorInterfaceToAdd, setActorInterfaceToAdd] = useState<Record<string, string>>({});
  const [requirementOwner, setRequirementOwner] = useState("");
  const [requirementToAdd, setRequirementToAdd] = useState("");

  useEffect(() => {
    if (!useCase) return;
    setEdit({
      Name: String(useCase.properties.Name ?? ""),
      ShortDescription: String(useCase.properties.ShortDescription ?? ""),
      UCStatement: String(useCase.properties.UCStatement ?? ""),
      Precondition: String(useCase.properties.Precondition ?? ""),
      Postcondition: String(useCase.properties.Postcondition ?? ""),
      NormalFlow: String(useCase.properties.NormalFlow ?? ""),
      AlternateFlows: String(useCase.properties.AlternateFlows ?? ""),
      ExceptionFlows: String(useCase.properties.ExceptionFlows ?? ""),
      Rationale: String(useCase.properties.Rationale ?? ""),
      Priority: String(useCase.properties.Priority ?? ""),
    });
  }, [useCase]);

  if (!useCase) {
    return <div style={{ width: 340, borderLeft: "var(--sstpa-border)", padding: "var(--sstpa-sp-3)" }}>Select a Use Case.</div>;
  }

  const availableInterfaces = interfaces.filter((n) => !participantInterfaces.some((p) => p.hid === n.hid));
  const availableFunctions = functions.filter((n) => !participantFunctions.some((p) => p.hid === n.hid));
  const availableIncludes = allUseCases.filter((n) => n.hid !== useCase.hid && !includedUseCases.some((p) => p.hid === n.hid));
  const availableExtends = allUseCases.filter((n) => n.hid !== useCase.hid && !extendedUseCases.some((p) => p.hid === n.hid));
  const requirementOwners = [...participantInterfaces, ...participantFunctions];

  return (
    <div style={{ width: 360, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>{selectedElement?.hid ?? useCase.hid}</div>
      <h3 style={{ margin: "4px 0 8px" }}>{String((selectedElement ?? useCase).properties.Name ?? "")}</h3>
      <button className="sstpa-button" disabled={drawerOpen} onClick={() => onOpenDrawer((selectedElement ?? useCase).hid)}>Open Drawer</button>

      {!selectedElement || selectedElement.hid === useCase.hid ? (
        <>
          {["Name", "ShortDescription", "UCStatement", "Precondition", "Postcondition", "NormalFlow", "AlternateFlows", "ExceptionFlows", "Rationale", "Priority"].map((k) => (
            <label key={k} style={labelStyle}>
              {k}
              <textarea className="sstpa-input" rows={k.includes("Flow") ? 3 : 1} value={edit[k] ?? ""} onChange={(e) => setEdit((x) => ({ ...x, [k]: e.target.value }))} />
            </label>
          ))}
          <button
            className="sstpa-button"
            onClick={() =>
              onCommit([
                {
                  op: "updateNode",
                  hid: useCase.hid,
                  properties: {
                    ...edit,
                    Priority: edit.Priority === "" ? null : Number(edit.Priority),
                    ActorList: JSON.stringify(actors),
                  },
                },
              ])
            }
          >
            Commit Use Case
          </button>

          <h4>Actors</h4>
          {actors.map((a) => (
            <div key={a.ActorID} style={{ borderBottom: "1px solid var(--sstpa-line-soft)", padding: "4px 0", fontSize: "0.74rem" }}>
              <strong>{a.ActorID}</strong> {a.ActorName} ({a.ActorType})<br />
              {a.ActorDescription && <span>{a.ActorDescription}<br /></span>}
              <span className="mono">{a.InterfaceHIDs.join(", ") || "No Interface"}</span>{" "}
              <button className="icon-button danger" onClick={() => onUpdateActors(actors.filter((x) => x.ActorID !== a.ActorID))}>Remove</button>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <select
                  className="sstpa-input"
                  value={actorInterfaceToAdd[a.ActorID] ?? ""}
                  onChange={(e) => setActorInterfaceToAdd((x) => ({ ...x, [a.ActorID]: e.target.value }))}
                >
                  <option value="">Assign Interface</option>
                  {participantInterfaces.filter((i) => !a.InterfaceHIDs.includes(i.hid)).map((i) => (
                    <option key={i.hid} value={i.hid}>{i.hid} - {String(i.properties.Name ?? "")}</option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  disabled={!actorInterfaceToAdd[a.ActorID]}
                  onClick={() => {
                    const hid = actorInterfaceToAdd[a.ActorID];
                    onUpdateActors(actors.map((x) => x.ActorID === a.ActorID ? { ...x, InterfaceHIDs: [...x.InterfaceHIDs, hid] } : x));
                    setActorInterfaceToAdd((x) => ({ ...x, [a.ActorID]: "" }));
                  }}
                >
                  Add
                </button>
              </div>
              {a.InterfaceHIDs.map((hid) => (
                <button
                  key={hid}
                  className="icon-button danger"
                  onClick={() =>
                    onUpdateActors(actors.map((x) => x.ActorID === a.ActorID ? { ...x, InterfaceHIDs: x.InterfaceHIDs.filter((i) => i !== hid) } : x))
                  }
                >
                  Unlink {hid}
                </button>
              ))}
            </div>
          ))}
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            <input className="sstpa-input" placeholder="Actor name" value={actorDraft.name} onChange={(e) => setActorDraft((x) => ({ ...x, name: e.target.value }))} />
            <textarea className="sstpa-input" rows={2} placeholder="Actor description" value={actorDraft.description} onChange={(e) => setActorDraft((x) => ({ ...x, description: e.target.value }))} />
            <select className="sstpa-input" value={actorDraft.type} onChange={(e) => setActorDraft((x) => ({ ...x, type: e.target.value as ActorType }))}>
              {ACTOR_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select className="sstpa-input" value={actorDraft.interfaceHid} onChange={(e) => setActorDraft((x) => ({ ...x, interfaceHid: e.target.value }))}>
              <option value="">Interface</option>
              {participantInterfaces.map((i) => <option key={i.hid} value={i.hid}>{i.hid} - {String(i.properties.Name ?? "")}</option>)}
            </select>
            <button
              className="sstpa-button"
              disabled={!actorDraft.name.trim()}
              onClick={() => {
                const nextId = `A${actors.length + 1}`;
                onUpdateActors([
                  ...actors,
                  {
                    ActorID: nextId,
                    ActorName: actorDraft.name,
                    ActorType: actorDraft.type,
                    ActorDescription: actorDraft.description,
                    InterfaceHIDs: actorDraft.interfaceHid ? [actorDraft.interfaceHid] : [],
                  },
                ]);
                setActorDraft({ name: "", type: "Human", description: "", interfaceHid: "" });
              }}
            >
              Add Actor
            </button>
          </div>

          <h4>Associations</h4>
          <RelationshipList
            title="Interfaces"
            items={participantInterfaces}
            relType="INVOLVES"
            sourceHid={useCase.hid}
            onCommit={(ops) => onCommit(cleanActorRefsOnInterfaceRemove(ops, actors, useCase.hid))}
            onSelect={onSelect}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <select className="sstpa-input" value={interfaceToAdd} onChange={(e) => setInterfaceToAdd(e.target.value)}>
              <option value="">Interface</option>
              {availableInterfaces.map((i) => <option key={i.hid} value={i.hid}>{i.hid} - {String(i.properties.Name ?? "")}</option>)}
            </select>
            <button className="sstpa-button" disabled={!interfaceToAdd} onClick={() => onCommit([{ op: "createRelationship", type: "INVOLVES", sourceHid: useCase.hid, targetHid: interfaceToAdd }])}>Add</button>
          </div>
          <RelationshipList title="Functions" items={participantFunctions} relType="INCLUDES" sourceHid={useCase.hid} onCommit={onCommit} onSelect={onSelect} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <select className="sstpa-input" value={functionToAdd} onChange={(e) => setFunctionToAdd(e.target.value)}>
              <option value="">Function</option>
              {availableFunctions.map((f) => <option key={f.hid} value={f.hid}>{f.hid} - {String(f.properties.Name ?? "")}</option>)}
            </select>
            <button className="sstpa-button" disabled={!functionToAdd} onClick={() => onCommit([{ op: "createRelationship", type: "INCLUDES", sourceHid: useCase.hid, targetHid: functionToAdd }])}>Add</button>
          </div>

          <h4>Use Case Relationships</h4>
          <RelationshipList title="Includes Use Cases" items={includedUseCases} relType="INCLUDES_UC" sourceHid={useCase.hid} onCommit={onCommit} onSelect={onSelect} />
          <div style={{ display: "flex", gap: 6 }}>
            <select className="sstpa-input" value={includeUseCaseToAdd} onChange={(e) => setIncludeUseCaseToAdd(e.target.value)}>
              <option value="">Included Use Case</option>
              {availableIncludes.map((u) => <option key={u.hid} value={u.hid}>{u.hid} - {String(u.properties.Name ?? "")}</option>)}
            </select>
            <button className="sstpa-button" disabled={!includeUseCaseToAdd} onClick={() => onCommit([{ op: "createRelationship", type: "INCLUDES_UC", sourceHid: useCase.hid, targetHid: includeUseCaseToAdd }])}>Add</button>
          </div>
          <RelationshipList title="Extends Use Cases" items={extendedUseCases} relType="EXTENDS" sourceHid={useCase.hid} onCommit={onCommit} onSelect={onSelect} />
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            <select className="sstpa-input" value={extendUseCaseToAdd} onChange={(e) => setExtendUseCaseToAdd(e.target.value)}>
              <option value="">Base Use Case</option>
              {availableExtends.map((u) => <option key={u.hid} value={u.hid}>{u.hid} - {String(u.properties.Name ?? "")}</option>)}
            </select>
            <input className="sstpa-input" placeholder="Extension point" value={extensionPoint} onChange={(e) => setExtensionPoint(e.target.value)} />
            <button
              className="sstpa-button"
              disabled={!extendUseCaseToAdd || !extensionPoint.trim()}
              onClick={() =>
                onCommit([{ op: "createRelationship", type: "EXTENDS", sourceHid: useCase.hid, targetHid: extendUseCaseToAdd, properties: { ExtensionPoint: extensionPoint } }])
              }
            >
              Add Extension
            </button>
          </div>
        </>
      ) : (
        <>
          <h4>Participant Requirements</h4>
          {(selectedElement.relationships ?? []).filter((r) => r.type === "HAS_REQUIREMENT").map((r) => (
            <span key={r.targetHID} style={{ display: "inline-flex", gap: 4, margin: 2 }}>
              <button className="icon-button" onClick={() => onSelect(r.targetHID)}>{r.targetHID}</button>
              <button className="icon-button danger" onClick={() => onCommit([{ op: "deleteRelationship", type: "HAS_REQUIREMENT", sourceHid: selectedElement.hid, targetHid: r.targetHID }])}>Remove</button>
            </span>
          ))}
        </>
      )}

      <h4>Requirement Allocation</h4>
      <select className="sstpa-input" value={requirementOwner} onChange={(e) => setRequirementOwner(e.target.value)}>
        <option value="">Owner Interface/Function</option>
        {requirementOwners.map((n) => <option key={n.hid} value={n.hid}>{n.hid} - {String(n.properties.Name ?? "")}</option>)}
      </select>
      <select className="sstpa-input" style={{ marginTop: 6 }} value={requirementToAdd} onChange={(e) => setRequirementToAdd(e.target.value)}>
        <option value="">Existing Requirement</option>
        {requirements.map((r) => <option key={r.hid} value={r.hid}>{r.hid} - {String(r.properties.Name ?? "")}</option>)}
      </select>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button className="sstpa-button" disabled={!requirementOwner || !requirementToAdd} onClick={() => onCommit([{ op: "createRelationship", type: "HAS_REQUIREMENT", sourceHid: requirementOwner, targetHid: requirementToAdd }])}>Associate</button>
        <button
          className="sstpa-button secondary"
          disabled={!requirementOwner}
          onClick={() =>
            onCommit([
              { op: "createNode", tempId: "req", label: "Requirement", properties: { Name: "New Use Case Requirement", RStatement: "TBD", Orphan: true, Barren: true } },
              { op: "createRelationship", type: "HAS_REQUIREMENT", sourceHid: requirementOwner, targetHid: "$req" },
            ])
          }
        >
          New Requirement
        </button>
      </div>
    </div>
  );
}

function RelationshipList({
  title,
  items,
  relType,
  sourceHid,
  onCommit,
  onSelect,
}: {
  title: string;
  items: SoINode[];
  relType: string;
  sourceHid: string;
  onCommit: (ops: CommitOperation[]) => void;
  onSelect: (hid: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ margin: "4px 0 6px" }}>
      <div style={{ fontSize: "0.7rem", color: "var(--sstpa-navy-muted)" }}>{title}</div>
      {items.map((item) => (
        <div key={`${relType}-${item.hid}`} style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 3 }}>
          <button className="icon-button" onClick={() => onSelect(item.hid)}>{item.hid}</button>
          <span style={{ flex: 1, fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(item.properties.Name ?? "")}</span>
          <button className="icon-button danger" onClick={() => onCommit([{ op: "deleteRelationship", type: relType, sourceHid, targetHid: item.hid }])}>Remove</button>
        </div>
      ))}
    </div>
  );
}

function ValidationView({ findings, onSelect }: { findings: Finding[]; onSelect: (hid: string) => void }) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      {findings.map((f, i) => (
        <div key={i} className="sstpa-alert-warning" style={{ marginBottom: 8 }}>
          <strong>{f.severity}</strong> {f.message} {f.hid && <button className="icon-button" onClick={() => onSelect(f.hid!)}>{f.hid}</button>}
        </div>
      ))}
      {findings.length === 0 && <p className="state-ok">Use Case is structurally complete.</p>}
    </div>
  );
}

function ExportView({
  useCase,
  actors,
  interfaces,
  functions,
  includedUseCases,
  extendedUseCases,
  findings,
  system,
}: {
  useCase: SoINode;
  actors: ActorEntry[];
  interfaces: SoINode[];
  functions: SoINode[];
  includedUseCases: SoINode[];
  extendedUseCases: SoINode[];
  findings: Finding[];
  system?: SoINode;
}) {
  const md = useCaseMarkdown(useCase, actors, interfaces, functions, includedUseCases, extendedUseCases, findings, system);
  const json = JSON.stringify({ useCase, actors, interfaces, functions, includedUseCases, extendedUseCases, findings, systemHid: system?.hid }, null, 2);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)" }}>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${useCase.hid}-usecase.md`, md, "text/markdown")}>Markdown</button>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${useCase.hid}-usecase.json`, json, "application/json")}>JSON</button>
      </div>
      <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "var(--sstpa-sp-3)", whiteSpace: "pre-wrap", fontSize: "0.76rem" }}>{md}</pre>
    </div>
  );
}

function NewUseCaseDialog({
  purpose,
  system,
  onClose,
  onCreate,
}: {
  purpose: SoINode;
  system?: SoINode;
  onClose: () => void;
  onCreate: (props: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  return (
    <div className="sstpa-dialog-overlay" onClick={onClose}>
      <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New Use Case</h2>
        <p className="mono" style={{ fontSize: "0.72rem" }}>Purpose {purpose.hid}</p>
        <label style={labelStyle}>Name<input className="sstpa-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label style={labelStyle}>Statement<textarea className="sstpa-input" rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="sstpa-button secondary" onClick={onClose}>Cancel</button>
          <button
            className="sstpa-button"
            disabled={!name.trim()}
            onClick={() =>
              onCreate({
                Name: name,
                UCStatement: statement,
                ActorList: "[]",
                IsComplete: false,
                ValidationStatus: "NotValidated",
                UseCaseDiagramJSON: JSON.stringify(emptyDiagram(system)),
              })
            }
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: "0.76rem", marginTop: 8 };

function purposeForSystem(system: SoINode | undefined, byHid: Map<string, SoINode>): SoINode | undefined {
  const rel = system?.relationships?.find((r) => r.type === "REALIZES");
  return rel ? byHid.get(rel.targetHID) : undefined;
}

function relatedNodes(node: SoINode, relType: string, byHid: Map<string, SoINode>): SoINode[] {
  return (node.relationships ?? []).filter((r) => r.type === relType).map((r) => byHid.get(r.targetHID)).filter((n): n is SoINode => !!n);
}

function parseActors(raw: unknown): ActorEntry[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as ActorEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a, i) => ({
      ActorID: String(a.ActorID ?? `A${i + 1}`),
      ActorName: String(a.ActorName ?? ""),
      ActorType: ACTOR_TYPES.includes(a.ActorType) ? a.ActorType : "Human",
      ActorDescription: String(a.ActorDescription ?? ""),
      InterfaceHIDs: Array.isArray(a.InterfaceHIDs) ? a.InterfaceHIDs.map(String) : [],
    }));
  } catch {
    return [];
  }
}

function validateUseCase(useCase: SoINode, actors: ActorEntry[], interfaces: SoINode[], functions: SoINode[]): Finding[] {
  const findings: Finding[] = [];
  const requiredText = ["Name", "UCStatement", "Precondition", "Postcondition", "NormalFlow"];
  for (const key of requiredText) if (!String(useCase.properties[key] ?? "").trim()) findings.push({ severity: "ERROR", hid: useCase.hid, message: `${key} is required.` });
  if (actors.length === 0) findings.push({ severity: "ERROR", hid: useCase.hid, message: "At least one Actor is required." });
  if (interfaces.length === 0) findings.push({ severity: "ERROR", hid: useCase.hid, message: "At least one Interface association is required." });
  if (functions.length === 0) findings.push({ severity: "ERROR", hid: useCase.hid, message: "At least one Function association is required." });
  const interfaceSet = new Set(interfaces.map((i) => i.hid));
  for (const actor of actors) {
    if (actor.InterfaceHIDs.length === 0) findings.push({ severity: "ERROR", hid: useCase.hid, message: `Actor ${actor.ActorName || actor.ActorID} has no Interface.` });
    for (const hid of actor.InterfaceHIDs) if (!interfaceSet.has(hid)) findings.push({ severity: "ERROR", hid, message: `Actor ${actor.ActorID} references an Interface not associated to this Use Case.` });
  }
  for (const n of [...interfaces, ...functions]) {
    if (!(n.relationships ?? []).some((r) => r.type === "HAS_REQUIREMENT")) findings.push({ severity: "WARNING", hid: n.hid, message: `${n.hid} has no Requirement allocation.` });
  }
  return findings;
}

function cleanActorRefsOnInterfaceRemove(ops: CommitOperation[], actors: ActorEntry[], useCaseHid: string): CommitOperation[] {
  const removed = ops.filter((op) => op.type === "INVOLVES").map((op) => op.targetHid).filter((hid): hid is string => !!hid);
  if (removed.length === 0) return ops;
  const removedSet = new Set(removed);
  const nextActors = actors.map((actor) => ({ ...actor, InterfaceHIDs: actor.InterfaceHIDs.filter((hid) => !removedSet.has(hid)) }));
  return [...ops, { op: "updateNode", hid: useCaseHid, properties: { ActorList: JSON.stringify(nextActors) } }];
}

function useCaseComputedProps(
  useCase: SoINode,
  actors: ActorEntry[],
  interfaces: SoINode[],
  functions: SoINode[],
  includedUseCases: SoINode[],
  extendedUseCases: SoINode[],
  system?: SoINode,
): Record<string, unknown> {
  const findings = validateUseCase(useCase, actors, interfaces, functions);
  const hasError = findings.some((f) => f.severity === "ERROR");
  const hasWarning = findings.some((f) => f.severity === "WARNING");
  return {
    IsComplete: !hasError && !hasWarning,
    ValidationStatus: hasError ? "Invalid" : hasWarning ? "Warning" : "Valid",
    UseCaseDiagramJSON: JSON.stringify({
      ...emptyDiagram(system),
      useCaseHID: useCase.hid,
      useCaseUUID: useCase.uuid,
      actors,
      interfaces: interfaces.map((i) => ({ hid: i.hid, name: i.properties.Name })),
      functions: functions.map((f) => ({ hid: f.hid, name: f.properties.Name })),
      useCaseRelationships: [
        ...includedUseCases.map((u) => ({ type: "INCLUDES_UC", targetHID: u.hid, targetName: u.properties.Name })),
        ...extendedUseCases.map((u) => {
          const rel = (useCase.relationships ?? []).find((r) => r.type === "EXTENDS" && r.targetHID === u.hid);
          return { type: "EXTENDS", targetHID: u.hid, targetName: u.properties.Name, extensionPoint: rel?.props?.ExtensionPoint ?? null };
        }),
      ],
      savedAt: new Date().toISOString(),
    }),
  };
}

function useCaseMatches(u: SoINode, search: string, byHid: Map<string, SoINode>): boolean {
  if (!search.trim()) return true;
  const actors = parseActors(u.properties.ActorList);
  const related = (u.relationships ?? []).map((r) => byHid.get(r.targetHID)).filter((n): n is SoINode => !!n);
  const haystack = [
    u.hid,
    u.uuid,
    u.properties.Name,
    u.properties.UCStatement,
    actors.map((a) => a.ActorName).join(" "),
    related.map((n) => `${n.hid} ${String(n.properties.Name ?? "")}`).join(" "),
  ].join(" ").toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function emptyDiagram(system?: SoINode) {
  return {
    schemaVersion: "1.0",
    soiHid: system?.hid ?? null,
    soiName: system?.properties.Name ?? null,
    viewport: { x: 0, y: 0, zoom: 1 },
    actors: [],
    interfaces: [],
    functions: [],
    relationships: [],
  };
}

function useCaseMarkdown(
  useCase: SoINode,
  actors: ActorEntry[],
  interfaces: SoINode[],
  functions: SoINode[],
  includedUseCases: SoINode[],
  extendedUseCases: SoINode[],
  findings: Finding[],
  system?: SoINode,
): string {
  let md = `# Use Case ${useCase.hid} - ${String(useCase.properties.Name ?? "")}\n\n`;
  md += `System: ${String(system?.properties.Name ?? system?.hid ?? "—")}\n\n`;
  for (const key of ["UCStatement", "Precondition", "Postcondition", "NormalFlow", "AlternateFlows", "ExceptionFlows"]) {
    md += `## ${key}\n\n${String(useCase.properties[key] ?? "—")}\n\n`;
  }
  md += "## Actors\n\n";
  for (const a of actors) md += `- ${a.ActorID}: ${a.ActorName} (${a.ActorType}) via ${a.InterfaceHIDs.join(", ") || "—"}\n`;
  md += "\n## Interfaces\n\n";
  for (const i of interfaces) md += `- ${i.hid}: ${String(i.properties.Name ?? "")}\n`;
  md += "\n## Functions\n\n";
  for (const f of functions) md += `- ${f.hid}: ${String(f.properties.Name ?? "")}\n`;
  md += "\n## Use Case Relationships\n\n";
  for (const u of includedUseCases) md += `- includes ${u.hid}: ${String(u.properties.Name ?? "")}\n`;
  for (const u of extendedUseCases) {
    const rel = (useCase.relationships ?? []).find((r) => r.type === "EXTENDS" && r.targetHID === u.hid);
    md += `- extends ${u.hid}: ${String(u.properties.Name ?? "")}${rel?.props?.ExtensionPoint ? ` at ${String(rel.props.ExtensionPoint)}` : ""}\n`;
  }
  md += "\n## Validation\n\n";
  if (findings.length === 0) md += "Complete.\n";
  for (const f of findings) md += `- ${f.severity}: ${f.hid ? `${f.hid} ` : ""}${f.message}\n`;
  return md;
}

function downloadText(filename: string, text: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
