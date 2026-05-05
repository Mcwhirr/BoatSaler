package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	adminSessionCookieName       = "salesboat_admin_session"
	adminSessionTTL              = 12 * time.Hour
	defaultAdminEmail            = "smartpastaguy@hotmail.com"
	defaultAdminPasswordHash     = "pbkdf2_sha256$210000$pSgHvgXd5DpvzfkKgoKrYg==$LwO2yeJLIZnBeWibzIiYCDG9ZONkArnfruvApJXDqCM="
	defaultPBKDF2Iterations      = 210000
	defaultPBKDF2DerivedKeyBytes = 32
)

type adminAuthConfig struct {
	UpdatedAt string          `json:"updatedAt"`
	Users     []adminAuthUser `json:"users"`
}

type adminAuthUser struct {
	Email        string `json:"email"`
	PasswordHash string `json:"passwordHash"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type adminSession struct {
	Token     string
	Email     string
	ExpiresAt time.Time
}

type adminAuthStatusResponse struct {
	Authenticated bool                  `json:"authenticated"`
	User          *adminAuthUserSummary `json:"user,omitempty"`
}

type adminAuthUserSummary struct {
	Email string `json:"email"`
}

type adminAuthActionResponse struct {
	Message string                `json:"message"`
	User    *adminAuthUserSummary `json:"user,omitempty"`
}

type adminLoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type adminChangePasswordInput struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type adminSessionContextKey struct{}

func (a *app) ensureAdminAuthFile() error {
	if _, err := os.Stat(a.authPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read admin auth config: %w", err)
	}

	config := defaultAdminAuthConfig()
	if err := a.writeAdminAuthConfig(config); err != nil {
		return err
	}

	log.Printf("initialized admin auth config at %s for %s", a.authPath, defaultAdminEmail)
	return nil
}

func defaultAdminAuthConfig() adminAuthConfig {
	now := time.Now().UTC().Format(time.RFC3339)
	return adminAuthConfig{
		UpdatedAt: now,
		Users: []adminAuthUser{
			{
				Email:        defaultAdminEmail,
				PasswordHash: defaultAdminPasswordHash,
				CreatedAt:    now,
				UpdatedAt:    now,
			},
		},
	}
}

func (a *app) readAdminAuthConfig() (adminAuthConfig, error) {
	data, err := os.ReadFile(a.authPath)
	if err != nil {
		if os.IsNotExist(err) {
			config := defaultAdminAuthConfig()
			if err := a.writeAdminAuthConfig(config); err != nil {
				return adminAuthConfig{}, err
			}
			return config, nil
		}

		return adminAuthConfig{}, fmt.Errorf("read admin auth config: %w", err)
	}

	var config adminAuthConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return adminAuthConfig{}, fmt.Errorf("parse admin auth config: %w", err)
	}

	if len(config.Users) == 0 {
		config = defaultAdminAuthConfig()
		if err := a.writeAdminAuthConfig(config); err != nil {
			return adminAuthConfig{}, err
		}
	}

	return config, nil
}

func (a *app) writeAdminAuthConfig(config adminAuthConfig) error {
	if len(config.Users) == 0 {
		return errors.New("admin auth config must contain at least one user")
	}

	config.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := os.MkdirAll(filepath.Dir(a.authPath), 0o755); err != nil {
		return fmt.Errorf("create admin auth directory: %w", err)
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal admin auth config: %w", err)
	}

	if err := os.WriteFile(a.authPath, append(data, '\n'), 0o600); err != nil {
		return fmt.Errorf("write admin auth config: %w", err)
	}

	return nil
}

func normalizeAdminEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validateAdminPassword(value string) error {
	password := strings.TrimSpace(value)
	if len(password) < 12 {
		return errors.New("new password must be at least 12 characters long")
	}

	if len(password) > 128 {
		return errors.New("new password must be 128 characters or fewer")
	}

	return nil
}

func hashAdminPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}

	hash := derivePBKDF2SHA256([]byte(password), salt, defaultPBKDF2Iterations, defaultPBKDF2DerivedKeyBytes)
	return fmt.Sprintf(
		"pbkdf2_sha256$%d$%s$%s",
		defaultPBKDF2Iterations,
		base64.StdEncoding.EncodeToString(salt),
		base64.StdEncoding.EncodeToString(hash),
	), nil
}

func verifyAdminPassword(encodedHash string, password string) bool {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return false
	}

	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations <= 0 {
		return false
	}

	salt, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil || len(salt) == 0 {
		return false
	}

	expectedHash, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil || len(expectedHash) == 0 {
		return false
	}

	derivedHash := derivePBKDF2SHA256([]byte(password), salt, iterations, len(expectedHash))
	return subtle.ConstantTimeCompare(derivedHash, expectedHash) == 1
}

func derivePBKDF2SHA256(password []byte, salt []byte, iterations int, keyLength int) []byte {
	const hashLength = 32

	blockCount := (keyLength + hashLength - 1) / hashLength
	derivedKey := make([]byte, 0, blockCount*hashLength)

	for blockIndex := 1; blockIndex <= blockCount; blockIndex++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)

		var blockCounter [4]byte
		binary.BigEndian.PutUint32(blockCounter[:], uint32(blockIndex))
		mac.Write(blockCounter[:])

		u := mac.Sum(nil)
		t := append([]byte(nil), u...)

		for iteration := 1; iteration < iterations; iteration++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)

			for index := range t {
				t[index] ^= u[index]
			}
		}

		derivedKey = append(derivedKey, t...)
	}

	return derivedKey[:keyLength]
}

func (a *app) handleAdminAuthStatus(w http.ResponseWriter, r *http.Request) {
	session, err := a.getAdminSessionFromRequest(r)
	if err != nil {
		a.clearAdminSessionCookie(w, r)
		writeJSON(w, http.StatusOK, adminAuthStatusResponse{
			Authenticated: false,
		})
		return
	}

	writeJSON(w, http.StatusOK, adminAuthStatusResponse{
		Authenticated: true,
		User: &adminAuthUserSummary{
			Email: session.Email,
		},
	})
}

func (a *app) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	var input adminLoginInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeAPIError(w, http.StatusBadRequest, fmt.Errorf("decode login request: %w", err))
		return
	}

	email := normalizeAdminEmail(input.Email)
	if email == "" || strings.TrimSpace(input.Password) == "" {
		writeAPIError(w, http.StatusBadRequest, errors.New("email and password are required"))
		return
	}

	a.mu.Lock()
	config, err := a.readAdminAuthConfig()
	a.mu.Unlock()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	var matchedUser *adminAuthUser
	for index := range config.Users {
		if normalizeAdminEmail(config.Users[index].Email) == email {
			matchedUser = &config.Users[index]
			break
		}
	}

	if matchedUser == nil || !verifyAdminPassword(matchedUser.PasswordHash, input.Password) {
		writeAPIError(w, http.StatusUnauthorized, errors.New("invalid email or password"))
		return
	}

	session, err := a.createAdminSession(matchedUser.Email)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	a.setAdminSessionCookie(w, r, session)
	writeJSON(w, http.StatusOK, adminAuthActionResponse{
		Message: "Logged in successfully",
		User: &adminAuthUserSummary{
			Email: matchedUser.Email,
		},
	})
}

func (a *app) handleAdminLogout(w http.ResponseWriter, r *http.Request) {
	session, ok := adminSessionFromContext(r)
	if ok {
		a.deleteAdminSession(session.Token)
	}

	a.clearAdminSessionCookie(w, r)
	writeJSON(w, http.StatusOK, adminAuthActionResponse{
		Message: "Logged out successfully",
	})
}

func (a *app) handleAdminChangePassword(w http.ResponseWriter, r *http.Request) {
	session, ok := adminSessionFromContext(r)
	if !ok {
		writeAPIError(w, http.StatusUnauthorized, errors.New("please log in again"))
		return
	}

	var input adminChangePasswordInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeAPIError(w, http.StatusBadRequest, fmt.Errorf("decode password request: %w", err))
		return
	}

	if strings.TrimSpace(input.CurrentPassword) == "" {
		writeAPIError(w, http.StatusBadRequest, errors.New("current password is required"))
		return
	}

	if err := validateAdminPassword(input.NewPassword); err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	config, err := a.readAdminAuthConfig()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	userIndex := -1
	for index := range config.Users {
		if normalizeAdminEmail(config.Users[index].Email) == normalizeAdminEmail(session.Email) {
			userIndex = index
			break
		}
	}

	if userIndex == -1 {
		writeAPIError(w, http.StatusUnauthorized, errors.New("admin account no longer exists"))
		return
	}

	if !verifyAdminPassword(config.Users[userIndex].PasswordHash, input.CurrentPassword) {
		writeAPIError(w, http.StatusUnauthorized, errors.New("current password is incorrect"))
		return
	}

	passwordHash, err := hashAdminPassword(input.NewPassword)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	config.Users[userIndex].PasswordHash = passwordHash
	config.Users[userIndex].UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	if err := a.writeAdminAuthConfig(config); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, adminAuthActionResponse{
		Message: "Password updated successfully",
		User: &adminAuthUserSummary{
			Email: config.Users[userIndex].Email,
		},
	})
}

func (a *app) requireAdminSession(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, err := a.getAdminSessionFromRequest(r)
		if err != nil {
			a.clearAdminSessionCookie(w, r)
			writeAPIError(w, http.StatusUnauthorized, errors.New("please log in to access the admin console"))
			return
		}

		contextWithSession := context.WithValue(r.Context(), adminSessionContextKey{}, session)
		next(w, r.WithContext(contextWithSession))
	}
}

func adminSessionFromContext(r *http.Request) (adminSession, bool) {
	session, ok := r.Context().Value(adminSessionContextKey{}).(adminSession)
	return session, ok
}

func (a *app) getAdminSessionFromRequest(r *http.Request) (adminSession, error) {
	cookie, err := r.Cookie(adminSessionCookieName)
	if err != nil {
		return adminSession{}, errors.New("admin session not found")
	}

	token := strings.TrimSpace(cookie.Value)
	if token == "" {
		return adminSession{}, errors.New("admin session is empty")
	}

	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()

	a.pruneExpiredAdminSessionsLocked()

	session, ok := a.sessions[token]
	if !ok {
		return adminSession{}, errors.New("admin session is invalid")
	}

	if time.Now().After(session.ExpiresAt) {
		delete(a.sessions, token)
		return adminSession{}, errors.New("admin session expired")
	}

	return session, nil
}

func (a *app) createAdminSession(email string) (adminSession, error) {
	token, err := generateAdminSessionToken()
	if err != nil {
		return adminSession{}, fmt.Errorf("generate admin session token: %w", err)
	}

	session := adminSession{
		Token:     token,
		Email:     email,
		ExpiresAt: time.Now().Add(adminSessionTTL),
	}

	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()

	a.pruneExpiredAdminSessionsLocked()
	a.sessions[token] = session
	return session, nil
}

func (a *app) deleteAdminSession(token string) {
	if strings.TrimSpace(token) == "" {
		return
	}

	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()
	delete(a.sessions, token)
}

func (a *app) pruneExpiredAdminSessionsLocked() {
	now := time.Now()
	for token, session := range a.sessions {
		if now.After(session.ExpiresAt) {
			delete(a.sessions, token)
		}
	}
}

func generateAdminSessionToken() (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(tokenBytes), nil
}

func (a *app) setAdminSessionCookie(w http.ResponseWriter, r *http.Request, session adminSession) {
	http.SetCookie(w, &http.Cookie{
		Name:     adminSessionCookieName,
		Value:    session.Token,
		Path:     "/",
		Expires:  session.ExpiresAt,
		MaxAge:   int(adminSessionTTL.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   isSecureAdminRequest(r),
	})
}

func (a *app) clearAdminSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     adminSessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   isSecureAdminRequest(r),
	})
}

func isSecureAdminRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}

	return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
}
