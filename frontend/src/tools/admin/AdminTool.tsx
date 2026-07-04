// Admin Tool (SRS §6.5.15, §3.2, §3.2.1): three-region layout (top status
// bar, function navigation, work area) with Account Management (roster,
// detail panel, enrollment with two-step ADMIN authorization, multi-step
// disenrollment workflow), Message Management (all mailboxes + purge),
// Ownership Transfer, Sandbox Management, and Backend Status modes.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { api, apiBase } from "../../api/client";
import type { MessageSummary } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useSession, useUnderConstruction } from "../../state/stores";
import { downloadText, errorText, ToolStatus, usePrompt } from "../shared";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

type RosterUser = Awaited<ReturnType<typeof api.listUsers>>["users"][number];
type Role = "USER" | "ADMIN" | "ROOT_ADMIN";
type Mode = "accounts" | "messages" | "transfer" | "sandbox" | "backend";
type SortDir = "asc" | "desc";

const ROOT_LOCKED =
  "The Root Admin account cannot be modified through the Admin Tool.";
const NEEDS_ROOT = "This operation requires Root Admin authorization.";

function roleOf(u: RosterUser): Role {
  return u.isRootAdmin ? "ROOT_ADMIN" : u.isAdmin ? "ADMIN" : "USER";
}

function fmtDate(s: string | null | undefined): string {
  return String(s ?? "").slice(0, 19).replace("T", " ");
}

/** Global purge (admin): DELETE /api/messages/{id}?purge=true — the API
 *  client's deleteMessage() has no purge parameter, so call it directly. */
async function purgeMessage(id: string, token: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(
    `${apiBase()}/api/messages/${encodeURIComponent(id)}?purge=true`,
    { method: "DELETE", headers },
  );
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.error ?? body.detail ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(
      detail ? `Purge failed: ${detail}` : `Purge failed (HTTP ${res.status})`,
    );
  }
}

/** Role badge with non-icon visual distinction (SRS §6.5.15.18). */
function RoleBadge({ role }: { role: Role }) {
  const style =
    role === "ROOT_ADMIN"
      ? { background: "var(--sstpa-navy)" }
      : role === "ADMIN"
        ? { background: "var(--sstpa-gold)", color: "var(--sstpa-navy)" }
        : { background: "var(--sstpa-node-muted)" };
  return (
    <span className="type-badge" style={style}>
      {role.replace("_", " ")}
    </span>
  );
}

function StatusLabel({ status }: { status: RosterUser["accountStatus"] }) {
  const color =
    status === "ACTIVE"
      ? "var(--sstpa-status-ok)"
      : status === "SUSPENDED"
        ? "var(--sstpa-status-warn)"
        : "var(--sstpa-navy-muted)";
  return (
    <span
      style={{
        color,
        fontSize: "0.78rem",
        fontWeight: 600,
        textDecoration: status === "DISENROLLED" ? "line-through" : undefined,
      }}
    >
      {status}
    </span>
  );
}

/** Clickable column header; repeated click reverses (SRS §6.5.15.5a). */
function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
}) {
  const active = k === sortKey;
  return (
    <th
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      style={{ padding: 0 }}
    >
      <button
        onClick={() => onSort(k)}
        title={active ? `Sorted by ${label} — click to reverse` : `Sort by ${label}`}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          font: "inherit",
          fontWeight: 700,
          color: "var(--sstpa-navy)",
          padding: "6px 10px",
          width: "100%",
          textAlign: "left",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        {active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}

/** Action button that stays visible but disabled with a tooltip explaining
 *  why (SRS §6.5.15.18 "Root Admin Only" marking). */
function ActionButton({
  label,
  reason,
  danger,
  onClick,
}: {
  label: string;
  reason: string | null;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <span title={reason ?? undefined} style={{ display: "inline-block" }}>
      <button
        className={`sstpa-button ${danger ? "danger" : "secondary"}`}
        disabled={reason !== null}
        aria-disabled={reason !== null}
        onClick={onClick}
      >
        {label}
      </button>
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--sstpa-navy-muted)", whiteSpace: "nowrap" }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </>
  );
}

const NAV: { id: Mode; label: string }[] = [
  { id: "accounts", label: "Account Management" },
  { id: "messages", label: "Message Management" },
  { id: "transfer", label: "Ownership Transfer" },
  { id: "sandbox", label: "Sandbox Management" },
  { id: "backend", label: "Backend Status" },
];

export default function AdminTool({ ctx }: { ctx: ToolLaunchContext; manifest: ToolManifest }) {
  const qc = useQueryClient();
  const sessionUser = useSession((s) => s.user);
  const actingIsRoot = sessionUser?.isRootAdmin ?? false;

  const [mode, setMode] = useState<Mode>("accounts");
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messageUserFilter, setMessageUserFilter] = useState<string | null>(null);
  const [transferFrom, setTransferFrom] = useState<string>("");
  const [disenroll, setDisenroll] = useState<{
    userName: string;
    presetDest?: string;
  } | null>(null);

  const capability = useQuery({
    queryKey: ["admin-capability"],
    queryFn: api.capability,
    enabled: ctx.isAdmin,
    retry: 1,
  });
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.listUsers,
    enabled: ctx.isAdmin,
  });
  const roster = usersQuery.data?.users ?? undefined;

  if (!ctx.isAdmin) {
    // §6.5.15.3: refuse to open with an authorization error.
    return (
      <div style={{ padding: 16 }}>
        <div className="sstpa-alert-error">
          Authorization error: the Admin Tool requires ADMIN or ROOT_ADMIN
          privileges (SRS §6.5.15.3).
        </div>
      </div>
    );
  }

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-messages"] });
    void qc.invalidateQueries({ queryKey: ["admin-message"] });
    void qc.invalidateQueries({ queryKey: ["admin-capability"] });
    void qc.invalidateQueries({ queryKey: ["admin-product"] });
  };

  const viewMessages = (userName: string) => {
    setMessageUserFilter(userName);
    setMode("messages");
  };
  const transferData = (userName: string) => {
    setTransferFrom(userName);
    setMode("transfer");
  };

  const wizardUser = disenroll
    ? roster?.find((u) => u.userName === disenroll.userName)
    : undefined;
  const endpoint = apiBase() || "same-origin";

  return (
    <div className="tool-shell" style={{ height: "100%" }}>
      {/* Top bar: branding, acting admin + role badge, backend status,
          refresh (SRS §6.5.15.2). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sstpa-sp-3)",
          padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
          borderBottom: "2px solid var(--sstpa-navy)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--sstpa-font-brand)",
            fontWeight: 700,
            color: "var(--sstpa-navy)",
          }}
        >
          Admin Tool
        </span>
        <span style={{ fontSize: "0.85rem" }}>{ctx.userName}</span>
        <RoleBadge role={actingIsRoot ? "ROOT_ADMIN" : "ADMIN"} />
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: "0.78rem",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
          title={`Backend endpoint: ${endpoint}`}
        >
          <span
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: capability.isError
                ? "var(--sstpa-status-error)"
                : capability.isSuccess
                  ? "var(--sstpa-status-ok)"
                  : "var(--sstpa-status-warn)",
            }}
          />
          {capability.isPending
            ? "Connecting…"
            : capability.isError
              ? `Disconnected · ${endpoint}`
              : `Connected · ${endpoint}`}
        </span>
        <button
          className="sstpa-button secondary"
          onClick={refreshAll}
          title="Refresh all Admin Tool data"
        >
          ⟳ Refresh
        </button>
      </div>

      {notice && (
        <div
          className="sstpa-alert-success"
          style={{
            margin: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notice"
            onClick={() => setNotice(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left panel: function navigation (SRS §6.5.15.2). */}
        <nav
          aria-label="Admin functions"
          style={{
            width: 190,
            flexShrink: 0,
            borderRight: "var(--sstpa-border-soft)",
            padding: "var(--sstpa-sp-2)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            overflow: "auto",
          }}
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`sstpa-button ${mode === n.id ? "" : "secondary"}`}
              style={{ textAlign: "left" }}
              aria-current={mode === n.id ? "page" : undefined}
              onClick={() => setMode(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {/* Right panel: work area (SRS §6.5.15.5). */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {mode === "accounts" && (
            <AccountsMode
              roster={roster}
              loading={usersQuery.isPending}
              error={usersQuery.error ?? undefined}
              onRetry={() => void usersQuery.refetch()}
              actingIsRoot={actingIsRoot}
              actingUserName={ctx.userName}
              selected={selectedUser}
              setSelected={setSelectedUser}
              onNotice={setNotice}
              onViewMessages={viewMessages}
              onTransferData={transferData}
              onDisenroll={(userName) => setDisenroll({ userName })}
            />
          )}
          {mode === "messages" && (
            <MessagesMode
              userFilter={messageUserFilter}
              onClearUserFilter={() => setMessageUserFilter(null)}
              onNotice={setNotice}
            />
          )}
          {mode === "transfer" && (
            <TransferMode
              roster={roster ?? []}
              from={transferFrom}
              setFrom={setTransferFrom}
              actingIsRoot={actingIsRoot}
              actingUserName={ctx.userName}
              onStartDisenroll={(userName, presetDest) =>
                setDisenroll({ userName, presetDest })
              }
            />
          )}
          {mode === "sandbox" && <SandboxMode />}
          {mode === "backend" && <BackendMode endpoint={endpoint} />}
        </div>
      </div>

      {disenroll && wizardUser && (
        <DisenrollWizard
          user={wizardUser}
          candidates={(roster ?? []).filter(
            (u) =>
              roleOf(u) === "USER" &&
              u.accountStatus === "ACTIVE" &&
              u.userName !== disenroll.userName,
          )}
          presetDestination={disenroll.presetDest}
          onClose={() => setDisenroll(null)}
          onDone={setNotice}
        />
      )}
    </div>
  );
}

/* ------------------------- Account Management -------------------------- */

type RosterSortKey =
  | "displayName"
  | "userName"
  | "email"
  | "role"
  | "status"
  | "created"
  | "lastTouch"
  | "owned"
  | "unread";

function rosterValue(u: RosterUser, key: RosterSortKey): string | number {
  switch (key) {
    case "displayName":
      return String(u.displayName ?? "").toLowerCase();
    case "userName":
      return String(u.userName ?? "").toLowerCase();
    case "email":
      return String(u.email ?? "").toLowerCase();
    case "role":
      return roleOf(u);
    case "status":
      return String(u.accountStatus ?? "");
    case "created":
      return String(u.createDate ?? "");
    case "lastTouch":
      return String(u.lastTouch ?? "");
    case "owned":
      return u.ownedNodes ?? 0;
    case "unread":
      return u.unreadMessages ?? 0;
  }
}

const ROSTER_COLUMNS: { key: RosterSortKey; label: string }[] = [
  { key: "displayName", label: "Display Name" },
  { key: "userName", label: "Username" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
  { key: "lastTouch", label: "Last Touch" },
  { key: "owned", label: "Owned" },
  { key: "unread", label: "Unread" },
];

function AccountsMode({
  roster,
  loading,
  error,
  onRetry,
  actingIsRoot,
  actingUserName,
  selected,
  setSelected,
  onNotice,
  onViewMessages,
  onTransferData,
  onDisenroll,
}: {
  roster: RosterUser[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  actingIsRoot: boolean;
  actingUserName: string;
  selected: string | null;
  setSelected: (u: string | null) => void;
  onNotice: (t: string) => void;
  onViewMessages: (u: string) => void;
  onTransferData: (u: string) => void;
  onDisenroll: (u: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | Role>("ALL");
  const [showDisenrolled, setShowDisenrolled] = useState(false);
  const [sortKey, setSortKey] = useState<RosterSortKey>("displayName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [enrolling, setEnrolling] = useState<{ presetAdmin: boolean } | null>(null);

  const rows = useMemo(() => {
    let list = roster ?? [];
    if (!showDisenrolled) {
      list = list.filter((u) => u.accountStatus !== "DISENROLLED");
    }
    if (roleFilter !== "ALL") list = list.filter((u) => roleOf(u) === roleFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((u) =>
        [u.userName, u.displayName, u.email].some((v) =>
          String(v ?? "").toLowerCase().includes(q),
        ),
      );
    }
    return [...list].sort((a, b) => {
      const va = rosterValue(a, sortKey);
      const vb = rosterValue(b, sortKey);
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va) < String(vb)
            ? -1
            : String(va) > String(vb)
              ? 1
              : 0;
      return sortDir === "asc" ? c : -c;
    });
  }, [roster, search, roleFilter, showDisenrolled, sortKey, sortDir]);

  const onSort = (key: string) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key as RosterSortKey);
      setSortDir("asc");
    }
  };

  // Roster export (SRS §6.5.15.14): full roster including disenrolled
  // accounts; credential hashes are never returned by the Backend.
  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "DisplayName",
      "UserName",
      "Email",
      "Role",
      "AccountStatus",
      "Created",
      "LastTouch",
      "OwnedNodes",
      "UnreadMessages",
    ];
    const lines = (roster ?? []).map((u) =>
      [
        u.displayName,
        u.userName,
        u.email,
        roleOf(u),
        u.accountStatus,
        u.createDate ?? "",
        u.lastTouch ?? "",
        u.ownedNodes,
        u.unreadMessages,
      ]
        .map(esc)
        .join(","),
    );
    downloadText(
      "sstpa-account-roster.csv",
      [header.join(","), ...lines].join("\n"),
      "text/csv",
    );
    onNotice(`Exported ${lines.length} account(s) to sstpa-account-roster.csv.`);
  };

  const selectedUser = selected
    ? roster?.find((u) => u.userName === selected)
    : undefined;
  if (selected && selectedUser) {
    return (
      <AccountDetail
        user={selectedUser}
        actingIsRoot={actingIsRoot}
        actingUserName={actingUserName}
        onClose={() => setSelected(null)}
        onNotice={onNotice}
        onViewMessages={onViewMessages}
        onTransferData={onTransferData}
        onDisenroll={onDisenroll}
      />
    );
  }

  const onRowKeyDown = (
    e: React.KeyboardEvent<HTMLTableRowElement>,
    userName: string,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setSelected(userName);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sibling =
        e.key === "ArrowDown"
          ? e.currentTarget.nextElementSibling
          : e.currentTarget.previousElementSibling;
      (sibling as HTMLElement | null)?.focus?.();
    }
  };

  return (
    <>
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
        <input
          className="sstpa-input"
          style={{ width: 190 }}
          placeholder="Search name or email…"
          aria-label="Search accounts by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as "ALL" | Role)}
        >
          <option value="ALL">All roles</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="ROOT_ADMIN">ROOT_ADMIN</option>
        </select>
        <label
          style={{
            fontSize: "0.78rem",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <input
            type="checkbox"
            checked={showDisenrolled}
            onChange={(e) => setShowDisenrolled(e.target.checked)}
          />
          Show disenrolled
        </label>
        <span style={{ flex: 1 }} />
        <button
          className="sstpa-button secondary"
          onClick={exportCsv}
          disabled={!roster || roster.length === 0}
          title="Export the full roster (including disenrolled) as CSV (SRS §6.5.15.14)"
        >
          ⬇ Export CSV
        </button>
        <button
          className="sstpa-button"
          onClick={() => setEnrolling({ presetAdmin: false })}
        >
          + New User Account
        </button>
        <button
          className="sstpa-button"
          onClick={() => setEnrolling({ presetAdmin: true })}
        >
          + New Admin Account
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading || error || rows.length === 0 ? (
          <ToolStatus
            loading={loading}
            error={error}
            onRetry={onRetry}
            empty={rows.length === 0 && "No accounts match the current filter."}
            emptyHint="Adjust the search, role filter, or the Show disenrolled toggle."
          />
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  borderBottom: "2px solid var(--sstpa-navy)",
                }}
              >
                {ROSTER_COLUMNS.map((c) => (
                  <SortHeader
                    key={c.key}
                    label={c.label}
                    k={c.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const status = u.accountStatus;
                return (
                  <tr
                    key={u.userName}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open account ${u.userName}`}
                    style={{
                      borderBottom: "1px solid var(--sstpa-line-soft)",
                      cursor: "pointer",
                      opacity: status === "DISENROLLED" ? 0.55 : 1,
                      textDecoration:
                        status === "DISENROLLED" ? "line-through" : undefined,
                      color:
                        status === "SUSPENDED"
                          ? "var(--sstpa-navy-muted)"
                          : undefined,
                    }}
                    onClick={() => setSelected(u.userName)}
                    onKeyDown={(e) => onRowKeyDown(e, u.userName)}
                  >
                    <td style={{ padding: "5px 10px", fontWeight: 600 }}>
                      {u.displayName}
                    </td>
                    <td className="mono" style={{ fontSize: "0.74rem" }}>
                      {u.userName}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <RoleBadge role={roleOf(u)} />
                    </td>
                    <td>
                      <StatusLabel status={status} />
                    </td>
                    <td className="mono" style={{ fontSize: "0.7rem" }}>
                      {fmtDate(u.createDate).slice(0, 10)}
                    </td>
                    <td className="mono" style={{ fontSize: "0.7rem" }}>
                      {fmtDate(u.lastTouch).slice(0, 10)}
                    </td>
                    <td style={{ textAlign: "right", paddingRight: 10 }}>
                      {u.ownedNodes}
                    </td>
                    <td style={{ textAlign: "right", paddingRight: 10 }}>
                      {u.unreadMessages}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {enrolling && (
        <EnrollDialog
          presetAdmin={enrolling.presetAdmin}
          actingUserName={actingUserName}
          onDone={onNotice}
          onClose={() => setEnrolling(null)}
        />
      )}
    </>
  );
}

/* -------------------------- Account Detail ----------------------------- */

function AccountDetail({
  user,
  actingIsRoot,
  actingUserName,
  onClose,
  onNotice,
  onViewMessages,
  onTransferData,
  onDisenroll,
}: {
  user: RosterUser;
  actingIsRoot: boolean;
  actingUserName: string;
  onClose: () => void;
  onNotice: (t: string) => void;
  onViewMessages: (u: string) => void;
  onTransferData: (u: string) => void;
  onDisenroll: (u: string) => void;
}) {
  const qc = useQueryClient();
  const prompt = usePrompt();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [confirming, setConfirming] = useState<
    "suspend" | "reinstate" | "revoke" | null
  >(null);
  const [granting, setGranting] = useState(false);
  const [grantPw, setGrantPw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (vars: { payload: Record<string, unknown>; success: string }) =>
      api.updateUser(user.userName, vars.payload),
    onSuccess: (_data, vars) => {
      setError(null);
      onNotice(vars.success);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => setError(errorText(e)),
  });

  const targetRole = roleOf(user);
  const isRootTarget = targetRole === "ROOT_ADMIN";
  const isSelf = user.userName === actingUserName;

  // UI-side authorization gating (SRS §6.5.15.12); the Backend enforces the
  // same rules, this keeps disabled controls honest with a tooltip.
  const gate = (o: { notSelf?: boolean; rootForAdmin?: boolean } = {}): string | null => {
    if (isRootTarget) return ROOT_LOCKED;
    if (o.notSelf && isSelf) {
      return "An account cannot perform this action on itself.";
    }
    if (o.rootForAdmin && targetRole === "ADMIN" && !actingIsRoot) {
      return `${NEEDS_ROOT} (Root Admin only)`;
    }
    return null;
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{user.displayName}</h3>
        <RoleBadge role={targetRole} />
        <StatusLabel status={user.accountStatus} />
        <span style={{ flex: 1 }} />
        <button className="sstpa-button secondary" onClick={onClose}>
          ← Back to roster
        </button>
      </div>

      {isRootTarget && (
        <div className="sstpa-alert-warning" style={{ margin: "10px 0" }}>
          {ROOT_LOCKED} (SRS §6.5.15.12)
        </div>
      )}
      {error && (
        <div className="sstpa-alert-error" style={{ margin: "10px 0" }}>
          {error}
        </div>
      )}

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          gap: "4px 16px",
          fontSize: "0.85rem",
          margin: "var(--sstpa-sp-3) 0",
        }}
      >
        <Field label="Display Name:">{user.displayName}</Field>
        <Field label="Username:">
          <span className="mono" style={{ fontSize: "0.78rem" }}>
            {user.userName}
          </span>
        </Field>
        <Field label="Email:">{user.email}</Field>
        <Field label="Role:">
          <RoleBadge role={targetRole} />
        </Field>
        <Field label="Status:">
          <StatusLabel status={user.accountStatus} />
        </Field>
        <Field label="Created:">
          <span className="mono" style={{ fontSize: "0.78rem" }}>
            {fmtDate(user.createDate) || "N/A"}
          </span>
        </Field>
        <Field label="Last Touch:">
          <span className="mono" style={{ fontSize: "0.78rem" }}>
            {fmtDate(user.lastTouch) || "N/A"}
          </span>
        </Field>
        <Field label="Owned Core Data nodes:">
          {user.ownedNodes}{" "}
          <span style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.78rem" }}>
            (per-node-type breakdown is not available from this Backend version)
          </span>
        </Field>
        <Field label="Unread messages:">{user.unreadMessages}</Field>
      </dl>

      {editing ? (
        <div
          style={{
            border: "var(--sstpa-border-soft)",
            borderRadius: "var(--sstpa-radius)",
            padding: "var(--sstpa-sp-3)",
            maxWidth: 420,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <label style={{ fontSize: "0.8rem" }}>
            Display Name
            <input
              className="sstpa-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            Email
            <input
              className="sstpa-input"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
          </label>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--sstpa-navy-muted)" }}>
            Username cannot be changed in this version.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="sstpa-button secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="sstpa-button"
              disabled={!editName.trim() || !editEmail.trim() || update.isPending}
              onClick={() => {
                update.mutate({
                  payload: { displayName: editName.trim(), email: editEmail.trim() },
                  success: `Account ${user.userName} updated.`,
                });
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton
            label="Edit"
            reason={gate()}
            onClick={() => {
              setEditName(user.displayName ?? "");
              setEditEmail(user.email ?? "");
              setEditing(true);
            }}
          />
          <ActionButton
            label="Reset Password…"
            reason={gate({ rootForAdmin: true })}
            onClick={() =>
              prompt.ask(
                `New temporary password for ${user.userName}`,
                (v) =>
                  update.mutate({
                    payload: { password: v },
                    success: `Password reset for ${user.userName}.`,
                  }),
                { placeholder: "Temporary password" },
              )
            }
          />
          {user.accountStatus === "ACTIVE" && (
            <ActionButton
              label="Suspend Account…"
              reason={gate({ notSelf: true, rootForAdmin: true })}
              onClick={() => setConfirming("suspend")}
            />
          )}
          {user.accountStatus === "SUSPENDED" && (
            <ActionButton
              label="Reinstate Account…"
              reason={gate({ rootForAdmin: true })}
              onClick={() => setConfirming("reinstate")}
            />
          )}
          {targetRole === "USER" && user.accountStatus !== "DISENROLLED" && (
            <ActionButton
              label="Grant ADMIN Role…"
              reason={gate()}
              onClick={() => setGranting(true)}
            />
          )}
          {targetRole === "ADMIN" && (
            <ActionButton
              label="Revoke ADMIN Role…"
              reason={gate({ notSelf: true, rootForAdmin: true })}
              onClick={() => setConfirming("revoke")}
            />
          )}
          {user.accountStatus !== "DISENROLLED" && (
            <ActionButton
              label="Disenroll Account…"
              danger
              reason={gate({ notSelf: true, rootForAdmin: true })}
              onClick={() => onDisenroll(user.userName)}
            />
          )}
          <ActionButton
            label="View Messages"
            reason={null}
            onClick={() => onViewMessages(user.userName)}
          />
          <ActionButton
            label="Transfer Owned Data"
            reason={gate()}
            onClick={() => onTransferData(user.userName)}
          />
        </div>
      )}

      {update.isPending && (
        <p style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.8rem" }}>Applying…</p>
      )}

      {confirming === "suspend" && (
        <ConfirmDialog
          title={`Suspend ${user.userName}?`}
          confirmLabel="Suspend"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            update.mutate({
              payload: { suspend: true },
              success: `Account ${user.userName} suspended.`,
            });
          }}
        >
          <p>
            The account is blocked from logging in and its active sessions are
            revoked. It can be reinstated later.
          </p>
        </ConfirmDialog>
      )}
      {confirming === "reinstate" && (
        <ConfirmDialog
          title={`Reinstate ${user.userName}?`}
          confirmLabel="Reinstate"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            update.mutate({
              payload: { reinstate: true },
              success: `Account ${user.userName} reinstated.`,
            });
          }}
        >
          <p>The account returns to ACTIVE status and can log in again.</p>
        </ConfirmDialog>
      )}
      {confirming === "revoke" && (
        <ConfirmDialog
          title={`Revoke ADMIN role from ${user.userName}?`}
          confirmLabel="Revoke"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            update.mutate({
              payload: { isAdmin: false },
              success: `${user.userName} is now a regular USER.`,
            });
          }}
        >
          <p>
            The account becomes a regular USER and loses access to the Admin
            Tool and all admin functions.
          </p>
        </ConfirmDialog>
      )}

      {granting && (
        <div className="sstpa-dialog-overlay">
          <div
            className="sstpa-frame sstpa-dialog"
            role="dialog"
            aria-label={`Grant ADMIN role to ${user.userName}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setGranting(false);
                setGrantPw("");
              }
            }}
          >
            <h2>Grant ADMIN role to {user.userName}</h2>
            <p style={{ fontSize: "0.85rem" }}>
              Granting the ADMIN role requires re-authorization by the acting
              admin (SRS §6.5.15.8). Enter <strong>your own</strong> password
              ({actingUserName}) to authorize.
            </p>
            <label style={{ fontSize: "0.8rem" }}>
              Your password
              <input
                className="sstpa-input"
                type="password"
                autoFocus
                value={grantPw}
                onChange={(e) => setGrantPw(e.target.value)}
              />
            </label>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                className="sstpa-button secondary"
                onClick={() => {
                  setGranting(false);
                  setGrantPw("");
                }}
              >
                Cancel
              </button>
              <button
                className="sstpa-button"
                disabled={!grantPw || update.isPending}
                onClick={() => {
                  update.mutate({
                    payload: { isAdmin: true, authorizerPassword: grantPw },
                    success: `${user.userName} granted the ADMIN role.`,
                  });
                  setGranting(false);
                  setGrantPw("");
                }}
              >
                Authorize &amp; Grant
              </button>
            </div>
          </div>
        </div>
      )}

      {prompt.element}
    </div>
  );
}

/* ------------------------- Enrollment dialog --------------------------- */

function EnrollDialog({
  presetAdmin,
  actingUserName,
  onDone,
  onClose,
}: {
  presetAdmin: boolean;
  actingUserName: string;
  onDone: (t: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(presetAdmin);
  const [authorizerPassword, setAuthorizerPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createUser({
        userName: userName.trim(),
        password,
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        isAdmin,
        // Two-step authorization for ADMIN creation (SRS §6.5.15.8).
        authorizerPassword: isAdmin ? authorizerPassword : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      onDone(
        `Account ${userName.trim()} created${isAdmin ? " with the ADMIN role" : ""}.`,
      );
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  const ready =
    userName.trim() !== "" &&
    email.trim() !== "" &&
    password !== "" &&
    (!isAdmin || authorizerPassword !== "");

  return (
    <div
      className="sstpa-dialog-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="sstpa-frame sstpa-dialog"
        style={{ minWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{isAdmin ? "Enroll new admin" : "Enroll new user"}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "0.8rem" }}>
            Display name
            <input
              className="sstpa-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
            />
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            User name
            <input
              className="sstpa-input"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            Email
            <input
              className="sstpa-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            Initial password
            <input
              className="sstpa-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />{" "}
            Admin
          </label>
          {isAdmin && (
            <div
              style={{
                border: "var(--sstpa-border-soft)",
                borderRadius: "var(--sstpa-radius)",
                background: "var(--sstpa-ivory-sunken)",
                padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
              }}
            >
              <p style={{ margin: "0 0 6px", fontSize: "0.78rem" }}>
                Authorization step (SRS §6.5.15.8): creating an ADMIN account
                requires re-authentication by the acting admin.
              </p>
              <label style={{ fontSize: "0.8rem" }}>
                Your password ({actingUserName})
                <input
                  className="sstpa-input"
                  type="password"
                  value={authorizerPassword}
                  onChange={(e) => setAuthorizerPassword(e.target.value)}
                />
              </label>
            </div>
          )}
          {error && <div className="sstpa-alert-error">{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="sstpa-button secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="sstpa-button"
              disabled={!ready || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending
                ? "Enrolling…"
                : isAdmin
                  ? "Authorize & Enroll"
                  : "Enroll"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Disenrollment workflow ------------------------ */

function DisenrollWizard({
  user,
  candidates,
  presetDestination,
  onClose,
  onDone,
}: {
  user: RosterUser;
  candidates: RosterUser[];
  presetDestination?: string;
  onClose: () => void;
  onDone: (t: string) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dest, setDest] = useState(() =>
    presetDestination && candidates.some((c) => c.userName === presetDestination)
      ? presetDestination
      : (candidates[0]?.userName ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    nodesTransferred: number;
    dataTransferredTo: string;
  } | null>(null);

  const run = useMutation({
    mutationFn: () =>
      api.updateUser(user.userName, { disenroll: true, transferTo: dest }),
    onSuccess: (d) => {
      const r = d as unknown as {
        nodesTransferred?: number;
        dataTransferredTo?: string;
      };
      setError(null);
      setResult({
        nodesTransferred: Number(r.nodesTransferred ?? 0),
        dataTransferredTo: String(r.dataTransferredTo ?? dest),
      });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-messages"] });
    },
    onError: (e) => setError(errorText(e)),
  });

  const stepTitle =
    step === 1 ? "Review account" : step === 2 ? "Choose transfer destination" : "Final confirmation";

  return (
    <div className="sstpa-dialog-overlay">
      <div
        className="sstpa-frame sstpa-dialog"
        style={{ minWidth: 540 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Disenroll ${user.userName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Disenroll {user.userName}</h2>

        {result ? (
          <>
            <div className="sstpa-alert-success">
              <p style={{ margin: 0 }}>
                <strong>{user.userName}</strong> has been disenrolled.
              </p>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li>
                  {result.nodesTransferred} owned Core Data node(s) transferred to{" "}
                  <strong>{result.dataTransferredTo}</strong>.
                </li>
                <li>Mailbox messages soft-deleted (retained for audit).</li>
                <li>Account retained with status DISENROLLED; login disabled.</li>
                <li>Active sessions revoked.</li>
              </ul>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button
                className="sstpa-button"
                onClick={() => {
                  onDone(
                    `${user.userName} disenrolled — ${result.nodesTransferred} node(s) transferred to ${result.dataTransferredTo}.`,
                  );
                  onClose();
                }}
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--sstpa-navy-muted)",
                margin: "0 0 10px",
              }}
            >
              Step {step} of 3 — {stepTitle}
            </p>

            {step === 1 && (
              <>
                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "max-content 1fr",
                    gap: "4px 16px",
                    fontSize: "0.85rem",
                    margin: 0,
                  }}
                >
                  <Field label="Display Name:">{user.displayName}</Field>
                  <Field label="Username:">{user.userName}</Field>
                  <Field label="Email:">{user.email}</Field>
                  <Field label="Role:">
                    <RoleBadge role={roleOf(user)} />
                  </Field>
                  <Field label="Status:">
                    <StatusLabel status={user.accountStatus} />
                  </Field>
                  <Field label="Owned Core Data nodes:">{String(user.ownedNodes)}</Field>
                  <Field label="Unread messages:">{String(user.unreadMessages)}</Field>
                </dl>
                <div className="sstpa-alert-warning" style={{ marginTop: 10 }}>
                  Disenrollment is permanent once completed (SRS §6.5.15.11).
                  The account is retained for audit but can never log in again.
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 12,
                  }}
                >
                  <button className="sstpa-button secondary" onClick={onClose}>
                    Cancel
                  </button>
                  <button className="sstpa-button" onClick={() => setStep(2)}>
                    Continue →
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p style={{ fontSize: "0.85rem" }}>
                  All {user.ownedNodes} Core Data node(s) owned by{" "}
                  <strong>{user.userName}</strong> will be transferred to the
                  destination account. Only ACTIVE non-admin users are eligible
                  (SRS §6.5.15.10); the Backend requires a destination even when
                  the account owns no data.
                </p>
                {candidates.length === 0 ? (
                  <div className="sstpa-alert-warning">
                    No ACTIVE non-admin user is available to receive ownership.
                    Enroll or reinstate an eligible USER account first.
                  </div>
                ) : (
                  <label style={{ fontSize: "0.85rem" }}>
                    Transfer ownership to{" "}
                    <select
                      className="sstpa-input"
                      style={{ width: "auto", display: "inline-block" }}
                      value={dest}
                      onChange={(e) => setDest(e.target.value)}
                    >
                      {candidates.map((c) => (
                        <option key={c.userName} value={c.userName}>
                          {c.displayName} ({c.userName})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 12,
                  }}
                >
                  <button className="sstpa-button secondary" onClick={() => setStep(1)}>
                    ← Back
                  </button>
                  <button className="sstpa-button secondary" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    className="sstpa-button"
                    disabled={!dest || candidates.length === 0}
                    onClick={() => setStep(3)}
                  >
                    Continue →
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p style={{ fontSize: "0.85rem", marginTop: 0 }}>
                  Confirming will execute the following in a single transaction:
                </p>
                <ul style={{ fontSize: "0.85rem", margin: 0, paddingLeft: 18 }}>
                  <li>
                    Ownership of <strong>{user.ownedNodes}</strong> Core Data
                    node(s) transfers to <strong>{dest}</strong> (Owner and
                    OwnerEmail updated; Creator unchanged).
                  </li>
                  <li>
                    All messages in {user.userName}&rsquo;s mailbox are
                    soft-deleted (retained in the database for audit).
                  </li>
                  <li>
                    The account is retained with AccountStatus = DISENROLLED —
                    it is <strong>not</strong> deleted, but can never log in.
                  </li>
                  <li>Active sessions for {user.userName} are revoked immediately.</li>
                </ul>
                <div className="sstpa-alert-warning" style={{ marginTop: 10 }}>
                  This action is permanent and cannot be undone from the Admin
                  Tool.
                </div>
                {error && (
                  <div className="sstpa-alert-error" style={{ marginTop: 8 }}>
                    {error}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 12,
                  }}
                >
                  <button className="sstpa-button secondary" onClick={() => setStep(2)}>
                    ← Back
                  </button>
                  <button className="sstpa-button secondary" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    className="sstpa-button danger"
                    disabled={run.isPending}
                    onClick={() => run.mutate()}
                  >
                    {run.isPending ? "Disenrolling…" : "Confirm Disenrollment"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------- Message Management -------------------------- */

type MsgSortKey = "subject" | "sender" | "recipient" | "type" | "read" | "date" | "hids";

function msgSortValue(m: MessageSummary, key: MsgSortKey): string {
  switch (key) {
    case "subject":
      return String(m.subject ?? "").toLowerCase();
    case "sender":
      return String(m.sender ?? "").toLowerCase();
    case "recipient":
      return String(m.recipient ?? "").toLowerCase();
    case "type":
      return String(m.messageType ?? "");
    case "read":
      return m.isRead ? "1" : "0";
    case "date":
      return String(m.sentAt ?? "");
    case "hids":
      return (m.relatedNodeHids ?? [])[0] ?? "";
  }
}

const MSG_COLUMNS: { key: MsgSortKey; label: string }[] = [
  { key: "subject", label: "Subject" },
  { key: "sender", label: "Sender" },
  { key: "recipient", label: "Recipient" },
  { key: "type", label: "Type" },
  { key: "read", label: "Read/Unread" },
  { key: "date", label: "Date" },
  { key: "hids", label: "HIDs" },
];

function MessagesMode({
  userFilter,
  onClearUserFilter,
  onNotice,
}: {
  userFilter: string | null;
  onClearUserFilter: () => void;
  onNotice: (t: string) => void;
}) {
  const qc = useQueryClient();
  const token = useSession((s) => s.token);
  const msgs = useQuery({
    queryKey: ["admin-messages"],
    queryFn: () => api.messages({ all: "true" }),
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<MsgSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [purging, setPurging] = useState<MessageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const purge = useMutation({
    mutationFn: (id: string) => purgeMessage(id, token),
    onSuccess: () => {
      setError(null);
      onNotice("Message purged from all mailboxes (global soft delete).");
      void qc.invalidateQueries({ queryKey: ["admin-messages"] });
      void qc.invalidateQueries({ queryKey: ["messages"] });
      void qc.invalidateQueries({ queryKey: ["unread-count"] });
    },
    onError: (e) => setError(errorText(e)),
  });

  const rows = useMemo(() => {
    let list = msgs.data?.messages ?? [];
    if (userFilter) {
      list = list.filter((m) => m.sender === userFilter || m.recipient === userFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((m) =>
        [m.subject, m.sender, m.recipient].some((v) =>
          String(v ?? "").toLowerCase().includes(q),
        ),
      );
    }
    return [...list].sort((a, b) => {
      const va = msgSortValue(a, sortKey);
      const vb = msgSortValue(b, sortKey);
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? c : -c;
    });
  }, [msgs.data, userFilter, search, sortKey, sortDir]);

  const onSort = (key: string) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key as MsgSortKey);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  return (
    <>
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
        <span style={{ fontSize: "0.82rem", color: "var(--sstpa-navy-muted)" }}>
          All mailboxes (admin view, SRS §6.5.15.5b)
        </span>
        <input
          className="sstpa-input"
          style={{ width: 220 }}
          placeholder="Search subject, sender, recipient…"
          aria-label="Search messages"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {userFilter && (
          <span
            className="type-badge"
            style={{ background: "var(--sstpa-navy)", display: "inline-flex", gap: 6 }}
          >
            Mailbox: {userFilter}
            <button
              onClick={onClearUserFilter}
              aria-label="Clear mailbox filter"
              style={{
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                padding: 0,
                font: "inherit",
              }}
            >
              ✕
            </button>
          </span>
        )}
        <span style={{ flex: 1 }} />
      </div>

      {error && (
        <div className="sstpa-alert-error" style={{ margin: "8px 12px" }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        {msgs.isPending || msgs.isError || rows.length === 0 ? (
          <ToolStatus
            loading={msgs.isPending}
            error={msgs.error ?? undefined}
            onRetry={() => void msgs.refetch()}
            empty={rows.length === 0 && "No messages match the current filter."}
          />
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  borderBottom: "2px solid var(--sstpa-navy)",
                }}
              >
                {MSG_COLUMNS.map((c) => (
                  <SortHeader
                    key={c.key}
                    label={c.label}
                    k={c.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                ))}
                <th style={{ padding: "6px 10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr
                  key={m.messageId}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open message: ${m.subject}`}
                  style={{
                    borderBottom: "1px solid var(--sstpa-line-soft)",
                    cursor: "pointer",
                  }}
                  onClick={() => setOpenId(m.messageId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setOpenId(m.messageId);
                    }
                  }}
                >
                  <td style={{ padding: "5px 10px" }}>{m.subject}</td>
                  <td>{m.sender}</td>
                  <td>{m.recipient}</td>
                  <td>
                    <span className="mono" style={{ fontSize: "0.64rem" }}>
                      {m.messageType}
                    </span>
                  </td>
                  <td
                    style={{
                      color: m.isRead
                        ? "var(--sstpa-navy-muted)"
                        : "var(--sstpa-status-info)",
                    }}
                  >
                    {m.isRead ? "Read" : "● Unread"}
                  </td>
                  <td className="mono" style={{ fontSize: "0.68rem" }}>
                    {fmtDate(m.sentAt)}
                  </td>
                  <td className="mono" style={{ fontSize: "0.64rem" }}>
                    {(m.relatedNodeHids ?? []).slice(0, 2).join(", ")}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-button danger"
                      title="Remove this message from all mailboxes (global soft delete)"
                      onClick={() => setPurging(m)}
                    >
                      Purge…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openId && (
        <AdminMessageDetail messageId={openId} onClose={() => setOpenId(null)} />
      )}

      {purging && (
        <ConfirmDialog
          title="Purge message?"
          confirmLabel="Purge"
          danger
          onCancel={() => setPurging(null)}
          onConfirm={() => {
            purge.mutate(purging.messageId);
            setPurging(null);
          }}
        >
          <p>
            “{purging.subject}” (from {purging.sender} to {purging.recipient},{" "}
            {fmtDate(purging.sentAt)}) will be removed from{" "}
            <strong>all</strong> mailboxes — both parties lose it from their
            lists. The record is retained in the database for audit (soft
            delete).
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

function AdminMessageDetail({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["admin-message", messageId],
    queryFn: () => api.message(messageId),
  });
  const msg = (detail.data?.msg ?? null) as Record<string, unknown> | null;

  return (
    <div
      className="sstpa-dialog-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="sstpa-frame sstpa-dialog"
        style={{ minWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        {detail.isPending || detail.isError || !msg ? (
          <>
            <h2>Message</h2>
            <ToolStatus
              loading={detail.isPending}
              error={detail.error ?? undefined}
              onRetry={() => void detail.refetch()}
            />
          </>
        ) : (
          <>
            <h2>{String(msg.Subject ?? "(no subject)")}</h2>
            <p
              className="mono"
              style={{ fontSize: "0.7rem", color: "var(--sstpa-navy-muted)" }}
            >
              {String(msg.MessageType ?? "")} · from {String(msg.Sender ?? "")} to{" "}
              {String(msg.Recipient ?? "")} ·{" "}
              {String(msg.SentAt ?? "").slice(0, 19).replace("T", " ")}
            </p>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "var(--sstpa-font-ui)",
                fontSize: "0.85rem",
                background: "var(--sstpa-ivory-sunken)",
                padding: "var(--sstpa-sp-3)",
                borderRadius: "var(--sstpa-radius)",
                maxHeight: 300,
                overflow: "auto",
              }}
            >
              {String(msg.Body ?? "")}
            </pre>
            {Array.isArray(msg.RelatedNodeHIDs) && msg.RelatedNodeHIDs.length > 0 && (
              <p className="mono" style={{ fontSize: "0.72rem" }}>
                Related: {(msg.RelatedNodeHIDs as string[]).join(", ")}
              </p>
            )}
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="sstpa-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Ownership Transfer -------------------------- */

function TransferMode({
  roster,
  from,
  setFrom,
  actingIsRoot,
  actingUserName,
  onStartDisenroll,
}: {
  roster: RosterUser[];
  from: string;
  setFrom: (u: string) => void;
  actingIsRoot: boolean;
  actingUserName: string;
  onStartDisenroll: (userName: string, presetDest: string) => void;
}) {
  const [to, setTo] = useState("");
  const sources = roster.filter((u) => !u.isRootAdmin);
  const destinations = roster.filter(
    (u) =>
      roleOf(u) === "USER" && u.accountStatus === "ACTIVE" && u.userName !== from,
  );
  const src = roster.find((u) => u.userName === from);

  const reason: string | null = !from
    ? "Select a source user first."
    : !src
      ? "Source user not found."
      : src.isRootAdmin
        ? ROOT_LOCKED
        : src.userName === actingUserName
          ? "An account cannot disenroll itself."
          : src.accountStatus === "DISENROLLED"
            ? "This account is already disenrolled."
            : roleOf(src) === "ADMIN" && !actingIsRoot
              ? `${NEEDS_ROOT} (Root Admin only)`
              : !to
                ? "Select a destination user."
                : null;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div style={{ maxWidth: 640 }}>
        <h3 style={{ marginTop: 0 }}>Ownership Transfer</h3>
        <p style={{ fontSize: "0.85rem" }}>
          Reassigns Owner and OwnerEmail on all Core Data nodes owned by the
          source user to the destination user (SRS §6.5.15.10). The destination
          must be an ACTIVE non-admin user.
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.82rem" }}>
            Transfer FROM
            <br />
            <select
              className="sstpa-input"
              style={{ width: "auto" }}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              <option value="">— select source —</option>
              {sources.map((u) => (
                <option key={u.userName} value={u.userName}>
                  {u.displayName} ({u.userName}) — {u.ownedNodes} node(s)
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.82rem" }}>
            Transfer TO
            <br />
            <select
              className="sstpa-input"
              style={{ width: "auto" }}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">— select destination —</option>
              {destinations.map((u) => (
                <option key={u.userName} value={u.userName}>
                  {u.displayName} ({u.userName})
                </option>
              ))}
            </select>
          </label>
        </div>

        {src && (
          <p style={{ fontSize: "0.85rem" }}>
            <strong>{src.displayName}</strong> ({src.userName}) owns{" "}
            <strong>{src.ownedNodes}</strong> Core Data node(s). A per-node-type
            breakdown is not available from this Backend version.
          </p>
        )}

        <div className="sstpa-alert-warning" style={{ margin: "10px 0" }}>
          This Backend version executes the global ownership transfer only as
          part of the Disenrollment workflow (SRS §6.5.15.11): the source
          account is disenrolled and all of its owned Core Data transfers to
          the destination in one transaction. A standalone transfer that keeps
          the source account active is not yet supported by the Backend API.
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--sstpa-navy-muted)" }}>
          For selective, per-node transfers while keeping the source account
          active: ownership changes automatically when another user commits an
          edit to a node (SRS §3.2) — have the new owner edit and commit the
          nodes in question.
        </p>

        <ActionButton
          label={
            from && to
              ? `Disenroll ${from} and transfer owned data to ${to}…`
              : "Disenroll source and transfer owned data…"
          }
          danger
          reason={reason}
          onClick={() => onStartDisenroll(from, to)}
        />
      </div>
    </div>
  );
}

/* ------------------------- Sandbox Management -------------------------- */

function SandboxMode() {
  const show = useUnderConstruction((s) => s.show);
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)" }}>
      <div style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Sandbox Management</h3>
        <div className="sstpa-alert-warning">
          Sandbox Management (SRS §6.5.15.5d) requires Backend (:Sandbox)
          endpoints that are not available in this version.
        </div>
        <p style={{ fontSize: "0.85rem" }}>
          Listing a user&rsquo;s (:Sandbox) nodes, transferring their ownership
          to another active user, and deleting them during disenrollment will
          appear here once the Backend exposes sandbox management APIs.
        </p>
        <button
          className="sstpa-button secondary"
          onClick={() => show("Sandbox Management")}
        >
          🚧 Under Construction
        </button>
      </div>
    </div>
  );
}

/* --------------------------- Backend Status ---------------------------- */

function BackendMode({ endpoint }: { endpoint: string }) {
  const capability = useQuery({
    queryKey: ["admin-capability"],
    queryFn: api.capability,
    retry: 1,
  });
  const product = useQuery({
    queryKey: ["admin-product"],
    queryFn: api.product,
    retry: 1,
  });
  const cap = capability.data;
  const prod = (product.data?.product ?? null) as Record<string, unknown> | null;
  const components = (product.data?.components ?? []) as Record<string, unknown>[];

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div style={{ maxWidth: 640 }}>
        <h3 style={{ marginTop: 0 }}>Backend Status</h3>

        {capability.isPending || capability.isError ? (
          <ToolStatus
            loading={capability.isPending}
            error={capability.error ?? undefined}
            onRetry={() => void capability.refetch()}
          />
        ) : (
          cap && (
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                gap: "4px 16px",
                fontSize: "0.85rem",
              }}
            >
              <Field label="Endpoint:">
                <span className="mono" style={{ fontSize: "0.78rem" }}>
                  {endpoint}
                </span>
              </Field>
              <Field label="Service status:">
                <span style={{ color: "var(--sstpa-status-ok)", fontWeight: 600 }}>
                  Connected
                </span>
              </Field>
              <Field label="Product:">{cap.product}</Field>
              <Field label="Version:">
                {cap.version} (build {cap.build})
              </Field>
              <Field label="Environment:">{cap.environment}</Field>
              <Field label="Schema version:">{cap.schemaVersion}</Field>
              <Field label="API versions:">{(cap.apiVersions ?? []).join(", ")}</Field>
              <Field label="Capabilities:">
                <span className="mono" style={{ fontSize: "0.72rem" }}>
                  {(cap.capabilities ?? []).join(", ")}
                </span>
              </Field>
            </dl>
          )
        )}

        <h4>Product Data (SRS §3.1)</h4>
        {product.isPending || product.isError ? (
          <ToolStatus
            loading={product.isPending}
            error={product.error ?? undefined}
            onRetry={() => void product.refetch()}
          />
        ) : (
          prod && (
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                gap: "4px 16px",
                fontSize: "0.85rem",
              }}
            >
              <Field label="Name:">{String(prod.Name ?? "")}</Field>
              <Field label="Version:">{String(prod.Version ?? "")}</Field>
              <Field label="Build:">{String(prod.BuildNumber ?? "")}</Field>
              <Field label="Open-source components:">
                {components.length === 0
                  ? "none recorded"
                  : components
                      .map((c) => `${String(c.Name ?? "?")} ${String(c.Version ?? "")}`)
                      .join(", ")}
              </Field>
            </dl>
          )
        )}

        <div className="sstpa-alert-warning" style={{ marginTop: 12 }}>
          Node-count summaries by type, active session count, and last-backup
          timestamp (SRS §6.5.15.5e) are not exposed by this Backend version —
          use the Grafana dashboard for Backend telemetry (SRS §1.2.1).
        </div>
      </div>
    </div>
  );
}
