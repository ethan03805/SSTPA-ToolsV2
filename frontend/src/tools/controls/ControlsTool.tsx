// Controls Tool (SRS 6.5.17): SoI controls baseline categorization,
// tailoring, control mapping, requirement/countermeasure development, and export.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, ReferenceSearchResult, SoINode } from "../../api/types";
import { useDrawer } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

type Mode = "categorization" | "resilience" | "survivability" | "baseline" | "mapping" | "validation" | "export";
type Impact = "NONE" | "LOW" | "MODERATE" | "HIGH";
type BaselineStatus = "DRAFT" | "REVIEWED" | "BASELINED" | "APPROVED";

interface Finding {
  severity: "ERROR" | "WARNING";
  message: string;
  controlId?: string;
  hid?: string;
}

interface BaselineControl {
  ControlID: string;
  ControlName: string;
  Source: string[];
  Selected: boolean;
  TailoredOut: boolean;
  TailorReason: string | null;
  MappedControl: string | null;
  RequirementCount: number;
  Status: "Implemented" | "Incomplete" | "Tailored" | "Error";
  SelectedBy: Record<string, unknown>[];
  ParameterValues?: string | null;
  NSSJustification?: string | null;
  PrivacyImplementationConsiderations?: string | null;
  AssuranceFlag?: boolean;
  ResiliencyFlag?: boolean;
  ATTACKFlag?: boolean;
}

interface ResilienceEntry {
  ApproachID: string;
  ApproachName: string;
  PrincipleID: string;
  TechniqueID: string;
  UserStrategy: string;
  UserImplementationApproach: string;
  UserRationale: string;
  Assumptions: string;
  ResidualConcerns: string;
  RelatedControlIDs: string[];
}

interface CSAEntry {
  CSAID: string;
  CSAName: string;
  Description: string;
  UserApplicabilityStatement: string;
  UserImplementationDescription: string;
  RelatedAssetHIDs: string[];
  RelatedLossHIDs: string[];
  RelatedControlHIDs: string[];
}

interface BaselineArtifact {
  schema: "SSTPA-CB-1.0";
  categorization: {
    ConfidentialityImpact: Impact;
    IntegrityImpact: Impact;
    AvailabilityImpact: Impact;
    CategorizationRationale: string;
  };
  overlays: string[];
  survivability: CSAEntry[];
  resilience: ResilienceEntry[];
  controls: BaselineControl[];
}

const IMPACTS: Impact[] = ["NONE", "LOW", "MODERATE", "HIGH"];
const STATUSES: BaselineStatus[] = ["DRAFT", "REVIEWED", "BASELINED", "APPROVED"];
const SOURCES = ["CNSSI1253", "Overlay", "CSA", "CyberResilience", "UserAdded"];

const emptyResilience: ResilienceEntry = {
  ApproachID: "",
  ApproachName: "",
  PrincipleID: "",
  TechniqueID: "",
  UserStrategy: "",
  UserImplementationApproach: "",
  UserRationale: "",
  Assumptions: "",
  ResidualConcerns: "",
  RelatedControlIDs: [],
};

const emptyCSA: CSAEntry = {
  CSAID: "",
  CSAName: "",
  Description: "",
  UserApplicabilityStatement: "",
  UserImplementationDescription: "",
  RelatedAssetHIDs: [],
  RelatedLossHIDs: [],
  RelatedControlHIDs: [],
};

export default function ControlsTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const qc = useQueryClient();
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const [mode, setMode] = useState<Mode>("baseline");
  const [selectedBaseline, setSelectedBaseline] = useState("");
  const [selectedControlId, setSelectedControlId] = useState("");
  const [controlFilter, setControlFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const system = ctx.soiHid ? byHid.get(ctx.soiHid) : undefined;
  const baselines = nodes.filter((n) => n.typeName === "ControlsBaseline");
  const activeBaseline = selectedBaseline ? byHid.get(selectedBaseline) : findActiveBaseline(system, byHid, baselines);
  const baseline = activeBaseline?.typeName === "ControlsBaseline" ? activeBaseline : undefined;
  const artifact = useMemo(() => parseArtifact(baseline), [baseline]);
  const securityNode = findSecurityNode(system, byHid, nodes);
  const controls = nodes.filter((n) => n.typeName === "SecurityControl");
  const countermeasures = nodes.filter((n) => n.typeName === "Countermeasure");
  const requirements = nodes.filter((n) => n.typeName === "Requirement");
  const assets = nodes.filter((n) => n.typeName === "Asset");
  const losses = nodes.filter((n) => n.typeName === "Loss");
  const states = nodes.filter((n) => n.typeName === "State");
  const functions = nodes.filter((n) => n.typeName === "SystemFunction");
  const interfaces = nodes.filter((n) => n.typeName === "Interface");
  const components = nodes.filter((n) => n.typeName === "Component");
  const selectedControl = artifact.controls.find((c) => c.ControlID === selectedControlId) ?? artifact.controls[0];
  const mappedNode = selectedControl?.MappedControl ? byHid.get(selectedControl.MappedControl) : undefined;
  const findings = validateBaseline(artifact, controls, requirements, byHid);

  useEffect(() => {
    if (!selectedBaseline && baseline) setSelectedBaseline(baseline.hid);
  }, [baseline, selectedBaseline]);

  useEffect(() => {
    const hid = ctx.drawerNodeHid;
    if (!hid) return;
    const node = byHid.get(hid);
    if (!node) return;
    if (node.typeName === "ControlsBaseline") setSelectedBaseline(hid);
    if (node.typeName === "SecurityControl") {
      const row = artifact.controls.find((c) => c.MappedControl === hid);
      if (row) setSelectedControlId(row.ControlID);
      setMode("mapping");
    }
    if (node.typeName === "Asset") setMode("survivability");
    if (node.typeName === "System") setMode("categorization");
  }, [artifact.controls, byHid, ctx.drawerNodeHid]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.controls", operations: ops }),
    onSuccess: (res) => {
      setNotice(`Controls commit ${res.commitId.slice(0, 8)} accepted.`);
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice(String(e)),
  });

  const saveArtifact = (next: BaselineArtifact, extra: Record<string, unknown> = {}) => {
    if (!baseline) return;
    commit.mutate([
      {
        op: "updateNode",
        hid: baseline.hid,
        properties: {
          ...extra,
          ControlsBaselineJSON: JSON.stringify(syncControlStatus(next, byHid)),
          ValidationSummary: JSON.stringify(summarizeFindings(validateBaseline(next, controls, requirements, byHid))),
        },
      },
    ]);
  };

  const visibleControls = artifact.controls.filter((control) => {
    if (statusFilter && control.Status !== statusFilter) return false;
    if (!controlFilter.trim()) return true;
    const haystack = [control.ControlID, control.ControlName, control.Source.join(" "), control.MappedControl, control.TailorReason].join(" ").toLowerCase();
    return haystack.includes(controlFilter.toLowerCase());
  });

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
        <button
          className="sstpa-button"
          disabled={!system || !!baseline}
          onClick={() =>
            system &&
            commit.mutate([
              {
                op: "createNode",
                tempId: "baseline",
                label: "ControlsBaseline",
                properties: {
                  Name: "Active Controls Baseline",
                  ConfidentialityImpact: "NONE",
                  IntegrityImpact: "NONE",
                  AvailabilityImpact: "NONE",
                  BaselineStatus: "DRAFT",
                  IsActive: true,
                  OverlayIDs: "[]",
                  SelectedCSA: "[]",
                  SelectedPrinciples: "[]",
                  SelectedTechniques: "[]",
                  SelectedApproaches: "[]",
                  ControlsBaselineJSON: JSON.stringify(defaultArtifact()),
                },
              },
              { op: "createRelationship", type: "HAS_CONTROLS_BASELINE", sourceHid: system.hid, targetHid: "$baseline" },
            ])
          }
        >
          Create Baseline
        </button>
        {(["categorization", "resilience", "survivability", "baseline", "mapping", "validation", "export"] as Mode[]).map((m) => (
          <button key={m} className={`sstpa-button ${mode === m ? "" : "secondary"}`} disabled={!baseline && m !== "categorization"} onClick={() => setMode(m)}>
            {modeLabel(m)}
          </button>
        ))}
        <input className="sstpa-input" style={{ width: 210 }} value={controlFilter} onChange={(e) => setControlFilter(e.target.value)} placeholder="Search Controls" />
        <select className="sstpa-input" style={{ width: 150 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {["Implemented", "Incomplete", "Tailored", "Error"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {baseline && <button className="icon-button" disabled={drawerOpen} onClick={() => openDrawer({ mode: "edit", hid: baseline.hid })}>Open Baseline</button>}
      </div>
      {notice && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          {notice} <button className="icon-button" onClick={() => setNotice(null)}>x</button>
        </div>
      )}
      {!baseline ? (
        <div style={{ padding: "var(--sstpa-sp-4)", color: "var(--sstpa-navy-muted)" }}>No Controls Baseline exists for this SoI.</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <ControlsTable controls={visibleControls} selected={selectedControl?.ControlID ?? ""} onSelect={setSelectedControlId} />
          <main style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {mode === "categorization" && (
              <CategorizationView baseline={baseline} artifact={artifact} findings={findings} onSave={(next, props) => saveArtifact(next, props)} />
            )}
            {mode === "resilience" && (
              <ResilienceView artifact={artifact} onSave={saveArtifact} />
            )}
            {mode === "survivability" && (
              <SurvivabilityView artifact={artifact} assets={assets} losses={losses} controls={controls} onSave={saveArtifact} />
            )}
            {mode === "baseline" && (
              <BaselineView
                artifact={artifact}
                controls={controls}
                selectedControl={selectedControl}
                onSelect={setSelectedControlId}
                onSave={saveArtifact}
              />
            )}
            {mode === "mapping" && selectedControl && (
              <MappingView
                artifact={artifact}
                selectedControl={selectedControl}
                mappedNode={mappedNode}
                controls={controls}
                countermeasures={countermeasures}
                requirements={requirements}
                securityNode={securityNode}
                targets={{ states, functions, interfaces, components }}
                drawerOpen={drawerOpen}
                onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })}
                onSave={saveArtifact}
                onCommit={(ops) => commit.mutate(ops)}
                onCreateMappedControl={(ops) =>
                  commit.mutate(ops, {
                    onSuccess: (res) => {
                      const hid = res.createdNodes.ctrl;
                      if (!hid) return;
                      saveArtifact({
                        ...artifact,
                        controls: artifact.controls.map((c) =>
                          c.ControlID === selectedControl.ControlID
                            ? { ...c, MappedControl: hid, Status: "Incomplete" }
                            : c,
                        ),
                      });
                    },
                  })
                }
              />
            )}
            {mode === "validation" && <ValidationView findings={findings} onSelectControl={setSelectedControlId} onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })} />}
            {mode === "export" && <ExportView baseline={baseline} artifact={syncControlStatus(artifact, byHid)} findings={findings} controls={controls} />}
          </main>
          <SummaryPanel baseline={baseline} artifact={artifact} findings={findings} mappedNode={mappedNode} onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })} />
        </div>
      )}
    </div>
  );
}

function ControlsTable({ controls, selected, onSelect }: { controls: BaselineControl[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <aside style={{ width: 360, borderRight: "var(--sstpa-border)", overflow: "auto", background: "var(--sstpa-ivory-raised)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
        <thead style={{ position: "sticky", top: 0, background: "var(--sstpa-ivory-raised)", zIndex: 1 }}>
          <tr>
            <th style={thStyle}>Control ID</th>
            <th style={thStyle}>Source</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {controls.map((control) => (
            <tr
              key={control.ControlID}
              onClick={() => onSelect(control.ControlID)}
              style={{
                cursor: "pointer",
                background: selected === control.ControlID ? "rgba(191, 163, 92, 0.22)" : statusColor(control),
                borderBottom: "1px solid var(--sstpa-line-soft)",
              }}
            >
              <td style={tdStyle}>
                <strong>{control.ControlID}</strong>
                <div style={{ color: "var(--sstpa-navy-muted)" }}>{control.ControlName}</div>
              </td>
              <td style={tdStyle}>{control.Source.join(", ")}</td>
              <td style={tdStyle}>{control.Status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {controls.length === 0 && <p style={{ padding: 12, color: "var(--sstpa-navy-muted)" }}>No controls in the current view.</p>}
    </aside>
  );
}

function CategorizationView({
  baseline,
  artifact,
  findings,
  onSave,
}: {
  baseline: SoINode;
  artifact: BaselineArtifact;
  findings: Finding[];
  onSave: (next: BaselineArtifact, props: Record<string, unknown>) => void;
}) {
  const [impact, setImpact] = useState(artifact.categorization);
  const [overlays, setOverlays] = useState(readStringArray(baseline.properties.OverlayIDs).join(", "));
  const [overlayRationale, setOverlayRationale] = useState(String(baseline.properties.OverlayRationale ?? ""));
  const [status, setStatus] = useState<BaselineStatus>(String(baseline.properties.BaselineStatus ?? "DRAFT") as BaselineStatus);

  useEffect(() => {
    setImpact(artifact.categorization);
    setOverlays(readStringArray(baseline.properties.OverlayIDs).join(", "));
    setOverlayRationale(String(baseline.properties.OverlayRationale ?? ""));
    setStatus(String(baseline.properties.BaselineStatus ?? "DRAFT") as BaselineStatus);
  }, [artifact, baseline]);

  const nextArtifact = (): BaselineArtifact => ({
    ...artifact,
    categorization: impact,
    overlays: splitList(overlays),
  });

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {(["ConfidentialityImpact", "IntegrityImpact", "AvailabilityImpact"] as const).map((k) => (
          <label key={k} style={labelStyle}>{label(k)}
            <select className="sstpa-input" value={impact[k]} onChange={(e) => setImpact((x) => ({ ...x, [k]: e.target.value as Impact }))}>
              {IMPACTS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}
        <label style={labelStyle}>Baseline Status
          <select className="sstpa-input" value={status} onChange={(e) => setStatus(e.target.value as BaselineStatus)}>
            {STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>
      <label style={labelStyle}>Categorization Rationale
        <textarea className="sstpa-input" rows={4} value={impact.CategorizationRationale} onChange={(e) => setImpact((x) => ({ ...x, CategorizationRationale: e.target.value }))} />
      </label>
      <label style={labelStyle}>Overlay IDs
        <input className="sstpa-input" value={overlays} onChange={(e) => setOverlays(e.target.value)} />
      </label>
      <label style={labelStyle}>Overlay Rationale
        <textarea className="sstpa-input" rows={3} value={overlayRationale} onChange={(e) => setOverlayRationale(e.target.value)} />
      </label>
      <button
        className="sstpa-button"
        onClick={() =>
          onSave(nextArtifact(), {
            ConfidentialityImpact: impact.ConfidentialityImpact,
            IntegrityImpact: impact.IntegrityImpact,
            AvailabilityImpact: impact.AvailabilityImpact,
            CategorizationRationale: impact.CategorizationRationale,
            OverlayIDs: JSON.stringify(splitList(overlays)),
            OverlayRationale: overlayRationale,
            BaselineStatus: status,
          })
        }
      >
        Commit Categorization
      </button>
      <ValidationSummary findings={findings} />
    </div>
  );
}

function ResilienceView({ artifact, onSave }: { artifact: BaselineArtifact; onSave: (next: BaselineArtifact) => void }) {
  const [draft, setDraft] = useState<ResilienceEntry>(emptyResilience);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const commitEntry = () => {
    if (!draft.ApproachID.trim()) return;
    const next = [...artifact.resilience];
    if (editIndex == null) next.push(draft);
    else next[editIndex] = draft;
    const controlIds = new Set(draft.RelatedControlIDs);
    onSave({
      ...artifact,
      resilience: next,
      controls: mergeSourceForControls(artifact.controls, [...controlIds], "CyberResilience", draft.ApproachID),
    });
    setDraft(emptyResilience);
    setEditIndex(null);
  };
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)", display: "grid", gridTemplateColumns: "minmax(280px, 420px) 1fr", gap: 16 }}>
      <div>
        {["ApproachID", "ApproachName", "PrincipleID", "TechniqueID", "UserStrategy", "UserImplementationApproach", "UserRationale", "Assumptions", "ResidualConcerns"].map((k) => (
          <label key={k} style={labelStyle}>{label(k)}
            <textarea className="sstpa-input" rows={k.startsWith("User") || k === "Assumptions" || k === "ResidualConcerns" ? 2 : 1} value={String(draft[k as keyof ResilienceEntry] ?? "")} onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.value }))} />
          </label>
        ))}
        <label style={labelStyle}>Related Control IDs
          <input className="sstpa-input" value={draft.RelatedControlIDs.join(", ")} onChange={(e) => setDraft((x) => ({ ...x, RelatedControlIDs: splitList(e.target.value) }))} />
        </label>
        <button className="sstpa-button" disabled={!draft.ApproachID.trim()} onClick={commitEntry}>{editIndex == null ? "Add Approach" : "Update Approach"}</button>
      </div>
      <div style={{ overflow: "auto" }}>
        {artifact.resilience.map((entry, i) => (
          <div key={`${entry.ApproachID}-${i}`} className="entity-card" style={{ marginBottom: 8 }}>
            <div className="entity-card-header">
              <span className="entity-hid">{entry.ApproachID}</span>
              <span className="type-badge">{entry.RelatedControlIDs.length} controls</span>
            </div>
            <strong>{entry.ApproachName}</strong>
            <div style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.72rem" }}>{entry.UserStrategy}</div>
            <button className="icon-button" onClick={() => { setDraft(entry); setEditIndex(i); }}>Edit</button>
            <button className="icon-button danger" onClick={() => onSave({ ...artifact, resilience: artifact.resilience.filter((_, idx) => idx !== i) })}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SurvivabilityView({
  artifact,
  assets,
  losses,
  controls,
  onSave,
}: {
  artifact: BaselineArtifact;
  assets: SoINode[];
  losses: SoINode[];
  controls: SoINode[];
  onSave: (next: BaselineArtifact, props?: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState<CSAEntry>(emptyCSA);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const commitEntry = () => {
    if (!draft.CSAID.trim()) return;
    const next = [...artifact.survivability];
    if (editIndex == null) next.push(draft);
    else next[editIndex] = draft;
    onSave(
      {
        ...artifact,
        survivability: next,
        controls: mergeSourceForControls(artifact.controls, draft.RelatedControlHIDs, "CSA", draft.CSAID),
      },
      { SelectedCSA: JSON.stringify(next) },
    );
    setDraft(emptyCSA);
    setEditIndex(null);
  };
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)", display: "grid", gridTemplateColumns: "minmax(280px, 420px) 1fr", gap: 16 }}>
      <div>
        {["CSAID", "CSAName", "Description", "UserApplicabilityStatement", "UserImplementationDescription"].map((k) => (
          <label key={k} style={labelStyle}>{label(k)}
            <textarea className="sstpa-input" rows={k.startsWith("User") || k === "Description" ? 3 : 1} value={String(draft[k as keyof CSAEntry] ?? "")} onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.value }))} />
          </label>
        ))}
        <EntityMulti labelText="Related Assets" nodes={assets} values={draft.RelatedAssetHIDs} onChange={(v) => setDraft((x) => ({ ...x, RelatedAssetHIDs: v }))} />
        <EntityMulti labelText="Related Losses" nodes={losses} values={draft.RelatedLossHIDs} onChange={(v) => setDraft((x) => ({ ...x, RelatedLossHIDs: v }))} />
        <EntityMulti labelText="Related Controls" nodes={controls} values={draft.RelatedControlHIDs} onChange={(v) => setDraft((x) => ({ ...x, RelatedControlHIDs: v }))} />
        <button className="sstpa-button" disabled={!draft.CSAID.trim()} onClick={commitEntry}>{editIndex == null ? "Add CSA" : "Update CSA"}</button>
      </div>
      <div style={{ overflow: "auto" }}>
        {artifact.survivability.map((entry, i) => (
          <div key={`${entry.CSAID}-${i}`} className="entity-card" style={{ marginBottom: 8 }}>
            <div className="entity-card-header">
              <span className="entity-hid">{entry.CSAID}</span>
              <span className="type-badge">{entry.RelatedAssetHIDs.length + entry.RelatedLossHIDs.length} traces</span>
            </div>
            <strong>{entry.CSAName}</strong>
            <div style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.72rem" }}>{entry.UserApplicabilityStatement}</div>
            <button className="icon-button" onClick={() => { setDraft(entry); setEditIndex(i); }}>Edit</button>
            <button className="icon-button danger" onClick={() => onSave({ ...artifact, survivability: artifact.survivability.filter((_, idx) => idx !== i) }, { SelectedCSA: JSON.stringify(artifact.survivability.filter((_, idx) => idx !== i)) })}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BaselineView({
  artifact,
  controls,
  selectedControl,
  onSelect,
  onSave,
}: {
  artifact: BaselineArtifact;
  controls: SoINode[];
  selectedControl?: BaselineControl;
  onSelect: (id: string) => void;
  onSave: (next: BaselineArtifact) => void;
}) {
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualSource, setManualSource] = useState("UserAdded");
  const [refText, setRefText] = useState("");
  const refSearch = useQuery({
    queryKey: ["controls-ref-search", refText],
    queryFn: () => api.referenceSearch({ text: refText, limit: "80" }),
    enabled: refText.length >= 2,
  });
  const refs = (refSearch.data?.results ?? []).filter((r) => r.labels.some((l) => l === "NIST_Control" || l === "NIST_Enhancement"));
  const addControl = (entry: BaselineControl) => {
    onSave({ ...artifact, controls: upsertControl(artifact.controls, entry) });
    onSelect(entry.ControlID);
  };
  const importExistingControls = () => {
    const next = controls.reduce((acc, ctrl) => upsertControl(acc, controlFromCore(ctrl, "UserAdded")), artifact.controls);
    onSave({ ...artifact, controls: next });
  };
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 380px) 1fr", gap: 16 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Add Baseline Control</h3>
          <label style={labelStyle}>Control ID<input className="sstpa-input" value={manualId} onChange={(e) => setManualId(e.target.value)} /></label>
          <label style={labelStyle}>Control Name<input className="sstpa-input" value={manualName} onChange={(e) => setManualName(e.target.value)} /></label>
          <label style={labelStyle}>Source
            <select className="sstpa-input" value={manualSource} onChange={(e) => setManualSource(e.target.value)}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button className="sstpa-button" disabled={!manualId.trim()} onClick={() => addControl(newControl(manualId, manualName || manualId, manualSource))}>Add Control</button>
          <button className="sstpa-button secondary" style={{ marginLeft: 6 }} onClick={importExistingControls}>Import Core Controls</button>
          <label style={labelStyle}>Reference Search<input className="sstpa-input" value={refText} onChange={(e) => setRefText(e.target.value)} /></label>
          <div style={{ maxHeight: 280, overflow: "auto" }}>
            {refs.map((r) => (
              <button key={r.uuid} className="entity-card" style={{ width: "100%", textAlign: "left", marginBottom: 6 }} onClick={() => addControl(controlFromReference(r, "UserAdded"))}>
                <div className="entity-card-header">
                  <span className="entity-hid">{r.externalId}</span>
                  <span className="type-badge">{r.labels.find((l) => l.startsWith("NIST_")) ?? "NIST"}</span>
                </div>
                <strong>{r.name}</strong>
              </button>
            ))}
          </div>
        </div>
        <ControlEditor artifact={artifact} selectedControl={selectedControl} onSave={onSave} />
      </div>
    </div>
  );
}

function ControlEditor({ artifact, selectedControl, onSave }: { artifact: BaselineArtifact; selectedControl?: BaselineControl; onSave: (next: BaselineArtifact) => void }) {
  const [tailorReason, setTailorReason] = useState("");
  const [parameters, setParameters] = useState("");
  useEffect(() => {
    setTailorReason(selectedControl?.TailorReason ?? "");
    setParameters(selectedControl?.ParameterValues ?? "");
  }, [selectedControl]);
  if (!selectedControl) return <p style={{ color: "var(--sstpa-navy-muted)" }}>Select a control row.</p>;
  const update = (patch: Partial<BaselineControl>) => {
    onSave({ ...artifact, controls: artifact.controls.map((c) => c.ControlID === selectedControl.ControlID ? { ...c, ...patch } : c) });
  };
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{selectedControl.ControlID} {selectedControl.ControlName}</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {selectedControl.Source.map((s) => <span key={s} className="type-badge">{s}</span>)}
      </div>
      <label style={labelStyle}>
        <input type="checkbox" checked={selectedControl.Selected} onChange={(e) => update({ Selected: e.target.checked })} /> Selected
      </label>
      <label style={labelStyle}>
        <input type="checkbox" checked={selectedControl.TailoredOut} onChange={(e) => update({ TailoredOut: e.target.checked, Status: e.target.checked ? "Tailored" : selectedControl.MappedControl ? "Implemented" : "Incomplete" })} /> Tailored Out
      </label>
      <label style={labelStyle}>Tailor Reason
        <textarea className="sstpa-input" rows={3} value={tailorReason} onChange={(e) => setTailorReason(e.target.value)} onBlur={() => update({ TailorReason: tailorReason })} />
      </label>
      <label style={labelStyle}>Parameter Values
        <textarea className="sstpa-input" rows={2} value={parameters} onChange={(e) => setParameters(e.target.value)} onBlur={() => update({ ParameterValues: parameters })} />
      </label>
      <button className="sstpa-button danger" onClick={() => onSave({ ...artifact, controls: artifact.controls.filter((c) => c.ControlID !== selectedControl.ControlID) })}>Remove Control</button>
    </div>
  );
}

function MappingView({
  artifact,
  selectedControl,
  mappedNode,
  controls,
  countermeasures,
  requirements,
  securityNode,
  targets,
  drawerOpen,
  onOpenDrawer,
  onSave,
  onCommit,
  onCreateMappedControl,
}: {
  artifact: BaselineArtifact;
  selectedControl: BaselineControl;
  mappedNode?: SoINode;
  controls: SoINode[];
  countermeasures: SoINode[];
  requirements: SoINode[];
  securityNode?: SoINode;
  targets: { states: SoINode[]; functions: SoINode[]; interfaces: SoINode[]; components: SoINode[] };
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onSave: (next: BaselineArtifact) => void;
  onCommit: (ops: CommitOperation[]) => void;
  onCreateMappedControl: (ops: CommitOperation[]) => void;
}) {
  const [mapHid, setMapHid] = useState(selectedControl.MappedControl ?? "");
  const [reqHid, setReqHid] = useState("");
  const [cmHid, setCmHid] = useState("");
  const [applyTarget, setApplyTarget] = useState("");
  useEffect(() => setMapHid(selectedControl.MappedControl ?? ""), [selectedControl]);
  const updateRow = (patch: Partial<BaselineControl>) => onSave({ ...artifact, controls: artifact.controls.map((c) => c.ControlID === selectedControl.ControlID ? { ...c, ...patch } : c) });
  const mappedReqs = mappedNode ? relatedNodes(mappedNode, "HAS_REQUIREMENT", new Map(requirements.map((r) => [r.hid, r]))) : [];
  const satisfying = mappedNode ? countermeasures.filter((cm) => (cm.relationships ?? []).some((r) => r.type === "SATISFIES" && r.targetHID === mappedNode.hid)) : [];
  const targetOptions = [...targets.functions, ...targets.interfaces, ...targets.components, ...targets.states];
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)" }}>
      <h3 style={{ marginTop: 0 }}>{selectedControl.ControlID} Mapping</h3>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 380px) 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle}>Existing Security Control
            <select className="sstpa-input" value={mapHid} onChange={(e) => setMapHid(e.target.value)}>
              <option value="">Unmapped</option>
              {controls.map((c) => <option key={c.hid} value={c.hid}>{c.hid} - {String(c.properties.ReferenceID ?? c.properties.Name ?? "")}</option>)}
            </select>
          </label>
          <button className="sstpa-button" disabled={!mapHid} onClick={() => updateRow({ MappedControl: mapHid, Status: "Implemented" })}>Map Existing</button>
          <button
            className="sstpa-button secondary"
            style={{ marginLeft: 6 }}
            onClick={() => {
              const ops: CommitOperation[] = [
                {
                  op: "createNode",
                  tempId: "ctrl",
                  label: "SecurityControl",
                  properties: {
                    Name: selectedControl.ControlName || selectedControl.ControlID,
                    ControlStatement: selectedControl.ControlName,
                    SatisfactionStatement: "TBD",
                    ReferenceID: selectedControl.ControlID,
                    ReferenceFramework: "Controls Baseline",
                    EvidenceOfImplementation: "",
                  },
                },
              ];
              if (securityNode) ops.push({ op: "createRelationship", type: "HAS_CONTROL", sourceHid: securityNode.hid, targetHid: "$ctrl" });
              onCreateMappedControl(ops);
            }}
          >
            Create Core Control
          </button>
          {mappedNode && (
            <button className="sstpa-button secondary" style={{ marginLeft: 6 }} disabled={drawerOpen} onClick={() => onOpenDrawer(mappedNode.hid)}>Open Control</button>
          )}

          <h4>Requirements</h4>
          {mappedReqs.map((r) => (
            <div key={r.hid} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <button className="icon-button" onClick={() => onOpenDrawer(r.hid)}>{r.hid}</button>
              <span style={{ flex: 1, fontSize: "0.74rem" }}>{String(r.properties.Name ?? "")}</span>
              {mappedNode && <button className="icon-button danger" onClick={() => onCommit([{ op: "deleteRelationship", type: "HAS_REQUIREMENT", sourceHid: mappedNode.hid, targetHid: r.hid }])}>Remove</button>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <select className="sstpa-input" value={reqHid} onChange={(e) => setReqHid(e.target.value)}>
              <option value="">Existing Requirement</option>
              {requirements.map((r) => <option key={r.hid} value={r.hid}>{r.hid} - {String(r.properties.Name ?? "")}</option>)}
            </select>
            <button className="sstpa-button" disabled={!mappedNode || !reqHid} onClick={() => onCommit([{ op: "createRelationship", type: "HAS_REQUIREMENT", sourceHid: mappedNode!.hid, targetHid: reqHid }])}>Add</button>
          </div>
          <button
            className="sstpa-button secondary"
            style={{ marginTop: 6 }}
            disabled={!mappedNode}
            onClick={() =>
              mappedNode &&
              onCommit([
                { op: "createNode", tempId: "req", label: "Requirement", properties: { Name: `${selectedControl.ControlID} Requirement`, RStatement: `${selectedControl.ControlName} SHALL be implemented.`, Orphan: true, Barren: true } },
                { op: "createRelationship", type: "HAS_REQUIREMENT", sourceHid: mappedNode.hid, targetHid: "$req" },
              ])
            }
          >
            New Requirement
          </button>
        </div>
        <div>
          <h4>Countermeasures</h4>
          {satisfying.map((cm) => (
            <div key={cm.hid} className="entity-card" style={{ marginBottom: 6 }}>
              <div className="entity-card-header">
                <span className="entity-hid">{cm.hid}</span>
                <button className="icon-button" onClick={() => onOpenDrawer(cm.hid)}>Open</button>
              </div>
              <strong>{String(cm.properties.Name ?? "")}</strong>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <select className="sstpa-input" value={cmHid} onChange={(e) => setCmHid(e.target.value)}>
              <option value="">Existing Countermeasure</option>
              {countermeasures.map((cm) => <option key={cm.hid} value={cm.hid}>{cm.hid} - {String(cm.properties.Name ?? "")}</option>)}
            </select>
            <button className="sstpa-button" disabled={!mappedNode || !cmHid} onClick={() => onCommit([{ op: "createRelationship", type: "SATISFIES", sourceHid: cmHid, targetHid: mappedNode!.hid }])}>Satisfies</button>
          </div>
          <button
            className="sstpa-button secondary"
            style={{ marginTop: 6 }}
            disabled={!mappedNode}
            onClick={() => {
              if (!mappedNode) return;
              const ops: CommitOperation[] = [
                { op: "createNode", tempId: "cm", label: "Countermeasure", properties: { Name: `${selectedControl.ControlID} Countermeasure`, MetricsJSON: null } },
                { op: "createRelationship", type: "SATISFIES", sourceHid: "$cm", targetHid: mappedNode.hid },
              ];
              if (securityNode) ops.push({ op: "createRelationship", type: "HAS_COUNTERMEASURE", sourceHid: securityNode.hid, targetHid: "$cm" });
              onCommit(ops);
            }}
          >
            New Countermeasure
          </button>
          <h4>Countermeasure Scope</h4>
          <div style={{ display: "flex", gap: 6 }}>
            <select className="sstpa-input" value={applyTarget} onChange={(e) => setApplyTarget(e.target.value)}>
              <option value="">Apply target</option>
              {targetOptions.map((n) => <option key={n.hid} value={n.hid}>{n.hid} - {n.typeName} - {String(n.properties.Name ?? "")}</option>)}
            </select>
            <button
              className="sstpa-button"
              disabled={!cmHid || !applyTarget}
              onClick={() => onCommit([{ op: "createRelationship", type: applyRel(byHidType(applyTarget)), sourceHid: cmHid, targetHid: applyTarget }])}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function byHidType(hid: string): string {
    return targetOptions.find((n) => n.hid === hid)?.typeName ?? "";
  }
}

function ValidationView({ findings, onSelectControl, onOpenDrawer }: { findings: Finding[]; onSelectControl: (id: string) => void; onOpenDrawer: (hid: string) => void }) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)" }}>
      {findings.map((f, i) => (
        <div key={i} className="sstpa-alert-warning" style={{ marginBottom: 8 }}>
          <strong>{f.severity}</strong> {f.message}{" "}
          {f.controlId && <button className="icon-button" onClick={() => onSelectControl(f.controlId!)}>{f.controlId}</button>}
          {f.hid && <button className="icon-button" onClick={() => onOpenDrawer(f.hid!)}>{f.hid}</button>}
        </div>
      ))}
      {findings.length === 0 && <p className="state-ok">Controls Baseline validates cleanly.</p>}
    </div>
  );
}

function ExportView({ baseline, artifact, findings, controls }: { baseline: SoINode; artifact: BaselineArtifact; findings: Finding[]; controls: SoINode[] }) {
  const csv = controlsCsv(artifact.controls);
  const kerml = controlsKerml(artifact, controls);
  const json = JSON.stringify({ baseline, artifact, findings }, null, 2);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)" }}>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${baseline.hid}-controls.csv`, csv, "text/csv")}>CSV</button>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${baseline.hid}-controls.kerml`, kerml, "text/plain")}>KerML</button>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${baseline.hid}-controls.json`, json, "application/json")}>JSON</button>
      </div>
      <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "var(--sstpa-sp-3)", whiteSpace: "pre-wrap", fontSize: "0.76rem" }}>{kerml}</pre>
    </div>
  );
}

function SummaryPanel({ baseline, artifact, findings, mappedNode, onOpenDrawer }: { baseline: SoINode; artifact: BaselineArtifact; findings: Finding[]; mappedNode?: SoINode; onOpenDrawer: (hid: string) => void }) {
  const implemented = artifact.controls.filter((c) => c.Status === "Implemented").length;
  const tailored = artifact.controls.filter((c) => c.TailoredOut).length;
  const errors = findings.filter((f) => f.severity === "ERROR").length;
  return (
    <aside style={{ width: 310, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)", background: "var(--sstpa-ivory-raised)" }}>
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>{baseline.hid}</div>
      <h3 style={{ margin: "4px 0 8px" }}>{String(baseline.properties.Name ?? "Controls Baseline")}</h3>
      <div className="entity-card" style={{ marginBottom: 8 }}>
        <div className="entity-card-header"><span>Total</span><strong>{artifact.controls.length}</strong></div>
        <div className="entity-card-header"><span>Implemented</span><strong>{implemented}</strong></div>
        <div className="entity-card-header"><span>Tailored</span><strong>{tailored}</strong></div>
        <div className="entity-card-header"><span>Validation Errors</span><strong>{errors}</strong></div>
      </div>
      <h4>Impacts</h4>
      <div className="mono" style={{ fontSize: "0.72rem" }}>
        C: {artifact.categorization.ConfidentialityImpact}<br />
        I: {artifact.categorization.IntegrityImpact}<br />
        A: {artifact.categorization.AvailabilityImpact}
      </div>
      {mappedNode && (
        <>
          <h4>Mapped Control</h4>
          <button className="entity-card" style={{ width: "100%", textAlign: "left" }} onClick={() => onOpenDrawer(mappedNode.hid)}>
            <div className="entity-hid">{mappedNode.hid}</div>
            <strong>{String(mappedNode.properties.Name ?? "")}</strong>
          </button>
        </>
      )}
    </aside>
  );
}

function EntityMulti({ labelText, nodes, values, onChange }: { labelText: string; nodes: SoINode[]; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <label style={labelStyle}>{labelText}
      <div style={{ maxHeight: 120, overflow: "auto", border: "var(--sstpa-border-soft)", padding: 6 }}>
        {nodes.map((n) => (
          <label key={n.hid} style={{ display: "block", fontSize: "0.72rem" }}>
            <input type="checkbox" checked={values.includes(n.hid)} onChange={(e) => onChange(e.target.checked ? [...values, n.hid] : values.filter((v) => v !== n.hid))} />{" "}
            <span className="mono">{n.hid}</span> {String(n.properties.Name ?? "")}
          </label>
        ))}
      </div>
    </label>
  );
}

function ValidationSummary({ findings }: { findings: Finding[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      {findings.slice(0, 5).map((f, i) => (
        <div key={i} className="sstpa-alert-warning" style={{ marginBottom: 6 }}>
          <strong>{f.severity}</strong> {f.message}
        </div>
      ))}
      {findings.length === 0 && <p className="state-ok">No validation findings.</p>}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: "0.76rem", marginTop: 8 };
const thStyle = { textAlign: "left" as const, padding: "6px 8px", borderBottom: "var(--sstpa-border-soft)" };
const tdStyle = { padding: "6px 8px", verticalAlign: "top" as const };

function defaultArtifact(): BaselineArtifact {
  return {
    schema: "SSTPA-CB-1.0",
    categorization: {
      ConfidentialityImpact: "NONE",
      IntegrityImpact: "NONE",
      AvailabilityImpact: "NONE",
      CategorizationRationale: "",
    },
    overlays: [],
    survivability: [],
    resilience: [],
    controls: [],
  };
}

function parseArtifact(baseline?: SoINode): BaselineArtifact {
  const base = defaultArtifact();
  if (!baseline) return base;
  let parsed: Partial<BaselineArtifact> = {};
  try {
    parsed = JSON.parse(String(baseline.properties.ControlsBaselineJSON ?? "{}")) as Partial<BaselineArtifact>;
  } catch {
    parsed = {};
  }
  return {
    schema: "SSTPA-CB-1.0",
    categorization: {
      ConfidentialityImpact: (baseline.properties.ConfidentialityImpact as Impact) ?? parsed.categorization?.ConfidentialityImpact ?? "NONE",
      IntegrityImpact: (baseline.properties.IntegrityImpact as Impact) ?? parsed.categorization?.IntegrityImpact ?? "NONE",
      AvailabilityImpact: (baseline.properties.AvailabilityImpact as Impact) ?? parsed.categorization?.AvailabilityImpact ?? "NONE",
      CategorizationRationale: String(baseline.properties.CategorizationRationale ?? parsed.categorization?.CategorizationRationale ?? ""),
    },
    overlays: readStringArray(baseline.properties.OverlayIDs).length ? readStringArray(baseline.properties.OverlayIDs) : parsed.overlays ?? [],
    survivability: Array.isArray(parsed.survivability) ? parsed.survivability : readCSAArray(baseline.properties.SelectedCSA),
    resilience: Array.isArray(parsed.resilience) ? parsed.resilience : [],
    controls: Array.isArray(parsed.controls) ? parsed.controls.map(normalizeControl) : [],
  };
}

function normalizeControl(control: Partial<BaselineControl>): BaselineControl {
  return {
    ControlID: String(control.ControlID ?? ""),
    ControlName: String(control.ControlName ?? control.ControlID ?? ""),
    Source: Array.isArray(control.Source) ? control.Source.map(String) : [String(control.Source ?? "UserAdded")],
    Selected: control.Selected !== false,
    TailoredOut: Boolean(control.TailoredOut),
    TailorReason: control.TailorReason ? String(control.TailorReason) : null,
    MappedControl: control.MappedControl ? String(control.MappedControl) : null,
    RequirementCount: Number(control.RequirementCount ?? 0),
    Status: control.Status ?? "Incomplete",
    SelectedBy: Array.isArray(control.SelectedBy) ? control.SelectedBy : [],
    ParameterValues: control.ParameterValues ? String(control.ParameterValues) : null,
    NSSJustification: control.NSSJustification ? String(control.NSSJustification) : null,
    PrivacyImplementationConsiderations: control.PrivacyImplementationConsiderations ? String(control.PrivacyImplementationConsiderations) : null,
    AssuranceFlag: Boolean(control.AssuranceFlag),
    ResiliencyFlag: Boolean(control.ResiliencyFlag),
    ATTACKFlag: Boolean(control.ATTACKFlag),
  };
}

function syncControlStatus(artifact: BaselineArtifact, byHid: Map<string, SoINode>): BaselineArtifact {
  return {
    ...artifact,
    controls: artifact.controls.map((control) => {
      if (control.TailoredOut) return { ...control, Status: "Tailored" };
      const mapped = control.MappedControl ? byHid.get(control.MappedControl) : undefined;
      const reqCount = mapped ? (mapped.relationships ?? []).filter((r) => r.type === "HAS_REQUIREMENT").length : 0;
      if (!mapped) return { ...control, RequirementCount: 0, Status: "Incomplete" };
      return { ...control, RequirementCount: reqCount, Status: reqCount > 0 ? "Implemented" : "Incomplete" };
    }),
  };
}

function validateBaseline(artifact: BaselineArtifact, controls: SoINode[], requirements: SoINode[], byHid: Map<string, SoINode>): Finding[] {
  const findings: Finding[] = [];
  const anyImpact = [artifact.categorization.ConfidentialityImpact, artifact.categorization.IntegrityImpact, artifact.categorization.AvailabilityImpact].some((v) => v !== "NONE");
  if (anyImpact && !artifact.categorization.CategorizationRationale.trim()) findings.push({ severity: "ERROR", message: "Categorization rationale is required when any impact is LOW, MODERATE, or HIGH." });
  for (const control of artifact.controls) {
    if (control.TailoredOut && !String(control.TailorReason ?? "").trim()) findings.push({ severity: "ERROR", controlId: control.ControlID, message: "Tailored controls require a tailoring rationale." });
    if (!control.TailoredOut && !control.MappedControl) findings.push({ severity: "ERROR", controlId: control.ControlID, message: "Selected control is not mapped to a Core SecurityControl." });
    if (control.MappedControl && !controls.some((c) => c.hid === control.MappedControl)) findings.push({ severity: "ERROR", controlId: control.ControlID, hid: control.MappedControl, message: "Mapped SecurityControl no longer exists." });
    const mapped = control.MappedControl ? byHid.get(control.MappedControl) : undefined;
    if (mapped && !(mapped.relationships ?? []).some((r) => r.type === "HAS_REQUIREMENT" && requirements.some((req) => req.hid === r.targetHID))) {
      findings.push({ severity: "WARNING", controlId: control.ControlID, hid: mapped.hid, message: "Mapped SecurityControl has no Requirement." });
    }
  }
  for (const csa of artifact.survivability) {
    if (csa.RelatedAssetHIDs.length === 0 && csa.RelatedLossHIDs.length === 0) findings.push({ severity: "WARNING", message: `${csa.CSAID} has no Asset or Loss traceability.` });
    if (!csa.UserApplicabilityStatement.trim()) findings.push({ severity: "WARNING", message: `${csa.CSAID} has no applicability statement.` });
  }
  for (const entry of artifact.resilience) {
    if (!entry.UserStrategy.trim() || !entry.UserRationale.trim()) findings.push({ severity: "WARNING", message: `${entry.ApproachID} resilience entry is missing strategy or rationale.` });
  }
  return findings;
}

function summarizeFindings(findings: Finding[]): Record<string, number> {
  return {
    errors: findings.filter((f) => f.severity === "ERROR").length,
    warnings: findings.filter((f) => f.severity === "WARNING").length,
  };
}

function findActiveBaseline(system: SoINode | undefined, byHid: Map<string, SoINode>, baselines: SoINode[]): SoINode | undefined {
  const linked = (system?.relationships ?? []).map((r) => r.type === "HAS_CONTROLS_BASELINE" ? byHid.get(r.targetHID) : undefined).filter((n): n is SoINode => !!n && n.typeName === "ControlsBaseline");
  return linked.find((b) => b.properties.IsActive !== false) ?? linked[0] ?? baselines.find((b) => b.properties.IsActive !== false) ?? baselines[0];
}

function findSecurityNode(system: SoINode | undefined, byHid: Map<string, SoINode>, nodes: SoINode[]): SoINode | undefined {
  const perspective = (system?.relationships ?? []).map((r) => r.type === "HAS_PERSPECTIVE" ? byHid.get(r.targetHID) : undefined).find((n): n is SoINode => !!n);
  return (perspective?.relationships ?? []).map((r) => r.type === "HAS_SECURITY" ? byHid.get(r.targetHID) : undefined).find((n): n is SoINode => !!n) ?? nodes.find((n) => n.typeName === "Security");
}

function relatedNodes(node: SoINode, relType: string, byHid: Map<string, SoINode>): SoINode[] {
  return (node.relationships ?? []).filter((r) => r.type === relType).map((r) => byHid.get(r.targetHID)).filter((n): n is SoINode => !!n);
}

function controlFromReference(ref: ReferenceSearchResult, source: string): BaselineControl {
  return newControl(ref.externalId, ref.name, source, [{ Basis: source, ReferenceUUID: ref.uuid, Framework: ref.frameworkName }]);
}

function controlFromCore(node: SoINode, source: string): BaselineControl {
  return {
    ...newControl(String(node.properties.ReferenceID ?? node.hid), String(node.properties.Name ?? node.hid), source, [{ Basis: source, CoreHID: node.hid }]),
    MappedControl: node.hid,
    RequirementCount: (node.relationships ?? []).filter((r) => r.type === "HAS_REQUIREMENT").length,
    Status: (node.relationships ?? []).some((r) => r.type === "HAS_REQUIREMENT") ? "Implemented" : "Incomplete",
  };
}

function newControl(id: string, name: string, source: string, selectedBy?: Record<string, unknown>[]): BaselineControl {
  return {
    ControlID: id.trim(),
    ControlName: name.trim() || id.trim(),
    Source: [source],
    Selected: true,
    TailoredOut: false,
    TailorReason: null,
    MappedControl: null,
    RequirementCount: 0,
    Status: "Incomplete",
    SelectedBy: selectedBy ?? [{ Basis: source }],
  };
}

function upsertControl(controls: BaselineControl[], next: BaselineControl): BaselineControl[] {
  const existing = controls.find((c) => c.ControlID === next.ControlID);
  if (!existing) return [...controls, next];
  return controls.map((c) =>
    c.ControlID === next.ControlID
      ? {
          ...c,
          ControlName: c.ControlName || next.ControlName,
          Source: [...new Set([...c.Source, ...next.Source])],
          SelectedBy: [...c.SelectedBy, ...next.SelectedBy],
          MappedControl: c.MappedControl ?? next.MappedControl,
        }
      : c,
  );
}

function mergeSourceForControls(controls: BaselineControl[], ids: string[], source: string, basis: string): BaselineControl[] {
  return ids.filter(Boolean).reduce((acc, id) => upsertControl(acc, newControl(id, id, source, [{ Basis: source, SourceID: basis }])), controls);
}

function readStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : splitList(raw);
  } catch {
    return splitList(raw);
  }
}

function readCSAArray(raw: unknown): CSAEntry[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as CSAEntry[] : [];
  } catch {
    return [];
  }
}

function splitList(value: string): string[] {
  return value.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
}

function applyRel(typeName: string): string {
  switch (typeName) {
    case "SystemFunction":
      return "APPLIES_TO_FUNCTION";
    case "Interface":
      return "APPLIES_TO_INTERFACE";
    case "Component":
      return "APPLIES_TO_ELEMENT";
    case "State":
      return "APPLIES_TO_STATE";
    default:
      return "APPLIES_TO_ELEMENT";
  }
}

function controlsCsv(controls: BaselineControl[]): string {
  const rows = [["Control ID", "Control Name", "Source", "Selected", "Tailored Out", "Tailor Reason", "Mapped Control", "Requirement Count", "Status"]];
  for (const c of controls) rows.push([c.ControlID, c.ControlName, c.Source.join(";"), String(c.Selected), String(c.TailoredOut), c.TailorReason ?? "", c.MappedControl ?? "", String(c.RequirementCount), c.Status]);
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function controlsKerml(artifact: BaselineArtifact, controls: SoINode[]): string {
  let text = "package SSTPA_Controls_Baseline {\n";
  text += `  metadata categorization = "C:${artifact.categorization.ConfidentialityImpact} I:${artifact.categorization.IntegrityImpact} A:${artifact.categorization.AvailabilityImpact}";\n`;
  for (const control of artifact.controls) {
    const mapped = controls.find((c) => c.hid === control.MappedControl);
    const name = (control.ControlID || "Control").replace(/[^A-Za-z0-9_]/g, "_");
    text += `  requirement ${name} {\n`;
    text += `    metadata source = "${control.Source.join(",")}";\n`;
    text += `    metadata tailoredOut = "${control.TailoredOut}";\n`;
    if (mapped) text += `    metadata coreHID = "${mapped.hid}";\n`;
    text += "  }\n";
  }
  text += "}\n";
  return text;
}

function statusColor(control: BaselineControl): string {
  if (control.TailoredOut || control.Status === "Tailored") return "rgba(180, 180, 180, 0.22)";
  if (control.Status === "Implemented") return "rgba(72, 138, 98, 0.16)";
  if (control.Status === "Error") return "rgba(155, 64, 64, 0.16)";
  return "rgba(191, 163, 92, 0.18)";
}

function modeLabel(mode: Mode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function label(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/CSA/g, "CSA");
}

function downloadText(filename: string, text: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
