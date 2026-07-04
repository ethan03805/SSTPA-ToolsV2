// Add-on Tool Extension Architecture: Tool Manifest schema and registry
// (SRS §6.4). The GUI discovers tools from registered manifests at startup
// and renders Control Panel buttons and Data Drawer launch actions from
// manifest content — no source changes needed to add/hide a conforming tool.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

export type ModelTextLanguage = "SYSML" | "KERML";
export type LaunchLocation = "CONTROL_PANEL" | "DATA_DRAWER" | "BRANDING_PANEL";

export interface ToolManifest {
  ToolID: string;
  ToolName: string;
  ToolVersion: string;
  ToolType: string;
  ModelTextLanguages: ModelTextLanguage[];
  LaunchLocation: LaunchLocation[];
  SupportedNodeContexts: string[];
  RequiredBackendCapabilities: string[];
  RequiredPermissions: string[];
  MutatesData: boolean;
  ChangesCurrentSoI: boolean;
  SupportedExportFormats: string[];
  MinimumSRSVersion: string;
  ToolEntryPoint: string;
  /** Icon glyph shown on the Control Panel button. */
  Icon: string;
}

/** Tool Launch Context handed to each Add-on Tool by the GUI (SRS §6.4). */
export interface ToolLaunchContext {
  userName: string;
  userEmail: string;
  isAdmin: boolean;
  soiHid: string | null;
  soiUuid: string | null;
  drawerNodeHid: string | null;
  drawerNodeUuid: string | null;
  /** Node another tool asked this tool to focus (cross-tool navigation). */
  focusHid: string | null;
  focusType: string | null;
  launchMode: "CONTROL_PANEL" | "DATA_DRAWER";
  backendBaseUrl: string;
  editAuthorized: boolean;
  themeTokens: string; // active stylesheet name
}

/** Registered Tool Manifests. Adding a manifest (plus a lazy component under
 *  tools/) is the complete integration step for a new Add-on Tool. */
export const toolManifests: ToolManifest[] = [
  {
    ToolID: "sstpa.navigator",
    ToolName: "Navigator Tool",
    ToolVersion: "1.0.0",
    ToolType: "NAVIGATION",
    ModelTextLanguages: [],
    LaunchLocation: ["CONTROL_PANEL"],
    SupportedNodeContexts: ["*"],
    RequiredBackendCapabilities: ["hierarchy.read", "node.lookup"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: true,
    SupportedExportFormats: ["PNG"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/navigator",
    Icon: "🧭",
  },
  {
    ToolID: "sstpa.requirements",
    ToolName: "Requirements Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["SYSML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: [
      "Project",
      "Requirement",
      "Connection",
      "Component",
      "Interface",
      "SystemFunction",
      "Constraint",
      "Countermeasure",
    ],
    RequiredBackendCapabilities: [
      "node.lookup",
      "requirement.hierarchy.read",
      "relationship.validate",
      "graph.mutate.transactional",
    ],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["PNG", "SVG", "SYSML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/requirements",
    Icon: "📐",
  },
  {
    ToolID: "sstpa.reports",
    ToolName: "Reports Tool",
    ToolVersion: "1.0.0",
    ToolType: "REPORTING",
    ModelTextLanguages: [],
    LaunchLocation: ["CONTROL_PANEL"],
    SupportedNodeContexts: ["*"],
    RequiredBackendCapabilities: [
      "soi.read",
      "hierarchy.read",
      "graph.mutate.transactional", // gap analysis persists Orphan/Barren (§6.5.3.8)
    ],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["MD", "TXT", "HTML", "PDF", "CSV"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/reports",
    Icon: "📄",
  },
  {
    ToolID: "sstpa.reference",
    ToolName: "Reference Tool",
    ToolVersion: "1.0.0",
    ToolType: "REFERENCE",
    ModelTextLanguages: [],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: [
      "Attack",
      "Countermeasure",
      "SecurityControl",
      "Component",
      "Hazard",
      "System",
    ],
    RequiredBackendCapabilities: ["reference.read", "reference.clone"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: [],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/reference",
    Icon: "📚",
  },
  {
    ToolID: "sstpa.state",
    ToolName: "State Tool",
    ToolVersion: "1.0.0",
    ToolType: "DIAGRAM",
    ModelTextLanguages: ["SYSML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["State", "System"],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["PNG", "SVG", "SYSML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/state",
    Icon: "🔀",
  },
  {
    ToolID: "sstpa.flow",
    ToolName: "Flow Tool",
    ToolVersion: "1.0.0",
    ToolType: "DIAGRAM",
    ModelTextLanguages: ["SYSML", "KERML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: [
      "SystemFunction",
      "Interface",
      "ControlStructure",
      "ControlAlgorithm",
      "ProcessModel",
      "ControlledProcess",
      "ControlAction",
      "Feedback",
    ],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["PNG", "SVG", "SYSML", "KERML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/flow",
    Icon: "🌊",
  },
  {
    ToolID: "sstpa.assets",
    ToolName: "Asset Manager Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["KERML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["Asset", "DerivedAsset", "Regime", "System"],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["CSV", "KERML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/assets",
    Icon: "💎",
  },
  {
    ToolID: "sstpa.context",
    ToolName: "Context Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["SYSML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["Environment", "State", "Hazard", "Loss"],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["PNG", "CSV"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/context",
    Icon: "🌍",
  },
  {
    ToolID: "sstpa.trace",
    ToolName: "Trace Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["KERML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["Asset", "State", "Interface", "SystemFunction", "Component"],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["CSV", "KERML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/trace",
    Icon: "🧵",
  },
  {
    ToolID: "sstpa.loss",
    ToolName: "Loss Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["KERML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["Loss", "Asset"],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["PNG", "SVG", "CSV", "KERML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/loss",
    Icon: "🌳",
  },
  {
    ToolID: "sstpa.goalkeeper",
    ToolName: "Goal Keeper Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["KERML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["GsnGoal", "Asset"],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["PNG", "SVG", "KERML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/goalkeeper",
    Icon: "🎯",
  },
  {
    ToolID: "sstpa.usecase",
    ToolName: "Use-Case Tool",
    ToolVersion: "1.0.0",
    ToolType: "DIAGRAM",
    ModelTextLanguages: ["SYSML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["UseCase", "Purpose"],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["PNG", "SVG", "SYSML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/usecase",
    Icon: "👤",
  },
  {
    ToolID: "sstpa.connection",
    ToolName: "Connection Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["SYSML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["Connection", "Interface"],
    RequiredBackendCapabilities: ["soi.read", "graph.mutate.transactional"],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["PNG", "SYSML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/connection",
    Icon: "🔗",
  },
  {
    ToolID: "sstpa.messagecenter",
    ToolName: "Message Center",
    ToolVersion: "1.0.0",
    ToolType: "MESSAGING",
    ModelTextLanguages: [],
    LaunchLocation: ["CONTROL_PANEL", "BRANDING_PANEL"],
    SupportedNodeContexts: ["*"],
    RequiredBackendCapabilities: ["messaging"],
    RequiredPermissions: [],
    MutatesData: false,
    ChangesCurrentSoI: false,
    SupportedExportFormats: [],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/messagecenter",
    Icon: "✉️",
  },
  {
    ToolID: "sstpa.admin",
    ToolName: "Admin Tool",
    ToolVersion: "1.0.0",
    ToolType: "ADMINISTRATION",
    ModelTextLanguages: [],
    LaunchLocation: ["CONTROL_PANEL"],
    SupportedNodeContexts: ["*"],
    RequiredBackendCapabilities: ["admin.users"],
    RequiredPermissions: ["admin"],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: [],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/admin",
    Icon: "🛡️",
  },
  {
    ToolID: "sstpa.attack",
    ToolName: "Attack Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["KERML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["Attack", "Hazard"],
    RequiredBackendCapabilities: [
      "soi.read",
      "reference.read",
      "graph.mutate.transactional",
    ],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["CSV", "MD", "KERML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/attack",
    Icon: "⚔️",
  },
  {
    ToolID: "sstpa.controls",
    ToolName: "Controls Tool",
    ToolVersion: "1.0.0",
    ToolType: "GRAPH_ANALYSIS",
    ModelTextLanguages: ["KERML"],
    LaunchLocation: ["CONTROL_PANEL", "DATA_DRAWER"],
    SupportedNodeContexts: ["SecurityControl", "System", "Asset"],
    RequiredBackendCapabilities: [
      "soi.read",
      "reference.read",
      "graph.mutate.transactional",
    ],
    RequiredPermissions: [],
    MutatesData: true,
    ChangesCurrentSoI: false,
    SupportedExportFormats: ["CSV", "KERML"],
    MinimumSRSVersion: "0.7",
    ToolEntryPoint: "tools/controls",
    Icon: "🎛️",
  },
];

/** Tools shown in the Control Panel, in declared order (SRS §6.3.2). */
export function controlPanelTools(): ToolManifest[] {
  return toolManifests.filter((t) =>
    t.LaunchLocation.includes("CONTROL_PANEL"),
  );
}

export function manifestById(toolId: string): ToolManifest | undefined {
  return toolManifests.find((t) => t.ToolID === toolId);
}

/** Availability check against backend capability discovery (SRS §6.4). */
export function unavailableReason(
  manifest: ToolManifest,
  backendCapabilities: string[],
  isAdmin: boolean,
): string | null {
  for (const cap of manifest.RequiredBackendCapabilities) {
    if (!backendCapabilities.includes(cap)) {
      return `Backend capability "${cap}" is unavailable`;
    }
  }
  if (manifest.RequiredPermissions.includes("admin") && !isAdmin) {
    return "Admin privileges required";
  }
  return null;
}
