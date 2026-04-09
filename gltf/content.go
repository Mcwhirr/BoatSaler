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
	"strings"
	"time"
)

var (
	youtubeVideoIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
	bilibiliBVIDPattern   = regexp.MustCompile(`(?i)^BV[0-9A-Za-z]+$`)
	numericIDPattern      = regexp.MustCompile(`^[0-9]+$`)
)

type siteContent struct {
	UpdatedAt string      `json:"updatedAt"`
	Videos    []siteVideo `json:"videos"`
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

	return content, nil
}

func (a *app) writeSiteContent(content siteContent) error {
	content.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if content.Videos == nil {
		content.Videos = []siteVideo{}
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
