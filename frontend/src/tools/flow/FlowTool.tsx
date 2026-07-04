// The Flow Tool (SRS §6.5.6): Functional Flow and STPA Control Flow diagrams
// for the current SoI. Functional Flow renders FLOWS_TO_FUNCTION /
// FLOWS_TO_INTERFACE / CONNECTS / PARTICIPATES_IN scoped to the selected
// (:FunctionalFlow) container via its [:CONTAINS] members (plus the layout
// JSON membership list when no membership edges exist yet); STPA Control Flow
// renders the control loop (GENERATES, COMMANDS, PRODUCES, INFORMS, TUNES)
// scoped to the selected (:ControlStructure) with role casting of
// Functions/Interfaces via [:IMPLEMENTS]. Layout persists in
// FunctionalFlowJSON / ControlStructureJSON node properties (§6.5.6.5).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import cytoscape from "cytoscape";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { ToolStatus, errorText, exportPng, exportSvg, usePrompt } from "../shared";

type Mode = "functional" | "stpa";

const STPA_ROLES = ["ControlAlgorithm", "ControlledProcess", "ProcessModel", "ControlAction", "Feedback"];
const LOOP_RELS = ["GENERATES", "COMMANDS", "PRODUCES", "INFORMS", "TUNES", "IMPLEMENTS"];
const FLOW_RELS = ["FLOWS_TO_FUNCTION", "FLOWS_TO_INTERFACE", "CONNECTS", "PARTICIPATES_IN"];
const CS_CHILD_REL: Record<string, string> = {
  ControlAlgorithm: "HAS_CONTROL_ALGORITHM",
  ControlledProcess: "HAS_CONTROLLED_PROCESS",
  ProcessModel: "HAS_PROCESS_MODEL",
  ControlAction: "HAS_CONTROL_ACTION",
  Feedback: "HAS_FEEDBACK",
};
const CS_CHILD_RELS = Object.values(CS_CHILD_REL);
const FUNCTIONAL_TYPES = ["SystemFunction", "Interface", "Connection"];

/** Physical / logical (OSI) flow-nature relationship properties (§6.5.6.7 /
 *  §6.5.6.15). relationships.json defines no properties for the FLOWS_TO_* /
 *  CONNECTS / PARTICIPATES_IN types, so the Backend accepts these as
 *  pass-through relationship properties; the names and enumerations follow
 *  the §3.3.4.4 flow-nature property group on (:SystemFunction)/(:Interface). */
const FLOW_NATURE_PROPS: { name: string; options?: string[] }[] = [
  { name: "RelationshipNature", options: ["PHYSICAL", "LOGICAL", "BOTH"] },
  { name: "PhysicalType" },
  {
    name: "LogicalLayer",
    options: [
      "N/A",
      "Layer 1: Physical",
      "Layer2: Data Link",
      "Layer 3: Network",
      "Layer 4: Transport",
      "Layer 5 Session",
      "Layer 6: Presentation",
      "Layer 7: Application",
    ],
  },
  { name: "Protocol" },
  { name: "FlowDirectionality", options: ["Unidirectional", "Bidirectional", "Multicast"] },
  { name: "TimingClass" },
  { name: "SecurityClass" },
];

/** Authorized Countermeasure application per selected node type (§3.3.4.9). */
const APPLIES_TO: Record<string, string> = {
  SystemFunction: "APPLIES_TO_FUNCTION",
  Interface: "APPLIES_TO_INTERFACE",
  Feedback: "APPLIES_TO_FEEDBACK",
};

/** Node types authorized as [:HAS_REQUIREMENT] sources (§3.3.4.8). */
const REQUIREMENT_SOURCES = ["SystemFunction", "Interface", "Connection", "Countermeasure"];

interface EdgeSel {
  type: string;
  sourceHid: string;
  targetHid: string;
  props: Record<string, unknown>;
  /** True for Feedback edges projected onto cast Functions/Interfaces in
   *  Functional Flow mode (§6.5.6.9); the underlying relationship endpoints
   *  are the STPA role nodes. */
  projected: boolean;
}

type Selection = { kind: "node"; hid: string } | { kind: "edge"; edge: EdgeSel } | null;

interface LayoutDoc {
  positions: Record<string, { x: number; y: number }>;
  members?: string[];
}

export default function FlowTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  // §6.5.6.3: initialize mode from the invoking Data Drawer node (or a
  // cross-tool focus request) and center on it once loaded.
  const focusHid = ctx.drawerNodeHid ?? ctx.focusHid;
  const focusPrefix = focusHid?.split("_")[0] ?? "";
  const initialMode: Mode = ["CS", "CAL", "PM", "CP", "ACT", "FB"].includes(focusPrefix)
    ? "stpa"
    : "functional";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [containerHid, setContainerHid] = useState<string>("");
  const [selection, setSelection] = useState<Selection>(null);
  const [cmFilter, setCmFilter] = useState("");
  const [linking, setLinking] = useState<null | { type: string; source?: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const prompt = usePrompt();
  const qc = useQueryClient();

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const nameOf = (hid: string) => String(byHid.get(hid)?.properties.Name ?? hid);

  const containerLabel = mode === "functional" ? "FunctionalFlow" : "ControlStructure";
  const containers = useMemo(
    () => nodes.filter((n) => n.typeName === containerLabel),
    [nodes, containerLabel],
  );

  // Auto-select a container; when several exist the toolbar select lets the
  // User choose (§6.5.6.3). Prefer the container holding the invoking node.
  useEffect(() => {
    if (containers.length === 0) return;
    if (containers.some((c) => c.hid === containerHid)) return;
    let pick = containers[0];
    if (focusHid) {
      const direct = containers.find((c) => c.hid === focusHid);
      const holding = containers.find((c) =>
        (c.relationships ?? []).some((r) => r.targetHID === focusHid),
      );
      pick = direct ?? holding ?? pick;
    }
    setContainerHid(pick.hid);
  }, [containers, containerHid, focusHid]);

  // §6.5.6.3: focus the invoking node's details on open.
  const initialFocusDone = useRef(false);
  useEffect(() => {
    if (initialFocusDone.current || !focusHid) return;
    if (byHid.has(focusHid)) {
      setSelection({ kind: "node", hid: focusHid });
      initialFocusDone.current = true;
    }
  }, [byHid, focusHid]);

  // Escape cancels an in-progress linking gesture.
  useEffect(() => {
    if (!linking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLinking(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linking]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.flow", operations: ops }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["soi"] });
      setError(null);
      setSuccess("Changes committed.");
    },
    onError: (e) => {
      setSuccess(null);
      setError(errorText(e));
    },
  });

  const layoutProp = mode === "functional" ? "FunctionalFlowJSON" : "ControlStructureJSON";
  const container = byHid.get(containerHid);

  const layoutDoc = useMemo<LayoutDoc>(() => {
    const raw = container?.properties?.[layoutProp];
    if (typeof raw !== "string" || !raw || raw === "null") return { positions: {} };
    try {
      const parsed = JSON.parse(raw) as LayoutDoc;
      return { positions: parsed.positions ?? {}, members: parsed.members };
    } catch {
      return { positions: {} };
    }
  }, [container, layoutProp]);

  // Container scoping (§6.5.6.6): Functional Flow members are the targets of
  // the container's [:CONTAINS] relationships (§3.3.4.5) unioned with the
  // layout JSON membership list (fallback for containers saved before the
  // membership edges existed). STPA members are the container's HAS_* child
  // role nodes plus Functions/Interfaces cast into them via [:IMPLEMENTS].
  const memberSet = useMemo(() => {
    const set = new Set<string>();
    if (!container) return set;
    if (mode === "functional") {
      for (const r of container.relationships ?? []) {
        if (r.type === "CONTAINS") set.add(r.targetHID);
      }
      for (const m of layoutDoc.members ?? []) set.add(m);
    } else {
      for (const r of container.relationships ?? []) {
        if (CS_CHILD_RELS.includes(r.type)) set.add(r.targetHID);
      }
      for (const n of nodes) {
        if (n.typeName !== "SystemFunction" && n.typeName !== "Interface") continue;
        if ((n.relationships ?? []).some((r) => r.type === "IMPLEMENTS" && set.has(r.targetHID))) {
          set.add(n.hid);
        }
      }
    }
    return set;
  }, [container, mode, layoutDoc, nodes]);

  const graph = useMemo(() => {
    const els: cytoscape.ElementDefinition[] = [];
    if (!container) return { els, hasPositions: false };

    const displayTypes =
      mode === "functional" ? FUNCTIONAL_TYPES : [...STPA_ROLES, "SystemFunction", "Interface"];

    // Countermeasure overlay filter (§6.5.6.8): show only flow nodes the CM
    // applies to (plus members touching them).
    let cmTargets: Set<string> | null = null;
    if (mode === "functional" && cmFilter) {
      const cm = byHid.get(cmFilter);
      cmTargets = new Set(
        (cm?.relationships ?? [])
          .filter((r) => r.type.startsWith("APPLIES_TO"))
          .map((r) => r.targetHID),
      );
    }

    const shown = new Set<string>();
    for (const hid of memberSet) {
      const n = byHid.get(hid);
      if (!n || !displayTypes.includes(n.typeName)) continue;
      if (cmTargets && !cmTargets.has(n.hid)) {
        const touches = (n.relationships ?? []).some((r) => cmTargets.has(r.targetHID));
        if (!touches) continue;
      }
      shown.add(n.hid);
    }

    // Feedback visualization in Functional Flow mode (§6.5.6.9): project
    // (:ControlledProcess)-[:PRODUCES]->(:Feedback)-[:INFORMS]->(:ProcessModel)
    // onto the member Functions/Interfaces cast into those roles.
    const fbShown = new Set<string>();
    const projEdges: cytoscape.ElementDefinition[] = [];
    const projSeen = new Set<string>();
    if (mode === "functional") {
      const roleToMember = new Map<string, string>();
      for (const hid of shown) {
        for (const r of byHid.get(hid)?.relationships ?? []) {
          if (r.type === "IMPLEMENTS") roleToMember.set(r.targetHID, hid);
        }
      }
      for (const [roleHid, memberHid] of roleToMember) {
        const role = byHid.get(roleHid);
        if (role?.typeName !== "ControlledProcess") continue;
        for (const r of role.relationships ?? []) {
          if (r.type !== "PRODUCES" || !byHid.has(r.targetHID)) continue;
          if (projSeen.has(`${memberHid}-PRODUCES->${r.targetHID}`)) continue;
          projSeen.add(`${memberHid}-PRODUCES->${r.targetHID}`);
          fbShown.add(r.targetHID);
          projEdges.push({
            data: {
              id: `${memberHid}-PRODUCES->${r.targetHID}`,
              source: memberHid,
              target: r.targetHID,
              label: "PRODUCES",
              rel: "PRODUCES",
              srcHid: roleHid,
              tgtHid: r.targetHID,
              relProps: r.props ?? {},
              projected: true,
            },
          });
        }
      }
      for (const fbHid of fbShown) {
        for (const r of byHid.get(fbHid)?.relationships ?? []) {
          if (r.type !== "INFORMS") continue;
          const memberHid = roleToMember.get(r.targetHID);
          if (memberHid && shown.has(memberHid)) {
            if (projSeen.has(`${fbHid}-INFORMS->${memberHid}`)) continue;
            projSeen.add(`${fbHid}-INFORMS->${memberHid}`);
            projEdges.push({
              data: {
                id: `${fbHid}-INFORMS->${memberHid}`,
                source: fbHid,
                target: memberHid,
                label: "INFORMS",
                rel: "INFORMS",
                srcHid: fbHid,
                tgtHid: r.targetHID,
                relProps: r.props ?? {},
                projected: true,
              },
            });
          }
        }
      }
    }

    // Node elements: saved positions where present; grid fallback for members
    // a partial preset layout would otherwise collapse at the origin.
    const allNodeHids = [...shown, ...fbShown];
    const saved = layoutDoc.positions;
    const hasPositions = allNodeHids.some((h) => saved[h]);
    let maxY = Number.NEGATIVE_INFINITY;
    let minX = Number.POSITIVE_INFINITY;
    for (const h of allNodeHids) {
      const p = saved[h];
      if (p) {
        if (p.y > maxY) maxY = p.y;
        if (p.x < minX) minX = p.x;
      }
    }
    const baseX = Number.isFinite(minX) ? minX : 80;
    const baseY = Number.isFinite(maxY) ? maxY + 140 : 80;
    let gi = 0;
    for (const h of allNodeHids) {
      const n = byHid.get(h);
      if (!n) continue;
      let pos = saved[h];
      if (!pos && hasPositions) {
        pos = { x: baseX + (gi % 4) * 190, y: baseY + Math.floor(gi / 4) * 110 };
        gi++;
      }
      els.push({
        data: {
          id: h,
          label: `${h}\n${String(n.properties.Name ?? "")}`,
          kind: n.typeName,
          cmHit: cmTargets?.has(h) ?? false,
        },
        position: pos ? { ...pos } : undefined,
      });
    }

    const relSet = mode === "functional" ? FLOW_RELS : LOOP_RELS;
    for (const hid of shown) {
      for (const r of byHid.get(hid)?.relationships ?? []) {
        if (!relSet.includes(r.type)) continue;
        if (!shown.has(r.targetHID)) continue;
        els.push({
          data: {
            id: `${hid}-${r.type}->${r.targetHID}`,
            source: hid,
            target: r.targetHID,
            label: r.type,
            rel: r.type,
            srcHid: hid,
            tgtHid: r.targetHID,
            relProps: r.props ?? {},
            projected: false,
          },
        });
      }
    }
    els.push(...projEdges);
    return { els, hasPositions };
  }, [container, mode, cmFilter, memberSet, byHid, layoutDoc]);

  const saveLayout = (positions: Record<string, { x: number; y: number }>) => {
    if (!container || !ctx.soiHid) return;
    const doc = {
      schemaVersion: "1.1",
      containerHid: container.hid,
      soiHid: ctx.soiHid,
      positions,
      ...(mode === "functional" ? { members: Array.from(memberSet) } : {}),
      savedAt: new Date().toISOString(),
    };
    commit.mutate([
      { op: "updateNode", hid: container.hid, properties: { [layoutProp]: JSON.stringify(doc) } },
    ]);
  };

  // Create-node helpers (§6.5.6.17): staged as a single Commit transaction.
  const createNode = (label: string) => {
    const soiHid = ctx.soiHid;
    if (!soiHid) return;
    prompt.ask(
      `Name for the new (:${label})`,
      (name) => {
        const ops: CommitOperation[] = [
          { op: "createNode", tempId: "n", label, properties: { Name: name } },
        ];
        if (label === "SystemFunction" || label === "Interface") {
          ops.push({
            op: "createRelationship",
            type: label === "SystemFunction" ? "HAS_FUNCTION" : "HAS_INTERFACE",
            sourceHid: soiHid,
            targetHid: "$n",
          });
          if (mode === "functional" && container) {
            ops.push({
              op: "createRelationship",
              type: "CONTAINS",
              sourceHid: container.hid,
              targetHid: "$n",
            });
          }
        } else if (CS_CHILD_REL[label] && container) {
          ops.push({
            op: "createRelationship",
            type: CS_CHILD_REL[label],
            sourceHid: container.hid,
            targetHid: "$n",
          });
        }
        commit.mutate(ops);
      },
      { initial: `New ${label}` },
    );
  };

  const createContainer = () => {
    const soiHid = ctx.soiHid;
    if (!soiHid) return;
    const label = containerLabel;
    prompt.ask(
      `Name for the new (:${label})`,
      (name) => {
        // (:Purpose) is the only authorized owner of a FunctionalFlow /
        // ControlStructure (§3.3.3.1); create the default Purpose chain from
        // the SoI root when missing so the container is never an orphan.
        const purpose = nodes.find((n) => n.typeName === "Purpose");
        const ops: CommitOperation[] = [];
        let owner = purpose?.hid;
        if (!owner) {
          ops.push(
            { op: "createNode", tempId: "p", label: "Purpose", properties: { Name: "Default Purpose" } },
            { op: "createRelationship", type: "REALIZES", sourceHid: soiHid, targetHid: "$p" },
          );
          owner = "$p";
        }
        ops.push(
          { op: "createNode", tempId: "c", label, properties: { Name: name } },
          {
            op: "createRelationship",
            type: mode === "functional" ? "HAS_FUNCTIONAL_FLOW" : "HAS_CONTROL_STRUCTURE",
            sourceHid: owner,
            targetHid: "$c",
          },
        );
        commit.mutate(ops);
      },
      { initial: `New ${label}` },
    );
  };

  const addRequirement = (target: SoINode) => {
    prompt.ask(
      `Requirement for ${String(target.properties.Name ?? target.hid)}`,
      (text) => {
        commit.mutate([
          {
            op: "createNode",
            tempId: "r",
            label: "Requirement",
            properties: { Name: text.length > 60 ? `${text.slice(0, 57)}…` : text, RStatement: text },
          },
          { op: "createRelationship", type: "HAS_REQUIREMENT", sourceHid: target.hid, targetHid: "$r" },
        ]);
      },
      { placeholder: "The system shall…" },
    );
  };

  const applyCountermeasure = (target: SoINode, cmHid: string) => {
    const relType = APPLIES_TO[target.typeName];
    if (!relType) return;
    commit.mutate([
      { op: "createRelationship", type: relType, sourceHid: cmHid, targetHid: target.hid },
    ]);
  };

  const createCountermeasure = (target: SoINode) => {
    const soiHid = ctx.soiHid;
    const relType = APPLIES_TO[target.typeName];
    if (!relType || !soiHid) return;
    prompt.ask("Name for the new (:Countermeasure)", (name) => {
      // Countermeasures live under System→Perspective→Security (§3.3.4.9);
      // create the missing chain so the new node is never an orphan.
      const ops: CommitOperation[] = [];
      const security = nodes.find((n) => n.typeName === "Security");
      let securityRef = security?.hid;
      if (!securityRef) {
        const perspective = nodes.find((n) => n.typeName === "Perspective");
        let perspectiveRef = perspective?.hid;
        if (!perspectiveRef) {
          ops.push(
            { op: "createNode", tempId: "pp", label: "Perspective", properties: { Name: "Security Perspective" } },
            { op: "createRelationship", type: "HAS_PERSPECTIVE", sourceHid: soiHid, targetHid: "$pp" },
          );
          perspectiveRef = "$pp";
        }
        ops.push(
          { op: "createNode", tempId: "sec", label: "Security", properties: { Name: "Security" } },
          { op: "createRelationship", type: "HAS_SECURITY", sourceHid: perspectiveRef, targetHid: "$sec" },
        );
        securityRef = "$sec";
      }
      ops.push(
        { op: "createNode", tempId: "cm", label: "Countermeasure", properties: { Name: name } },
        { op: "createRelationship", type: "HAS_COUNTERMEASURE", sourceHid: securityRef, targetHid: "$cm" },
        { op: "createRelationship", type: relType, sourceHid: "$cm", targetHid: target.hid },
      );
      commit.mutate(ops);
    });
  };

  const removeFromFlow = (hid: string) => {
    if (!container || !ctx.soiHid) return;
    const ops: CommitOperation[] = [];
    if ((container.relationships ?? []).some((r) => r.type === "CONTAINS" && r.targetHID === hid)) {
      ops.push({ op: "deleteRelationship", type: "CONTAINS", sourceHid: container.hid, targetHid: hid });
    }
    const positions = { ...layoutDoc.positions };
    delete positions[hid];
    ops.push({
      op: "updateNode",
      hid: container.hid,
      properties: {
        [layoutProp]: JSON.stringify({
          schemaVersion: "1.1",
          containerHid: container.hid,
          soiHid: ctx.soiHid,
          positions,
          members: Array.from(memberSet).filter((m) => m !== hid),
          savedAt: new Date().toISOString(),
        }),
      },
    });
    commit.mutate(ops);
    setSelection(null);
  };

  const applyEdgeProps = (edge: EdgeSel, props: Record<string, unknown>) => {
    // Relationship property edits commit as delete + recreate (§6.5.6.16).
    commit.mutate([
      { op: "deleteRelationship", type: edge.type, sourceHid: edge.sourceHid, targetHid: edge.targetHid },
      {
        op: "createRelationship",
        type: edge.type,
        sourceHid: edge.sourceHid,
        targetHid: edge.targetHid,
        properties: props,
      },
    ]);
    setSelection(null);
  };

  const handleNodeTap = (hid: string) => {
    if (linking) {
      if (!linking.source) {
        setLinking({ ...linking, source: hid });
        return;
      }
      const src = byHid.get(linking.source);
      const tgt = byHid.get(hid);
      setLinking(null);
      if (!src || !tgt) return;
      let type = "";
      if (linking.type === "IMPLEMENTS") {
        if (src.typeName === "Interface" && tgt.typeName === "ProcessModel") {
          setError("(:Interface) SHALL NOT be assigned to (:ProcessModel) (§6.5.6.13).");
          return;
        }
        type = "IMPLEMENTS";
      } else if (linking.type === "LOOP") {
        const loopMap: Record<string, string> = {
          "ControlAlgorithm>ControlAction": "GENERATES",
          "ControlAction>ControlledProcess": "COMMANDS",
          "ControlledProcess>Feedback": "PRODUCES",
          "Feedback>ProcessModel": "INFORMS",
          "ProcessModel>ControlAlgorithm": "TUNES",
        };
        type = loopMap[`${src.typeName}>${tgt.typeName}`] ?? "";
      } else {
        // Functional flow edge type from endpoint types (§6.5.6.7).
        if (src.typeName === "SystemFunction" && tgt.typeName === "SystemFunction")
          type = "FLOWS_TO_FUNCTION";
        else if (src.typeName === "SystemFunction" && tgt.typeName === "Interface")
          type = "FLOWS_TO_INTERFACE";
        else if (src.typeName === "Interface" && tgt.typeName === "SystemFunction")
          type = "CONNECTS";
        else if (src.typeName === "Interface" && tgt.typeName === "Connection")
          type = "PARTICIPATES_IN";
      }
      if (!type) {
        setError(`No authorized flow relationship from (:${src.typeName}) to (:${tgt.typeName}).`);
        return;
      }
      setError(null);
      commit.mutate([{ op: "createRelationship", type, sourceHid: src.hid, targetHid: tgt.hid }]);
      return;
    }
    setSelection({ kind: "node", hid });
  };

  if (!ctx.soiHid) {
    return <ToolStatus needsSoI />;
  }

  const selNode = selection?.kind === "node" ? byHid.get(selection.hid) : undefined;
  const memberCandidates = nodes.filter(
    (n) => FUNCTIONAL_TYPES.includes(n.typeName) && !memberSet.has(n.hid),
  );

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
          className={`sstpa-button ${mode === "functional" ? "" : "secondary"}`}
          onClick={() => {
            setMode("functional");
            setSelection(null);
            setLinking(null);
          }}
        >
          Functional Flow
        </button>
        <button
          className={`sstpa-button ${mode === "stpa" ? "" : "secondary"}`}
          onClick={() => {
            setMode("stpa");
            setSelection(null);
            setLinking(null);
            setCmFilter("");
          }}
        >
          STPA Control Flow
        </button>
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          value={containerHid}
          onChange={(e) => {
            setContainerHid(e.target.value);
            setSelection(null);
          }}
          title={mode === "functional" ? "Functional Flow" : "Control Structure"}
        >
          {containers.length === 0 && <option value="">(none — create one)</option>}
          {containers.map((c) => (
            <option key={c.hid} value={c.hid}>
              {String(c.properties.Name ?? c.hid)}
            </option>
          ))}
        </select>
        <button className="icon-button" onClick={createContainer}>
          + {mode === "functional" ? "Flow" : "Structure"}
        </button>
        <span style={{ width: 10 }} />
        {mode === "functional" ? (
          <>
            <button className="icon-button" disabled={!container} onClick={() => createNode("SystemFunction")}>
              + Function
            </button>
            <button className="icon-button" disabled={!container} onClick={() => createNode("Interface")}>
              + Interface
            </button>
            <button
              className="icon-button"
              disabled={!container}
              onClick={() => setLinking({ type: "FLOW" })}
            >
              + Flow edge
            </button>
            {container && (
              <AddMemberPicker
                candidates={memberCandidates}
                onAdd={(hid) =>
                  commit.mutate([
                    { op: "createRelationship", type: "CONTAINS", sourceHid: container.hid, targetHid: hid },
                  ])
                }
              />
            )}
          </>
        ) : (
          <>
            {STPA_ROLES.map((r) => (
              <button key={r} className="icon-button" disabled={!container} onClick={() => createNode(r)}>
                + {r.replace("Control", "C.").replace("Process", "Proc.")}
              </button>
            ))}
            <button
              className="icon-button"
              disabled={!container}
              title="Cast a Function/Interface into an STPA role via [:IMPLEMENTS]"
              onClick={() => setLinking({ type: "IMPLEMENTS" })}
            >
              ⇄ Cast role
            </button>
            <button className="icon-button" disabled={!container} onClick={() => setLinking({ type: "LOOP" })}>
              + Loop edge
            </button>
          </>
        )}
        <span style={{ flex: 1 }} />
        {mode === "functional" && (
          <select
            className="sstpa-input"
            style={{ width: "auto" }}
            value={cmFilter}
            onChange={(e) => setCmFilter(e.target.value)}
            title="Countermeasure overlay filter (§6.5.6.8)"
          >
            <option value="">No CM filter</option>
            {nodes
              .filter((n) => n.typeName === "Countermeasure")
              .map((cm) => (
                <option key={cm.hid} value={cm.hid}>
                  {String(cm.properties.Name ?? cm.hid)}
                </option>
              ))}
          </select>
        )}
      </div>

      {linking && (
        <div
          className="sstpa-alert-warning"
          style={{ margin: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ flex: 1 }}>
            {linking.source
              ? `Linking from ${nameOf(linking.source)} — click the target node or press Escape`
              : linking.type === "IMPLEMENTS"
                ? "Cast role: click the Function/Interface to cast, then the STPA role node (Escape cancels)"
                : linking.type === "LOOP"
                  ? "Loop edge: click the source role node, then the target (Escape cancels)"
                  : "Flow edge: click the source node, then the target (Escape cancels)"}
          </span>
          <button
            className="sstpa-button secondary"
            style={{ padding: "2px 10px" }}
            onClick={() => setLinking(null)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div className="sstpa-alert-error" style={{ margin: "6px 12px" }}>
          {error}{" "}
          <button className="icon-button" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      {success && !error && (
        <div className="sstpa-alert-success" style={{ margin: "6px 12px" }}>
          {success}{" "}
          <button className="icon-button" onClick={() => setSuccess(null)}>
            ✕
          </button>
        </div>
      )}

      {soi.isPending ? (
        <ToolStatus loading />
      ) : soi.error ? (
        <ToolStatus error={soi.error} onRetry={() => void soi.refetch()} />
      ) : !container ? (
        <ToolStatus
          empty={`No (:${containerLabel}) in this SoI yet`}
          emptyHint={`Use "+ ${mode === "functional" ? "Flow" : "Structure"}" in the toolbar to create one.`}
        />
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <FlowCanvas
            mode={mode}
            elements={graph.els}
            hasPositions={graph.hasPositions}
            focusHid={focusHid}
            onNodeTap={handleNodeTap}
            onEdgeTap={(edge) => setSelection({ kind: "edge", edge })}
            onBackgroundTap={() => setSelection(null)}
            onLayoutSave={saveLayout}
          />
          <aside
            style={{
              width: 300,
              borderLeft: "var(--sstpa-border)",
              overflow: "auto",
              background: "var(--sstpa-surface)",
              padding: "var(--sstpa-sp-3)",
              fontSize: "0.8rem",
            }}
          >
            {selection?.kind === "edge" ? (
              <EdgePanel
                key={`${selection.edge.sourceHid}-${selection.edge.type}-${selection.edge.targetHid}`}
                edge={selection.edge}
                nameOf={nameOf}
                editable={mode === "functional" && FLOW_RELS.includes(selection.edge.type)}
                onApply={(props) => applyEdgeProps(selection.edge, props)}
                onDelete={() => {
                  commit.mutate([
                    {
                      op: "deleteRelationship",
                      type: selection.edge.type,
                      sourceHid: selection.edge.sourceHid,
                      targetHid: selection.edge.targetHid,
                    },
                  ]);
                  setSelection(null);
                }}
              />
            ) : selNode ? (
              <>
                <div className="mono" style={{ fontSize: "0.7rem" }}>
                  {selNode.hid}
                </div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {String(selNode.properties.Name ?? "")}
                </div>
                <div style={{ color: "var(--sstpa-muted)" }}>{selNode.typeName}</div>
                <p>{String(selNode.properties.ShortDescription ?? "").replace("null", "")}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {REQUIREMENT_SOURCES.includes(selNode.typeName) && (
                    <button
                      className="icon-button"
                      title="Create a (:Requirement) via [:HAS_REQUIREMENT] (§6.5.6.17)"
                      onClick={() => addRequirement(selNode)}
                    >
                      + Requirement
                    </button>
                  )}
                  {mode === "functional" && memberSet.has(selNode.hid) && (
                    <button
                      className="icon-button danger"
                      title="Remove this node from the selected flow (keeps the node)"
                      onClick={() => removeFromFlow(selNode.hid)}
                    >
                      Remove from flow
                    </button>
                  )}
                </div>
                {APPLIES_TO[selNode.typeName] && (
                  <CmAssign
                    countermeasures={nodes.filter((n) => n.typeName === "Countermeasure")}
                    onApply={(cmHid) => applyCountermeasure(selNode, cmHid)}
                    onCreate={() => createCountermeasure(selNode)}
                  />
                )}
                <h4>Outgoing</h4>
                {(selNode.relationships ?? [])
                  .filter((r) => [...FLOW_RELS, ...LOOP_RELS].includes(r.type))
                  .map((r) => (
                    <div key={`${r.type}${r.targetHID}`} className="prop-row">
                      <span className="mono" style={{ fontSize: "0.66rem" }}>
                        [:{r.type}] {r.targetHID}
                      </span>
                      <button
                        className="icon-button danger"
                        onClick={() =>
                          commit.mutate([
                            {
                              op: "deleteRelationship",
                              type: r.type,
                              sourceHid: selNode.hid,
                              targetHid: r.targetHID,
                            },
                          ])
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))}
              </>
            ) : (
              <p style={{ color: "var(--sstpa-muted)" }}>
                Select a node or relationship. Drag nodes to arrange; positions
                and flow membership persist to {layoutProp} on Commit layout.
              </p>
            )}
          </aside>
        </div>
      )}
      {prompt.element}
    </div>
  );
}

/** Toolbar picker adding an existing SoI Function/Interface/Connection to the
 *  selected FunctionalFlow via [:CONTAINS]. */
function AddMemberPicker({
  candidates,
  onAdd,
}: {
  candidates: SoINode[];
  onAdd: (hid: string) => void;
}) {
  const [pick, setPick] = useState("");
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <select
        className="sstpa-input"
        style={{ width: "auto" }}
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        title="Add an existing node to this flow"
      >
        <option value="">Add existing…</option>
        {candidates.map((n) => (
          <option key={n.hid} value={n.hid}>
            {n.typeName}: {String(n.properties.Name ?? n.hid)}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        disabled={!pick}
        onClick={() => {
          onAdd(pick);
          setPick("");
        }}
      >
        Add to flow
      </button>
    </span>
  );
}

/** Countermeasure association block (§6.5.6.7): apply an existing SoI
 *  Countermeasure to the selected node, or create a new one. */
function CmAssign({
  countermeasures,
  onApply,
  onCreate,
}: {
  countermeasures: SoINode[];
  onApply: (cmHid: string) => void;
  onCreate: () => void;
}) {
  const [pick, setPick] = useState("");
  return (
    <div style={{ marginBottom: 8 }}>
      <h4>Countermeasure</h4>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <select
          className="sstpa-input"
          style={{ width: "auto", maxWidth: 170 }}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">Select…</option>
          {countermeasures.map((cm) => (
            <option key={cm.hid} value={cm.hid}>
              {String(cm.properties.Name ?? cm.hid)}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          disabled={!pick}
          onClick={() => {
            onApply(pick);
            setPick("");
          }}
        >
          Apply
        </button>
        <button className="icon-button" onClick={onCreate}>
          + New
        </button>
      </div>
    </div>
  );
}

/** Relationship detail panel (§6.5.6.16): shows type + properties; flow
 *  relationships expose the physical/logical (OSI) nature editor whose edits
 *  commit as delete + recreate operations. */
function EdgePanel({
  edge,
  nameOf,
  editable,
  onApply,
  onDelete,
}: {
  edge: EdgeSel;
  nameOf: (hid: string) => string;
  editable: boolean;
  onApply: (props: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [staged, setStaged] = useState<Record<string, string>>({});
  const current = (name: string) =>
    name in staged ? staged[name] : String(edge.props[name] ?? "");
  const natureNames = FLOW_NATURE_PROPS.map((p) => p.name);
  const otherProps = Object.entries(edge.props).filter(([k]) => !natureNames.includes(k));

  return (
    <>
      <div className="mono" style={{ fontSize: "0.7rem" }}>
        [:{edge.type}]
      </div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {nameOf(edge.sourceHid)} → {nameOf(edge.targetHid)}
      </div>
      {edge.projected && (
        <p style={{ color: "var(--sstpa-muted)", fontSize: "0.72rem" }}>
          Feedback relationship projected onto cast Functions/Interfaces
          (§6.5.6.9); endpoints are the underlying STPA role nodes.
        </p>
      )}
      {otherProps.length > 0 && (
        <>
          <h4>Properties</h4>
          {otherProps.map(([k, v]) => (
            <div key={k} className="prop-row">
              <span className="mono" style={{ fontSize: "0.66rem" }}>
                {k}
              </span>
              <span style={{ fontSize: "0.7rem" }}>{String(v ?? "")}</span>
            </div>
          ))}
        </>
      )}
      {editable ? (
        <>
          <h4>Flow nature (physical / logical OSI)</h4>
          {FLOW_NATURE_PROPS.map((p) => (
            <label key={p.name} style={{ display: "block", marginBottom: 4, fontSize: "0.72rem" }}>
              {p.name}
              {p.options ? (
                <select
                  className="sstpa-input"
                  value={current(p.name)}
                  onChange={(e) => setStaged((s) => ({ ...s, [p.name]: e.target.value }))}
                >
                  <option value="">(unset)</option>
                  {p.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="sstpa-input"
                  value={current(p.name)}
                  onChange={(e) => setStaged((s) => ({ ...s, [p.name]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <button
            className="sstpa-button"
            style={{ marginTop: 4 }}
            disabled={Object.keys(staged).length === 0}
            onClick={() => {
              const merged: Record<string, unknown> = { ...edge.props };
              for (const p of FLOW_NATURE_PROPS) {
                const v = current(p.name);
                if (v) merged[p.name] = v;
                else delete merged[p.name];
              }
              onApply(merged);
            }}
          >
            Apply properties
          </button>
        </>
      ) : (
        <p style={{ color: "var(--sstpa-muted)", fontSize: "0.72rem" }}>
          Flow-nature properties are edited on Functional Flow relationships.
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        <button className="sstpa-button danger" onClick={onDelete}>
          Delete relationship
        </button>
      </div>
    </>
  );
}

function FlowCanvas({
  mode,
  elements,
  hasPositions,
  focusHid,
  onNodeTap,
  onEdgeTap,
  onBackgroundTap,
  onLayoutSave,
}: {
  mode: Mode;
  elements: cytoscape.ElementDefinition[];
  hasPositions: boolean;
  focusHid: string | null;
  onNodeTap: (hid: string) => void;
  onEdgeTap: (edge: EdgeSel) => void;
  onBackgroundTap: () => void;
  onLayoutSave: (positions: Record<string, { x: number; y: number }>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const nodeTapRef = useRef(onNodeTap);
  nodeTapRef.current = onNodeTap;
  const edgeTapRef = useRef(onEdgeTap);
  edgeTapRef.current = onEdgeTap;
  const bgTapRef = useRef(onBackgroundTap);
  bgTapRef.current = onBackgroundTap;
  const focusPendingRef = useRef(true);

  useEffect(() => {
    if (!containerRef.current) return;
    cyRef.current?.destroy();
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            shape: "round-rectangle",
            "background-color": "#fcfaf2",
            "border-width": 1.5,
            "border-color": "#33567e",
            label: "data(label)",
            "text-wrap": "wrap",
            "text-valign": "center",
            "font-size": 8.5,
            "font-family": "JetBrains Mono, monospace",
            width: 140,
            height: 48,
            color: "#1b2a4a",
          },
        },
        { selector: 'node[kind = "Interface"]', style: { shape: "ellipse", "border-color": "#4a7a6f" } },
        { selector: 'node[kind = "Connection"]', style: { shape: "diamond", "border-color": "#3d6b7a" } },
        { selector: 'node[kind = "ControlAlgorithm"]', style: { "border-width": 3, "border-color": "#1b2a4a" } },
        { selector: 'node[kind = "ControlledProcess"]', style: { "border-color": "#567045", "border-width": 2.5 } },
        { selector: 'node[kind = "ProcessModel"]', style: { shape: "round-hexagon", "border-color": "#6d5a8e" } },
        { selector: 'node[kind = "ControlAction"]', style: { shape: "rectangle", "border-color": "#8c2f2f" } },
        { selector: 'node[kind = "Feedback"]', style: { shape: "rectangle", "border-color": "#9a6b1f" } },
        { selector: "node[?cmHit]", style: { "background-color": "#f3ead3" } },
        { selector: "node:selected", style: { "border-color": "#a8853a", "border-width": 3.5 } },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "line-color": "#33567e",
            "target-arrow-color": "#33567e",
            label: "data(label)",
            "font-size": 6.5,
            "text-rotation": "autorotate",
            "text-background-color": "#faf7ee",
            "text-background-opacity": 0.85,
            color: "#44546e",
          },
        },
        { selector: 'edge[rel = "PRODUCES"], edge[rel = "INFORMS"]', style: { "line-style": "dashed", "line-color": "#9a6b1f", "target-arrow-color": "#9a6b1f" } },
        { selector: 'edge[rel = "IMPLEMENTS"]', style: { "line-style": "dotted", "line-color": "#6d5a8e", "target-arrow-color": "#6d5a8e" } },
        { selector: 'edge[rel = "PARTICIPATES_IN"]', style: { "line-color": "#3d6b7a", "target-arrow-color": "#3d6b7a" } },
        { selector: "edge:selected", style: { "line-color": "#a8853a", "target-arrow-color": "#a8853a", width: 3 } },
      ],
      layout: hasPositions
        ? ({ name: "preset" } as cytoscape.LayoutOptions)
        : mode === "stpa"
          ? ({ name: "circle", animate: false } as cytoscape.LayoutOptions)
          : ({ name: "breadthfirst", directed: true, spacingFactor: 1.4, animate: false } as cytoscape.LayoutOptions),
    });
    cy.on("tap", "node", (ev) => nodeTapRef.current(ev.target.id()));
    cy.on("tap", "edge", (ev) => {
      const d = ev.target.data() as {
        rel: string;
        srcHid: string;
        tgtHid: string;
        relProps?: Record<string, unknown>;
        projected?: boolean;
      };
      edgeTapRef.current({
        type: d.rel,
        sourceHid: d.srcHid,
        targetHid: d.tgtHid,
        props: d.relProps ?? {},
        projected: Boolean(d.projected),
      });
    });
    cy.on("tap", (ev) => {
      if (ev.target === cy) bgTapRef.current();
    });
    // §6.5.6.3 / §6.5.6.16: animated centering on the invoking drawer node.
    if (focusPendingRef.current && focusHid) {
      const el = cy.getElementById(focusHid);
      if (el.nonempty()) {
        el.select();
        cy.animate({ center: { eles: el }, zoom: 1.15 }, { duration: 350 });
        focusPendingRef.current = false;
      }
    }
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, mode, hasPositions, focusHid]);

  const commitLayout = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const positions: Record<string, { x: number; y: number }> = {};
    cy.nodes().forEach((n) => {
      positions[n.id()] = { x: Math.round(n.position("x")), y: Math.round(n.position("y")) };
    });
    onLayoutSave(positions);
  };

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "var(--sstpa-canvas)" }} />
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
        <button className="icon-button" onClick={commitLayout} title="Persist node positions and membership (§6.5.6.5)">
          Commit layout
        </button>
        <button className="icon-button" onClick={() => cyRef.current && exportPng(cyRef.current, `sstpa-flow-${mode}`)}>
          PNG
        </button>
        <button className="icon-button" onClick={() => cyRef.current && exportSvg(cyRef.current, `sstpa-flow-${mode}`)}>
          SVG
        </button>
      </div>
    </div>
  );
}
