// System of Interest Panel (SRS §6.3.3): shows current SoI HID/Name/
// ShortDescription (not editable), Edit icon → Data Drawer, child SoI chips,
// and an up-arrow to the parent SoI. With no SoI selected, presents the
// (:Project) root and "Select a System of Interest".
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useDrawer, useSoI } from "../state/stores";
import { Icon } from "./Icon";

/** HID structure per the identity model (SRS §3.3.8): TYPE_INDEX_SEQUENCE,
 *  e.g. SYS_1_0 or EL_1.2_4. The SoI index is the middle segment. */
function hidParts(hid: string): { prefix: string; index: string; seq: string } | null {
  const m = /^([A-Z]+)_([0-9.]+)_(\d+)$/.exec(hid);
  return m ? { prefix: m[1], index: m[2], seq: m[3] } : null;
}

export function SoIPanel() {
  const { soiHid, setSoI } = useSoI();
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);

  const hierarchy = useQuery({
    queryKey: ["hierarchy"],
    queryFn: api.hierarchy,
    refetchInterval: 30000,
  });
  const entries = hierarchy.data?.entries ?? [];

  const soiNode = useQuery({
    queryKey: ["node", soiHid],
    queryFn: () => api.nodeByHid(soiHid!),
    enabled: !!soiHid,
  });

  // Children of the current SoI: systems whose parent Component lives in this
  // SoI (component HIDs encode the SoI index, SRS §3.3.8), or tier-1 systems
  // under the Project when no SoI is selected.
  const project = entries.find((e) => e.typeName === "Project");
  const soiIndex = soiHid ? (hidParts(soiHid)?.index ?? null) : null;
  const children = entries.filter((e) => {
    if (e.typeName !== "System") return false;
    if (!soiHid) return e.parentHid === project?.hid;
    if (!e.parentHid) return false;
    const parent = hidParts(e.parentHid);
    return parent?.prefix === "EL" && parent.index === soiIndex;
  });

  // Parent SoI: the System entry owning the SoI index of this system's
  // parent Component; null (Project level) for tier-1 systems.
  const parentOfSoI = (() => {
    if (!soiHid) return null;
    const me = entries.find((e) => e.hid === soiHid);
    if (!me?.parentHid) return null;
    const parent = hidParts(me.parentHid);
    if (!parent || parent.prefix !== "EL") return { hid: null }; // Project root
    const parentSystem = entries.find(
      (e) =>
        e.typeName === "System" && hidParts(e.hid)?.index === parent.index,
    );
    return { hid: parentSystem?.hid ?? null };
  })();

  const props = soiNode.data?.properties ?? {};

  return (
    <section className="soi-panel sstpa-panel">
      {soiHid ? (
        <>
          <button
            className="icon-button"
            title="Navigate to parent System of Interest"
            onClick={() => setSoI(parentOfSoI?.hid ?? null)}
          >
            <Icon name="arrow-up" size={16} />
          </button>
          <div className="soi-identity">
            <div className="soi-hid">{soiHid}</div>
            <div className="soi-name">
              {soiNode.isLoading
                ? "Loading…"
                : soiNode.isError
                  ? "(could not load node)"
                  : String(props.Name ?? soiNode.data?.hid ?? "")}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--sstpa-muted)" }}>
              {String(props.ShortDescription ?? "") === "null"
                ? ""
                : String(props.ShortDescription ?? "")}
            </div>
          </div>
          <button
            className="icon-button"
            title="Edit System of Interest properties"
            onClick={() => requestOpenDrawer({ mode: "edit", hid: soiHid })}
          >
            <Icon name="pencil" size={14} /> Edit
          </button>
        </>
      ) : (
        <div className="soi-identity">
          <div className="soi-hid">
            {hierarchy.isLoading
              ? "Loading hierarchy…"
              : (project?.hid ?? "No Capability yet")}
          </div>
          <div className="soi-name">
            {project?.name ?? "SSTPA Tools"} — Select a System of Interest
          </div>
        </div>
      )}
      <div className="soi-children">
        {hierarchy.isError && (
          <span style={{ fontSize: "0.78rem", color: "var(--sstpa-status-error)" }}>
            Hierarchy unavailable: {String(hierarchy.error)}
          </span>
        )}
        {children.map((c) => (
          <button
            key={c.hid}
            className="soi-chip"
            title={`${c.hid} — make this the current SoI`}
            onClick={() => setSoI(c.hid)}
          >
            <span className="mono" style={{ fontSize: "0.68rem" }}>
              {c.hid}
            </span>{" "}
            {c.name}
          </button>
        ))}
        {children.length === 0 && soiHid && !hierarchy.isError && (
          <span
            style={{ fontSize: "0.78rem", color: "var(--sstpa-muted)" }}
          >
            No child systems
          </span>
        )}
      </div>
    </section>
  );
}
