// Zustand UI state stores (SRS §6.1).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { create } from "zustand";
import type { UserIdentity } from "../api/types";
import { setToken } from "../api/client";

/** Session: authenticated user + backend connection status (SRS §6.3.1). */
interface SessionState {
  user: UserIdentity | null;
  token: string | null;
  connected: boolean;
  backendInfo: { version: string; schemaVersion: string } | null;
  login: (user: UserIdentity, token: string) => void;
  logout: () => void;
  setConnected: (
    connected: boolean,
    info?: { version: string; schemaVersion: string },
  ) => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  token: null,
  connected: false,
  backendInfo: null,
  login: (user, token) => {
    setToken(token);
    set({ user, token });
  },
  logout: () => {
    setToken(null);
    set({ user: null, token: null });
  },
  setConnected: (connected, info) =>
    set((s) => ({ connected, backendInfo: info ?? s.backendInfo })),
}));

/** Current System of Interest (SRS §6.3.3). Null → "Select a System of Interest". */
interface SoIState {
  soiHid: string | null;
  setSoI: (hid: string | null) => void;
}

export const useSoI = create<SoIState>((set) => ({
  soiHid: null,
  setSoI: (hid) => set({ soiHid: hid }),
}));

/** Data Drawer: the single edit surface (SRS §6.3.5). Only one drawer at a
 *  time; staged edits live here until Commit. */
export interface DrawerRequest {
  mode: "edit" | "create";
  hid?: string; // edit mode
  label?: string; // create mode
  /** relationship to create from a parent on commit (create mode) */
  linkFrom?: { sourceHid: string; type: string };
}

interface DrawerState {
  open: boolean;
  request: DrawerRequest | null;
  /** A drawer-open request deferred because the drawer holds staged edits;
   *  the Data Drawer surfaces a discard-confirmation for it (SRS §6.3.5.2
   *  "Opening a new node SHALL replace the current drawer content"). */
  pendingRequest: DrawerRequest | null;
  staged: Record<string, unknown>;
  stagedRelDeletes: { type: string; targetHid: string }[];
  stagedRelAdds: { type: string; targetHid: string }[];
  dirty: boolean;
  openDrawer: (req: DrawerRequest) => void;
  /** Open, replacing current content; defers behind a confirmation when
   *  uncommitted staged edits would be lost. */
  requestOpenDrawer: (req: DrawerRequest) => void;
  confirmPendingOpen: () => void;
  cancelPendingOpen: () => void;
  closeDrawer: () => void;
  stageProperty: (name: string, value: unknown) => void;
  stageRelDelete: (type: string, targetHid: string) => void;
  unstageRelDelete: (type: string, targetHid: string) => void;
  stageRelAdd: (type: string, targetHid: string) => void;
  unstageRelAdd: (type: string, targetHid: string) => void;
  resetStaged: () => void;
}

const cleanDrawer: Pick<
  DrawerState,
  "staged" | "stagedRelDeletes" | "stagedRelAdds" | "dirty"
> = {
  staged: {},
  stagedRelDeletes: [],
  stagedRelAdds: [],
  dirty: false,
};

export const useDrawer = create<DrawerState>((set, get) => ({
  open: false,
  request: null,
  pendingRequest: null,
  ...cleanDrawer,
  openDrawer: (req) =>
    set({ open: true, request: req, pendingRequest: null, ...cleanDrawer }),
  requestOpenDrawer: (req) => {
    const s = get();
    if (s.open && s.dirty) {
      set({ pendingRequest: req });
    } else {
      s.openDrawer(req);
    }
  },
  confirmPendingOpen: () => {
    const req = get().pendingRequest;
    if (req) get().openDrawer(req);
  },
  cancelPendingOpen: () => set({ pendingRequest: null }),
  closeDrawer: () =>
    set({ open: false, request: null, pendingRequest: null, ...cleanDrawer }),
  stageProperty: (name, value) =>
    set((s) => ({ staged: { ...s.staged, [name]: value }, dirty: true })),
  stageRelDelete: (type, targetHid) =>
    set((s) => ({
      stagedRelDeletes: [...s.stagedRelDeletes, { type, targetHid }],
      dirty: true,
    })),
  unstageRelDelete: (type, targetHid) =>
    set((s) => ({
      stagedRelDeletes: s.stagedRelDeletes.filter(
        (d) => !(d.type === type && d.targetHid === targetHid),
      ),
    })),
  stageRelAdd: (type, targetHid) =>
    set((s) => ({
      stagedRelAdds: s.stagedRelAdds.some(
        (a) => a.type === type && a.targetHid === targetHid,
      )
        ? s.stagedRelAdds
        : [...s.stagedRelAdds, { type, targetHid }],
      dirty: true,
    })),
  unstageRelAdd: (type, targetHid) =>
    set((s) => ({
      stagedRelAdds: s.stagedRelAdds.filter(
        (a) => !(a.type === type && a.targetHid === targetHid),
      ),
    })),
  resetStaged: () => set({ ...cleanDrawer }),
}));

/** Open Add-on Tool windows/panels (SRS §6.4). Tools may be launched with a
 *  focus context (the node that invoked them, SRS §6.4 Tool Launch Context)
 *  so cross-tool navigation lands on the right entity. */
export interface ToolLaunchContext {
  /** HID of the node that should receive focus in the launched tool. */
  focusHid?: string;
  /** TypeName of the focus node, when known. */
  focusType?: string;
}

interface ToolWindowState {
  openTools: string[]; // ToolIDs currently open
  launchContexts: Record<string, ToolLaunchContext | undefined>;
  openTool: (toolId: string, context?: ToolLaunchContext) => void;
  closeTool: (toolId: string) => void;
  /** Consume (read and clear) the launch context for a tool. */
  takeLaunchContext: (toolId: string) => ToolLaunchContext | undefined;
}

export const useToolWindows = create<ToolWindowState>((set, get) => ({
  openTools: [],
  launchContexts: {},
  openTool: (toolId, context) =>
    set((s) => ({
      openTools: s.openTools.includes(toolId)
        ? s.openTools
        : [...s.openTools, toolId],
      launchContexts: context
        ? { ...s.launchContexts, [toolId]: context }
        : s.launchContexts,
    })),
  closeTool: (toolId) =>
    set((s) => ({
      openTools: s.openTools.filter((t) => t !== toolId),
      launchContexts: { ...s.launchContexts, [toolId]: undefined },
    })),
  takeLaunchContext: (toolId) => {
    const ctx = get().launchContexts[toolId];
    if (ctx) {
      set((s) => ({
        launchContexts: { ...s.launchContexts, [toolId]: undefined },
      }));
    }
    return ctx;
  },
}));

/** Under Construction alert (SRS §6.3.2). */
interface UnderConstructionState {
  visible: boolean;
  feature: string;
  show: (feature: string) => void;
  hide: () => void;
}

export const useUnderConstruction = create<UnderConstructionState>((set) => ({
  visible: false,
  feature: "",
  show: (feature) => set({ visible: true, feature }),
  hide: () => set({ visible: false, feature: "" }),
}));
