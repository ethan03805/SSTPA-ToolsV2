// Admin user management (SRS §3.2, §3.2.1, §6.5.15).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (UserIdentity, bool) {
	user, _ := CurrentUser(r.Context())
	if !user.IsAdmin && !user.IsRootAdmin {
		writeError(w, http.StatusForbidden, "admin privileges required (SRS §3.2)", "")
		return user, false
	}
	return user, true
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (u:User)
			RETURN u.UserName AS userName, u.Email AS email, u.IsAdmin AS isAdmin,
			       toString(u.CreateDate) AS createDate, false AS isRootAdmin
			UNION
			MATCH (ra:RootAdmin)
			RETURN ra.UserName AS userName, ra.Email AS email, true AS isAdmin,
			       toString(ra.CreateDate) AS createDate, true AS isRootAdmin`, nil)
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
		writeError(w, http.StatusInternalServerError, "user list failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": res})
}

type createUserRequest struct {
	UserName string `json:"userName"`
	Password string `json:"password"`
	Email    string `json:"email"`
	IsAdmin  bool   `json:"isAdmin"`
}

// handleCreateUser enrolls a new (:User) with a mailbox and welcome message
// (SRS §3: "New Users will own no data and have only one message from SSTPA
// Tools welcoming them").
func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		req.UserName == "" || req.Password == "" || req.Email == "" {
		writeError(w, http.StatusBadRequest, "userName, password, email are required", "")
		return
	}
	_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			OPTIONAL MATCH (u:User {UserName: $name})
			OPTIONAL MATCH (ra:RootAdmin {UserName: $name})
			RETURN u IS NOT NULL OR ra IS NOT NULL AS exists`,
			map[string]any{"name": req.UserName})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		if exists, _ := single.AsMap()["exists"].(bool); exists {
			return nil, errUserExists
		}
		_, err = tx.Run(r.Context(), `
			CREATE (u:User {
				UserName: $name, Password: $pw, Email: $email,
				CreateDate: datetime(), IsAdmin: $isAdmin
			})
			CREATE (mb:Mailbox {
				MailboxID: randomUUID(), Owner: $name, OwnerEmail: $email,
				UnreadCount: 1, Created: datetime(), LastTouch: datetime()
			})
			CREATE (u)-[:OWNS_MAILBOX]->(mb)
			CREATE (m:Message {
				MessageID: randomUUID(),
				Subject: "Welcome to SSTPA Tools",
				Body: "Welcome to SSTPA Tools. Your account has been created. Open the Navigator Tool to select a System of Interest and begin.",
				MessageType: 'SYSTEM', SentAt: datetime(),
				Sender: 'SSTPA Tools', SenderEmail: 'nihlo2025@proton.me',
				Recipient: $name, RecipientEmail: $email,
				IsRead: false, IsDeleted: false,
				RequiresApproval: false, ApprovalStatus: 'NOT_APPLICABLE'
			})
			CREATE (mb)-[:HAS_MESSAGE]->(m)`,
			map[string]any{"name": req.UserName, "pw": hashPassword(req.Password),
				"email": req.Email, "isAdmin": req.IsAdmin})
		return nil, err
	})
	if err == errUserExists {
		writeError(w, http.StatusConflict, "user already exists", req.UserName)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user creation failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "created", "userName": req.UserName})
}

type updateUserRequest struct {
	IsAdmin  *bool   `json:"isAdmin,omitempty"`
	Password *string `json:"password,omitempty"`
	Email    *string `json:"email,omitempty"`
	// Disenroll transfers all owned data to TransferTo and removes the user
	// (SRS §3: Admins disenrolling Users SHALL transfer ownership).
	Disenroll  bool   `json:"disenroll,omitempty"`
	TransferTo string `json:"transferTo,omitempty"`
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	userName := chi.URLParam(r, "userName")
	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload", "")
		return
	}

	if req.Disenroll {
		if req.TransferTo == "" {
			writeError(w, http.StatusBadRequest,
				"disenrollment requires transferTo for owned data (SRS §3)", "")
			return
		}
		_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
			// Transfer ownership of all owned Core data to the target user.
			rec, err := tx.Run(r.Context(), `
				MATCH (t:User {UserName: $to})
				RETURN t.UserName AS name, t.Email AS email`,
				map[string]any{"to": req.TransferTo})
			if err != nil {
				return nil, err
			}
			single, err := rec.Single(r.Context())
			if err != nil {
				return nil, errTransferTarget
			}
			tm := single.AsMap()
			toEmail, _ := tm["email"].(string)
			if _, err := tx.Run(r.Context(), `
				MATCH (n:SSTPA) WHERE n.Owner = $from
				SET n.Owner = $to, n.OwnerEmail = $toEmail, n.LastTouch = datetime()`,
				map[string]any{"from": userName, "to": req.TransferTo, "toEmail": toEmail}); err != nil {
				return nil, err
			}
			// Remove the user, their mailbox and messages (export is the
			// Admin Tool's concern before disenrollment).
			if _, err := tx.Run(r.Context(), `
				MATCH (u:User {UserName: $name})
				OPTIONAL MATCH (u)-[:OWNS_MAILBOX]->(mb:Mailbox)
				OPTIONAL MATCH (mb)-[:HAS_MESSAGE]->(m:Message)
				DETACH DELETE m, mb, u`,
				map[string]any{"name": userName}); err != nil {
				return nil, err
			}
			return nil, nil
		})
		if err == errTransferTarget {
			writeError(w, http.StatusBadRequest, "transfer target user not found", req.TransferTo)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "disenrollment failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{
			"status": "disenrolled", "dataTransferredTo": req.TransferTo, "by": admin.UserName})
		return
	}

	set := map[string]any{}
	if req.IsAdmin != nil {
		set["IsAdmin"] = *req.IsAdmin
	}
	if req.Password != nil {
		set["Password"] = hashPassword(*req.Password)
	}
	if req.Email != nil {
		set["Email"] = *req.Email
	}
	if len(set) == 0 {
		writeError(w, http.StatusBadRequest, "nothing to update", "")
		return
	}
	_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(),
			`MATCH (u:User {UserName: $name}) SET u += $set RETURN count(u) AS n`,
			map[string]any{"name": userName, "set": set})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		if n, _ := single.AsMap()["n"].(int64); n == 0 {
			return nil, errUserNotFound
		}
		return nil, nil
	})
	if err == errUserNotFound {
		writeError(w, http.StatusNotFound, "user not found", userName)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

var (
	errUserExists     = &constError{"user exists"}
	errUserNotFound   = &constError{"user not found"}
	errTransferTarget = &constError{"transfer target not found"}
)
