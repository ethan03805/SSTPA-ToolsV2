// Messaging API (SRS §5.6.6.11, §3.2.4).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// handleListMessages returns the current user's messages: inbox (Recipient)
// and outbox (Sender). List view returns subject, datetime, HID summary,
// sender, message type, read/unread; supports sort by subject, datetime, HID,
// sender, ascending/descending (SRS §5.6.6.11). Admins may list all messages
// with ?all=true (§3.2).
func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	limit, offset := paginate(r, 100, 500)
	box := r.URL.Query().Get("box") // inbox | outbox | "" (both)
	all := r.URL.Query().Get("all") == "true" && user.IsAdmin

	sortField := map[string]string{
		"subject":  "m.Subject",
		"datetime": "m.SentAt",
		"hid":      "coalesce(m.RelatedNodeHIDs[0], '')",
		"sender":   "m.Sender",
	}[strings.ToLower(r.URL.Query().Get("sort"))]
	if sortField == "" {
		sortField = "m.SentAt"
	}
	dir := "DESC"
	if strings.EqualFold(r.URL.Query().Get("order"), "asc") {
		dir = "ASC"
	}

	where := "(m.Recipient = $user OR m.Sender = $user)"
	if all {
		where = "1=1"
	} else if box == "inbox" {
		where = "m.Recipient = $user"
	} else if box == "outbox" {
		where = "m.Sender = $user"
	}

	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		// Deletion is per-user: a message a user removed from their own list
		// (DeletedBy) stays visible to the other party (SRS §6.5.14.11).
		rec, err := tx.Run(r.Context(), `
			MATCH (m:Message) WHERE `+where+` AND coalesce(m.IsDeleted, false) = false
			  AND NOT $user IN coalesce(m.DeletedBy, [])
			RETURN m.MessageID AS messageId, m.Subject AS subject, toString(m.SentAt) AS sentAt,
			       m.RelatedNodeHIDs AS relatedNodeHids, m.Sender AS sender,
			       m.Recipient AS recipient, m.MessageType AS messageType, m.IsRead AS isRead
			ORDER BY `+sortField+` `+dir+` SKIP $offset LIMIT $limit`,
			map[string]any{"user": user.UserName, "limit": limit, "offset": offset})
		if err != nil {
			return nil, err
		}
		var out []map[string]any
		for rec.Next(r.Context()) {
			out = append(out, rec.Record().AsMap())
		}
		return out, rec.Err()
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "message list failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": res, "limit": limit, "offset": offset})
}

// handleGetMessage returns full body plus related HIDs and reply chain
// (SRS §5.6.6.11). Users may read only messages they sent or received (§3.2.4).
func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	id := chi.URLParam(r, "messageId")
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (m:Message {MessageID: $id})
			OPTIONAL MATCH chain = (m)-[:REPLY_TO*1..20]->(prev:Message)
			WITH m, collect(DISTINCT {messageId: prev.MessageID, subject: prev.Subject,
			     sender: prev.Sender, sentAt: toString(prev.SentAt)}) AS replyChain
			RETURN m{.*, SentAt: toString(m.SentAt), ReadAt: toString(m.ReadAt)} AS msg, replyChain`,
			map[string]any{"id": id})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		return single.AsMap(), nil
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "message not found", id)
		return
	}
	m := res.(map[string]any)
	msg, _ := m["msg"].(map[string]any)
	if !user.IsAdmin {
		sender, _ := msg["Sender"].(string)
		recipient, _ := msg["Recipient"].(string)
		if sender != user.UserName && recipient != user.UserName {
			writeError(w, http.StatusForbidden, "not your message (SRS §3.2.4)", "")
			return
		}
	}
	writeJSON(w, http.StatusOK, m)
}

type sendMessageRequest struct {
	Recipient       string   `json:"recipient"`
	Subject         string   `json:"subject"`
	Body            string   `json:"body"`
	RelatedNodeHIDs []string `json:"relatedNodeHids,omitempty"`
}

// handleSendMessage creates a DIRECT message into the recipient's mailbox.
func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	var req sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Recipient == "" {
		writeError(w, http.StatusBadRequest, "recipient is required", "")
		return
	}
	res, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (u)-[:OWNS_MAILBOX]->(mb:Mailbox) WHERE u.UserName = $recipient
			WITH u, mb
			CREATE (m:Message {
				MessageID: randomUUID(), Subject: $subject, Body: $body,
				MessageType: 'DIRECT', SentAt: datetime(),
				Sender: $sender, SenderEmail: $senderEmail,
				Recipient: $recipient, RecipientEmail: coalesce(u.Email, ''),
				RelatedNodeHIDs: $hids,
				IsRead: false, IsDeleted: false,
				RequiresApproval: false, ApprovalStatus: 'NOT_APPLICABLE'
			})
			CREATE (mb)-[:HAS_MESSAGE]->(m)
			SET mb.UnreadCount = coalesce(mb.UnreadCount, 0) + 1, mb.LastTouch = datetime()
			RETURN m.MessageID AS messageId`,
			map[string]any{
				"recipient": req.Recipient, "subject": req.Subject, "body": req.Body,
				"sender": user.UserName, "senderEmail": user.Email,
				"hids": req.RelatedNodeHIDs,
			})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		return single.AsMap(), nil
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "send failed (unknown recipient?)", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

// handleReplyMessage replies to a message, copying the original body into the
// response (SRS §3.2.4) and linking [:REPLY_TO].
func (s *Server) handleReplyMessage(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	id := chi.URLParam(r, "messageId")
	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload", "")
		return
	}
	res, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (orig:Message {MessageID: $id})
			WHERE orig.Recipient = $user OR orig.Sender = $user
			MATCH (u)-[:OWNS_MAILBOX]->(mb:Mailbox) WHERE u.UserName = orig.Sender
			CREATE (m:Message {
				MessageID: randomUUID(),
				Subject: 'Re: ' + orig.Subject,
				Body: $body + '\n\n--- Original message ---\n' + orig.Body,
				MessageType: 'DIRECT', SentAt: datetime(),
				Sender: $user, SenderEmail: $email,
				Recipient: orig.Sender, RecipientEmail: orig.SenderEmail,
				IsRead: false, IsDeleted: false,
				RequiresApproval: false, ApprovalStatus: 'NOT_APPLICABLE'
			})
			CREATE (mb)-[:HAS_MESSAGE]->(m)
			CREATE (m)-[:REPLY_TO]->(orig)
			SET mb.UnreadCount = coalesce(mb.UnreadCount, 0) + 1, mb.LastTouch = datetime()
			RETURN m.MessageID AS messageId`,
			map[string]any{"id": id, "user": user.UserName, "email": user.Email, "body": req.Body})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		return single.AsMap(), nil
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "reply failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

// handleMarkRead marks a message read and decrements the mailbox unread count.
func (s *Server) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	id := chi.URLParam(r, "messageId")
	_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (mb:Mailbox)-[:HAS_MESSAGE]->(m:Message {MessageID: $id})
			WHERE m.Recipient = $user AND coalesce(m.IsRead, false) = false
			SET m.IsRead = true, m.ReadAt = datetime(),
			    mb.UnreadCount = CASE WHEN coalesce(mb.UnreadCount,0) > 0 THEN mb.UnreadCount - 1 ELSE 0 END
			RETURN count(m) AS n`,
			map[string]any{"id": id, "user": user.UserName})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		return single.AsMap(), nil
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "mark-read failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleDeleteMessage removes a message from the CURRENT user's list only
// (per-user soft delete via DeletedBy; SRS §6.5.14.11) — the other party
// still sees it. Admins may purge a message globally with ?purge=true (§3.2).
func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	id := chi.URLParam(r, "messageId")
	purge := r.URL.Query().Get("purge") == "true" && user.IsAdmin

	var err error
	if purge {
		_, err = s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
			return tx.Run(r.Context(), `
				MATCH (m:Message {MessageID: $id})
				SET m.IsDeleted = true, m.DeletedAt = datetime(), m.DeletedByAdmin = $user`,
				map[string]any{"id": id, "user": user.UserName})
		})
	} else {
		_, err = s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
			rec, e := tx.Run(r.Context(), `
				MATCH (m:Message {MessageID: $id})
				WHERE m.Recipient = $user OR m.Sender = $user
				SET m.DeletedBy = [x IN coalesce(m.DeletedBy, []) WHERE x <> $user] + $user
				RETURN count(m) AS n`,
				map[string]any{"id": id, "user": user.UserName})
			if e != nil {
				return nil, e
			}
			single, e := rec.Single(r.Context())
			if e != nil {
				return nil, e
			}
			if n, _ := single.AsMap()["n"].(int64); n == 0 {
				return nil, &constError{"message not found or not yours"}
			}
			return nil, nil
		})
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "delete failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// handleUnreadCount returns the user's mailbox unread count (SRS §5.6.6.11).
func (s *Server) handleUnreadCount(w http.ResponseWriter, r *http.Request) {
	user, _ := CurrentUser(r.Context())
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (m:Message) WHERE m.Recipient = $user
			  AND coalesce(m.IsRead, false) = false AND coalesce(m.IsDeleted, false) = false
			  AND NOT $user IN coalesce(m.DeletedBy, [])
			RETURN count(m) AS unread`,
			map[string]any{"user": user.UserName})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		return single.AsMap(), nil
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unread count failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}
