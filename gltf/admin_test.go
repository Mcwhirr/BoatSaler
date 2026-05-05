package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSanitizeRelativeSubdirectoryAllowsAssetFolderNames(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "ascii folder",
			input: "cc",
			want:  "cc",
		},
		{
			name:  "nested material folder",
			input: "tt/cc",
			want:  "tt/cc",
		},
		{
			name:  "chinese asset folder",
			input: "船舱+栏杆+沙发（2048）/tt",
			want:  "船舱+栏杆+沙发（2048）/tt",
		},
		{
			name:  "backslash normalized",
			input: `船体+顶棚（2048）\tt`,
			want:  "船体+顶棚（2048）/tt",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := sanitizeRelativeSubdirectory(test.input)
			if err != nil {
				t.Fatalf("sanitizeRelativeSubdirectory(%q) returned error: %v", test.input, err)
			}

			if got != test.want {
				t.Fatalf("sanitizeRelativeSubdirectory(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}

func TestHandleAdminUpdateModelEnginesOnlyUpdatesTargetModelEngines(t *testing.T) {
	tempDir := t.TempDir()
	sourceDir := filepath.Join(tempDir, "gltf")
	contentPath := filepath.Join(tempDir, "site-content.json")

	for _, modelID := range []string{"40mijianchuan", "Cabnet"} {
		if err := os.MkdirAll(filepath.Join(sourceDir, modelID), 0o755); err != nil {
			t.Fatalf("create model dir: %v", err)
		}
	}

	application := &app{
		sourceDir:   sourceDir,
		contentPath: contentPath,
	}

	initialContent := defaultSiteContent()
	initialContent.Models["40mijianchuan"] = siteModelContent{
		DisplayName: "40m",
		Type:        "公务执法艇",
		Summary:     "keep this summary",
	}
	initialContent.Models["Cabnet"] = siteModelContent{
		DisplayName: "Cabnet",
		Engines: []siteEngineMount{
			{
				Enabled: true,
				Type:    "outboard-a",
				Position: siteVector3{
					X: 1,
					Y: 2,
					Z: 3,
				},
			},
		},
	}
	if err := application.writeSiteContent(initialContent); err != nil {
		t.Fatalf("write initial content: %v", err)
	}

	payload := siteModelEnginesInput{
		Engines: []siteEngineMount{
			{
				Enabled: true,
				Type:    "outboard-b",
				Position: siteVector3{
					X: 10,
					Y: 20,
					Z: 30,
				},
				Rotation: siteVector3{
					Y: 1.57,
				},
			},
		},
	}
	if err := application.updateSiteModelEngines("Cabnet", payload.Engines); err != nil {
		t.Fatalf("updateSiteModelEngines returned error: %v", err)
	}

	content, err := application.readSiteContent()
	if err != nil {
		t.Fatalf("read site content: %v", err)
	}

	if got := content.Models["40mijianchuan"].Summary; got != "keep this summary" {
		t.Fatalf("40mijianchuan summary changed to %q", got)
	}
	if len(content.Models["40mijianchuan"].Engines) != 0 {
		t.Fatalf("40mijianchuan engines changed: %+v", content.Models["40mijianchuan"].Engines)
	}

	cabnetEngines := content.Models["Cabnet"].Engines
	if len(cabnetEngines) != 1 {
		t.Fatalf("Cabnet engines length = %d, want 1", len(cabnetEngines))
	}
	if cabnetEngines[0].Type != "outboard-b" || cabnetEngines[0].Position.X != 10 || cabnetEngines[0].Rotation.Y != 1.57 {
		t.Fatalf("Cabnet engine not updated correctly: %+v", cabnetEngines[0])
	}
}

func TestSanitizeRelativeSubdirectoryRejectsUnsafePaths(t *testing.T) {
	tests := []string{
		"../escape",
		"/absolute",
		`bad:name`,
		"bad\x00name",
	}

	for _, input := range tests {
		t.Run(input, func(t *testing.T) {
			if got, err := sanitizeRelativeSubdirectory(input); err == nil {
				t.Fatalf("sanitizeRelativeSubdirectory(%q) = %q, want error", input, got)
			}
		})
	}
}

func TestScanAdminUVSetsUsesNestedTextureDirectory(t *testing.T) {
	assignments := defaultTextureAssignments()
	uvSets, err := scanAdminUVSets(
		"../gltf",
		"TestHigh",
		"../gltf/TestHigh/船舱+栏杆+沙发（2048）",
		"船舱+栏杆+沙发（2048）",
		nil,
		assignments,
	)
	if err != nil {
		t.Fatalf("scanAdminUVSets returned error: %v", err)
	}

	if len(uvSets) != 1 {
		t.Fatalf("scanAdminUVSets returned %d uv sets, want 1", len(uvSets))
	}

	if got, want := uvSets[0].DirectoryPath, "船舱+栏杆+沙发（2048）/tt"; got != want {
		t.Fatalf("directoryPath = %q, want %q", got, want)
	}
}
