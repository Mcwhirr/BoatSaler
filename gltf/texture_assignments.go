package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const textureAssignmentNone = "none"

var textureCandidateExtensions = map[string]struct{}{
	".png":  {},
	".jpg":  {},
	".jpeg": {},
	".webp": {},
	".ktx2": {},
	".dds":  {},
	".hdr":  {},
	".exr":  {},
}

type textureAssignments struct {
	UpdatedAt string            `json:"updatedAt"`
	Files     map[string]string `json:"files"`
}

type textureTypeUpdateInput struct {
	ModelID     string `json:"modelId"`
	Path        string `json:"path"`
	TextureType string `json:"textureType"`
}

type textureTypeResolution struct {
	Detected   string
	Effective  string
	Assignment string
	Candidate  bool
}

func (a *app) handleAdminUpdateTextureType(w http.ResponseWriter, r *http.Request) {
	input, err := decodeTextureTypeUpdateInput(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	modelIDCandidate := strings.TrimSpace(r.PathValue("modelID"))
	if modelIDCandidate == "" {
		modelIDCandidate = input.ModelID
	}

	modelID, err := sanitizeModelID(modelIDCandidate)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	relativePath, err := sanitizeRelativeFilePath(input.Path)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	normalizedAssignment, err := normalizeTextureAssignment(input.TextureType)
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
		writeAPIError(w, http.StatusBadRequest, errors.New("only files can be classified from this endpoint"))
		return
	}

	assignments, err := a.readTextureAssignments()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	sourceRelativePath := toPosixPath(filepath.Join(modelID, relativePath))
	if normalizedAssignment == "" {
		delete(assignments.Files, sourceRelativePath)
	} else {
		assignments.Files[sourceRelativePath] = normalizedAssignment
	}

	if err := a.writeTextureAssignments(assignments); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
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

	message := fmt.Sprintf("已更新 %s 的贴图标记。", relativePath)
	writeJSON(w, http.StatusOK, adminActionResponse{
		Message: message,
		State:   dashboard,
	})
}

func decodeTextureTypeUpdateInput(r *http.Request) (textureTypeUpdateInput, error) {
	var input textureTypeUpdateInput

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return textureTypeUpdateInput{}, fmt.Errorf("decode request body: %w", err)
	}

	return input, nil
}

func (a *app) readTextureAssignments() (textureAssignments, error) {
	data, err := os.ReadFile(a.textureAssignmentsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultTextureAssignments(), nil
		}

		return textureAssignments{}, fmt.Errorf("read texture assignments: %w", err)
	}

	var assignments textureAssignments
	if err := json.Unmarshal(data, &assignments); err != nil {
		return textureAssignments{}, fmt.Errorf("parse texture assignments: %w", err)
	}

	if assignments.Files == nil {
		assignments.Files = map[string]string{}
	}

	normalizedFiles := make(map[string]string, len(assignments.Files))
	for relativePath, rawAssignment := range assignments.Files {
		cleanedPath, err := sanitizeRelativeFilePath(relativePath)
		if err != nil {
			continue
		}

		normalizedAssignment, err := normalizeTextureAssignment(rawAssignment)
		if err != nil || normalizedAssignment == "" {
			continue
		}

		normalizedFiles[toPosixPath(cleanedPath)] = normalizedAssignment
	}

	assignments.Files = normalizedFiles
	return assignments, nil
}

func (a *app) writeTextureAssignments(assignments textureAssignments) error {
	assignments.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if assignments.Files == nil {
		assignments.Files = map[string]string{}
	}

	if err := os.MkdirAll(filepath.Dir(a.textureAssignmentsPath), 0o755); err != nil {
		return fmt.Errorf("create texture assignment directory: %w", err)
	}

	data, err := json.MarshalIndent(assignments, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal texture assignments: %w", err)
	}

	if err := os.WriteFile(a.textureAssignmentsPath, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write texture assignments: %w", err)
	}

	return nil
}

func defaultTextureAssignments() textureAssignments {
	return textureAssignments{
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		Files:     map[string]string{},
	}
}

func pruneTextureAssignments(sourceDir string, assignments *textureAssignments) bool {
	if assignments == nil {
		return false
	}

	if assignments.Files == nil {
		assignments.Files = map[string]string{}
		return false
	}

	changed := false
	for relativePath := range assignments.Files {
		targetPath := filepath.Join(sourceDir, filepath.FromSlash(relativePath))
		info, err := os.Stat(targetPath)
		if err == nil && !info.IsDir() {
			continue
		}

		delete(assignments.Files, relativePath)
		changed = true
	}

	return changed
}

func resolveTextureType(fileName string, sourceRelativePath string, assignments textureAssignments) textureTypeResolution {
	detectedType := classifyTexture(fileName)
	assignment := ""

	if assignments.Files != nil {
		if storedAssignment, ok := assignments.Files[toPosixPath(sourceRelativePath)]; ok {
			normalizedAssignment, err := normalizeTextureAssignment(storedAssignment)
			if err == nil {
				assignment = normalizedAssignment
			}
		}
	}

	effectiveType := detectedType
	switch assignment {
	case "":
	case textureAssignmentNone:
		effectiveType = ""
	default:
		effectiveType = assignment
	}

	return textureTypeResolution{
		Detected:   detectedType,
		Effective:  effectiveType,
		Assignment: assignment,
		Candidate:  isTextureCandidateExtension(filepath.Ext(fileName)) || detectedType != "" || assignment != "",
	}
}

func normalizeTextureAssignment(value string) (string, error) {
	candidate := strings.TrimSpace(value)
	if candidate == "" || strings.EqualFold(candidate, "auto") {
		return "", nil
	}

	if strings.EqualFold(candidate, textureAssignmentNone) {
		return textureAssignmentNone, nil
	}

	if canonicalType := canonicalTextureType(candidate); canonicalType != "" {
		return canonicalType, nil
	}

	return "", fmt.Errorf("unsupported texture type: %s", value)
}

func canonicalTextureType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "basecolor", "base_color", "base color", "albedo", "diffuse":
		return "baseColor"
	case "emissive", "emission":
		return "emissive"
	case "normal":
		return "normal"
	case "ao", "ambientocclusion", "ambient_occlusion", "occlusion":
		return "ao"
	case "metalness", "metallic", "metal":
		return "metalness"
	case "roughness", "rough":
		return "roughness"
	default:
		return ""
	}
}

func isTextureCandidateExtension(ext string) bool {
	_, ok := textureCandidateExtensions[strings.ToLower(ext)]
	return ok
}
