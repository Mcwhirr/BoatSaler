package main

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
)

const maxUploadRequestSize = 512 << 20

type app struct {
	repoRoot               string
	sourceDir              string
	frontendDir            string
	publicDir              string
	manifestPath           string
	textureAssignmentsPath string
	authPath               string
	ordersPath             string
	distDir                string
	contentPath            string
	mu                     sync.Mutex
	sessionMu              sync.Mutex
	sessions               map[string]adminSession
}

type projectPaths struct {
	repoRoot               string
	sourceDir              string
	frontendDir            string
	publicDir              string
	manifestPath           string
	textureAssignmentsPath string
	authPath               string
	ordersPath             string
	distDir                string
	contentPath            string
}

type adminActionResponse struct {
	Message string         `json:"message"`
	State   adminDashboard `json:"state"`
}

func newApp() (*app, error) {
	paths, err := discoverProjectPaths()
	if err != nil {
		return nil, err
	}

	application := &app{
		repoRoot:               paths.repoRoot,
		sourceDir:              paths.sourceDir,
		frontendDir:            paths.frontendDir,
		publicDir:              paths.publicDir,
		manifestPath:           paths.manifestPath,
		textureAssignmentsPath: paths.textureAssignmentsPath,
		authPath:               paths.authPath,
		ordersPath:             paths.ordersPath,
		distDir:                paths.distDir,
		contentPath:            paths.contentPath,
		sessions:               make(map[string]adminSession),
	}

	if err := application.ensureAdminAuthFile(); err != nil {
		return nil, err
	}

	return application, nil
}

func discoverProjectPaths() (projectPaths, error) {
	currentDir, err := os.Getwd()
	if err != nil {
		return projectPaths{}, fmt.Errorf("resolve current directory: %w", err)
	}

	searchDir := currentDir
	for {
		repoRoot := searchDir
		if filepath.Base(searchDir) == "gltf" {
			repoRoot = filepath.Dir(searchDir)
		}

		sourceDir := filepath.Join(repoRoot, "gltf")
		frontendDir := filepath.Join(repoRoot, "frontend")
		if isDirectory(sourceDir) && isDirectory(frontendDir) {
			publicDir := filepath.Join(frontendDir, "public", "gltf")
			manifestPath := filepath.Join(publicDir, "asset-manifest.json")
			return projectPaths{
				repoRoot:               repoRoot,
				sourceDir:              sourceDir,
				frontendDir:            frontendDir,
				publicDir:              publicDir,
				manifestPath:           manifestPath,
				textureAssignmentsPath: filepath.Join(repoRoot, "data", "texture-assignments.json"),
				authPath:               filepath.Join(repoRoot, "data", "admin-auth.json"),
				ordersPath:             filepath.Join(repoRoot, "data", "orders.json"),
				distDir:                filepath.Join(frontendDir, "dist"),
				contentPath:            filepath.Join(repoRoot, "data", "site-content.json"),
			}, nil
		}

		parentDir := filepath.Dir(searchDir)
		if parentDir == searchDir {
			break
		}

		searchDir = parentDir
	}

	return projectPaths{}, errors.New("could not locate repository root containing gltf and frontend directories")
}

func isDirectory(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}

	return info.IsDir()
}

func (a *app) registerAdminRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/admin/auth/status", a.handleAdminAuthStatus)
	mux.HandleFunc("POST /api/admin/auth/login", a.handleAdminLogin)
	mux.HandleFunc("POST /api/admin/auth/logout", a.requireAdminSession(a.handleAdminLogout))
	mux.HandleFunc("POST /api/admin/auth/change-password", a.requireAdminSession(a.handleAdminChangePassword))
	mux.HandleFunc("GET /api/admin/models", a.requireAdminSession(a.handleAdminDashboard))
	mux.HandleFunc("POST /api/admin/models/upload", a.requireAdminSession(a.handleAdminUpload))
	mux.HandleFunc("PUT /api/admin/models/{modelID}/content", a.requireAdminSession(a.handleAdminUpdateModelContent))
	mux.HandleFunc("PUT /api/admin/models/{modelID}/engines", a.requireAdminSession(a.handleAdminUpdateModelEngines))
	mux.HandleFunc("DELETE /api/admin/models/{modelID}", a.requireAdminSession(a.handleAdminDeleteModel))
	mux.HandleFunc("DELETE /api/admin/models/{modelID}/files", a.requireAdminSession(a.handleAdminDeleteFile))
	mux.HandleFunc("PUT /api/admin/models/{modelID}/files/texture-type", a.requireAdminSession(a.handleAdminUpdateTextureType))
	mux.HandleFunc("POST /api/admin/file-texture-type", a.requireAdminSession(a.handleAdminUpdateTextureType))
	mux.HandleFunc("POST /api/admin/uv-set-material-hint", a.requireAdminSession(a.handleAdminUpdateUVSetMaterialHint))
	mux.HandleFunc("POST /api/admin/sync", a.requireAdminSession(a.handleAdminSync))
	mux.HandleFunc("POST /api/admin/videos", a.requireAdminSession(a.handleAdminCreateVideo))
	mux.HandleFunc("PUT /api/admin/videos/{videoID}", a.requireAdminSession(a.handleAdminUpdateVideo))
	mux.HandleFunc("DELETE /api/admin/videos/{videoID}", a.requireAdminSession(a.handleAdminDeleteVideo))
}

func (a *app) handleAdminDashboard(w http.ResponseWriter, r *http.Request) {
	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, dashboard)
}

func (a *app) handleAdminUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadRequestSize)
	if err := r.ParseMultipartForm(maxUploadRequestSize); err != nil {
		writeAPIError(w, http.StatusBadRequest, fmt.Errorf("parse upload form: %w", err))
		return
	}
	defer r.MultipartForm.RemoveAll()

	modelID, err := sanitizeModelID(r.FormValue("modelId"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	subdirectory, err := sanitizeRelativeSubdirectory(r.FormValue("subdir"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	replaceExisting := parseReplaceFlag(r.FormValue("replace"))
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		writeAPIError(w, http.StatusBadRequest, errors.New("at least one file must be selected"))
		return
	}

	targetDir := filepath.Join(a.sourceDir, modelID)
	if subdirectory != "" {
		targetDir = filepath.Join(targetDir, filepath.FromSlash(subdirectory))
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		writeAPIError(w, http.StatusInternalServerError, fmt.Errorf("create upload directory: %w", err))
		return
	}

	uploadedCount := 0
	for _, header := range files {
		fileName := filepath.Base(header.Filename)
		if fileName == "." || fileName == "" {
			writeAPIError(w, http.StatusBadRequest, errors.New("invalid upload file name"))
			return
		}

		extension := strings.ToLower(filepath.Ext(fileName))
		if !isAllowedAssetExtension(extension) {
			writeAPIError(w, http.StatusBadRequest, fmt.Errorf("unsupported file type for %s", fileName))
			return
		}

		targetPath := filepath.Join(targetDir, fileName)
		if !replaceExisting {
			if _, err := os.Stat(targetPath); err == nil {
				writeAPIError(w, http.StatusConflict, fmt.Errorf("file already exists: %s", fileName))
				return
			}
		}

		if err := saveUploadedFile(header, targetPath); err != nil {
			writeAPIError(w, http.StatusInternalServerError, err)
			return
		}

		uploadedCount += 1
	}

	if _, err := a.syncAssetsLocked(); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	message := fmt.Sprintf("Uploaded %d file(s) to %s", uploadedCount, modelID)
	if subdirectory != "" {
		message = fmt.Sprintf("%s/%s", message, subdirectory)
	}

	writeJSON(w, http.StatusCreated, adminActionResponse{
		Message: message,
		State:   dashboard,
	})
}

func (a *app) handleAdminDeleteModel(w http.ResponseWriter, r *http.Request) {
	modelID, err := sanitizeModelID(r.PathValue("modelID"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	modelDir := filepath.Join(a.sourceDir, modelID)

	a.mu.Lock()
	defer a.mu.Unlock()

	if _, err := os.Stat(modelDir); err != nil {
		if os.IsNotExist(err) {
			writeAPIError(w, http.StatusNotFound, fmt.Errorf("model %s does not exist", modelID))
			return
		}

		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	if err := os.RemoveAll(modelDir); err != nil {
		writeAPIError(w, http.StatusInternalServerError, fmt.Errorf("delete model %s: %w", modelID, err))
		return
	}

	content, err := a.readSiteContent()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	if _, exists := content.Models[modelID]; exists {
		delete(content.Models, modelID)
		if err := a.writeSiteContent(content); err != nil {
			writeAPIError(w, http.StatusInternalServerError, err)
			return
		}
	}

	if _, err := a.syncAssetsLocked(); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, adminActionResponse{
		Message: fmt.Sprintf("Deleted model %s", modelID),
		State:   dashboard,
	})
}

func (a *app) handleAdminDeleteFile(w http.ResponseWriter, r *http.Request) {
	modelID, err := sanitizeModelID(r.PathValue("modelID"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	relativePath, err := sanitizeRelativeFilePath(r.URL.Query().Get("path"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	modelDir := filepath.Join(a.sourceDir, modelID)
	targetPath := filepath.Join(modelDir, filepath.FromSlash(relativePath))

	a.mu.Lock()
	defer a.mu.Unlock()

	if !isWithinBaseDirectory(modelDir, targetPath) {
		writeAPIError(w, http.StatusBadRequest, errors.New("file path escapes the model directory"))
		return
	}

	fileInfo, err := os.Stat(targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeAPIError(w, http.StatusNotFound, fmt.Errorf("file does not exist: %s", relativePath))
			return
		}

		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	if fileInfo.IsDir() {
		writeAPIError(w, http.StatusBadRequest, errors.New("only files can be deleted from this endpoint"))
		return
	}

	if err := os.Remove(targetPath); err != nil {
		writeAPIError(w, http.StatusInternalServerError, fmt.Errorf("delete file %s: %w", relativePath, err))
		return
	}

	pruneEmptyDirectories(filepath.Dir(targetPath), modelDir)

	if _, err := a.syncAssetsLocked(); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, adminActionResponse{
		Message: fmt.Sprintf("Deleted file %s from %s", relativePath, modelID),
		State:   dashboard,
	})
}

func (a *app) handleAdminSync(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	_, err := a.syncAssetsLocked()
	a.mu.Unlock()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, adminActionResponse{
		Message: "Synced source models into frontend/public/gltf",
		State:   dashboard,
	})
}

func saveUploadedFile(header *multipart.FileHeader, targetPath string) error {
	source, err := header.Open()
	if err != nil {
		return fmt.Errorf("open uploaded file %s: %w", header.Filename, err)
	}
	defer source.Close()

	target, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("create target file %s: %w", targetPath, err)
	}
	defer target.Close()

	if _, err := io.Copy(target, source); err != nil {
		return fmt.Errorf("save uploaded file %s: %w", header.Filename, err)
	}

	return nil
}

func parseReplaceFlag(value string) bool {
	return strings.TrimSpace(strings.ToLower(value)) != "false"
}

func sanitizeModelID(value string) (string, error) {
	candidate := strings.TrimSpace(value)
	if candidate == "" {
		return "", errors.New("modelId is required")
	}

	for _, r := range candidate {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			return "", errors.New("modelId contains unsupported path characters")
		}

		if r < 0x20 {
			return "", errors.New("modelId contains control characters")
		}

		if r == '_' || r == '-' || r == '.' || r == ' ' || r >= 0x80 || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			continue
		}

		return "", errors.New("modelId contains unsupported characters")
	}

	return candidate, nil
}

func sanitizeRelativeSubdirectory(value string) (string, error) {
	candidate := strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if candidate == "" {
		return "", nil
	}

	if strings.HasPrefix(candidate, "/") {
		return "", errors.New("subdir must be relative")
	}

	cleaned := path.Clean(candidate)
	if cleaned == "." {
		return "", nil
	}

	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", errors.New("subdir may not escape the model directory")
	}

	for _, segment := range strings.Split(cleaned, "/") {
		if segment == "" {
			continue
		}

		if err := validateRelativePathSegment(segment); err != nil {
			return "", fmt.Errorf("subdir contains unsupported characters: %w", err)
		}
	}

	return cleaned, nil
}

func validateRelativePathSegment(segment string) error {
	if segment == "." || segment == ".." {
		return errors.New("relative path segment may not be dot or dot-dot")
	}

	for _, r := range segment {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			return errors.New("relative path segment contains unsupported path characters")
		}

		if r < 0x20 {
			return errors.New("relative path segment contains control characters")
		}
	}

	return nil
}

func sanitizeRelativeFilePath(value string) (string, error) {
	candidate := strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if candidate == "" {
		return "", errors.New("file path is required")
	}

	if strings.HasPrefix(candidate, "/") {
		return "", errors.New("file path must be relative")
	}

	cleaned := path.Clean(candidate)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", errors.New("file path may not escape the model directory")
	}

	return cleaned, nil
}

func isWithinBaseDirectory(baseDir string, targetPath string) bool {
	baseAbs, err := filepath.Abs(baseDir)
	if err != nil {
		return false
	}

	targetAbs, err := filepath.Abs(targetPath)
	if err != nil {
		return false
	}

	relativePath, err := filepath.Rel(baseAbs, targetAbs)
	if err != nil {
		return false
	}

	return relativePath != ".." && !strings.HasPrefix(relativePath, ".."+string(os.PathSeparator))
}

func pruneEmptyDirectories(currentDir string, stopDir string) {
	for {
		if currentDir == stopDir {
			return
		}

		entries, err := os.ReadDir(currentDir)
		if err != nil || len(entries) > 0 {
			return
		}

		_ = os.Remove(currentDir)
		currentDir = filepath.Dir(currentDir)
	}
}

func writeAPIError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{
		"error": err.Error(),
	})
}
