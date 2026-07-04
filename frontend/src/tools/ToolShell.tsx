// Common Add-on Tool shell (SRS §6.4, §6.4.1): title/header, current SoI
// display, invoking node display, Commit/Cancel/Close, error and validation
// display, theme styling, and the Model Text Panel when the manifest declares
// model languages (§6.4.2). Tools render inside a resizable popup window
// managed by the GUI shell (§6.3.2).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "react";
import { apiBase } from "../api/client";
import { Icon } from "../components/Icon";
import { useDrawer, useSession, useSoI, useToolWindows } from "../state/stores";
import { activeStyle } from "../styles/styles";
import { manifestById, type ToolLaunchContext, type ToolManifest } from "./manifest";
import { ModelTextPanel } from "./ModelTextPanel";

/** Monotonic z-index so the last-clicked tool window stacks on top. */
let topZ = 30;

/** Lazy tool component registry keyed by ToolID. */
const TOOL_COMPONENTS: Record<
  string,
  ComponentType<{ ctx: ToolLaunchContext; manifest: ToolManifest }>
> = {
  "sstpa.navigator": lazy(() => import("./navigator/NavigatorTool")),
  "sstpa.requirements": lazy(() => import("./requirements/RequirementsTool")),
  "sstpa.reports": lazy(() => import("./reports/ReportsTool")),
  "sstpa.reference": lazy(() => import("./reference/ReferenceTool")),
  "sstpa.state": lazy(() => import("./state/StateTool")),
  "sstpa.flow": lazy(() => import("./flow/FlowTool")),
  "sstpa.assets": lazy(() => import("./assets/AssetManagerTool")),
  "sstpa.context": lazy(() => import("./context/ContextTool")),
  "sstpa.trace": lazy(() => import("./trace/TraceTool")),
  "sstpa.loss": lazy(() => import("./loss/LossTool")),
  "sstpa.goalkeeper": lazy(() => import("./goalkeeper/GoalKeeperTool")),
  "sstpa.usecase": lazy(() => import("./usecase/UseCaseTool")),
  "sstpa.connection": lazy(() => import("./connection/ConnectionTool")),
  "sstpa.messagecenter": lazy(() => import("./messagecenter/MessageCenterTool")),
  "sstpa.admin": lazy(() => import("./admin/AdminTool")),
  "sstpa.attack": lazy(() => import("./attack/AttackTool")),
  "sstpa.controls": lazy(() => import("./controls/ControlsTool")),
};

/** Hosts all open Add-on Tool popup windows. */
export function ToolWindowHost() {
  const openTools = useToolWindows((s) => s.openTools);
  return (
    <>
      {openTools.map((toolId) => (
        <ToolWindow key={toolId} toolId={toolId} />
      ))}
    </>
  );
}

function ToolWindow({ toolId }: { toolId: string }) {
  const closeTool = useToolWindows((s) => s.closeTool);
  const manifest = manifestById(toolId);
  const { user } = useSession();
  const soiHid = useSoI((s) => s.soiHid);
  const drawer = useDrawer();

  // Resizable popup (§6.3.2): drag the bottom-right grip.
  const [size, setSize] = useState({ w: 900, h: 620 });
  const [pos, setPos] = useState({
    x: Math.max(30, (window.innerWidth - 900) / 2),
    y: Math.max(70, (window.innerHeight - 620) / 2),
  });
  const [z, setZ] = useState(() => ++topZ);

  // Launch context (SRS §6.4): the invoking node (drawer or cross-tool
  // navigation) the tool should focus. Subscribed reactively so that
  // re-launching an already-open tool with a new focus target surfaces the
  // window and updates ctx.focusHid.
  const launch = useToolWindows((s) => s.launchContexts[toolId]);
  useEffect(() => {
    if (launch) setZ(++topZ); // bring to front when refocused
  }, [launch]);

  const ctx: ToolLaunchContext = useMemo(
    () => ({
      userName: user?.userName ?? "",
      userEmail: user?.email ?? "",
      isAdmin: user?.isAdmin ?? false,
      soiHid,
      soiUuid: null,
      drawerNodeHid: drawer.open ? (drawer.request?.hid ?? null) : null,
      drawerNodeUuid: null,
      focusHid: launch?.focusHid ?? null,
      focusType: launch?.focusType ?? null,
      launchMode: drawer.open ? "DATA_DRAWER" : "CONTROL_PANEL",
      backendBaseUrl: apiBase(),
      editAuthorized: true,
      themeTokens: activeStyle(),
    }),
    [user, soiHid, drawer.open, drawer.request, launch],
  );

  if (!manifest) return null;
  const Tool = TOOL_COMPONENTS[toolId];

  const startDrag = (e: React.MouseEvent, kind: "move" | "resize") => {
    e.preventDefault();
    const mouse = { x: e.clientX, y: e.clientY };
    const startPos = { ...pos };
    const startSize = { ...size };
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - mouse.x;
      const dy = ev.clientY - mouse.y;
      if (kind === "move") {
        setPos({
          x: Math.max(0, startPos.x + dx),
          y: Math.max(58, startPos.y + dy),
        });
      } else {
        setSize({
          w: Math.max(420, startSize.w + dx),
          h: Math.max(300, startSize.h + dy),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const showModelText = manifest.ModelTextLanguages.length > 0;

  return (
    <div
      className="sstpa-frame"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: z,
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--sstpa-shadow-popup)",
        overflow: "hidden",
      }}
      role="dialog"
      aria-label={manifest.ToolName}
      onMouseDownCapture={() => {
        if (z < topZ) setZ(++topZ);
      }}
    >
      <div
        className="tool-shell-header"
        style={{ cursor: "move" }}
        onMouseDown={(e) => startDrag(e, "move")}
      >
        <span style={{ display: "flex", color: "var(--sstpa-muted)" }} aria-hidden>
          <Icon name={manifest.Icon} size={17} />
        </span>
        <span className="tool-shell-title">{manifest.ToolName}</span>
        <div className="tool-shell-context">
          SoI: {soiHid ?? "none"}
          {ctx.drawerNodeHid && (
            <>
              <br />
              Node: {ctx.drawerNodeHid}
            </>
          )}
        </div>
        <button
          className="icon-button"
          title="Close tool"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => closeTool(toolId)}
        >
          ✕
        </button>
      </div>
      <div className="tool-shell-body">
        <div className="tool-shell-canvas">
          <Suspense
            fallback={
              <p style={{ padding: 20, color: "var(--sstpa-muted)" }}>
                Loading {manifest.ToolName}…
              </p>
            }
          >
            {Tool ? (
              <Tool ctx={ctx} manifest={manifest} />
            ) : (
              <p style={{ padding: 20 }}>Tool entry point not found.</p>
            )}
          </Suspense>
        </div>
        {showModelText && (
          <ModelTextPanel
            toolId={toolId}
            languages={manifest.ModelTextLanguages}
            soiHid={soiHid}
          />
        )}
      </div>
      <div
        onMouseDown={(e) => startDrag(e, "resize")}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: "nwse-resize",
          borderRight: "2px solid var(--sstpa-line)",
          borderBottom: "2px solid var(--sstpa-line)",
          borderBottomRightRadius: "var(--sstpa-radius-lg)",
        }}
        title="Resize"
      />
    </div>
  );
}
