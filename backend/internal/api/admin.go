// Admin user management (SRS §3.2, §3.2.1, §6.5.15).
//
// Account lifecycle: ACTIVE ⇄ SUSPENDED → DISENROLLED. Disenrollment retains
// the (:User) node for audit (SRS §6.5.15.11 "it SHALL NOT be deleted"),
// transfers owned Core Data to an ACTIVE non-Admin user, soft-deletes the
// account's messages, and terminates its sessions.
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"crypto/subtle"
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

// handleListUsers returns the account roster with the §6.5.15.5a columns:
// identity, role, status, created/last touch, owned-node count, unread count.
func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (u:User)
			OPTIONAL MATCH (u)-[:OWNS_MAILBOX]->(mb:Mailbox)
			WITH u, mb
			OPTIONAL MATCH (mb)-[:HAS_MESSAGE]->(m:Message)
			WHERE coalesce(m.IsRead, false) = false AND coalesce(m.IsDeleted, false) = false
			  AND NOT u.UserName IN coalesce(m.DeletedBy, [])
			WITH u, count(m) AS unread
			CALL (u) {
				MATCH (n:SSTPA) WHERE n.Owner = u.UserName
				RETURN count(n) AS owned
			}
			RETURN u.UserName AS userName, u.Email AS email,
			       coalesce(u.DisplayName, u.UserName) AS displayName,
			       coalesce(u.IsAdmin, false) AS isAdmin,
			       coalesce(u.AccountStatus, 'ACTIVE') AS accountStatus,
			       toString(u.CreateDate) AS createDate,
			       toString(u.LastTouch) AS lastTouch,
			       owned AS ownedNodes, unread AS unreadMessages,
			       false AS isRootAdmin
			UNION
			MATCH (ra:RootAdmin)
			OPTIONAL MATCH (ra)-[:OWNS_MAILBOX]->(mb:Mailbox)
			WITH ra, mb
			OPTIONAL MATCH (mb)-[:HAS_MESSAGE]->(m:Message)
			WHERE coalesce(m.IsRead, false) = false AND coalesce(m.IsDeleted, false) = false
			  AND NOT ra.UserName IN coalesce(m.DeletedBy, [])
			WITH ra, count(m) AS unread
			CALL (ra) {
				MATCH (n:SSTPA) WHERE n.Owner = ra.UserName
				RETURN count(n) AS owned
			}
			RETURN ra.UserName AS userName, ra.Email AS email,
			       coalesce(ra.DisplayName, ra.UserName) AS displayName,
			       true AS isAdmin,
			       'ACTIVE' AS accountStatus,
			       toString(ra.CreateDate) AS createDate,
			       toString(ra.LastTouch) AS lastTouch,
			       owned AS ownedNodes, unread AS unreadMessages,
			       true AS isRootAdmin`, nil)
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
	UserName    string `json:"userName"`
	Password    string `json:"password"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName,omitempty"`
	IsAdmin     bool   `json:"isAdmin"`
	// AuthorizerPassword re-authenticates the acting admin when creating an
	// ADMIN account (two-step authorization, SRS §6.5.15.8).
	AuthorizerPassword string `json:"authorizerPassword,omitempty"`
}

// handleCreateUser enrolls a new (:User) with a mailbox and welcome message
// (SRS §3: "New Users will own no data and have only one message from SSTPA
// Tools welcoming them"). Duplicate user names AND duplicate emails are
// rejected (SRS §6.5.15.8).
func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		req.UserName == "" || req.Password == "" || req.Email == "" {
		writeError(w, http.StatusBadRequest, "userName, password, email are required", "")
		return
	}

	// Creating an ADMIN account requires explicit re-authorization by the
	// acting admin (SRS §6.5.15.8 two-step authorization).
	if req.IsAdmin {
		if req.AuthorizerPassword == "" {
			writeError(w, http.StatusForbidden,
				"creating an ADMIN account requires authorizerPassword re-authentication (SRS §6.5.15.8)", "")
			return
		}
		if !s.verifyPassword(r, admin.UserName, req.AuthorizerPassword) {
			writeError(w, http.StatusForbidden, "authorizer re-authentication failed (SRS §6.5.15.8)", "")
			return
		}
	}

	_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			OPTIONAL MATCH (u:User) WHERE u.UserName = $name OR u.Email = $email
			OPTIONAL MATCH (ra:RootAdmin) WHERE ra.UserName = $name OR ra.Email = $email
			RETURN u IS NOT NULL OR ra IS NOT NULL AS exists`,
			map[string]any{"name": req.UserName, "email": req.Email})
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
				DisplayName: $displayName,
				CreateDate: datetime(), LastTouch: datetime(),
				IsAdmin: $isAdmin, AccountStatus: 'ACTIVE'
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
				"email": req.Email, "isAdmin": req.IsAdmin,
				"displayName": firstNonEmpty(req.DisplayName, req.UserName)})
		return nil, err
	})
	if err == errUserExists {
		writeError(w, http.StatusConflict, "a user with that name or email already exists", req.UserName)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user creation failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "created", "userName": req.UserName})
}

// verifyPassword re-checks a user's (or the RootAdmin's) password.
func (s *Server) verifyPassword(r *http.Request, userName, password string) bool {
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			OPTIONAL MATCH (u:User {UserName: $name})
			OPTIONAL MATCH (ra:RootAdmin {UserName: $name})
			RETURN coalesce(ra.Password, u.Password) AS pw`,
			map[string]any{"name": userName})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		pw, _ := single.AsMap()["pw"].(string)
		return pw, nil
	})
	if err != nil {
		return false
	}
	stored, _ := res.(string)
	want := hashPassword(password)
	return stored != "" && subtle.ConstantTimeCompare([]byte(stored), []byte(want)) == 1
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

type updateUserRequest struct {
	IsAdmin     *bool   `json:"isAdmin,omitempty"`
	Password    *string `json:"password,omitempty"`
	Email       *string `json:"email,omitempty"`
	DisplayName *string `json:"displayName,omitempty"`

	// Account lifecycle (SRS §6.5.15.7, §6.5.15.11).
	Suspend   bool `json:"suspend,omitempty"`
	Reinstate bool `json:"reinstate,omitempty"`

	// Disenroll retains the (:User) node with AccountStatus = DISENROLLED,
	// transfers all owned Core Data to TransferTo, and soft-deletes the
	// account's messages (SRS §6.5.15.11).
	Disenroll  bool   `json:"disenroll,omitempty"`
	TransferTo string `json:"transferTo,omitempty"`

	// AuthorizerPassword re-authenticates the acting admin for privileged
	// changes (granting admin role; SRS §6.5.15.8).
	AuthorizerPassword string `json:"authorizerPassword,omitempty"`
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

	// Admin accounts may only be suspended/disenrolled by the RootAdmin
	// (SRS §6.5.15.12 ROOT_ADMIN-exclusive functions).
	targetIsAdmin, targetExists := s.userIsAdmin(r, userName)
	if !targetExists {
		writeError(w, http.StatusNotFound, "user not found", userName)
		return
	}
	if (req.Suspend || req.Disenroll) && targetIsAdmin && !admin.IsRootAdmin {
		writeError(w, http.StatusForbidden,
			"suspending or disenrolling an ADMIN account requires the RootAdmin (SRS §6.5.15.12)", "")
		return
	}
	if userName == admin.UserName && (req.Suspend || req.Disenroll) {
		writeError(w, http.StatusBadRequest, "an account cannot suspend or disenroll itself", "")
		return
	}

	switch {
	case req.Suspend:
		if err := s.setAccountStatus(r, userName, "SUSPENDED", admin.UserName); err != nil {
			writeError(w, http.StatusInternalServerError, "suspend failed", err.Error())
			return
		}
		sessions.revokeUser(userName)
		writeJSON(w, http.StatusOK, map[string]string{"status": "suspended", "by": admin.UserName})
		return

	case req.Reinstate:
		if err := s.setAccountStatus(r, userName, "ACTIVE", admin.UserName); err != nil {
			writeError(w, http.StatusInternalServerError, "reinstate failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "reinstated", "by": admin.UserName})
		return

	case req.Disenroll:
		summary, err := s.disenrollUser(r, userName, req.TransferTo, admin)
		if err == errTransferTarget {
			writeError(w, http.StatusBadRequest,
				"transfer target must be an existing ACTIVE non-Admin user (SRS §6.5.15.10)", req.TransferTo)
			return
		}
		if err == errTransferRequired {
			writeError(w, http.StatusBadRequest,
				"disenrollment requires transferTo for owned data (SRS §6.5.15.11)", "")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "disenrollment failed", err.Error())
			return
		}
		sessions.revokeUser(userName)
		writeJSON(w, http.StatusOK, summary)
		return
	}

	set := map[string]any{}
	if req.IsAdmin != nil {
		// Granting the admin role is a privileged change: re-authorize
		// (SRS §6.5.15.8); revoking is an ordinary edit.
		if *req.IsAdmin && !targetIsAdmin {
			if req.AuthorizerPassword == "" || !s.verifyPassword(r, admin.UserName, req.AuthorizerPassword) {
				writeError(w, http.StatusForbidden,
					"granting the ADMIN role requires authorizerPassword re-authentication (SRS §6.5.15.8)", "")
				return
			}
		}
		set["IsAdmin"] = *req.IsAdmin
	}
	if req.Password != nil {
		set["Password"] = hashPassword(*req.Password)
	}
	if req.Email != nil {
		set["Email"] = *req.Email
	}
	if req.DisplayName != nil {
		set["DisplayName"] = *req.DisplayName
	}
	if len(set) == 0 {
		writeError(w, http.StatusBadRequest, "nothing to update", "")
		return
	}
	_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(),
			`MATCH (u:User {UserName: $name}) SET u += $set, u.LastTouch = datetime() RETURN count(u) AS n`,
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

// userIsAdmin reports the target's admin flag and existence.
func (s *Server) userIsAdmin(r *http.Request, userName string) (isAdmin, exists bool) {
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(),
			`OPTIONAL MATCH (u:User {UserName: $name})
			 RETURN u IS NOT NULL AS exists, coalesce(u.IsAdmin, false) AS isAdmin`,
			map[string]any{"name": userName})
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
		return false, false
	}
	m := res.(map[string]any)
	e, _ := m["exists"].(bool)
	a, _ := m["isAdmin"].(bool)
	return a, e
}

func (s *Server) setAccountStatus(r *http.Request, userName, status, by string) error {
	_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			MATCH (u:User {UserName: $name})
			SET u.AccountStatus = $status, u.StatusChangedBy = $by,
			    u.StatusChangedAt = datetime(), u.LastTouch = datetime()
			RETURN count(u) AS n`,
			map[string]any{"name": userName, "status": status, "by": by})
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
	return err
}

// disenrollUser implements the §6.5.15.11 disenrollment record: transfer
// owned Core Data to an ACTIVE non-Admin user, soft-delete messages, retain
// the (:User) node with DISENROLLED status, all in one transaction.
func (s *Server) disenrollUser(r *http.Request, userName, transferTo string, admin UserIdentity) (map[string]any, error) {
	if transferTo == "" {
		return nil, errTransferRequired
	}
	res, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		// Destination must be an existing, ACTIVE, non-Admin (:User)
		// (Admins cannot own Core Data; SRS §3.2, §6.5.15.10).
		rec, err := tx.Run(r.Context(), `
			MATCH (t:User {UserName: $to})
			WHERE coalesce(t.IsAdmin, false) = false
			  AND coalesce(t.AccountStatus, 'ACTIVE') = 'ACTIVE'
			RETURN t.UserName AS name, t.Email AS email`,
			map[string]any{"to": transferTo})
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, errTransferTarget
		}
		toEmail, _ := single.AsMap()["email"].(string)

		// Transfer ownership of all owned Core Data.
		tres, err := tx.Run(r.Context(), `
			MATCH (n:SSTPA) WHERE n.Owner = $from
			SET n.Owner = $to, n.OwnerEmail = $toEmail, n.LastTouch = datetime()
			RETURN count(n) AS transferred`,
			map[string]any{"from": userName, "to": transferTo, "toEmail": toEmail})
		if err != nil {
			return nil, err
		}
		trec, err := tres.Single(r.Context())
		if err != nil {
			return nil, err
		}
		transferred, _ := trec.AsMap()["transferred"].(int64)

		// Soft-delete the account's messages; retain the mailbox and user
		// node for the audit trail (SRS §6.5.15.11).
		if _, err := tx.Run(r.Context(), `
			MATCH (u:User {UserName: $name})-[:OWNS_MAILBOX]->(mb:Mailbox)-[:HAS_MESSAGE]->(m:Message)
			SET m.IsDeleted = true, m.DeletedAt = datetime()`,
			map[string]any{"name": userName}); err != nil {
			return nil, err
		}
		urec, err := tx.Run(r.Context(), `
			MATCH (u:User {UserName: $name})
			SET u.AccountStatus = 'DISENROLLED',
			    u.DisenrolledAt = datetime(), u.DisenrolledBy = $by,
			    u.DataTransferredTo = $to, u.LastTouch = datetime()
			RETURN count(u) AS n`,
			map[string]any{"name": userName, "by": admin.UserName, "to": transferTo})
		if err != nil {
			return nil, err
		}
		usingle, err := urec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		if n, _ := usingle.AsMap()["n"].(int64); n == 0 {
			return nil, errUserNotFound
		}
		return map[string]any{
			"status":            "disenrolled",
			"userName":          userName,
			"dataTransferredTo": transferTo,
			"nodesTransferred":  transferred,
			"by":                admin.UserName,
		}, nil
	})
	if err != nil {
		return nil, err
	}
	return res.(map[string]any), nil
}

var (
	errUserExists       = &constError{"user exists"}
	errUserNotFound     = &constError{"user not found"}
	errTransferTarget   = &constError{"transfer target not found"}
	errTransferRequired = &constError{"transfer target required"}
)
