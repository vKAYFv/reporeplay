package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vKAYFv/reporeplay/internal/model"
)

func TestRunVersionAndHelp(t *testing.T) {
	for _, test := range []struct {
		args []string
		want string
	}{{[]string{"version"}, "RepoReplay"}, {[]string{"help"}, "reporeplay build"}} {
		var stdout, stderr bytes.Buffer
		if err := run(context.Background(), test.args, &stdout, &stderr); err != nil {
			t.Fatalf("run(%v): %v", test.args, err)
		}
		if !strings.Contains(stdout.String(), test.want) {
			t.Fatalf("run(%v) output %q does not contain %q", test.args, stdout.String(), test.want)
		}
	}
}

func TestRunBuildJSON(t *testing.T) {
	dir := testRepository(t)
	var stdout, stderr bytes.Buffer
	if err := run(context.Background(), []string{"build", "--json", "--pretty", dir}, &stdout, &stderr); err != nil {
		t.Fatal(err)
	}
	var data model.Report
	if err := json.Unmarshal(stdout.Bytes(), &data); err != nil {
		t.Fatalf("decode CLI output: %v\n%s", err, stdout.String())
	}
	if data.Repository.Name != filepath.Base(dir) || data.Summary.Commits != 1 {
		t.Fatalf("unexpected report: %#v", data)
	}
}

func TestRunBuildHTML(t *testing.T) {
	dir := testRepository(t)
	output := filepath.Join(t.TempDir(), "story.html")
	var stdout, stderr bytes.Buffer
	if err := run(context.Background(), []string{"build", "--output", output, dir}, &stdout, &stderr); err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(payload, []byte("RepoReplay")) || !strings.Contains(stdout.String(), "Report written") {
		t.Fatal("build did not produce a complete report")
	}
}

func TestRunRejectsInvalidInput(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if err := run(context.Background(), []string{"--unknown"}, &stdout, &stderr); err == nil {
		t.Fatal("expected unknown option error")
	}
	if err := run(context.Background(), []string{"serve", "--port", "70000"}, &stdout, &stderr); err == nil {
		t.Fatal("expected invalid port error")
	}
	if _, err := onePath([]string{"one", "two"}); err == nil {
		t.Fatal("expected multiple path error")
	}
}

func testRepository(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dir := t.TempDir()
	commands := [][]string{{"init", "-b", "main"}, {"config", "user.name", "Test Author"}, {"config", "user.email", "author@example.com"}}
	for _, args := range commands {
		runTestGit(t, dir, args...)
	}
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("# Demo\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, dir, "add", "README.md")
	runTestGit(t, dir, "commit", "-m", "Initial commit")
	return dir
}

func runTestGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_DATE=2026-01-02T03:04:05Z", "GIT_COMMITTER_DATE=2026-01-02T03:04:05Z")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
}
