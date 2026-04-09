package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

var allowedAssetExtensions = map[string]struct{}{
	".glb":  {},
	".gltf": {},
	".bin":  {},
	".fbx":  {},
	".obj":  {},
	".mtl":  {},
	".png":  {},
	".jpg":  {},
	".jpeg": {},
	".webp": {},
	".ktx2": {},
	".dds":  {},
	".hdr":  {},
	".exr":  {},
}

var modelExtensions = []string{".glb", ".gltf", ".fbx", ".obj"}
var preferredModelFileNames = []string{"1.glb", "1.fbx", "2.glb", "2.fbx"}
var modelExtensionPriority = []string{".glb", ".gltf", ".fbx", ".obj"}

const preferredPrimaryModelID = "PleasureBoat1"

type assetManifest struct {
	Version        int                  `json:"version"`
	GeneratedAt    string               `json:"generatedAt"`
	Source         assetManifestSource  `json:"source"`
	PrimaryModelID string               `json:"primaryModelId"`
	Models         []assetManifestModel `json:"models"`
}

type assetManifestSource struct {
	AssetRoot  string `json:"assetRoot"`
	PublicRoot string `json:"publicRoot"`
}

type assetManifestModel struct {
	ID             string               `json:"id"`
	Label          string               `json:"label"`
	Model          assetManifestFile    `json:"model"`
	DefaultUVSetID *string              `json:"defaultUvSetId"`
	UVSets         []assetManifestUVSet `json:"uvSets"`
}

type assetManifestFile struct {
	Format string `json:"format"`
	Path   string `json:"path"`
}

type assetManifestUVSet struct {
	ID               string            `json:"id"`
	Label            string            `json:"label"`
	Directory        string            `json:"directory"`
	MaterialNameHint *string           `json:"materialNameHint"`
	Textures         map[string]string `json:"textures"`
}

type adminDashboard struct {
	SourceRoot string        `json:"sourceRoot"`
	PublicRoot string        `json:"publicRoot"`
	UpdatedAt  string        `json:"updatedAt"`
	Manifest   assetManifest `json:"manifest"`
	Models     []adminModel  `json:"models"`
	Content    siteContent   `json:"content"`
}

type adminModel struct {
	ID                string       `json:"id"`
	SelectedModelPath string       `json:"selectedModelPath,omitempty"`
	Files             []adminFile  `json:"files"`
	UVSets            []adminUVSet `json:"uvSets"`
	FileCount         int          `json:"fileCount"`
	TotalBytes        int64        `json:"totalBytes"`
}

type adminUVSet struct {
	ID         string      `json:"id"`
	Files      []adminFile `json:"files"`
	FileCount  int         `json:"fileCount"`
	TotalBytes int64       `json:"totalBytes"`
}

type adminFile struct {
	Name                string `json:"name"`
	RelativePath        string `json:"relativePath"`
	Extension           string `json:"extension"`
	Size                int64  `json:"size"`
	Supported           bool   `json:"supported"`
	TextureType         string `json:"textureType,omitempty"`
	DetectedTextureType string `json:"detectedTextureType,omitempty"`
	TextureAssignment   string `json:"textureAssignment,omitempty"`
	TextureCandidate    bool   `json:"textureCandidate,omitempty"`
}

func (a *app) readManifest() (assetManifest, error) {
	var manifest assetManifest

	data, err := os.ReadFile(a.manifestPath)
	if err != nil {
		return manifest, err
	}

	if err := json.Unmarshal(data, &manifest); err != nil {
		return manifest, fmt.Errorf("parse manifest: %w", err)
	}

	return manifest, nil
}

func (a *app) buildDashboard() (adminDashboard, error) {
	var dashboard adminDashboard

	manifest, err := a.readManifest()
	if err != nil {
		if !os.IsNotExist(err) {
			return dashboard, err
		}

		a.mu.Lock()
		manifest, err = a.syncAssetsLocked()
		a.mu.Unlock()
		if err != nil {
			return dashboard, err
		}
	}

	assignments, err := a.readTextureAssignments()
	if err != nil {
		return dashboard, err
	}

	models, err := scanAdminModels(a.sourceDir, manifest, assignments)
	if err != nil {
		return dashboard, err
	}

	content, err := a.readSiteContent()
	if err != nil {
		return dashboard, err
	}

	dashboard = adminDashboard{
		SourceRoot: toPosixPath(a.sourceDir),
		PublicRoot: toPosixPath(a.publicDir),
		UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		Manifest:   manifest,
		Models:     models,
		Content:    content,
	}

	return dashboard, nil
}

func (a *app) syncAssetsLocked() (assetManifest, error) {
	if err := os.RemoveAll(a.publicDir); err != nil {
		return assetManifest{}, fmt.Errorf("reset public assets: %w", err)
	}

	if err := os.MkdirAll(a.publicDir, 0o755); err != nil {
		return assetManifest{}, fmt.Errorf("create public assets dir: %w", err)
	}

	if err := copySupportedAssets(a.sourceDir, a.publicDir); err != nil {
		return assetManifest{}, err
	}

	assignments, err := a.readTextureAssignments()
	if err != nil {
		return assetManifest{}, err
	}

	if pruneTextureAssignments(a.sourceDir, &assignments) {
		if err := a.writeTextureAssignments(assignments); err != nil {
			return assetManifest{}, err
		}
	}

	manifest, err := buildAssetManifest(a.sourceDir, a.frontendDir, assignments)
	if err != nil {
		return assetManifest{}, err
	}

	manifestData, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return assetManifest{}, fmt.Errorf("marshal manifest: %w", err)
	}

	if err := os.WriteFile(a.manifestPath, append(manifestData, '\n'), 0o644); err != nil {
		return assetManifest{}, fmt.Errorf("write manifest: %w", err)
	}

	return manifest, nil
}

func copySupportedAssets(fromDir string, toDir string) error {
	entries, err := os.ReadDir(fromDir)
	if err != nil {
		return fmt.Errorf("read assets dir %s: %w", fromDir, err)
	}

	for _, entry := range entries {
		fromPath := filepath.Join(fromDir, entry.Name())
		toPath := filepath.Join(toDir, entry.Name())

		if entry.IsDir() {
			if err := os.MkdirAll(toPath, 0o755); err != nil {
				return fmt.Errorf("create directory %s: %w", toPath, err)
			}

			if err := copySupportedAssets(fromPath, toPath); err != nil {
				return err
			}

			continue
		}

		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if !isAllowedAssetExtension(ext) {
			continue
		}

		if err := copyFile(fromPath, toPath); err != nil {
			return err
		}
	}

	return nil
}

func buildAssetManifest(sourceDir string, frontendDir string, assignments textureAssignments) (assetManifest, error) {
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return assetManifest{}, fmt.Errorf("read source root: %w", err)
	}

	manifest := assetManifest{
		Version:     1,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Source: assetManifestSource{
			AssetRoot:  toPosixPath(mustRelativePath(frontendDir, sourceDir)),
			PublicRoot: "public/gltf",
		},
	}

	models := make([]assetManifestModel, 0)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		modelDir := filepath.Join(sourceDir, entry.Name())
		model, err := buildManifestModel(sourceDir, modelDir, entry.Name(), assignments)
		if err != nil {
			return assetManifest{}, err
		}

		if model == nil {
			continue
		}

		models = append(models, *model)
	}

	sort.Slice(models, func(i, j int) bool {
		return models[i].ID < models[j].ID
	})

	manifest.Models = models
	for _, model := range models {
		if model.ID == preferredPrimaryModelID {
			manifest.PrimaryModelID = model.ID
			break
		}
	}

	if manifest.PrimaryModelID == "" && len(models) > 0 {
		manifest.PrimaryModelID = models[0].ID
	}

	return manifest, nil
}

func buildManifestModel(sourceDir string, modelDir string, modelID string, assignments textureAssignments) (*assetManifestModel, error) {
	entries, err := os.ReadDir(modelDir)
	if err != nil {
		return nil, fmt.Errorf("read model dir %s: %w", modelID, err)
	}

	modelFileCandidates := make([]fs.DirEntry, 0)
	uvSets := make([]assetManifestUVSet, 0)

	for _, entry := range entries {
		if entry.IsDir() {
			uvSet, err := buildManifestUVSet(sourceDir, filepath.Join(modelDir, entry.Name()), modelID, entry.Name(), assignments)
			if err != nil {
				return nil, err
			}

			uvSets = append(uvSets, uvSet)
			continue
		}

		if isModelExtension(strings.ToLower(filepath.Ext(entry.Name()))) {
			modelFileCandidates = append(modelFileCandidates, entry)
		}
	}

	sort.Slice(uvSets, func(i, j int) bool {
		return uvSets[i].ID < uvSets[j].ID
	})

	modelFileEntry := pickPreferredModelFile(modelID, modelFileCandidates)
	if modelFileEntry == nil {
		return nil, nil
	}

	modelPath := filepath.Join(modelDir, modelFileEntry.Name())
	modelFormat := strings.TrimPrefix(strings.ToLower(filepath.Ext(modelFileEntry.Name())), ".")

	var defaultUVSetID *string
	if len(uvSets) > 0 {
		defaultUVSetID = &uvSets[0].ID
	}

	model := assetManifestModel{
		ID:    modelID,
		Label: modelID,
		Model: assetManifestFile{
			Format: modelFormat,
			Path:   toPublicAssetPath(sourceDir, modelPath),
		},
		DefaultUVSetID: defaultUVSetID,
		UVSets:         uvSets,
	}

	return &model, nil
}

func buildManifestUVSet(sourceDir string, uvDir string, modelID string, uvSetID string, assignments textureAssignments) (assetManifestUVSet, error) {
	entries, err := os.ReadDir(uvDir)
	if err != nil {
		return assetManifestUVSet{}, fmt.Errorf("read uv dir %s/%s: %w", modelID, uvSetID, err)
	}

	textures := make(map[string]string)
	textureFileNames := make([]string, 0)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		fileName := entry.Name()
		ext := strings.ToLower(filepath.Ext(fileName))
		if !isAllowedAssetExtension(ext) {
			continue
		}

		textureFileNames = append(textureFileNames, fileName)
		resolution := resolveTextureType(fileName, mustRelativePath(sourceDir, filepath.Join(uvDir, fileName)), assignments)
		if resolution.Effective == "" {
			continue
		}

		textures[resolution.Effective] = toPublicAssetPath(sourceDir, filepath.Join(uvDir, fileName))
	}

	var materialHint *string
	if hint := inferMaterialNameHint(textureFileNames); hint != "" {
		materialHint = &hint
	}

	return assetManifestUVSet{
		ID:               uvSetID,
		Label:            fmt.Sprintf("UV %s", uvSetID),
		Directory:        fmt.Sprintf("/gltf/%s/%s", modelID, uvSetID),
		MaterialNameHint: materialHint,
		Textures:         textures,
	}, nil
}

func scanAdminModels(sourceDir string, manifest assetManifest, assignments textureAssignments) ([]adminModel, error) {
	selectedModelPathByID := make(map[string]string, len(manifest.Models))
	for _, model := range manifest.Models {
		selectedModelPathByID[model.ID] = model.Model.Path
	}

	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return nil, fmt.Errorf("read source root: %w", err)
	}

	models := make([]adminModel, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		modelDir := filepath.Join(sourceDir, entry.Name())
		model, err := scanAdminModel(sourceDir, modelDir, entry.Name(), selectedModelPathByID[entry.Name()], assignments)
		if err != nil {
			return nil, err
		}

		models = append(models, model)
	}

	sort.Slice(models, func(i, j int) bool {
		return models[i].ID < models[j].ID
	})

	return models, nil
}

func scanAdminModel(sourceDir string, modelDir string, modelID string, selectedModelPath string, assignments textureAssignments) (adminModel, error) {
	entries, err := os.ReadDir(modelDir)
	if err != nil {
		return adminModel{}, fmt.Errorf("read model dir %s: %w", modelID, err)
	}

	model := adminModel{
		ID:                modelID,
		SelectedModelPath: selectedModelPath,
		Files:             []adminFile{},
		UVSets:            []adminUVSet{},
	}

	for _, entry := range entries {
		entryPath := filepath.Join(modelDir, entry.Name())
		if entry.IsDir() {
			uvSet, err := scanAdminUVSet(sourceDir, entryPath, entry.Name(), assignments)
			if err != nil {
				return adminModel{}, err
			}

			model.UVSets = append(model.UVSets, uvSet)
			model.FileCount += uvSet.FileCount
			model.TotalBytes += uvSet.TotalBytes
			continue
		}

		fileInfo, err := entry.Info()
		if err != nil {
			return adminModel{}, fmt.Errorf("read file info %s: %w", entryPath, err)
		}

		file := buildAdminFile(
			entry.Name(),
			entry.Name(),
			toPosixPath(filepath.Join(modelID, entry.Name())),
			fileInfo.Size(),
			assignments,
		)
		model.Files = append(model.Files, file)
		model.FileCount += 1
		model.TotalBytes += file.Size
	}

	sort.Slice(model.Files, func(i, j int) bool {
		return model.Files[i].RelativePath < model.Files[j].RelativePath
	})
	sort.Slice(model.UVSets, func(i, j int) bool {
		return model.UVSets[i].ID < model.UVSets[j].ID
	})

	return model, nil
}

func scanAdminUVSet(sourceDir string, uvDir string, uvSetID string, assignments textureAssignments) (adminUVSet, error) {
	files, err := collectFilesRecursively(sourceDir, uvDir, uvDir, assignments)
	if err != nil {
		return adminUVSet{}, err
	}

	if files == nil {
		files = []adminFile{}
	}

	totalBytes := int64(0)
	for _, file := range files {
		totalBytes += file.Size
	}

	return adminUVSet{
		ID:         uvSetID,
		Files:      files,
		FileCount:  len(files),
		TotalBytes: totalBytes,
	}, nil
}

func collectFilesRecursively(sourceDir string, baseDir string, currentDir string, assignments textureAssignments) ([]adminFile, error) {
	entries, err := os.ReadDir(currentDir)
	if err != nil {
		return nil, fmt.Errorf("read directory %s: %w", currentDir, err)
	}

	files := make([]adminFile, 0)
	for _, entry := range entries {
		entryPath := filepath.Join(currentDir, entry.Name())
		if entry.IsDir() {
			nestedFiles, err := collectFilesRecursively(sourceDir, baseDir, entryPath, assignments)
			if err != nil {
				return nil, err
			}

			files = append(files, nestedFiles...)
			continue
		}

		info, err := entry.Info()
		if err != nil {
			return nil, fmt.Errorf("read file info %s: %w", entryPath, err)
		}

		relativePath, err := filepath.Rel(baseDir, entryPath)
		if err != nil {
			return nil, fmt.Errorf("resolve relative path for %s: %w", entryPath, err)
		}

		files = append(files, buildAdminFile(
			entry.Name(),
			toPosixPath(relativePath),
			toPosixPath(mustRelativePath(sourceDir, entryPath)),
			info.Size(),
			assignments,
		))
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].RelativePath < files[j].RelativePath
	})

	return files, nil
}

func buildAdminFile(name string, relativePath string, sourceRelativePath string, size int64, assignments textureAssignments) adminFile {
	extension := strings.ToLower(filepath.Ext(name))
	resolution := resolveTextureType(name, sourceRelativePath, assignments)

	return adminFile{
		Name:                name,
		RelativePath:        relativePath,
		Extension:           extension,
		Size:                size,
		Supported:           isAllowedAssetExtension(extension),
		TextureType:         resolution.Effective,
		DetectedTextureType: resolution.Detected,
		TextureAssignment:   resolution.Assignment,
		TextureCandidate:    resolution.Candidate,
	}
}

func copyFile(fromPath string, toPath string) error {
	source, err := os.Open(fromPath)
	if err != nil {
		return fmt.Errorf("open source file %s: %w", fromPath, err)
	}
	defer source.Close()

	target, err := os.Create(toPath)
	if err != nil {
		return fmt.Errorf("create target file %s: %w", toPath, err)
	}
	defer target.Close()

	if _, err := io.Copy(target, source); err != nil {
		return fmt.Errorf("copy file %s -> %s: %w", fromPath, toPath, err)
	}

	return nil
}

func isAllowedAssetExtension(extension string) bool {
	_, ok := allowedAssetExtensions[extension]
	return ok
}

func isModelExtension(extension string) bool {
	for _, candidate := range modelExtensions {
		if extension == candidate {
			return true
		}
	}

	return false
}

func pickPreferredModelFile(modelID string, entries []fs.DirEntry) fs.DirEntry {
	if len(entries) == 0 {
		return nil
	}

	preferredNames := getPreferredModelFileNames(modelID)
	sort.Slice(entries, func(i, j int) bool {
		leftName := strings.ToLower(entries[i].Name())
		rightName := strings.ToLower(entries[j].Name())
		leftPreferredIndex := indexOfString(preferredNames, leftName)
		rightPreferredIndex := indexOfString(preferredNames, rightName)

		if leftPreferredIndex != rightPreferredIndex {
			if leftPreferredIndex == -1 {
				return false
			}

			if rightPreferredIndex == -1 {
				return true
			}

			return leftPreferredIndex < rightPreferredIndex
		}

		leftExtIndex := indexOfString(modelExtensionPriority, strings.ToLower(filepath.Ext(entries[i].Name())))
		rightExtIndex := indexOfString(modelExtensionPriority, strings.ToLower(filepath.Ext(entries[j].Name())))
		if leftExtIndex != rightExtIndex {
			if leftExtIndex == -1 {
				return false
			}

			if rightExtIndex == -1 {
				return true
			}

			return leftExtIndex < rightExtIndex
		}

		return leftName < rightName
	})

	return entries[0]
}

func getPreferredModelFileNames(modelID string) []string {
	base := make([]string, 0, len(preferredModelFileNames)+2)

	if modelID == "Yacht" {
		base = append(base, "950.fbx", "950.glb")
	}

	if modelID == "PleasureBoat1" {
		base = append(base, "11.fbx", "11.glb")
	}

	for _, fileName := range preferredModelFileNames {
		base = append(base, strings.ToLower(fileName))
	}

	return base
}

func classifyTexture(fileName string) string {
	normalizedName := strings.ToLower(strings.TrimSuffix(fileName, filepath.Ext(fileName)))
	normalizedName = strings.NewReplacer("-", "_", " ", "_").Replace(normalizedName)

	switch {
	case strings.Contains(normalizedName, "basecolor"),
		strings.Contains(normalizedName, "base_color"),
		strings.Contains(normalizedName, "albedo"),
		strings.Contains(normalizedName, "diffuse"):
		return "baseColor"
	case strings.Contains(normalizedName, "emissive"),
		strings.Contains(normalizedName, "emission"):
		return "emissive"
	case strings.Contains(normalizedName, "normal"):
		return "normal"
	case normalizedName == "ao",
		strings.HasPrefix(normalizedName, "ao_"),
		strings.HasSuffix(normalizedName, "_ao"),
		strings.Contains(normalizedName, "ambientocclusion"),
		strings.Contains(normalizedName, "ambient_occlusion"),
		strings.Contains(normalizedName, "occlusion"):
		return "ao"
	case strings.Contains(normalizedName, "roughness"),
		strings.Contains(normalizedName, "rough"):
		return "roughness"
	case strings.Contains(normalizedName, "metallic"),
		strings.Contains(normalizedName, "metalness"),
		strings.Contains(normalizedName, "metal"):
		return "metalness"
	default:
		return ""
	}
}

func inferMaterialNameHint(fileNames []string) string {
	for _, fileName := range fileNames {
		normalized := strings.ReplaceAll(fileName, "\\", "/")
		start := strings.Index(strings.ToLower(normalized), "_")
		if start == -1 || start+3 >= len(normalized) {
			continue
		}

		marker := normalized[start+1:]
		if len(marker) >= 12 && isTwoDigitPrefix(marker) && strings.Contains(strings.ToLower(marker), " - default") {
			return fmt.Sprintf("M_%s___Default", marker[:2])
		}
	}

	return ""
}

func isTwoDigitPrefix(value string) bool {
	if len(value) < 2 {
		return false
	}

	return value[0] >= '0' && value[0] <= '9' && value[1] >= '0' && value[1] <= '9'
}

func indexOfString(items []string, target string) int {
	for index, item := range items {
		if item == target {
			return index
		}
	}

	return -1
}

func toPublicAssetPath(sourceDir string, absolutePath string) string {
	relativePath := mustRelativePath(sourceDir, absolutePath)
	return "/gltf/" + toPosixPath(relativePath)
}

func mustRelativePath(fromPath string, toPath string) string {
	relativePath, err := filepath.Rel(fromPath, toPath)
	if err != nil {
		return toPath
	}

	return relativePath
}

func toPosixPath(value string) string {
	return filepath.ToSlash(value)
}
