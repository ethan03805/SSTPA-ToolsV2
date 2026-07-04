// Authentication and user identity (SRS §3.2, §4, §5.6.6.9).
// MVP placeholder security: username + SHA-384 password hash verification,
// bearer session tokens held in memory. Enterprise security replaces this
// post-MVP (SRS §2, §4).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
package api

import (
	"context"
	"crypto/rand"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// UserIdentity is the authenticated principal attached to each request.
type UserIdentity struct {
	UserName    string `json:"userName"`
	Email       string `json:"email"`
	IsAdmin     bool   `json:"isAdmin"`
	IsRootAdmin bool   `json:"isRootAdmin"`
}

type ctxKey int

const userKey ctxKey = 1

// CurrentUser extracts the authenticated user from a request context.
func CurrentUser(ctx context.Context) (UserIdentity, bool) {
	u, ok := ctx.Value(userKey).(UserIdentity)
	return u, ok
}

// sessionStore is the MVP in-memory token store. Sessions expire after an
// idle timeout so tokens do not stay valid (and the map does not grow)
// indefinitely between process restarts.
const sessionIdleTimeout = 24 * time.Hour

type sessionEntry struct {
	user     UserIdentity
	lastSeen time.Time
}

type sessionStore struct {
	mu       sync.Mutex
	sessions map[string]*sessionEntry
}

var sessions = &sessionStore{sessions: map[string]*sessionEntry{}}

func (st *sessionStore) create(u UserIdentity) string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	tok := hex.EncodeToString(b)
	st.mu.Lock()
	st.prune()
	st.sessions[tok] = &sessionEntry{user: u, lastSeen: timeNow()}
	st.mu.Unlock()
	return tok
}

func (st *sessionStore) lookup(tok string) (UserIdentity, bool) {
	st.mu.Lock()
	defer st.mu.Unlock()
	e, ok := st.sessions[tok]
	if !ok {
		return UserIdentity{}, false
	}
	if timeNow().Sub(e.lastSeen) > sessionIdleTimeout {
		delete(st.sessions, tok)
		return UserIdentity{}, false
	}
	e.lastSeen = timeNow()
	return e.user, true
}

func (st *sessionStore) revoke(tok string) {
	st.mu.Lock()
	delete(st.sessions, tok)
	st.mu.Unlock()
}

// revokeUser drops every session belonging to userName (suspension,
// disenrollment; SRS §6.5.15.11 "terminate any active sessions").
func (st *sessionStore) revokeUser(userName string) {
	st.mu.Lock()
	for tok, e := range st.sessions {
		if e.user.UserName == userName {
			delete(st.sessions, tok)
		}
	}
	st.mu.Unlock()
}

// prune removes expired sessions; callers hold st.mu.
func (st *sessionStore) prune() {
	cutoff := timeNow().Add(-sessionIdleTimeout)
	for tok, e := range st.sessions {
		if e.lastSeen.Before(cutoff) {
			delete(st.sessions, tok)
		}
	}
}

// hashPassword computes the SHA-384 hex digest required by SRS §3.2.
func hashPassword(pw string) string {
	sum := sha512.Sum384([]byte(pw))
	return hex.EncodeToString(sum[:])
}

// authMiddleware validates the bearer token and injects the user identity.
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "missing bearer token", "")
			return
		}
		u, ok := sessions.lookup(strings.TrimPrefix(h, "Bearer "))
		if !ok {
			writeError(w, http.StatusUnauthorized, "invalid or expired session", "")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
	})
}

type loginRequest struct {
	UserName string `json:"userName"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string       `json:"token"`
	User  UserIdentity `json:"user"`
}

// handleLogin verifies username/password against (:User) / (:RootAdmin) nodes
// (SRS §4: Startup verifies user name and password with the Backend).
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserName == "" {
		writeError(w, http.StatusBadRequest, "invalid login payload", "")
		return
	}
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `
			OPTIONAL MATCH (u:User {UserName: $name})
			OPTIONAL MATCH (ra:RootAdmin {UserName: $name})
			RETURN u.Password AS upw, u.Email AS uemail, u.IsAdmin AS isAdmin,
			       coalesce(u.AccountStatus, 'ACTIVE') AS uStatus,
			       ra.Password AS rpw, ra.Email AS remail`,
			map[string]any{"name": req.UserName})
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
		writeError(w, http.StatusUnauthorized, "unknown user", "")
		return
	}
	m := res.(map[string]any)
	want := hashPassword(req.Password)

	verify := func(stored any) bool {
		spw, _ := stored.(string)
		return spw != "" && subtle.ConstantTimeCompare([]byte(spw), []byte(want)) == 1
	}

	var identity UserIdentity
	switch {
	case verify(m["rpw"]):
		email, _ := m["remail"].(string)
		identity = UserIdentity{UserName: req.UserName, Email: email, IsAdmin: true, IsRootAdmin: true}
	case verify(m["upw"]):
		// Suspended/disenrolled accounts cannot authenticate (SRS §6.5.15.11).
		if status, _ := m["uStatus"].(string); status != "ACTIVE" {
			writeError(w, http.StatusForbidden, "account is not active", status)
			return
		}
		email, _ := m["uemail"].(string)
		isAdmin, _ := m["isAdmin"].(bool)
		identity = UserIdentity{UserName: req.UserName, Email: email, IsAdmin: isAdmin}
	default:
		writeError(w, http.StatusUnauthorized, "invalid credentials", "")
		return
	}
	writeJSON(w, http.StatusOK, loginResponse{Token: sessions.create(identity), User: identity})
}

// handleAuthStatus reports whether this installation has been bootstrapped
// (RootAdmin exists). Startup Software uses it to decide between the
// first-run "create RootAdmin" flow and the normal login flow (SRS §3.2, §4).
func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	res, err := s.db.Read(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `MATCH (ra:RootAdmin) RETURN count(ra) > 0 AS exists`, nil)
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		exists, _ := single.AsMap()["exists"].(bool)
		return exists, nil
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "auth status failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rootAdminExists": res.(bool)})
}

// handleLogout revokes the presented bearer token.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		sessions.revoke(strings.TrimPrefix(h, "Bearer "))
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

type bootstrapRequest struct {
	UserName string `json:"userName"`
	Password string `json:"password"`
	Email    string `json:"email"`
}

// handleBootstrap creates the (:RootAdmin) account on first installation
// (SRS §3.2: "The (:RootAdmin) is an account set on installation"). It is
// rejected once a RootAdmin exists.
func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	var req bootstrapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		req.UserName == "" || req.Password == "" || req.Email == "" {
		writeError(w, http.StatusBadRequest, "userName, password and email are required", "")
		return
	}
	_, err := s.db.Write(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
		rec, err := tx.Run(r.Context(), `MATCH (ra:RootAdmin) RETURN count(ra) AS n`, nil)
		if err != nil {
			return nil, err
		}
		single, err := rec.Single(r.Context())
		if err != nil {
			return nil, err
		}
		if n, _ := single.Get("n"); n.(int64) > 0 {
			return nil, errRootAdminExists
		}
		_, err = tx.Run(r.Context(), `
			CREATE (ra:RootAdmin {
				UserName: $name, Password: $pw, Email: $email,
				CreateDate: datetime()
			})
			CREATE (mb:Mailbox {
				MailboxID: randomUUID(), Owner: $name, OwnerEmail: $email,
				UnreadCount: 1, Created: datetime(), LastTouch: datetime()
			})
			CREATE (ra)-[:OWNS_MAILBOX]->(mb)
			CREATE (msg:Message {
				MessageID: randomUUID(),
				Subject: "Welcome to SSTPA Tools",
				Body: "Welcome to SSTPA Tools. You are the RootAdmin of this installation. Use the Admin Tool to enroll your engineering team.",
				MessageType: "SYSTEM", SentAt: datetime(),
				Sender: "SSTPA Tools", SenderEmail: "nihlo2025@proton.me",
				Recipient: $name, RecipientEmail: $email,
				IsRead: false, IsDeleted: false,
				RequiresApproval: false, ApprovalStatus: "NOT_APPLICABLE"
			})
			CREATE (mb)-[:HAS_MESSAGE]->(msg)`,
			map[string]any{"name": req.UserName, "pw": hashPassword(req.Password), "email": req.Email})
		return nil, err
	})
	if err == errRootAdminExists {
		writeError(w, http.StatusConflict, "RootAdmin already exists", "")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "bootstrap failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "RootAdmin created"})
}

var errRootAdminExists = &constError{"root admin exists"}

type constError struct{ s string }

func (e *constError) Error() string { return e.s }
