// Node type badge with per-type color token (SRS §6.2.2 node type
// visualization; §6.3.4.3 card header badge).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

const TYPE_COLORS: Record<string, string> = {
  System: "var(--sstpa-node-system)",
  Component: "var(--sstpa-node-element)",
  SystemFunction: "var(--sstpa-node-function)",
  Interface: "var(--sstpa-node-interface)",
  State: "var(--sstpa-node-state)",
  Asset: "var(--sstpa-node-asset)",
  DerivedAsset: "var(--sstpa-node-asset)",
  SecurityControl: "var(--sstpa-node-security)",
  Countermeasure: "var(--sstpa-node-security)",
  Security: "var(--sstpa-node-security)",
  Hazard: "var(--sstpa-node-security)",
  Attack: "var(--sstpa-node-security)",
  Loss: "var(--sstpa-node-security)",
  Purpose: "var(--sstpa-node-purpose)",
  Constraint: "var(--sstpa-node-purpose)",
  Requirement: "var(--sstpa-node-purpose)",
  Validation: "var(--sstpa-node-purpose)",
  Verification: "var(--sstpa-node-purpose)",
  UseCase: "var(--sstpa-node-purpose)",
  Environment: "var(--sstpa-node-environment)",
  Connection: "var(--sstpa-node-connection)",
};

const DISPLAY_NAMES: Record<string, string> = {
  Project: "Capability",
  Component: "Element",
  SystemFunction: "Function",
  SecurityControl: "Control",
  GsnGoal: "Goal",
  GsnStrategy: "Strategy",
  GsnContext: "Context",
  GsnAssumption: "Assumption",
  GsnJustification: "Justification",
  GsnSolution: "Solution",
  UseCase: "Use Case",
  FunctionalFlow: "Functional Flow",
  ControlStructure: "Control Structure",
  DerivedAsset: "Derived Asset",
};

export function nodeTypeColor(typeName: string): string {
  return TYPE_COLORS[typeName] ?? "var(--sstpa-node-muted)";
}

/** GUI display name for a node label (SRS §3.3.3 table). */
export function displayName(typeName: string): string {
  return DISPLAY_NAMES[typeName] ?? typeName;
}

export function NodeTypeBadge({ typeName }: { typeName: string }) {
  const color = nodeTypeColor(typeName);
  return (
    <span
      className="type-badge"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {displayName(typeName)}
    </span>
  );
}
