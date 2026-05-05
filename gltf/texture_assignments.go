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

const (
	textureAssignmentNone = "none"
	uvSetAlphaModeOpaque  = "opaque"
	uvSetAlphaModeCutout  = "cutout"
	uvSetAlphaModeBlend   = "blend"
	uvSetSideFront        = "front"
	uvSetSideDouble       = "double"
	uvSetDepthWriteOn     = "on"
	uvSetDepthWriteOff    = "off"
	uvSetDepthTestOn      = "on"
	uvSetDepthTestOff     = "off"
)

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
	UpdatedAt string                             `json:"updatedAt"`
	Files     map[string]textureAssignmentRecord `json:"files"`
	UVSets    map[string]uvSetAssignmentRecord   `json:"uvSets,omitempty"`
}

type textureAssignmentRecord struct {
	TextureType       string `json:"textureType,omitempty"`
	UseAlphaAsOpacity bool   `json:"useAlphaAsOpacity,omitempty"`
}

type uvSetAssignmentRecord struct {
	MaterialNameHint string             `json:"materialNameHint,omitempty"`
	RenderProfile    uvSetRenderProfile `json:"renderProfile,omitempty"`
}

type uvSetRenderProfile struct {
	AlphaMode   string  `json:"alphaMode,omitempty"`
	Side        string  `json:"side,omitempty"`
	DepthWrite  string  `json:"depthWrite,omitempty"`
	DepthTest   string  `json:"depthTest,omitempty"`
	AlphaCutoff float64 `json:"alphaCutoff,omitempty"`
	RenderOrder *int    `json:"renderOrder,omitempty"`
}

func (record *textureAssignmentRecord) UnmarshalJSON(data []byte) error {
	var legacyValue string
	if err := json.Unmarshal(data, &legacyValue); err == nil {
		normalized, err := normalizeTextureAssignmentRecord(legacyValue, false)
		if err != nil {
			return err
		}

		*record = normalized
		return nil
	}

	var payload struct {
		TextureType       string `json:"textureType"`
		UseAlphaAsOpacity bool   `json:"useAlphaAsOpacity"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}

	normalized, err := normalizeTextureAssignmentRecord(payload.TextureType, payload.UseAlphaAsOpacity)
	if err != nil {
		return err
	}

	*record = normalized
	return nil
}

func (record textureAssignmentRecord) isEmpty() bool {
	return record.TextureType == "" && !record.UseAlphaAsOpacity
}

type textureTypeUpdateInput struct {
	ModelID           string `json:"modelId"`
	Path              string `json:"path"`
	TextureType       string `json:"textureType"`
	UseAlphaAsOpacity bool   `json:"useAlphaAsOpacity"`
}

type uvSetMaterialHintUpdateInput struct {
	ModelID          string             `json:"modelId"`
	Path             string             `json:"path"`
	MaterialNameHint string             `json:"materialNameHint"`
	RenderProfile    uvSetRenderProfile `json:"renderProfile"`
}

type textureTypeResolution struct {
	Detected          string
	Effective         string
	Assignment        string
	UseAlphaAsOpacity bool
	Candidate         bool
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

	normalizedAssignment, err := normalizeTextureAssignmentRecord(input.TextureType, input.UseAlphaAsOpacity)
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
	if normalizedAssignment.isEmpty() {
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

func (a *app) handleAdminUpdateUVSetMaterialHint(w http.ResponseWriter, r *http.Request) {
	input, err := decodeUVSetMaterialHintUpdateInput(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	modelID, err := sanitizeModelID(input.ModelID)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	relativePath, err := sanitizeRelativeSubdirectory(input.Path)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	normalizedAssignment, err := normalizeUVSetAssignmentRecord(input.MaterialNameHint, input.RenderProfile)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}
	modelDir := filepath.Join(a.sourceDir, modelID)
	targetDir := modelDir
	if relativePath != "" {
		targetDir = filepath.Join(modelDir, filepath.FromSlash(relativePath))
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	if !isWithinBaseDirectory(modelDir, targetDir) {
		writeAPIError(w, http.StatusBadRequest, errors.New("uv set path escapes the model directory"))
		return
	}

	fileInfo, err := os.Stat(targetDir)
	if err != nil {
		if os.IsNotExist(err) {
			writeAPIError(w, http.StatusNotFound, fmt.Errorf("uv set directory does not exist: %s", relativePath))
			return
		}

		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	if !fileInfo.IsDir() {
		writeAPIError(w, http.StatusBadRequest, errors.New("uv set path must point to a directory"))
		return
	}

	assignments, err := a.readTextureAssignments()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	sourceRelativePath := buildUVSetSourceRelativePath(modelID, relativePath)
	if normalizedAssignment.isEmpty() {
		delete(assignments.UVSets, sourceRelativePath)
	} else {
		assignments.UVSets[sourceRelativePath] = normalizedAssignment
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

	message := fmt.Sprintf("已更新 %s 的材质槽绑定。", sourceRelativePath)
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

func decodeUVSetMaterialHintUpdateInput(r *http.Request) (uvSetMaterialHintUpdateInput, error) {
	var input uvSetMaterialHintUpdateInput

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return uvSetMaterialHintUpdateInput{}, fmt.Errorf("decode request body: %w", err)
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
		assignments.Files = map[string]textureAssignmentRecord{}
	}
	if assignments.UVSets == nil {
		assignments.UVSets = map[string]uvSetAssignmentRecord{}
	}

	normalizedRecords := make(map[string]textureAssignmentRecord, len(assignments.Files))
	for relativePath, rawAssignment := range assignments.Files {
		cleanedPath, err := sanitizeRelativeFilePath(relativePath)
		if err != nil {
			continue
		}

		normalizedAssignment, err := normalizeTextureAssignmentRecord(rawAssignment.TextureType, rawAssignment.UseAlphaAsOpacity)
		if err != nil || normalizedAssignment.isEmpty() {
			continue
		}

		normalizedRecords[toPosixPath(cleanedPath)] = normalizedAssignment
	}

	assignments.Files = normalizedRecords
	normalizedUVSetRecords := make(map[string]uvSetAssignmentRecord, len(assignments.UVSets))
	for relativePath, rawAssignment := range assignments.UVSets {
		cleanedPath, err := sanitizeRelativeSubdirectory(relativePath)
		if err != nil {
			cleanedPath, err = sanitizeRelativeFilePath(relativePath)
			if err != nil {
				continue
			}
		}

		normalizedAssignment, err := normalizeUVSetAssignmentRecord(rawAssignment.MaterialNameHint, rawAssignment.RenderProfile)
		if err != nil || normalizedAssignment.isEmpty() {
			continue
		}

		normalizedUVSetRecords[toPosixPath(cleanedPath)] = normalizedAssignment
	}

	assignments.UVSets = normalizedUVSetRecords
	return assignments, nil
}

func (a *app) writeTextureAssignments(assignments textureAssignments) error {
	assignments.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if assignments.Files == nil {
		assignments.Files = map[string]textureAssignmentRecord{}
	}
	if assignments.UVSets == nil {
		assignments.UVSets = map[string]uvSetAssignmentRecord{}
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
		Files:     map[string]textureAssignmentRecord{},
		UVSets:    map[string]uvSetAssignmentRecord{},
	}
}

func pruneTextureAssignments(sourceDir string, assignments *textureAssignments) bool {
	if assignments == nil {
		return false
	}

	if assignments.Files == nil {
		assignments.Files = map[string]textureAssignmentRecord{}
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

	if assignments.UVSets == nil {
		assignments.UVSets = map[string]uvSetAssignmentRecord{}
		return changed
	}

	for relativePath := range assignments.UVSets {
		targetPath := filepath.Join(sourceDir, filepath.FromSlash(relativePath))
		info, err := os.Stat(targetPath)
		if err == nil && info.IsDir() {
			continue
		}

		delete(assignments.UVSets, relativePath)
		changed = true
	}

	return changed
}

func resolveTextureType(fileName string, sourceRelativePath string, assignments textureAssignments) textureTypeResolution {
	detectedType := classifyTexture(fileName)
	assignment := textureAssignmentRecord{}

	if assignments.Files != nil {
		if storedAssignment, ok := assignments.Files[toPosixPath(sourceRelativePath)]; ok {
			normalizedAssignment, err := normalizeTextureAssignmentRecord(storedAssignment.TextureType, storedAssignment.UseAlphaAsOpacity)
			if err == nil {
				assignment = normalizedAssignment
			}
		}
	}

	effectiveType := detectedType
	switch assignment.TextureType {
	case "":
	case textureAssignmentNone:
		effectiveType = ""
	default:
		effectiveType = assignment.TextureType
	}

	useAlphaAsOpacity := assignment.UseAlphaAsOpacity && effectiveType == "baseColor"

	return textureTypeResolution{
		Detected:          detectedType,
		Effective:         effectiveType,
		Assignment:        assignment.TextureType,
		UseAlphaAsOpacity: useAlphaAsOpacity,
		Candidate:         isTextureCandidateExtension(filepath.Ext(fileName)) || detectedType != "" || assignment.TextureType != "" || assignment.UseAlphaAsOpacity,
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

func normalizeTextureAssignmentRecord(textureType string, useAlphaAsOpacity bool) (textureAssignmentRecord, error) {
	normalizedType, err := normalizeTextureAssignment(textureType)
	if err != nil {
		return textureAssignmentRecord{}, err
	}

	normalized := textureAssignmentRecord{
		TextureType: normalizedType,
	}

	switch normalizedType {
	case "":
		normalized.UseAlphaAsOpacity = useAlphaAsOpacity
	case textureAssignmentNone:
		normalized.UseAlphaAsOpacity = false
	case "baseColor":
		normalized.UseAlphaAsOpacity = useAlphaAsOpacity
	default:
		normalized.UseAlphaAsOpacity = false
	}

	return normalized, nil
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
	case "orm", "rmao", "r+m+ao", "occlusionroughnessmetallic", "occlusion_roughness_metallic":
		return "orm"
	case "opacity", "alpha", "transparent", "transparency":
		return "opacity"
	default:
		return ""
	}
}

func isTextureCandidateExtension(ext string) bool {
	_, ok := textureCandidateExtensions[strings.ToLower(ext)]
	return ok
}

func (record uvSetAssignmentRecord) isEmpty() bool {
	return strings.TrimSpace(record.MaterialNameHint) == "" && record.RenderProfile.isEmpty()
}

func (profile uvSetRenderProfile) isEmpty() bool {
	return profile.AlphaMode == "" &&
		profile.Side == "" &&
		profile.DepthWrite == "" &&
		profile.DepthTest == "" &&
		profile.AlphaCutoff == 0 &&
		profile.RenderOrder == nil
}

func normalizeUVSetRenderProfile(profile uvSetRenderProfile) (uvSetRenderProfile, error) {
	normalizedProfile := uvSetRenderProfile{}

	switch strings.ToLower(strings.TrimSpace(profile.AlphaMode)) {
	case "", "auto":
	case uvSetAlphaModeOpaque, uvSetAlphaModeCutout, uvSetAlphaModeBlend:
		normalizedProfile.AlphaMode = strings.ToLower(strings.TrimSpace(profile.AlphaMode))
	default:
		return uvSetRenderProfile{}, fmt.Errorf("unsupported uv set alpha mode: %s", profile.AlphaMode)
	}

	switch strings.ToLower(strings.TrimSpace(profile.Side)) {
	case "", "auto":
	case uvSetSideFront, uvSetSideDouble:
		normalizedProfile.Side = strings.ToLower(strings.TrimSpace(profile.Side))
	default:
		return uvSetRenderProfile{}, fmt.Errorf("unsupported uv set side mode: %s", profile.Side)
	}

	switch strings.ToLower(strings.TrimSpace(profile.DepthWrite)) {
	case "", "auto":
	case uvSetDepthWriteOn, uvSetDepthWriteOff:
		normalizedProfile.DepthWrite = strings.ToLower(strings.TrimSpace(profile.DepthWrite))
	default:
		return uvSetRenderProfile{}, fmt.Errorf("unsupported uv set depth write mode: %s", profile.DepthWrite)
	}

	switch strings.ToLower(strings.TrimSpace(profile.DepthTest)) {
	case "", "auto":
	case uvSetDepthTestOn, uvSetDepthTestOff:
		normalizedProfile.DepthTest = strings.ToLower(strings.TrimSpace(profile.DepthTest))
	default:
		return uvSetRenderProfile{}, fmt.Errorf("unsupported uv set depth test mode: %s", profile.DepthTest)
	}

	if profile.AlphaCutoff > 0 {
		if profile.AlphaCutoff > 1 {
			return uvSetRenderProfile{}, fmt.Errorf("uv set alpha cutoff must be between 0 and 1")
		}

		normalizedProfile.AlphaCutoff = profile.AlphaCutoff
	}

	if profile.RenderOrder != nil {
		if *profile.RenderOrder < -1000 || *profile.RenderOrder > 1000 {
			return uvSetRenderProfile{}, fmt.Errorf("uv set render order must be between -1000 and 1000")
		}

		renderOrder := *profile.RenderOrder
		normalizedProfile.RenderOrder = &renderOrder
	}

	return normalizedProfile, nil
}

func normalizeUVSetAssignmentRecord(materialNameHint string, renderProfile uvSetRenderProfile) (uvSetAssignmentRecord, error) {
	normalizedRenderProfile, err := normalizeUVSetRenderProfile(renderProfile)
	if err != nil {
		return uvSetAssignmentRecord{}, err
	}

	return uvSetAssignmentRecord{
		MaterialNameHint: strings.TrimSpace(materialNameHint),
		RenderProfile:    normalizedRenderProfile,
	}, nil
}

func buildUVSetSourceRelativePath(modelID string, relativePath string) string {
	if strings.TrimSpace(relativePath) == "" {
		return toPosixPath(modelID)
	}

	return toPosixPath(filepath.Join(modelID, filepath.FromSlash(relativePath)))
}

func resolveUVSetMaterialNameHint(assignments textureAssignments, modelID string, relativePath string) string {
	if assignments.UVSets == nil {
		return ""
	}

	return strings.TrimSpace(assignments.UVSets[buildUVSetSourceRelativePath(modelID, relativePath)].MaterialNameHint)
}

func resolveUVSetRenderProfile(assignments textureAssignments, modelID string, relativePath string) uvSetRenderProfile {
	if assignments.UVSets == nil {
		return uvSetRenderProfile{}
	}

	record := assignments.UVSets[buildUVSetSourceRelativePath(modelID, relativePath)]
	normalizedProfile, err := normalizeUVSetRenderProfile(record.RenderProfile)
	if err != nil {
		return uvSetRenderProfile{}
	}

	return normalizedProfile
}
