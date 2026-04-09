package main

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func (a *app) registerFrontendRoutes(mux *http.ServeMux) {
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(filepath.Join(a.distDir, "assets")))))
	mux.Handle("/gltf/", http.StripPrefix("/gltf/", http.FileServer(http.Dir(a.publicDir))))
	mux.Handle("/pdf/", http.StripPrefix("/pdf/", http.FileServer(http.Dir(filepath.Join(a.repoRoot, "pdf")))))
	mux.HandleFunc("/", a.handleFrontendRequest)
}

func (a *app) handleFrontendRequest(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}

	indexPath := filepath.Join(a.distDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "frontend build not found; run `cd frontend && npm run build` before starting the Go server", http.StatusServiceUnavailable)
			return
		}

		http.Error(w, fmt.Sprintf("resolve frontend build: %v", err), http.StatusInternalServerError)
		return
	}

	if r.URL.Path == "/" {
		http.ServeFile(w, r, indexPath)
		return
	}

	cleanedPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	requestedPath := filepath.Join(a.distDir, filepath.FromSlash(cleanedPath))
	if !isWithinBaseDirectory(a.distDir, requestedPath) {
		http.Error(w, "invalid frontend asset path", http.StatusBadRequest)
		return
	}

	fileInfo, err := os.Stat(requestedPath)
	switch {
	case err == nil && !fileInfo.IsDir():
		http.ServeFile(w, r, requestedPath)
		return
	case err == nil && fileInfo.IsDir():
		nestedIndexPath := filepath.Join(requestedPath, "index.html")
		if nestedInfo, nestedErr := os.Stat(nestedIndexPath); nestedErr == nil && !nestedInfo.IsDir() {
			http.ServeFile(w, r, nestedIndexPath)
			return
		}
	case err != nil && !os.IsNotExist(err):
		http.Error(w, fmt.Sprintf("resolve frontend asset: %v", err), http.StatusInternalServerError)
		return
	}

	http.ServeFile(w, r, indexPath)
}
