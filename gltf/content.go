package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	youtubeVideoIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
	bilibiliBVIDPattern   = regexp.MustCompile(`(?i)^BV[0-9A-Za-z]+$`)
	numericIDPattern      = regexp.MustCompile(`^[0-9]+$`)
)

type siteContent struct {
	UpdatedAt string                      `json:"updatedAt"`
	Videos    []siteVideo                 `json:"videos"`
	Models    map[string]siteModelContent `json:"models"`
}

type siteModelSpecs struct {
	OverallLength   string `json:"overallLength"`
	WaterlineLength string `json:"waterlineLength"`
	Beam            string `json:"beam"`
	Depth           string `json:"depth"`
	Draft           string `json:"draft"`
	NavigationArea  string `json:"navigationArea"`
	MainEnginePower string `json:"mainEnginePower"`
	DesignSpeed     string `json:"designSpeed"`
	RatedCapacity   string `json:"ratedCapacity"`
	PowerType       string `json:"powerType"`
	Material        string `json:"material"`
	CertificateType string `json:"certificateType"`
}

type siteVector3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type siteEngineMount struct {
	Enabled  bool        `json:"enabled"`
	Type     string      `json:"type"`
	Position siteVector3 `json:"position"`
	Rotation siteVector3 `json:"rotation"`
}

type siteModelContent struct {
	DisplayName     string            `json:"displayName"`
	Type            string            `json:"type"`
	Price           string            `json:"price"`
	Specs           siteModelSpecs    `json:"specs"`
	Engines         []siteEngineMount `json:"engines,omitempty"`
	DetailImagePath string            `json:"detailImagePath"`
	Summary         string            `json:"summary"`
}

type siteVideo struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Summary     string `json:"summary"`
	Platform    string `json:"platform"`
	SourceURL   string `json:"sourceUrl"`
	ExternalURL string `json:"externalUrl"`
	EmbedURL    string `json:"embedUrl"`
}

type siteVideoInput struct {
	Title   string `json:"title"`
	Summary string `json:"summary"`
	URL     string `json:"url"`
}

type siteModelContentInput struct {
	DisplayName     string            `json:"displayName"`
	Type            string            `json:"type"`
	Price           string            `json:"price"`
	Specs           siteModelSpecs    `json:"specs"`
	Engines         []siteEngineMount `json:"engines"`
	DetailImagePath string            `json:"detailImagePath"`
	Summary         string            `json:"summary"`
}

type siteModelEnginesInput struct {
	Engines []siteEngineMount `json:"engines"`
}

const maxSiteEngineMountCount = 4

func (a *app) registerContentRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/site-content", a.handleSiteContent)
}

func (a *app) handleSiteContent(w http.ResponseWriter, r *http.Request) {
	content, err := a.readSiteContent()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, content)
}

func (a *app) handleAdminUpdateModelContent(w http.ResponseWriter, r *http.Request) {
	modelID, err := sanitizeModelID(r.PathValue("modelID"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	input, err := decodeSiteModelContentInput(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	modelDir := filepath.Join(a.sourceDir, modelID)
	if _, err := os.Stat(modelDir); err != nil {
		if os.IsNotExist(err) {
			writeAPIError(w, http.StatusNotFound, fmt.Errorf("model %s does not exist", modelID))
			return
		}

		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	content, err := a.readSiteContent()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	nextContent := siteModelContent{
		DisplayName: strings.TrimSpace(input.DisplayName),
		Type:        normalizeModelType(input.Type),
		Price:       "",
		Specs:       normalizeSiteModelSpecs(input.Specs),
		Engines:     normalizeSiteEngineMounts(input.Engines),
		Summary:     strings.TrimSpace(input.Summary),
	}

	price, err := normalizeSiteModelPrice(input.Price)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}
	nextContent.Price = price

	detailImagePath, err := normalizeSiteModelDetailImagePath(a.sourceDir, modelID, input.DetailImagePath)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}
	nextContent.DetailImagePath = detailImagePath

	if !hasAnySiteModelContent(nextContent) {
		delete(content.Models, modelID)
	} else {
		content.Models[modelID] = nextContent
	}

	if err := a.writeSiteContent(content); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, adminActionResponse{
		Message: fmt.Sprintf("Updated content for model %s", modelID),
		State:   dashboard,
	})
}

func (a *app) handleAdminUpdateModelEngines(w http.ResponseWriter, r *http.Request) {
	modelID, err := sanitizeModelID(r.PathValue("modelID"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	var input siteModelEnginesInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeAPIError(w, http.StatusBadRequest, fmt.Errorf("decode request body: %w", err))
		return
	}

	modelDir := filepath.Join(a.sourceDir, modelID)
	if _, err := os.Stat(modelDir); err != nil {
		if os.IsNotExist(err) {
			writeAPIError(w, http.StatusNotFound, fmt.Errorf("model %s does not exist", modelID))
			return
		}

		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	if err := a.updateSiteModelEngines(modelID, input.Engines); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, adminActionResponse{
		Message: fmt.Sprintf("Updated engine mounts for model %s", modelID),
		State:   dashboard,
	})
}

func (a *app) updateSiteModelEngines(modelID string, engines []siteEngineMount) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	content, err := a.readSiteContent()
	if err != nil {
		return err
	}

	nextContent := content.Models[modelID]
	nextContent.Engines = normalizeSiteEngineMounts(engines)

	if !hasAnySiteModelContent(nextContent) {
		delete(content.Models, modelID)
	} else {
		content.Models[modelID] = nextContent
	}

	return a.writeSiteContent(content)
}

func (a *app) handleAdminCreateVideo(w http.ResponseWriter, r *http.Request) {
	input, err := decodeSiteVideoInput(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	video, err := buildSiteVideo("", input)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	content, err := a.readSiteContent()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	content.Videos = append(content.Videos, video)
	if err := a.writeSiteContent(content); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusCreated, adminActionResponse{
		Message: fmt.Sprintf("Added %s video \"%s\"", displayPlatformName(video.Platform), video.Title),
		State:   dashboard,
	})
}

func (a *app) handleAdminUpdateVideo(w http.ResponseWriter, r *http.Request) {
	videoID := strings.TrimSpace(r.PathValue("videoID"))
	if videoID == "" {
		writeAPIError(w, http.StatusBadRequest, errors.New("videoID is required"))
		return
	}

	input, err := decodeSiteVideoInput(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	content, err := a.readSiteContent()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	index := findSiteVideoIndex(content.Videos, videoID)
	if index == -1 {
		writeAPIError(w, http.StatusNotFound, fmt.Errorf("video %s does not exist", videoID))
		return
	}

	video, err := buildSiteVideo(videoID, input)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, err)
		return
	}

	content.Videos[index] = video
	if err := a.writeSiteContent(content); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, adminActionResponse{
		Message: fmt.Sprintf("Updated %s video \"%s\"", displayPlatformName(video.Platform), video.Title),
		State:   dashboard,
	})
}

func (a *app) handleAdminDeleteVideo(w http.ResponseWriter, r *http.Request) {
	videoID := strings.TrimSpace(r.PathValue("videoID"))
	if videoID == "" {
		writeAPIError(w, http.StatusBadRequest, errors.New("videoID is required"))
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	content, err := a.readSiteContent()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	index := findSiteVideoIndex(content.Videos, videoID)
	if index == -1 {
		writeAPIError(w, http.StatusNotFound, fmt.Errorf("video %s does not exist", videoID))
		return
	}

	deletedVideo := content.Videos[index]
	content.Videos = append(content.Videos[:index], content.Videos[index+1:]...)
	if err := a.writeSiteContent(content); err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	dashboard, err := a.buildDashboard()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, adminActionResponse{
		Message: fmt.Sprintf("Deleted video \"%s\"", deletedVideo.Title),
		State:   dashboard,
	})
}

func (a *app) readSiteContent() (siteContent, error) {
	data, err := os.ReadFile(a.contentPath)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultSiteContent(), nil
		}

		return siteContent{}, fmt.Errorf("read site content: %w", err)
	}

	var content siteContent
	if err := json.Unmarshal(data, &content); err != nil {
		return siteContent{}, fmt.Errorf("parse site content: %w", err)
	}

	if content.Videos == nil {
		content.Videos = []siteVideo{}
	}

	if content.Models == nil {
		content.Models = map[string]siteModelContent{}
	}

	return content, nil
}

func (a *app) writeSiteContent(content siteContent) error {
	content.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if content.Videos == nil {
		content.Videos = []siteVideo{}
	}

	if content.Models == nil {
		content.Models = map[string]siteModelContent{}
	}

	if err := os.MkdirAll(filepath.Dir(a.contentPath), 0o755); err != nil {
		return fmt.Errorf("create content directory: %w", err)
	}

	data, err := json.MarshalIndent(content, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal site content: %w", err)
	}

	if err := os.WriteFile(a.contentPath, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write site content: %w", err)
	}

	return nil
}

func defaultSiteContent() siteContent {
	return siteContent{
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		Videos:    []siteVideo{},
		Models:    map[string]siteModelContent{},
	}
}

func decodeSiteVideoInput(r *http.Request) (siteVideoInput, error) {
	var input siteVideoInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return siteVideoInput{}, fmt.Errorf("decode request body: %w", err)
	}

	return input, nil
}

func decodeSiteModelContentInput(r *http.Request) (siteModelContentInput, error) {
	var payload map[string]json.RawMessage
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&payload); err != nil {
		return siteModelContentInput{}, fmt.Errorf("decode request body: %w", err)
	}

	allowedFields := map[string]struct{}{
		"displayName":     {},
		"type":            {},
		"price":           {},
		"specs":           {},
		"engines":         {},
		"detailImagePath": {},
		"summary":         {},
	}

	for field := range payload {
		if _, ok := allowedFields[field]; !ok {
			return siteModelContentInput{}, fmt.Errorf("decode request body: json: unknown field %q", field)
		}
	}

	var input siteModelContentInput
	if err := decodeSiteModelContentField(payload, "displayName", &input.DisplayName); err != nil {
		return siteModelContentInput{}, err
	}
	if err := decodeSiteModelContentField(payload, "type", &input.Type); err != nil {
		return siteModelContentInput{}, err
	}
	if err := decodeSiteModelContentField(payload, "price", &input.Price); err != nil {
		return siteModelContentInput{}, err
	}
	if err := decodeSiteModelContentField(payload, "specs", &input.Specs); err != nil {
		return siteModelContentInput{}, err
	}
	if err := decodeSiteModelContentField(payload, "engines", &input.Engines); err != nil {
		return siteModelContentInput{}, err
	}
	if err := decodeSiteModelContentField(payload, "detailImagePath", &input.DetailImagePath); err != nil {
		return siteModelContentInput{}, err
	}
	if err := decodeSiteModelContentField(payload, "summary", &input.Summary); err != nil {
		return siteModelContentInput{}, err
	}

	if strings.TrimSpace(input.Type) != "" && normalizeModelType(input.Type) == "" {
		return siteModelContentInput{}, errors.New("type must be one of 新能源船、应急救援船、公务执法艇、游艇")
	}

	return input, nil
}

func decodeSiteModelContentField(payload map[string]json.RawMessage, field string, destination any) error {
	rawValue, ok := payload[field]
	if !ok {
		return nil
	}

	if err := json.Unmarshal(rawValue, destination); err != nil {
		return fmt.Errorf("decode request body: field %q: %w", field, err)
	}

	return nil
}

func normalizeSiteModelSpecs(specs siteModelSpecs) siteModelSpecs {
	return siteModelSpecs{
		OverallLength:   strings.TrimSpace(specs.OverallLength),
		WaterlineLength: strings.TrimSpace(specs.WaterlineLength),
		Beam:            strings.TrimSpace(specs.Beam),
		Depth:           strings.TrimSpace(specs.Depth),
		Draft:           strings.TrimSpace(specs.Draft),
		NavigationArea:  strings.TrimSpace(specs.NavigationArea),
		MainEnginePower: strings.TrimSpace(specs.MainEnginePower),
		DesignSpeed:     strings.TrimSpace(specs.DesignSpeed),
		RatedCapacity:   strings.TrimSpace(specs.RatedCapacity),
		PowerType:       strings.TrimSpace(specs.PowerType),
		Material:        strings.TrimSpace(specs.Material),
		CertificateType: strings.TrimSpace(specs.CertificateType),
	}
}

func normalizeSiteEngineType(value string) string {
	switch strings.TrimSpace(value) {
	case "", "outboard-a":
		return "outboard-a"
	case "outboard-b":
		return "outboard-b"
	default:
		return ""
	}
}

func normalizeSiteVector3(value siteVector3) siteVector3 {
	return siteVector3{
		X: value.X,
		Y: value.Y,
		Z: value.Z,
	}
}

func normalizeSiteEngineMounts(engines []siteEngineMount) []siteEngineMount {
	if len(engines) == 0 {
		return nil
	}

	limit := len(engines)
	if limit > maxSiteEngineMountCount {
		limit = maxSiteEngineMountCount
	}

	normalized := make([]siteEngineMount, 0, limit)
	for index, engine := range engines {
		if index >= maxSiteEngineMountCount {
			break
		}

		normalized = append(normalized, siteEngineMount{
			Enabled:  engine.Enabled,
			Type:     normalizeSiteEngineType(engine.Type),
			Position: normalizeSiteVector3(engine.Position),
			Rotation: normalizeSiteVector3(engine.Rotation),
		})
	}

	return normalized
}

func normalizeSiteModelPrice(value string) (string, error) {
	candidate := strings.TrimSpace(value)
	if candidate == "" {
		return "", nil
	}

	candidate = strings.NewReplacer("￥", "", "¥", "", "，", "", ",", "", " ", "").Replace(candidate)
	amount, err := strconv.ParseFloat(candidate, 64)
	if err != nil {
		return "", errors.New("price must be a valid number")
	}

	return strconv.FormatFloat(amount, 'f', -1, 64), nil
}

func hasAnySiteModelSpecs(specs siteModelSpecs) bool {
	return specs.OverallLength != "" ||
		specs.WaterlineLength != "" ||
		specs.Beam != "" ||
		specs.Depth != "" ||
		specs.Draft != "" ||
		specs.NavigationArea != "" ||
		specs.MainEnginePower != "" ||
		specs.DesignSpeed != "" ||
		specs.RatedCapacity != "" ||
		specs.PowerType != "" ||
		specs.Material != "" ||
		specs.CertificateType != ""
}

func hasAnySiteModelContent(content siteModelContent) bool {
	return content.DisplayName != "" ||
		content.Type != "" ||
		content.Price != "" ||
		content.DetailImagePath != "" ||
		content.Summary != "" ||
		len(content.Engines) > 0 ||
		hasAnySiteModelSpecs(content.Specs)
}

func normalizeSiteModelDetailImagePath(sourceDir string, modelID string, value string) (string, error) {
	candidate := strings.TrimSpace(value)
	if candidate == "" {
		return "", nil
	}

	relativePath, err := sanitizeRelativeFilePath(candidate)
	if err != nil {
		return "", errors.New("detailImagePath must be a relative file path inside the model directory")
	}

	extension := strings.ToLower(filepath.Ext(relativePath))
	if !isPreviewImageExtension(extension) {
		return "", errors.New("detailImagePath must point to a png, jpg, jpeg, or webp image")
	}

	modelDir := filepath.Join(sourceDir, modelID)
	absolutePath := filepath.Join(modelDir, filepath.FromSlash(relativePath))
	if !isWithinBaseDirectory(modelDir, absolutePath) {
		return "", errors.New("detailImagePath may not escape the model directory")
	}

	info, err := os.Stat(absolutePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("detail image does not exist: %s", relativePath)
		}

		return "", fmt.Errorf("read detail image: %w", err)
	}

	if info.IsDir() {
		return "", errors.New("detailImagePath must point to a file")
	}

	return relativePath, nil
}

func normalizeModelType(value string) string {
	switch strings.TrimSpace(value) {
	case "新能源船":
		return "新能源船"
	case "应急救援船":
		return "应急救援船"
	case "公务执法艇":
		return "公务执法艇"
	case "游艇":
		return "游艇"
	default:
		return ""
	}
}

func buildSiteVideo(existingID string, input siteVideoInput) (siteVideo, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return siteVideo{}, errors.New("title is required")
	}

	platform, externalURL, embedURL, err := normalizeExternalVideoURL(input.URL)
	if err != nil {
		return siteVideo{}, err
	}

	videoID := existingID
	if videoID == "" {
		videoID = newSiteVideoID(platform)
	}

	return siteVideo{
		ID:          videoID,
		Title:       title,
		Summary:     strings.TrimSpace(input.Summary),
		Platform:    platform,
		SourceURL:   externalURL,
		ExternalURL: externalURL,
		EmbedURL:    embedURL,
	}, nil
}

func newSiteVideoID(platform string) string {
	return fmt.Sprintf("%s-%d", platform, time.Now().UTC().UnixNano())
}

func displayPlatformName(platform string) string {
	switch platform {
	case "youtube":
		return "YouTube"
	case "bilibili":
		return "Bilibili"
	default:
		return platform
	}
}

func findSiteVideoIndex(videos []siteVideo, targetID string) int {
	for index, video := range videos {
		if video.ID == targetID {
			return index
		}
	}

	return -1
}

func normalizeExternalVideoURL(raw string) (string, string, string, error) {
	parsedURL, err := parseExternalVideoURL(raw)
	if err != nil {
		return "", "", "", err
	}

	host := strings.ToLower(parsedURL.Hostname())
	switch host {
	case "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be":
		externalURL, embedURL, err := buildYouTubeURLs(parsedURL, host)
		if err != nil {
			return "", "", "", err
		}
		return "youtube", externalURL, embedURL, nil
	case "bilibili.com", "www.bilibili.com", "m.bilibili.com", "player.bilibili.com":
		externalURL, embedURL, err := buildBilibiliURLs(parsedURL, host)
		if err != nil {
			return "", "", "", err
		}
		return "bilibili", externalURL, embedURL, nil
	case "b23.tv":
		return "", "", "", errors.New("b23.tv short links are not supported yet; please paste the full bilibili.com URL")
	default:
		return "", "", "", errors.New("only YouTube and Bilibili video links are supported")
	}
}

func parseExternalVideoURL(raw string) (*url.URL, error) {
	candidate := strings.TrimSpace(raw)
	if candidate == "" {
		return nil, errors.New("video URL is required")
	}

	parsedURL, err := url.Parse(candidate)
	if err != nil {
		return nil, fmt.Errorf("parse video URL: %w", err)
	}

	if parsedURL.Scheme == "" && parsedURL.Host == "" {
		parsedURL, err = url.Parse("https://" + candidate)
		if err != nil {
			return nil, fmt.Errorf("parse video URL: %w", err)
		}
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, errors.New("video URL must start with http:// or https://")
	}

	if parsedURL.Hostname() == "" {
		return nil, errors.New("video URL must include a valid hostname")
	}

	return parsedURL, nil
}

func buildYouTubeURLs(parsedURL *url.URL, host string) (string, string, error) {
	var videoID string
	segments := splitURLPath(parsedURL.Path)

	switch host {
	case "youtu.be":
		if len(segments) > 0 {
			videoID = segments[0]
		}
	default:
		switch {
		case len(segments) > 0 && segments[0] == "watch":
			videoID = strings.TrimSpace(parsedURL.Query().Get("v"))
		case len(segments) >= 2 && (segments[0] == "embed" || segments[0] == "shorts" || segments[0] == "live"):
			videoID = segments[1]
		}
	}

	videoID = strings.TrimSpace(videoID)
	if !youtubeVideoIDPattern.MatchString(videoID) {
		return "", "", errors.New("could not extract a valid YouTube video ID")
	}

	externalURL := "https://www.youtube.com/watch?v=" + videoID
	embedURL := "https://www.youtube.com/embed/" + videoID + "?playsinline=1&rel=0"
	return externalURL, embedURL, nil
}

func buildBilibiliURLs(parsedURL *url.URL, host string) (string, string, error) {
	query := parsedURL.Query()

	if host == "player.bilibili.com" {
		if bvid := normalizeBilibiliBVID(query.Get("bvid")); bvid != "" {
			return bilibiliVideoURLs("bvid", bvid)
		}
		if aid := normalizeNumericID(query.Get("aid")); aid != "" {
			return bilibiliVideoURLs("aid", aid)
		}
		if episodeID := normalizeNumericID(query.Get("episodeId")); episodeID != "" {
			return bilibiliVideoURLs("episodeId", episodeID)
		}
		if seasonID := normalizeNumericID(query.Get("seasonId")); seasonID != "" {
			return bilibiliVideoURLs("seasonId", seasonID)
		}
	}

	segments := splitURLPath(parsedURL.Path)
	switch {
	case len(segments) >= 2 && segments[0] == "video":
		if bvid := normalizeBilibiliBVID(segments[1]); bvid != "" {
			return bilibiliVideoURLs("bvid", bvid)
		}

		lowerSegment := strings.ToLower(strings.TrimSpace(segments[1]))
		if strings.HasPrefix(lowerSegment, "av") {
			if aid := normalizeNumericID(strings.TrimPrefix(lowerSegment, "av")); aid != "" {
				return bilibiliVideoURLs("aid", aid)
			}
		}
	case len(segments) >= 3 && segments[0] == "bangumi" && segments[1] == "play":
		lowerSegment := strings.ToLower(strings.TrimSpace(segments[2]))
		if strings.HasPrefix(lowerSegment, "ep") {
			if episodeID := normalizeNumericID(strings.TrimPrefix(lowerSegment, "ep")); episodeID != "" {
				return bilibiliVideoURLs("episodeId", episodeID)
			}
		}
		if strings.HasPrefix(lowerSegment, "ss") {
			if seasonID := normalizeNumericID(strings.TrimPrefix(lowerSegment, "ss")); seasonID != "" {
				return bilibiliVideoURLs("seasonId", seasonID)
			}
		}
	}

	return "", "", errors.New("could not extract a supported Bilibili video ID")
}

func bilibiliVideoURLs(idType string, value string) (string, string, error) {
	switch idType {
	case "bvid":
		return "https://www.bilibili.com/video/" + value + "/", "https://player.bilibili.com/player.html?bvid=" + value + "&danmaku=0", nil
	case "aid":
		return "https://www.bilibili.com/video/av" + value + "/", "https://player.bilibili.com/player.html?aid=" + value + "&danmaku=0", nil
	case "episodeId":
		return "https://www.bilibili.com/bangumi/play/ep" + value, "https://player.bilibili.com/player.html?episodeId=" + value + "&danmaku=0", nil
	case "seasonId":
		return "https://www.bilibili.com/bangumi/play/ss" + value, "https://player.bilibili.com/player.html?seasonId=" + value + "&danmaku=0", nil
	default:
		return "", "", errors.New("unsupported Bilibili video reference")
	}
}

func splitURLPath(rawPath string) []string {
	trimmed := strings.Trim(strings.TrimSpace(rawPath), "/")
	if trimmed == "" {
		return nil
	}

	segments := strings.Split(trimmed, "/")
	filtered := make([]string, 0, len(segments))
	for _, segment := range segments {
		segment = strings.TrimSpace(segment)
		if segment == "" {
			continue
		}

		filtered = append(filtered, segment)
	}

	return filtered
}

func normalizeBilibiliBVID(value string) string {
	candidate := strings.TrimSpace(value)
	if bilibiliBVIDPattern.MatchString(candidate) {
		return "BV" + candidate[2:]
	}

	return ""
}

func normalizeNumericID(value string) string {
	candidate := strings.TrimSpace(value)
	if numericIDPattern.MatchString(candidate) {
		return candidate
	}

	return ""
}
