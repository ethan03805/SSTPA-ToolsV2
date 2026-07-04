// SSTPA Backend API client (SRS §5.6.6). All GUI and Add-on Tool data access
// flows through this module; mutations only via commit() (SRS §6.4).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import type {
  CapabilityResponse,
  CommitRequest,
  CommitResponse,
  HierarchyEntry,
  LossPathsResponse,
  LossTreeResponse,
  LoginResponse,
  MessageSummary,
  NodeResponse,
  NodeTypeSchema,
  ReferenceSearchResult,
  SoIResponse,
  ValidateRelationshipResult,
} from "./types";

/** Base URL of the Backend API (SRS §5.4: Caddy reverse proxy on 443).
 *  Resolution order: ?backend= query → Startup-provided launch config
 *  (Tauri, SSTPA_BACKEND_URL) → Vite dev proxy (same-origin, browser dev)
 *  → https://localhost. */
let apiBaseUrl =
  import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)
    ? "" // same-origin: vite.config.ts proxies /api to the local Caddy edge
    : "https://localhost";

{
  const fromQuery = new URLSearchParams(window.location.search).get("backend");
  if (fromQuery) apiBaseUrl = fromQuery.replace(/\/$/, "");
}

export function apiBase(): string {
  return apiBaseUrl;
}

export interface LaunchConfig {
  backendUrl: string | null;
  token: string | null;
  userName: string | null;
}

/** Read the launch configuration handed over by the Startup Software
 *  (SRS §4): backend URL and pre-authenticated session. Resolves to null
 *  outside Tauri (browser dev). Must run before the first API call. */
export async function initLaunchConfig(): Promise<LaunchConfig | null> {
  if (!("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const cfg = await invoke<{
      backend_url: string | null;
      token: string | null;
      user_name: string | null;
    }>("launch_config");
    if (cfg.backend_url) apiBaseUrl = cfg.backend_url.replace(/\/$/, "");
    return {
      backendUrl: cfg.backend_url,
      token: cfg.token,
      userName: cfg.user_name,
    };
  } catch {
    return null;
  }
}

let authToken: string | null = null;

export function setToken(token: string | null) {
  authToken = token;
}

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; detail?: string };
    throw new ApiError(res.status, err.error ?? res.statusText, err.detail);
  }
  return json as T;
}

export const api = {
  capability: () => request<CapabilityResponse>("GET", "/api/capability"),

  login: (userName: string, password: string) =>
    request<LoginResponse>("POST", "/api/auth/login", { userName, password }),

  bootstrap: (userName: string, password: string, email: string) =>
    request<{ status: string }>("POST", "/api/auth/bootstrap", {
      userName,
      password,
      email,
    }),

  authStatus: () =>
    request<{ rootAdminExists: boolean }>("GET", "/api/auth/status"),

  me: () => request<{ user: LoginResponse["user"] }>("GET", "/api/auth/me"),

  logout: () => request<{ status: string }>("POST", "/api/auth/logout"),

  nodeByHid: (hid: string) =>
    request<NodeResponse>("GET", `/api/nodes/hid/${encodeURIComponent(hid)}`),

  hierarchy: () =>
    request<{ entries: HierarchyEntry[] | null }>("GET", "/api/hierarchy"),

  nodesByType: (label: string, params?: Record<string, string>) =>
    request<{ nodes: NodeResponse[] | null }>(
      "GET",
      `/api/nodes/type/${encodeURIComponent(label)}?${new URLSearchParams(params ?? {})}`,
    ),

  soi: (systemHid: string) =>
    request<SoIResponse>("GET", `/api/soi/${encodeURIComponent(systemHid)}`),

  search: (params: Record<string, string>) =>
    request<{ results: NodeResponse[] | null }>(
      "GET",
      `/api/search?${new URLSearchParams(params)}`,
    ),

  context: (hid: string) =>
    request<Record<string, unknown>>(
      "GET",
      `/api/context/${encodeURIComponent(hid)}`,
    ),

  validateRelationship: (payload: {
    type: string;
    sourceHid?: string;
    targetHid?: string;
    sourceLabel?: string;
    targetLabel?: string;
  }) =>
    request<ValidateRelationshipResult>(
      "POST",
      "/api/relationships/validate",
      payload,
    ),

  commit: (payload: CommitRequest) =>
    request<CommitResponse>("POST", "/api/commit", payload),

  createSystemFromComponent: (componentHid: string, name?: string) =>
    request<Record<string, unknown>>(
      "POST",
      "/api/systems/create-from-component",
      { componentHid, name },
    ),

  lossTree: (lossHid: string) =>
    request<LossTreeResponse>(
      "GET",
      `/api/loss/${encodeURIComponent(lossHid)}/tree`,
    ),

  lossPaths: (lossHid: string, params?: { limit?: string; offset?: string }) =>
    request<LossPathsResponse>(
      "GET",
      `/api/loss/${encodeURIComponent(lossHid)}/paths?${new URLSearchParams(params ?? {})}`,
    ),

  lossAutoBuild: (lossHid: string, rebuild = false) =>
    request<Record<string, unknown>>(
      "POST",
      `/api/loss/${encodeURIComponent(lossHid)}/auto-build?${new URLSearchParams({
        rebuild: String(rebuild),
      })}`,
      {},
    ),

  schemaNodeTypes: () =>
    request<{
      nodeTypes: {
        label: string;
        displayName: string;
        modelDomain: string;
        hidPrefix: string;
        category: string;
      }[];
      schemaVersion: string;
    }>("GET", "/api/schema/node-types"),

  schemaNodeType: (label: string) =>
    request<NodeTypeSchema>(
      "GET",
      `/api/schema/node-types/${encodeURIComponent(label)}`,
    ),

  schemaRelationships: () =>
    request<{
      relationships: {
        type: string;
        source: string;
        target: string;
        srsSection?: string;
      }[];
    }>("GET", "/api/schema/relationships"),

  messages: (params?: Record<string, string>) =>
    request<{ messages: MessageSummary[] | null }>(
      "GET",
      `/api/messages?${new URLSearchParams(params ?? {})}`,
    ),

  message: (id: string) =>
    request<Record<string, unknown>>(
      "GET",
      `/api/messages/${encodeURIComponent(id)}`,
    ),

  sendMessage: (payload: {
    recipient: string;
    subject: string;
    body: string;
    relatedNodeHids?: string[];
  }) => request<{ messageId: string }>("POST", "/api/messages", payload),

  replyMessage: (id: string, body: string) =>
    request<{ messageId: string }>(
      "POST",
      `/api/messages/${encodeURIComponent(id)}/reply`,
      { body },
    ),

  markRead: (id: string) =>
    request<{ status: string }>(
      "POST",
      `/api/messages/${encodeURIComponent(id)}/read`,
      {},
    ),

  deleteMessage: (id: string) =>
    request<{ status: string }>(
      "DELETE",
      `/api/messages/${encodeURIComponent(id)}`,
    ),

  unreadCount: () =>
    request<{ unread: number }>("GET", "/api/messages/unread-count"),

  listUsers: () =>
    request<{ users: Record<string, unknown>[] }>("GET", "/api/admin/users"),

  createUser: (payload: {
    userName: string;
    password: string;
    email: string;
    isAdmin: boolean;
  }) => request<{ status: string }>("POST", "/api/admin/users", payload),

  updateUser: (userName: string, payload: Record<string, unknown>) =>
    request<{ status: string }>(
      "PATCH",
      `/api/admin/users/${encodeURIComponent(userName)}`,
      payload,
    ),

  product: () => request<Record<string, unknown>>("GET", "/api/product"),

  referenceFrameworks: () =>
    request<{ frameworks: Record<string, unknown>[] | null }>(
      "GET",
      "/api/reference/frameworks",
    ),

  referenceSearch: (params: Record<string, string>) =>
    request<{ results: ReferenceSearchResult[] | null }>(
      "GET",
      `/api/reference/search?${new URLSearchParams(params)}`,
    ),

  referenceNode: (uuid: string) =>
    request<Record<string, unknown>>(
      "GET",
      `/api/reference/node/${encodeURIComponent(uuid)}`,
    ),

  referenceClone: (payload: {
    coreHid: string;
    referenceUuid: string;
    overwrite?: boolean;
  }) => request<Record<string, unknown>>("POST", "/api/reference/clone", payload),
};
