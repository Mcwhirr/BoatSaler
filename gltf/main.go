package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"time"
)

type Vec3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type Color struct {
	Hex string `json:"hex"`
}

type Material struct {
	Type  string `json:"type"`
	Color Color  `json:"color"`
}

type SceneObject struct {
	ID       string   `json:"id"`
	Kind     string   `json:"kind"`
	Position Vec3     `json:"position"`
	Rotation Vec3     `json:"rotation"`
	Scale    Vec3     `json:"scale"`
	Material Material `json:"material"`
}

type ScenePayload struct {
	Name    string        `json:"name"`
	Camera  Vec3          `json:"camera"`
	Objects []SceneObject `json:"objects"`
}

func main() {
	rand.Seed(time.Now().UnixNano())

	app, err := newApp()
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/time", timeHandler)
	mux.HandleFunc("/api/scene/basic", basicSceneHandler)
	mux.HandleFunc("/api/scene/random", randomSceneHandler)
	app.registerAdminRoutes(mux)
	app.registerContentRoutes(mux)
	app.registerFrontendRoutes(mux)

	server := &http.Server{
		Addr:         ":8080",
		Handler:      withCORS(mux),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	log.Println("Go server is running at http://localhost:8080")
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
	})
}

func timeHandler(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	writeJSON(w, http.StatusOK, map[string]any{
		"unix": now.Unix(),
		"iso":  now.Format(time.RFC3339),
	})
}

func basicSceneHandler(w http.ResponseWriter, r *http.Request) {
	payload := ScenePayload{
		Name:   "basic-scene",
		Camera: Vec3{X: 0, Y: 2, Z: 6},
		Objects: []SceneObject{
			{
				ID:       "cube-1",
				Kind:     "box",
				Position: Vec3{X: 0, Y: 0, Z: 0},
				Rotation: Vec3{X: 0, Y: 0.4, Z: 0},
				Scale:    Vec3{X: 1, Y: 1, Z: 1},
				Material: Material{Type: "standard", Color: Color{Hex: "#44aa88"}},
			},
			{
				ID:       "sphere-1",
				Kind:     "sphere",
				Position: Vec3{X: 2, Y: 0.5, Z: -1},
				Rotation: Vec3{X: 0, Y: 0, Z: 0},
				Scale:    Vec3{X: 1, Y: 1, Z: 1},
				Material: Material{Type: "standard", Color: Color{Hex: "#3f7ad6"}},
			},
		},
	}

	writeJSON(w, http.StatusOK, payload)
}

func randomSceneHandler(w http.ResponseWriter, r *http.Request) {
	count := 10
	if raw := r.URL.Query().Get("count"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 50 {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "count must be an integer between 1 and 50",
			})
			return
		}
		count = parsed
	}

	objects := make([]SceneObject, 0, count)
	colors := []string{"#e74c3c", "#2ecc71", "#3498db", "#f1c40f", "#9b59b6"}

	for i := 0; i < count; i++ {
		objects = append(objects, SceneObject{
			ID:   "obj-" + strconv.Itoa(i+1),
			Kind: []string{"box", "sphere", "cone"}[rand.Intn(3)],
			Position: Vec3{
				X: rand.Float64()*10 - 5,
				Y: rand.Float64()*2 + 0.2,
				Z: rand.Float64()*10 - 5,
			},
			Rotation: Vec3{
				X: rand.Float64(),
				Y: rand.Float64(),
				Z: rand.Float64(),
			},
			Scale: Vec3{
				X: rand.Float64()*1.5 + 0.5,
				Y: rand.Float64()*1.5 + 0.5,
				Z: rand.Float64()*1.5 + 0.5,
			},
			Material: Material{
				Type:  "standard",
				Color: Color{Hex: colors[rand.Intn(len(colors))]},
			},
		})
	}

	payload := ScenePayload{
		Name:    "random-scene",
		Camera:  Vec3{X: 0, Y: 5, Z: 10},
		Objects: objects,
	}

	writeJSON(w, http.StatusOK, payload)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
