// Main Panel (SRS §6.3.4): hierarchical single-window card interface with
// progressive disclosure. Primary Node Type Sections → entity cards →
// relationship groups → secondary/tertiary cards (recursive).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { SoINode } from "../api/types";
import { useDrawer, useSoI } from "../state/stores";
import { NodeTypeBadge, nodeTypeColor } from "./NodeTypeBadge";
import { ConfirmDialog } from "./ConfirmDialog";

/** Primary section order per SRS §6.3.4.2. SecurityControl/Countermeasure
 *  disclose through the Security section's relationship groups (§6.3.4.2);
 *  every node type not named here surfaces in the trailing Analysis section
 *  so the panel presents all SoI data (§6.3.4). */
const SECTIONS: { title: string; labels: string[] }[] = [
  { title: "Environment", labels: ["Environment"] },
  { title: "Connection", labels: ["Connection"] },
  { title: "Interface", labels: ["Interface"] },
  { title: "Function", labels: ["SystemFunction"] },
  { title: "Element", labels: ["Component"] },
  { title: "Purpose", labels: ["Purpose"] },
  { title: "State", labels: ["State"] },
  {
    title: "Views",
    labels: ["Perspective", "FunctionalFlow", "ControlStructure", "UseCase"],
  },
  { title: "Asset", labels: ["Asset", "DerivedAsset"] },
  { title: "Security", labels: ["Security"] },
];

const SECTION_LABELS = new Set(SECTIONS.flatMap((s) => s.labels));

/** Allowed (type → target labels) lookup keyed by source label. */
export type RelTargetLookup = Map<string, Map<string, string[]>>;

export function MainPanel() {
  const soiHid = useSoI((s) => s.soiHid);

  const soiQuery = useQuery({
    queryKey: ["soi", soiHid],
    queryFn: () => api.soi(soiHid!),
    enabled: !!soiHid,
  });

  const relSchema = useQuery({
    queryKey: ["schema-relationships"],
    queryFn: api.schemaRelationships,
    staleTime: Infinity,
  });

  const relTargets: RelTargetLookup = useMemo(() => {
    const m: RelTargetLookup = new Map();
    for (const r of relSchema.data?.relationships ?? []) {
      if (r.type === "AT_RELATES_TO") continue; // Loss Tool exclusive (§3.3.4.11)
      let byType = m.get(r.source);
      if (!byType) {
        byType = new Map();
        m.set(r.source, byType);
      }
      const targets = byType.get(r.type) ?? [];
      if (!targets.includes(r.target)) targets.push(r.target);
      byType.set(r.type, targets);
    }
    return m;
  }, [relSchema.data]);

  const nodesByHid = useMemo(() => {
    const m = new Map<string, SoINode>();
    for (const n of soiQuery.data?.nodes ?? []) m.set(n.hid, n);
    return m;
  }, [soiQuery.data]);

  const analysisNodes = useMemo(
    () =>
      (soiQuery.data?.nodes ?? []).filter(
        (n) => !SECTION_LABELS.has(n.typeName) && n.typeName !== "System",
      ),
    [soiQuery.data],
  );
  const analysisLabels = useMemo(
    () => [...new Set(analysisNodes.map((n) => n.typeName))].sort(),
    [analysisNodes],
  );

  if (!soiHid) {
    return (
      <main className="main-panel">
        <div
          className="sstpa-frame"
          style={{
            padding: "var(--sstpa-sp-8)",
            textAlign: "center",
            color: "var(--sstpa-navy-muted)",
          }}
        >
          <img
            src="/sstpa-logo-large.png"
            alt=""
            style={{ maxWidth: 260, opacity: 0.85 }}
          />
          <p style={{ fontFamily: "var(--sstpa-font-brand)", fontSize: "1.2rem" }}>
            Select a System of Interest to begin
          </p>
          <p style={{ fontSize: "0.85rem" }}>
            Use the Navigator Tool or the System of Interest Panel above.
          </p>
        </div>
      </main>
    );
  }

  if (soiQuery.isLoading) {
    return (
      <main className="main-panel">
        <p style={{ color: "var(--sstpa-navy-muted)" }}>Loading SoI…</p>
      </main>
    );
  }

  if (soiQuery.isError) {
    return (
      <main className="main-panel">
        <div className="sstpa-alert-warning">
          Could not load the System of Interest ({soiHid}):{" "}
          {String(soiQuery.error)}
          <button
            className="sstpa-button secondary"
            style={{ marginLeft: 12, padding: "2px 10px" }}
            onClick={() => void soiQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="main-panel">
      {SECTIONS.map((section) => (
        <NodeTypeSection
          key={section.title}
          title={section.title}
          labels={section.labels}
          nodes={(soiQuery.data?.nodes ?? []).filter((n) =>
            section.labels.includes(n.typeName),
          )}
          nodesByHid={nodesByHid}
          soiHid={soiHid}
          relTargets={relTargets}
        />
      ))}
      {analysisNodes.length > 0 && (
        <NodeTypeSection
          title="Analysis"
          labels={analysisLabels}
          nodes={analysisNodes}
          nodesByHid={nodesByHid}
          soiHid={soiHid}
          relTargets={relTargets}
          creatable={false}
        />
      )}
    </main>
  );
}

function NodeTypeSection({
  title,
  labels,
  nodes,
  nodesByHid,
  soiHid,
  relTargets,
  creatable = true,
}: {
  title: string;
  labels: string[];
  nodes: SoINode[];
  nodesByHid: Map<string, SoINode>;
  soiHid: string;
  relTargets: RelTargetLookup;
  creatable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);

  const toggle = () => setOpen((v) => !v);

  return (
    <section className="node-section" data-open={open}>
      <div
        className="node-section-header"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
      >
        <span style={{ width: 14, textAlign: "center" }}>{open ? "▾" : "▸"}</span>
        <span className="node-section-title">{title}</span>
        <span className="node-count">{nodes.length}</span>
        <span style={{ flex: 1 }} />
        {creatable && (
          <button
            className="icon-button"
            title={`Add a new ${title} node`}
            onClick={(e) => {
              e.stopPropagation();
              requestOpenDrawer({ mode: "create", label: labels[0] });
            }}
          >
            + Add
          </button>
        )}
      </div>
      {open && (
        <div className="node-section-body">
          {nodes.length === 0 && (
            <span style={{ fontSize: "0.8rem", color: "var(--sstpa-navy-muted)" }}>
              No {title} nodes in this SoI.
            </span>
          )}
          {nodes.map((n) => (
            <EntityCard
              key={n.hid}
              node={n}
              nodesByHid={nodesByHid}
              soiHid={soiHid}
              relTargets={relTargets}
              depth={0}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Entity card with recursive relationship-group disclosure
 *  (SRS §6.3.4.3–§6.3.4.6). Depth is bounded to keep traversal finite. */
export function EntityCard({
  node,
  nodesByHid,
  soiHid,
  relTargets,
  depth,
}: {
  node: SoINode;
  nodesByHid: Map<string, SoINode>;
  soiHid: string;
  relTargets: RelTargetLookup;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);
  const qc = useQueryClient();

  const relGroups = useMemo(() => {
    const groups = new Map<string, { targetHid: string; props: Record<string, unknown> }[]>();
    for (const rel of node.relationships ?? []) {
      if (!rel.type) continue;
      const list = groups.get(rel.type) ?? [];
      list.push({ targetHid: rel.targetHID, props: rel.props ?? {} });
      groups.set(rel.type, list);
    }
    return groups;
  }, [node]);

  const props = node.properties;
  const desc = String(props.ShortDescription ?? "");

  // Orphan analysis for the delete dialog (SRS §6.3.4.8): nodes in this SoI
  // whose only incoming relationship is from the node being deleted.
  const orphanCandidates = useMemo(() => {
    if (!confirmDelete) return [];
    const targets = new Set(
      (node.relationships ?? []).map((r) => r.targetHID).filter(Boolean),
    );
    const orphans: string[] = [];
    for (const hid of targets) {
      let incoming = 0;
      let fromMe = 0;
      for (const other of nodesByHid.values()) {
        for (const rel of other.relationships ?? []) {
          if (rel.targetHID === hid) {
            incoming++;
            if (other.hid === node.hid) fromMe++;
          }
        }
      }
      if (fromMe > 0 && incoming - fromMe === 0) orphans.push(hid);
    }
    return orphans;
  }, [confirmDelete, node, nodesByHid]);

  const del = useMutation({
    mutationFn: () =>
      api.commit({
        soiHid,
        toolId: "gui.mainpanel",
        operations: [{ op: "deleteNode", hid: node.hid }],
      }),
    onSuccess: () => {
      setConfirmDelete(false);
      void qc.invalidateQueries({ queryKey: ["soi"] });
      void qc.invalidateQueries({ queryKey: ["hierarchy"] });
    },
  });

  return (
    <div className="entity-card">
      <div className="entity-card-header">
        <button
          className="icon-button"
          style={{ border: "none", padding: "0 2px" }}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <span className="entity-hid">{node.hid}</span>
        <span className="entity-name">{String(props.Name ?? "")}</span>
        <span className="entity-desc">{desc === "null" ? "" : desc}</span>
        <NodeTypeBadge typeName={node.typeName} />
        <div className="entity-actions">
          <button
            className="icon-button"
            title="Edit in Data Drawer"
            onClick={() => requestOpenDrawer({ mode: "edit", hid: node.hid })}
          >
            ✎
          </button>
          <button
            className="icon-button danger"
            title="Delete node"
            onClick={() => setConfirmDelete(true)}
          >
            🗑
          </button>
        </div>
      </div>

      {expanded && depth < 6 && (
        <div style={{ paddingBottom: "var(--sstpa-sp-2)" }}>
          {relGroups.size === 0 && (
            <div
              className="rel-group"
              style={{ fontSize: "0.78rem", color: "var(--sstpa-navy-muted)" }}
            >
              No outgoing relationships.
            </div>
          )}
          {[...relGroups.entries()].map(([relType, targets]) => (
            <RelationshipGroup
              key={relType}
              relType={relType}
              targets={targets}
              nodesByHid={nodesByHid}
              soiHid={soiHid}
              parentNode={node}
              relTargets={relTargets}
              depth={depth}
            />
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${node.hid}?`}
          confirmLabel={del.isPending ? "Deleting…" : "Delete"}
          confirmDisabled={del.isPending}
          danger
          onCancel={() => {
            if (!del.isPending) {
              setConfirmDelete(false);
              del.reset();
            }
          }}
          onConfirm={() => {
            if (!del.isPending) del.mutate();
          }}
        >
          <p>
            Delete <span className="mono">{node.hid}</span> “
            {String(props.Name ?? "")}”? Deletion does not cascade outside the
            current SoI.
          </p>
          {node.typeName === "System" && (
            <div className="sstpa-alert-warning">
              This is a (:System) node — deleting it removes the SoI root.
            </div>
          )}
          {orphanCandidates.length > 0 && (
            <div className="sstpa-alert-warning">
              WARNING: Cancel and Re-Associate the Following Nodes or They will
              be Deleted:
              <ul>
                {orphanCandidates.map((h) => (
                  <li key={h} className="mono">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {del.isError && (
            <div className="sstpa-alert-warning">
              Delete rejected:{" "}
              {del.error instanceof ApiError
                ? `${del.error.message}${del.error.detail ? `: ${del.error.detail}` : ""}`
                : String(del.error)}
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function RelationshipGroup({
  relType,
  targets,
  nodesByHid,
  soiHid,
  parentNode,
  relTargets,
  depth,
}: {
  relType: string;
  targets: { targetHid: string; props: Record<string, unknown> }[];
  nodesByHid: Map<string, SoINode>;
  soiHid: string;
  parentNode: SoINode;
  relTargets: RelTargetLookup;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const [addPicker, setAddPicker] = useState(false);
  const [associatePick, setAssociatePick] = useState<string | null>(null);
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);
  const qc = useQueryClient();

  // Authorized target labels for this (source type, relationship type)
  // (SRS §6.3.4.4 Add / Associate act on schema-valid targets only).
  const allowedTargets =
    relTargets.get(parentNode.typeName)?.get(relType) ?? [];

  const associate = useMutation({
    mutationFn: (targetHid: string) =>
      api.commit({
        soiHid,
        toolId: "gui.mainpanel",
        operations: [
          {
            op: "createRelationship",
            type: relType,
            sourceHid: parentNode.hid,
            targetHid,
          },
        ],
      }),
    onSuccess: () => {
      setAssociatePick(null);
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
  });

  const beginAdd = (label: string) => {
    setAddPicker(false);
    requestOpenDrawer({
      mode: "create",
      label,
      linkFrom: { sourceHid: parentNode.hid, type: relType },
    });
  };

  const existing = new Set(targets.map((t) => t.targetHid));
  const associateCandidates = [...nodesByHid.values()].filter(
    (n) =>
      allowedTargets.includes(n.typeName) &&
      n.hid !== parentNode.hid &&
      !existing.has(n.hid),
  );

  const toggle = () => setOpen((v) => !v);

  return (
    <div className="rel-group">
      <div
        className="rel-group-header"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span className="rel-name">[:{relType}]</span>
        <span className="node-count">{targets.length}</span>
        <span style={{ flex: 1 }} />
        {allowedTargets.length > 0 && (
          <>
            <button
              className="icon-button"
              title="Create a new related node"
              onClick={(e) => {
                e.stopPropagation();
                if (allowedTargets.length === 1) beginAdd(allowedTargets[0]);
                else setAddPicker((v) => !v);
              }}
            >
              + Add
            </button>
            <button
              className="icon-button"
              title="Associate an existing node"
              disabled={associateCandidates.length === 0}
              onClick={(e) => {
                e.stopPropagation();
                setAssociatePick(associatePick === null ? "" : null);
              }}
            >
              ⇄ Associate
            </button>
          </>
        )}
      </div>
      {addPicker && (
        <div style={{ display: "flex", gap: 6, padding: "4px 0" }}>
          {allowedTargets.map((label) => (
            <button
              key={label}
              className="icon-button"
              onClick={() => beginAdd(label)}
            >
              + {label}
            </button>
          ))}
        </div>
      )}
      {associatePick !== null && (
        <div style={{ padding: "4px 0" }}>
          <select
            className="sstpa-input"
            value={associatePick}
            onChange={(e) => setAssociatePick(e.target.value)}
          >
            <option value="" disabled>
              Select a node to associate via [:{relType}]…
            </option>
            {associateCandidates.map((c) => (
              <option key={c.hid} value={c.hid}>
                {c.hid} — {String(c.properties.Name ?? "")} ({c.typeName})
              </option>
            ))}
          </select>
          <button
            className="sstpa-button"
            style={{ marginLeft: 6, padding: "2px 10px" }}
            disabled={!associatePick || associate.isPending}
            onClick={() => associate.mutate(associatePick)}
          >
            {associate.isPending ? "Committing…" : "Commit association"}
          </button>
          {associate.isError && (
            <div className="sstpa-alert-warning" style={{ marginTop: 4 }}>
              {associate.error instanceof ApiError
                ? `${associate.error.message}${associate.error.detail ? `: ${associate.error.detail}` : ""}`
                : String(associate.error)}
            </div>
          )}
        </div>
      )}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
          {targets.map(({ targetHid, props }) => {
            const target = nodesByHid.get(targetHid);
            const kind = String(props?.TransitionKind ?? "");
            return (
              <div key={`${relType}-${targetHid}`}>
                {/* TransitionKind distinction for State TRANSITIONS_TO (§6.3.4.4) */}
                {relType === "TRANSITIONS_TO" && kind && (
                  <span
                    className={`rel-name rel-kind-${kind === "FUNCTIONAL" ? "functional" : kind === "COUNTERMEASURE_REQUIRED" ? "countermeasure" : "both"}`}
                    style={{ fontSize: "0.68rem" }}
                  >
                    {kind}
                  </span>
                )}
                {target ? (
                  <EntityCard
                    node={target}
                    nodesByHid={nodesByHid}
                    soiHid={soiHid}
                    relTargets={relTargets}
                    depth={depth + 1}
                  />
                ) : (
                  <div
                    className="entity-card"
                    style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                  >
                    <span className="entity-hid">{targetHid}</span>{" "}
                    <span style={{ color: "var(--sstpa-navy-muted)" }}>
                      (outside this SoI)
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { nodeTypeColor };
