package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	cosSyncScriptFileName = "cos_sync.py"
	cosSyncEnvFileName    = "cos-sync.env"
)

func (a *app) syncAssetsToCOS() error {
	scriptPath := filepath.Join(a.sourceDir, cosSyncScriptFileName)
	pythonPath := filepath.Join(a.repoRoot, ".venv-cos", "bin", "python")
	envFilePath := filepath.Join(a.repoRoot, "data", cosSyncEnvFileName)

	for _, candidatePath := range []string{scriptPath, pythonPath, envFilePath} {
		if _, err := os.Stat(candidatePath); err != nil {
			if os.IsNotExist(err) {
				return nil
			}

			return fmt.Errorf("inspect cos sync dependency %s: %w", candidatePath, err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	command := exec.CommandContext(
		ctx,
		pythonPath,
		scriptPath,
		"--source", a.publicDir,
		"--prefix", "gltf",
		"--env-file", envFilePath,
	)
	command.Dir = a.repoRoot

	output, err := command.CombinedOutput()
	outputText := strings.TrimSpace(string(output))
	if outputText != "" {
		log.Printf("COS sync output:\n%s", outputText)
	}

	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("sync assets to cos timed out after %s", 20*time.Minute)
	}

	if err != nil {
		if outputText == "" {
			return fmt.Errorf("sync assets to cos: %w", err)
		}

		return fmt.Errorf("sync assets to cos: %w: %s", err, outputText)
	}

	return nil
}
