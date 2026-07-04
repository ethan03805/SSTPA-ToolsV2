// SSTPA Backend API types (SRS §5.6.6).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

export interface UserIdentity {
  userName: string;
  email: string;
  isAdmin: boolean;
  isRootAdmin: boolean;
}

export interface LoginResponse {
  token: string;
  user: UserIdentity;
}

export interface NodeResponse {
  hid: string;
  uuid: string;
  typeName: string;
  soi: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface SoINode extends NodeResponse {
  relationships: SoIRelationship[];
}

export interface SoIRelationship {
  type: string;
  targetHID: string;
  targetUUID: string;
  props: Record<string, unknown>;
}

export interface SoIResponse {
  soi: string;
  systemHid: string;
  nodes: SoINode[] | null;
}

export interface HierarchyEntry {
  hid: string;
  uuid: string;
  name: string;
  typeName: string;
  shortDescription?: string;
  parentHid?: string | null;
}

export interface CommitOperation {
  op:
    | "createNode"
    | "updateNode"
    | "deleteNode"
    | "createRelationship"
    | "deleteRelationship";
  tempId?: string;
  label?: string;
  properties?: Record<string, unknown>;
  hid?: string;
  type?: string;
  sourceHid?: string;
  targetHid?: string;
}

export interface CommitRequest {
  soiHid?: string;
  toolId: string;
  operations: CommitOperation[];
}

export interface CommitResponse {
  commitId: string;
  nodesChanged: number;
  relationshipsChanged: number;
  messagesGenerated: number;
  recipientsNotified: string[] | null;
  createdNodes: Record<string, string>;
}

export interface PropertyDef {
  name: string;
  displayName: string;
  type: string;
  enumValues?: string[];
  edit: string; // edit | fixed | admin variants
  default: unknown;
}

export interface PropertyGroup {
  groupName: string;
  properties: PropertyDef[];
  constraints?: string[];
}

export interface NodeTypeSchema {
  label: string;
  displayName: string;
  modelDomain: string;
  hidPrefix: string;
  description?: string;
  commonPropertyGroups: PropertyGroup[];
  propertyGroups: PropertyGroup[] | null;
  relationshipGroups?: string[];
  outgoingRelationships: { type: string; target: string; srsSection?: string }[] | null;
}

export interface MessageSummary {
  messageId: string;
  subject: string;
  sentAt: string;
  relatedNodeHids?: string[];
  sender: string;
  recipient: string;
  messageType: "DIRECT" | "CHANGE_NOTIFICATION" | "SYSTEM";
  isRead: boolean;
}

export interface CapabilityResponse {
  product: string;
  version: string;
  build: string;
  apiVersions: string[];
  schemaVersion: string;
  environment: string;
  capabilities: string[];
  config: Record<string, unknown>;
}

export interface ValidateRelationshipResult {
  valid: boolean;
  reason?: string;
}

export interface ReferenceSearchResult {
  uuid: string;
  externalId: string;
  name: string;
  shortDescription?: string;
  frameworkName: string;
  frameworkVersion: string;
  frameworkDomain?: string;
  labels: string[];
  isDeprecated: boolean;
  isRevoked: boolean;
}

export interface AttackTreeNode {
  hid: string;
  uuid: string;
  typeName: string;
  name: string;
  tier: number;
  props: Record<string, unknown>;
}

export interface AttackTreeEdge {
  sourceHid: string;
  targetHid: string;
  logicOperator: "AND" | "OR" | "SAND";
  sandSequence?: number | null;
  tailoredOut: boolean;
  props: Record<string, unknown>;
}

export interface LossTreeResponse {
  loss: Record<string, unknown>;
  asset: Record<string, unknown> | null;
  environment: Record<string, unknown> | null;
  nodes: AttackTreeNode[] | null;
  edges: AttackTreeEdge[] | null;
  traceCoverage: Record<string, unknown>[] | null;
  statesCovered: number;
  statesTotal: number;
}

export interface LossPathResult {
  pathNumber: number;
  sequence: string[];
  nameSequence: string[];
  leafType: string;
  rvStatus: "RV" | "ALLOWED_RV" | "BLOCKED" | "DERIVED" | "";
  metrics: Record<string, number>;
}

export interface LossPathsResponse {
  lossHid: string;
  paths: LossPathResult[] | null;
  total: number;
  limit: number;
  offset: number;
}
