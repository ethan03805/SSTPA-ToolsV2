// Main Panel Data Drawer (SRS §6.3.5): the single edit surface of the GUI.
// Slides in from the right without obscuring Branding/Control panels; stages
// all edits; persists only after Commit confirmation; property groups and
// editability are driven by the Backend schema (SRS §3.3.9/§3.3.10).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { CommitResponse, PropertyDef, PropertyGroup } from "../api/types";
import { useDrawer, useSession, useSoI } from "../state/stores";
import { ConfirmDialog } from "./ConfirmDialog";
import { NodeTypeBadge } from "./NodeTypeBadge";

export function DataDrawer() {
  const drawer = useDrawer();
  if (!drawer.open || !drawer.request) return null;
  return (
    <>
      <AnimatePresence>
        <motion.aside
          key="drawer"
          className="data-drawer"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.33, 0.9, 0.35, 1] }}
        >
          <DrawerContent />
        </motion.aside>
      </AnimatePresence>
      {drawer.pendingRequest && (
        <ConfirmDialog
          title="Discard staged changes?"
          confirmLabel="Discard & open"
          danger
          onCancel={drawer.cancelPendingOpen}
          onConfirm={drawer.confirmPendingOpen}
        >
          <p>
            The drawer holds uncommitted staged changes. Opening{" "}
            <span className="mono">
              {drawer.pendingRequest.hid ?? `new ${drawer.pendingRequest.label}`}
            </span>{" "}
            will discard them.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

function DrawerContent() {
  const drawer = useDrawer();
  const req = drawer.request!;
  const soiHid = useSoI((s) => s.soiHid);
  const { user } = useSession();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);

  const isEdit = req.mode === "edit";

  const node = useQuery({
    queryKey: ["node", req.hid],
    queryFn: () => api.nodeByHid(req.hid!),
    enabled: isEdit && !!req.hid,
  });

  const label = isEdit ? (node.data?.typeName ?? "") : (req.label ?? "");

  const schema = useQuery({
    queryKey: ["schema", label],
    queryFn: () => api.schemaNodeType(label),
    enabled: !!label,
  });

  // A pending "Add related node" flow: after the current staged changes are
  // committed, the drawer switches to create mode for the new related node
  // (SRS §6.3.5.5 "open that node in the Data Drawer only after displaying
  // the Commit dialog").
  const [pendingAdd, setPendingAdd] = useState<{
    type: string;
    label: string;
  } | null>(null);

  const commit = useMutation({
    mutationFn: async () => {
      const ops = [];
      if (isEdit) {
        if (Object.keys(drawer.staged).length > 0) {
          ops.push({
            op: "updateNode" as const,
            hid: req.hid!,
            properties: drawer.staged,
          });
        }
        for (const add of drawer.stagedRelAdds) {
          ops.push({
            op: "createRelationship" as const,
            type: add.type,
            sourceHid: req.hid!,
            targetHid: add.targetHid,
          });
        }
        for (const del of drawer.stagedRelDeletes) {
          ops.push({
            op: "deleteRelationship" as const,
            type: del.type,
            sourceHid: req.hid!,
            targetHid: del.targetHid,
          });
        }
      } else {
        ops.push({
          op: "createNode" as const,
          tempId: "new",
          label,
          properties: drawer.staged,
        });
        if (req.linkFrom) {
          ops.push({
            op: "createRelationship" as const,
            type: req.linkFrom.type,
            sourceHid: req.linkFrom.sourceHid,
            targetHid: "$new",
          });
        } else if (label === "System") {
          // Tier-1 system: attach to the Capability root when one exists.
          const hierarchy = await api.hierarchy();
          const cap = (hierarchy.entries ?? []).find(
            (e) => e.typeName === "Project",
          );
          if (cap) {
            ops.push({
              op: "createRelationship" as const,
              type: "HAS_SYSTEM",
              sourceHid: cap.hid,
              targetHid: "$new",
            });
          }
        }
      }
      return api.commit({
        soiHid: soiHid ?? undefined,
        toolId: "gui.datadrawer",
        operations: ops,
      });
    },
    onSuccess: (res) => {
      setConfirming(false);
      setError(null);
      drawer.resetStaged();
      void qc.invalidateQueries({ queryKey: ["soi"] });
      void qc.invalidateQueries({ queryKey: ["hierarchy"] });
      void qc.invalidateQueries({ queryKey: ["node"] });
      if (pendingAdd && isEdit) {
        // Continue the Add flow: the drawer becomes the create surface for
        // the new related node (SRS §6.3.5.5).
        const add = pendingAdd;
        setPendingAdd(null);
        setResult(null);
        drawer.openDrawer({
          mode: "create",
          label: add.label,
          linkFrom: { sourceHid: req.hid!, type: add.type },
        });
        return;
      }
      if (!isEdit && res.createdNodes?.new) {
        // The created node opens for continued editing (SRS §6.3.5.5).
        setResult(res);
        drawer.openDrawer({ mode: "edit", hid: res.createdNodes.new });
        return;
      }
      setResult(res);
    },
    onError: (e) => {
      setConfirming(false);
      setPendingAdd(null);
      setError(e instanceof ApiError ? `${e.message}: ${e.detail ?? ""}` : String(e));
    },
  });

  // Merge staged edits over persisted values for display.
  const currentValue = (name: string): unknown => {
    if (name in drawer.staged) return drawer.staged[name];
    if (isEdit) return node.data?.properties?.[name];
    return undefined;
  };

  const groups: PropertyGroup[] = useMemo(() => {
    if (!schema.data) return [];
    return [
      ...(schema.data.commonPropertyGroups ?? []),
      ...(schema.data.propertyGroups ?? []),
    ];
  }, [schema.data]);

  const ownedByOther =
    isEdit &&
    node.data &&
    String(node.data.properties.Owner ?? "") !== user?.userName &&
    String(node.data.properties.Owner ?? "") !== "";

  const title = isEdit
    ? String(node.data?.properties?.Name ?? req.hid)
    : `New ${label || "node"}`;

  // Orphan assessment (SRS §6.3.5.5): a staged relationship removal whose
  // target would keep no other relationship is flagged before Commit.
  const orphanRisks = useOrphanRisks(req.hid, drawer.stagedRelDeletes);

  // Add flow entry point: stage nothing; if dirty, the Commit dialog runs
  // first (SRS §6.3.5.5), otherwise switch straight to create mode.
  const beginAdd = (type: string, targetLabel: string) => {
    if (!isEdit) return;
    if (drawer.dirty) {
      setPendingAdd({ type, label: targetLabel });
      setConfirming(true);
    } else {
      drawer.openDrawer({
        mode: "create",
        label: targetLabel,
        linkFrom: { sourceHid: req.hid!, type },
      });
    }
  };

  return (
    <>
      <div className="drawer-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {label && <NodeTypeBadge typeName={label} />}
          <span className="drawer-title">{title}</span>
          <span style={{ flex: 1 }} />
          <button
            className="sstpa-button"
            style={{ padding: "2px 12px" }}
            disabled={!drawer.dirty || commit.isPending}
            onClick={() => setConfirming(true)}
          >
            Commit
          </button>
          <button
            className="sstpa-button secondary"
            style={{ padding: "2px 12px" }}
            title="Discard staged changes and close"
            onClick={() => {
              drawer.resetStaged();
              drawer.closeDrawer();
            }}
          >
            Cancel
          </button>
          <button
            className="icon-button"
            title="Close"
            onClick={drawer.closeDrawer}
          >
            ✕
          </button>
        </div>
        {isEdit && <div className="entity-hid mono">{req.hid}</div>}
      </div>

      <div className="drawer-body">
        {error && <div className="sstpa-alert-warning">{error}</div>}
        {result && (
          <div className="sstpa-alert-success">
            Commit {result.commitId.slice(0, 8)} succeeded: {result.nodesChanged}{" "}
            node(s), {result.relationshipsChanged} relationship(s) changed
            {result.messagesGenerated > 0 &&
              `; ${result.messagesGenerated} owner notification(s) sent to ${(result.recipientsNotified ?? []).join(", ")}`}
            .
            <button
              className="icon-button"
              style={{ float: "right" }}
              title="Dismiss"
              onClick={() => setResult(null)}
            >
              ✕
            </button>
          </div>
        )}
        {node.isError && isEdit && (
          <div className="sstpa-alert-warning">
            Could not load {req.hid}: {String(node.error)}
          </div>
        )}
        {schema.isLoading && <p>Loading schema…</p>}
        {schema.isError && (
          <div className="sstpa-alert-warning">
            Could not load the {label} schema: {String(schema.error)}
          </div>
        )}
        {groups.map((g) => (
          <DrawerPropertyGroup
            key={g.groupName}
            group={g}
            currentValue={currentValue}
            isCreate={!isEdit}
            isAdmin={user?.isAdmin ?? false}
          />
        ))}
        {isEdit && node.data && (
          <DrawerRelationships hid={req.hid!} label={label} onAdd={beginAdd} />
        )}
      </div>

      <div className="drawer-footer">
        <span style={{ fontSize: "0.75rem", color: "var(--sstpa-navy-muted)" }}>
          {Object.keys(drawer.staged).length} property change(s),{" "}
          {drawer.stagedRelAdds.length} association(s),{" "}
          {drawer.stagedRelDeletes.length} removal(s) staged
        </span>
        <span style={{ flex: 1 }} />
        {drawer.dirty && (
          <span style={{ fontSize: "0.75rem", color: "var(--sstpa-status-warn)" }}>
            Uncommitted changes
          </span>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title="Commit changes?"
          confirmLabel={commit.isPending ? "Committing…" : "Commit"}
          confirmDisabled={commit.isPending}
          onCancel={() => {
            if (!commit.isPending) {
              setConfirming(false);
              setPendingAdd(null);
            }
          }}
          onConfirm={() => {
            if (!commit.isPending) commit.mutate();
          }}
        >
          <p>
            {Object.keys(drawer.staged).length} propert
            {Object.keys(drawer.staged).length === 1 ? "y" : "ies"} staged
            {drawer.stagedRelAdds.length > 0 &&
              `, ${drawer.stagedRelAdds.length} association(s)`}
            {drawer.stagedRelDeletes.length > 0 &&
              `, ${drawer.stagedRelDeletes.length} relationship removal(s)`}
            . Changes are validated by the Backend before commit.
          </p>
          {pendingAdd && (
            <p>
              After this commit, the drawer opens a new {pendingAdd.label} to
              associate via [:{pendingAdd.type}].
            </p>
          )}
          {orphanRisks.length > 0 && (
            <div className="sstpa-alert-warning">
              Removing these relationships leaves node(s) with no remaining
              relationship (orphaned): {orphanRisks.join(", ")}. Review them
              after committing — orphaned nodes may warrant deletion.
            </div>
          )}
          {ownedByOther && (
            <div className="sstpa-alert-warning">
              This node is owned by{" "}
              {String(node.data?.properties.Owner ?? "another user")}. Owner
              notification messages will be generated, and ownership will
              transfer to you (SRS §3.3.9.1).
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/** Identify staged relationship removals whose target node would be left
 *  with no relationship at all within the current SoI (SRS §6.3.5.5). */
function useOrphanRisks(
  hid: string | undefined,
  stagedRelDeletes: { type: string; targetHid: string }[],
): string[] {
  const soiHid = useSoI((s) => s.soiHid);
  const soi = useQuery({
    queryKey: ["soi", soiHid],
    queryFn: () => api.soi(soiHid!),
    enabled: !!soiHid && stagedRelDeletes.length > 0,
  });
  return useMemo(() => {
    if (!hid || stagedRelDeletes.length === 0 || !soi.data?.nodes) return [];
    const nodes = soi.data.nodes;
    // Count each node's total relationship degree (in + out) inside the SoI.
    const degree = new Map<string, number>();
    for (const n of nodes) {
      for (const rel of n.relationships ?? []) {
        degree.set(n.hid, (degree.get(n.hid) ?? 0) + 1);
        degree.set(rel.targetHID, (degree.get(rel.targetHID) ?? 0) + 1);
      }
    }
    const out: string[] = [];
    for (const del of stagedRelDeletes) {
      if ((degree.get(del.targetHid) ?? 0) <= 1) out.push(del.targetHid);
    }
    return out;
  }, [hid, stagedRelDeletes, soi.data]);
}

function DrawerPropertyGroup({
  group,
  currentValue,
  isCreate,
  isAdmin,
}: {
  group: PropertyGroup;
  currentValue: (name: string) => unknown;
  isCreate: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(true);
  const stageProperty = useDrawer((s) => s.stageProperty);

  const editable = (p: PropertyDef): boolean => {
    const e = p.edit?.toLowerCase() ?? "fixed";
    if (e.startsWith("edit")) return true;
    if (e.includes("admin")) return isAdmin;
    // fixed properties are set by the system; on create the user still can't
    // provide them (HID, uuid, timestamps are backend-assigned).
    return false;
  };

  return (
    <div className="prop-group">
      <div
        className="prop-group-header"
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <span>{open ? "▾" : "▸"}</span>
        {group.groupName}
      </div>
      {open && (
        <div className="prop-group-body">
          {group.properties.map((p) => {
            const value = currentValue(p.name);
            const display =
              value === undefined || value === null || value === ""
                ? "Null"
                : String(value);
            const canEdit = editable(p);
            if (!canEdit && isCreate) return null;
            return (
              <div className="prop-row" key={p.name}>
                <label className="prop-label" title={p.name}>
                  {p.displayName?.replace(/:\s*$/, "") || p.name}
                </label>
                {canEdit ? (
                  <PropertyEditor
                    def={p}
                    value={value}
                    onChange={(v) => stageProperty(p.name, v)}
                  />
                ) : (
                  <span className="prop-value fixed">{display}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PropertyEditor({
  def,
  value,
  onChange,
}: {
  def: PropertyDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = def.type?.toLowerCase() ?? "string";
  if (t === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (t === "enum" && def.enumValues && def.enumValues.length > 0) {
    return (
      <select
        className="sstpa-input"
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">Null</option>
        {def.enumValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }
  if (t === "integer" || t === "float") {
    return (
      <input
        className="sstpa-input"
        type="number"
        step={t === "integer" ? 1 : "any"}
        value={value == null ? "" : String(value)}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? null
              : t === "integer"
                ? parseInt(e.target.value, 10)
                : parseFloat(e.target.value),
          )
        }
      />
    );
  }
  const s = value == null ? "" : String(value);
  if (s.length > 60 || t === "json") {
    return (
      <textarea
        className="sstpa-input"
        rows={3}
        value={s}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      />
    );
  }
  return (
    <input
      className="sstpa-input"
      value={s}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    />
  );
}

/** Relationship groups in the drawer (SRS §6.3.5.5): related nodes with
 *  HID/Name/ShortDescription, Add / Associate / Remove actions, transition
 *  property display, and out-of-SoI navigation alerts (§6.3.5.8). */
function DrawerRelationships({
  hid,
  label,
  onAdd,
}: {
  hid: string;
  label: string;
  onAdd: (type: string, targetLabel: string) => void;
}) {
  const soiHid = useSoI((s) => s.soiHid);
  const drawer = useDrawer();
  const [alertHid, setAlertHid] = useState<string | null>(null);
  const [associating, setAssociating] = useState<string | null>(null); // "TYPE→Label"

  const soi = useQuery({
    queryKey: ["soi", soiHid],
    queryFn: () => api.soi(soiHid!),
    enabled: !!soiHid,
  });
  const relSchema = useQuery({
    queryKey: ["schema-relationships"],
    queryFn: api.schemaRelationships,
    staleTime: Infinity,
  });

  const me = (soi.data?.nodes ?? []).find((n) => n.hid === hid);
  const byHid = new Map((soi.data?.nodes ?? []).map((n) => [n.hid, n]));

  // Authorized outgoing (type, target label) pairs for this node type
  // (SRS §6.3.5.5 relationship groups are schema-driven).
  const allowedPairs = useMemo(() => {
    const rels = relSchema.data?.relationships ?? [];
    return rels.filter(
      (r) => r.source === label && r.type !== "AT_RELATES_TO",
    );
  }, [relSchema.data, label]);

  if (!me) return null;

  const groups = new Map<
    string,
    { targetHid: string; props: Record<string, unknown> }[]
  >();
  for (const rel of me.relationships ?? []) {
    if (!rel.type) continue;
    const list = groups.get(rel.type) ?? [];
    list.push({ targetHid: rel.targetHID, props: rel.props ?? {} });
    groups.set(rel.type, list);
  }
  // Staged (not yet committed) associations appear in their groups.
  for (const add of drawer.stagedRelAdds) {
    const list = groups.get(add.type) ?? [];
    list.push({ targetHid: add.targetHid, props: { __staged: true } });
    groups.set(add.type, list);
  }

  const associateCandidates = (type: string, targetLabel: string) => {
    const existing = new Set(
      (groups.get(type) ?? []).map((t) => t.targetHid),
    );
    return (soi.data?.nodes ?? []).filter(
      (n) =>
        n.typeName === targetLabel && n.hid !== hid && !existing.has(n.hid),
    );
  };

  return (
    <div className="prop-group">
      <div className="prop-group-header">Relationships</div>
      <div className="prop-group-body">
        {groups.size === 0 && (
          <span style={{ fontSize: "0.8rem", color: "var(--sstpa-navy-muted)" }}>
            No outgoing relationships yet — use Add or Associate below.
          </span>
        )}
        {[...groups.entries()].map(([type, targets]) => (
          <div key={type}>
            <div className="rel-name" style={{ marginBottom: 4 }}>
              [:{type}] ({targets.length})
            </div>
            {targets.map(({ targetHid, props }) => {
              const target = byHid.get(targetHid);
              const isStagedAdd = props.__staged === true;
              const pendingDelete = drawer.stagedRelDeletes.some(
                (d) => d.type === type && d.targetHid === targetHid,
              );
              return (
                <div
                  key={targetHid}
                  className="prop-row"
                  style={pendingDelete ? { opacity: 0.45 } : undefined}
                >
                  <span className="prop-value mono" style={{ fontSize: "0.72rem" }}>
                    {targetHid}
                  </span>
                  <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span
                      className="entity-desc"
                      style={{ flex: 1 }}
                      title={
                        target
                          ? String(target.properties.ShortDescription ?? "")
                          : undefined
                      }
                    >
                      {target
                        ? [
                            String(target.properties.Name ?? ""),
                            String(target.properties.ShortDescription ?? ""),
                          ]
                            .filter(Boolean)
                            .join(" — ")
                        : "(outside SoI)"}
                    </span>
                    {!target && !isStagedAdd && (
                      <button
                        className="icon-button"
                        title="Navigate to edit"
                        onClick={() => setAlertHid(targetHid)}
                      >
                        ↗
                      </button>
                    )}
                    {type === "TRANSITIONS_TO" && !isStagedAdd && (
                      <span
                        className="rel-name"
                        style={{ fontSize: "0.62rem" }}
                        title={[
                          `Trigger: ${String(props.Trigger ?? "—")}`,
                          `Guard: ${String(props.GuardCondition ?? "—")}`,
                          `Rationale: ${String(props.Rationale ?? "—")}`,
                          `Countermeasure: ${String(props.RequiredByCountermeasureHID ?? props.RequiredByCountermeasureUUID ?? "—")}`,
                        ].join("\n")}
                      >
                        {String(props.TransitionKind ?? "FUNCTIONAL")}
                      </span>
                    )}
                    {isStagedAdd ? (
                      <>
                        <span
                          className="rel-name"
                          style={{ fontSize: "0.62rem", color: "var(--sstpa-status-warn)" }}
                        >
                          staged
                        </span>
                        <button
                          className="icon-button"
                          title="Unstage this association"
                          onClick={() => drawer.unstageRelAdd(type, targetHid)}
                        >
                          undo
                        </button>
                      </>
                    ) : pendingDelete ? (
                      <button
                        className="icon-button"
                        onClick={() => drawer.unstageRelDelete(type, targetHid)}
                      >
                        undo
                      </button>
                    ) : (
                      <button
                        className="icon-button danger"
                        title="Remove relationship (staged until Commit)"
                        onClick={() => drawer.stageRelDelete(type, targetHid)}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        {allowedPairs.length > 0 && (
          <div style={{ marginTop: 8, borderTop: "1px solid var(--sstpa-line-soft)", paddingTop: 8 }}>
            <div className="rel-name" style={{ marginBottom: 4 }}>
              Add / associate related nodes
            </div>
            {allowedPairs.map((pair) => {
              const key = `${pair.type}→${pair.target}`;
              const candidates = associateCandidates(pair.type, pair.target);
              return (
                <div key={key} className="prop-row">
                  <span className="prop-value" style={{ fontSize: "0.72rem" }}>
                    [:{pair.type}] → {pair.target}
                  </span>
                  <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button
                      className="icon-button"
                      title={`Create a new ${pair.target} linked via [:${pair.type}]`}
                      onClick={() => onAdd(pair.type, pair.target)}
                    >
                      + Add
                    </button>
                    <button
                      className="icon-button"
                      title={`Associate an existing ${pair.target} via [:${pair.type}]`}
                      disabled={candidates.length === 0}
                      onClick={() =>
                        setAssociating(associating === key ? null : key)
                      }
                    >
                      ⇄ Associate
                    </button>
                  </span>
                  {associating === key && (
                    <select
                      className="sstpa-input"
                      style={{ gridColumn: "1 / -1", marginTop: 4 }}
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          drawer.stageRelAdd(pair.type, e.target.value);
                          setAssociating(null);
                        }
                      }}
                    >
                      <option value="" disabled>
                        Select a {pair.target}…
                      </option>
                      {candidates.map((c) => (
                        <option key={c.hid} value={c.hid}>
                          {c.hid} — {String(c.properties.Name ?? "")}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {alertHid && (
        <ConfirmDialog
          title="Outside current SoI"
          confirmLabel="Copy HID"
          onCancel={() => setAlertHid(null)}
          onConfirm={() => {
            void navigator.clipboard.writeText(alertHid);
            setAlertHid(null);
          }}
        >
          <p>
            Navigate to: <span className="mono">{alertHid}</span> to edit. The
            HID can be copied and pasted into the SoI Navigator.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
