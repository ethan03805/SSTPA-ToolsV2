// SSTPA Control Panel (SRS §6.3.2): Add-on Tool icons left-to-right, red
// Shutdown icon far right with visual separation. Remains visible/accessible
// when the Data Drawer is open.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useSession, useToolWindows } from "../state/stores";
import { controlPanelTools, unavailableReason } from "../tools/manifest";
import { shutdownApplication } from "../shutdown";
import { Icon } from "./Icon";

export function ControlPanel() {
  const { user } = useSession();
  const openTool = useToolWindows((s) => s.openTool);

  const capability = useQuery({
    queryKey: ["capability"],
    queryFn: api.capability,
    refetchInterval: 10000,
    retry: false,
  });
  const backendCaps = capability.data?.capabilities ?? [];

  // Admin-permission tools are HIDDEN (not disabled) from non-admin users
  // (SRS §6.5.15.3 "SHALL NOT be displayed to users with UserRole = USER").
  const visibleTools = controlPanelTools().filter(
    (t) =>
      !t.RequiredPermissions.includes("admin") ||
      (user?.isAdmin ?? false) ||
      (user?.isRootAdmin ?? false),
  );

  return (
    <nav className="control-panel sstpa-panel">
      {visibleTools.map((tool) => {
        const reason = unavailableReason(
          tool,
          backendCaps,
          user?.isAdmin ?? false,
        );
        return (
          <button
            key={tool.ToolID}
            className="tool-button"
            disabled={reason !== null}
            title={reason ?? tool.ToolName}
            onClick={() => openTool(tool.ToolID)}
          >
            <span className="tool-icon" aria-hidden>
              <Icon name={tool.Icon} />
            </span>
            <span>{tool.ToolName.replace(" Tool", "")}</span>
          </button>
        );
      })}
      <button
        className="tool-button shutdown"
        title="Shutdown SSTPA Tools"
        onClick={() => void shutdownApplication()}
      >
        <span className="tool-icon" aria-hidden>
          <Icon name="power" />
        </span>
        <span>Shutdown</span>
      </button>
    </nav>
  );
}
