// Message Center (SRS §6.5.14, §3.2.4, §5.6.6.11): mailbox list with
// column-header sorting (repeated click reverses), keyboard navigation,
// explicit Read/Unread column, unread highlighting, refresh, detail view
// with reply (quoting the original) and per-user delete, and compose.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { MessageSummary } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorText, ToolStatus } from "../shared";

type Box = "inbox" | "outbox";
type SortKey = "subject" | "party" | "type" | "read" | "date" | "hids";
type SortDir = "asc" | "desc";

/** Sortable value per column (§6.5.14.7: sort by clicking column headers). */
function sortValue(m: MessageSummary, key: SortKey, box: Box): string {
  switch (key) {
    case "subject":
      return String(m.subject ?? "").toLowerCase();
    case "party":
      return String((box === "inbox" ? m.sender : m.recipient) ?? "").toLowerCase();
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

/** Clickable column header; repeated click reverses the sort (§6.5.14.7). */
function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
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

export default function MessageCenterTool() {
  const qc = useQueryClient();
  const [box, setBox] = useState<Box>("inbox");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const messages = useQuery({
    queryKey: ["messages", box],
    queryFn: () => api.messages({ box }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["messages"] });
    void qc.invalidateQueries({ queryKey: ["unread-count"] });
  };

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const rows = useMemo(() => {
    const list = [...(messages.data?.messages ?? [])];
    list.sort((a, b) => {
      const va = sortValue(a, sortKey, box);
      const vb = sortValue(b, sortKey, box);
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? c : -c;
    });
    return list;
  }, [messages.data, sortKey, sortDir, box]);

  // Keyboard navigation (§6.5.14.7): Enter opens, arrows move row focus.
  const onRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setOpenId(id);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sibling =
        e.key === "ArrowDown"
          ? e.currentTarget.nextElementSibling
          : e.currentTarget.previousElementSibling;
      (sibling as HTMLElement | null)?.focus?.();
    }
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "subject", label: "Subject" },
    { key: "party", label: box === "inbox" ? "Sender" : "Recipient" },
    { key: "type", label: "Type" },
    { key: "read", label: "Read/Unread" },
    { key: "date", label: "Date" },
    { key: "hids", label: "Related HIDs" },
  ];

  return (
    <div className="tool-shell" style={{ height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: "var(--sstpa-sp-2)",
          alignItems: "center",
          padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
          borderBottom: "var(--sstpa-border-soft)",
        }}
      >
        <button
          className={`sstpa-button ${box === "inbox" ? "" : "secondary"}`}
          onClick={() => setBox("inbox")}
        >
          Inbox
        </button>
        <button
          className={`sstpa-button ${box === "outbox" ? "" : "secondary"}`}
          onClick={() => setBox("outbox")}
        >
          Outbox
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="sstpa-button secondary"
          title="Refresh the mailbox (SRS §6.5.14.6)"
          onClick={refresh}
        >
          ⟳ Refresh
        </button>
        <button className="sstpa-button" onClick={() => setComposing(true)}>
          ✎ New message
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

      <div style={{ flex: 1, overflow: "auto" }}>
        {messages.isPending || messages.isError || rows.length === 0 ? (
          <ToolStatus
            loading={messages.isPending}
            error={messages.error ?? undefined}
            onRetry={() => void messages.refetch()}
            empty={
              rows.length === 0 &&
              (box === "inbox" ? "No messages in your inbox." : "No sent messages.")
            }
            emptyHint={
              box === "inbox"
                ? "Direct messages and change notifications will appear here."
                : "Use “✎ New message” to write to another user."
            }
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
                {columns.map((c) => (
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
              {rows.map((m) => {
                const unread = !m.isRead;
                const hids = m.relatedNodeHids ?? [];
                return (
                  <tr
                    key={m.messageId}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open message: ${m.subject}`}
                    style={{
                      borderBottom: "1px solid var(--sstpa-line-soft)",
                      fontWeight: unread && box === "inbox" ? 700 : 400,
                      cursor: "pointer",
                    }}
                    onClick={() => setOpenId(m.messageId)}
                    onKeyDown={(e) => onRowKeyDown(e, m.messageId)}
                  >
                    <td style={{ padding: "5px 10px" }}>{m.subject}</td>
                    <td>{box === "inbox" ? m.sender : m.recipient}</td>
                    <td>
                      <span className="mono" style={{ fontSize: "0.66rem" }}>
                        {m.messageType}
                      </span>
                    </td>
                    <td
                      style={{
                        color: unread
                          ? "var(--sstpa-status-info)"
                          : "var(--sstpa-navy-muted)",
                      }}
                    >
                      {unread ? "● Unread" : "Read"}
                    </td>
                    <td className="mono" style={{ fontSize: "0.7rem" }}>
                      {String(m.sentAt ?? "").slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="mono" style={{ fontSize: "0.66rem" }}>
                      {hids.slice(0, 3).join(", ")}
                      {hids.length > 3 ? "…" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openId && (
        <MessageDetail
          messageId={openId}
          isInbox={box === "inbox"}
          onNotice={setNotice}
          onClose={() => {
            setOpenId(null);
            refresh();
          }}
        />
      )}
      {composing && (
        <ComposeDialog
          onSent={(recipient) => setNotice(`Message sent to ${recipient}.`)}
          onClose={() => {
            setComposing(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function MessageDetail({
  messageId,
  isInbox,
  onNotice,
  onClose,
}: {
  messageId: string;
  isInbox: boolean;
  onNotice: (text: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["message", messageId],
    queryFn: () => api.message(messageId),
  });
  const [replyBody, setReplyBody] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Opening a message marks it read once content has loaded (§6.5.14.12);
  // run as an effect — never during render — and refresh both the list and
  // this detail so the read state is consistent everywhere.
  const { mutate: markReadNow } = useMutation({
    mutationFn: () => api.markRead(messageId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages"] });
      void qc.invalidateQueries({ queryKey: ["message", messageId] });
      void qc.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });
  const msg = (detail.data?.msg ?? null) as Record<string, unknown> | null;
  const shouldMarkRead = isInbox && !!msg && msg.IsRead === false;
  useEffect(() => {
    if (shouldMarkRead) markReadNow();
  }, [messageId, shouldMarkRead, markReadNow]);

  const del = useMutation({
    mutationFn: () => api.deleteMessage(messageId),
    onSuccess: () => {
      onNotice("Message removed from your list.");
      onClose();
    },
  });
  const reply = useMutation({
    mutationFn: (body: string) => api.replyMessage(messageId, body),
    onSuccess: () => {
      onNotice("Reply sent.");
      onClose();
    },
  });

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
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="sstpa-button" onClick={onClose}>
                Close
              </button>
            </div>
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
            {del.isError && (
              <div className="sstpa-alert-error" style={{ marginBottom: 8 }}>
                {errorText(del.error)}
              </div>
            )}
            {reply.isError && (
              <div className="sstpa-alert-error" style={{ marginBottom: 8 }}>
                {errorText(reply.error)}
              </div>
            )}
            {replyBody !== null ? (
              <>
                <textarea
                  className="sstpa-input"
                  rows={4}
                  autoFocus
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Reply…"
                />
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 8,
                  }}
                >
                  <button
                    className="sstpa-button secondary"
                    onClick={() => setReplyBody(null)}
                  >
                    Discard
                  </button>
                  <button
                    className="sstpa-button"
                    disabled={!replyBody.trim() || reply.isPending}
                    onClick={() => reply.mutate(replyBody)}
                  >
                    {reply.isPending ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {isInbox && (
                  <button
                    className="sstpa-button secondary"
                    onClick={() => setReplyBody("")}
                  >
                    Reply
                  </button>
                )}
                <button
                  className="sstpa-button danger"
                  disabled={del.isPending}
                  onClick={() => setConfirmingDelete(true)}
                >
                  {del.isPending ? "Deleting…" : "Delete"}
                </button>
                <button className="sstpa-button" onClick={onClose}>
                  Close
                </button>
              </div>
            )}
            {confirmingDelete && (
              <ConfirmDialog
                title="Delete message?"
                confirmLabel="Delete"
                danger
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => {
                  setConfirmingDelete(false);
                  del.mutate();
                }}
              >
                <p>
                  “{String(msg.Subject ?? "")}” will be removed from{" "}
                  <strong>your</strong> message list only; the other party keeps
                  their copy (per-user delete, SRS §6.5.14.11). The record is
                  retained for audit.
                </p>
              </ConfirmDialog>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ComposeDialog({
  onSent,
  onClose,
}: {
  onSent: (recipient: string) => void;
  onClose: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () =>
      api.sendMessage({ recipient: recipient.trim(), subject, body }),
    onSuccess: () => {
      onSent(recipient.trim());
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

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
        style={{ minWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>New message</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "0.8rem" }}>
            To (user name)
            <input
              className="sstpa-input"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              autoFocus
            />
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            Subject
            <input
              className="sstpa-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <textarea
            className="sstpa-input"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body…"
          />
          {error && <div className="sstpa-alert-error">{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="sstpa-button secondary" onClick={onClose}>
              Discard
            </button>
            <button
              className="sstpa-button"
              disabled={!recipient.trim() || !subject.trim() || send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
