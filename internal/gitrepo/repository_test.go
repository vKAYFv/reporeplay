package gitrepo

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestParseLog(t *testing.T) {
	input := []byte("\x1e0123456789\x1f0123456\x1fAda Lovelace\x1fada@example.com\x1f2026-01-02T03:04:05+00:00\x1fAdd parser\n12\t3\tinternal/parser.go\n-\t-\tdocs/demo.png\n")
	commits, err := ParseLog(input)
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) != 1 {
		t.Fatalf("got %d commits, want 1", len(commits))
	}
	commit := commits[0]
	if commit.Author != "Ada Lovelace" || commit.Subject != "Add parser" {
		t.Fatalf("unexpected commit: %#v", commit)
	}
	if len(commit.FileChanges) != 2 || commit.FileChanges[0].Additions != 12 || !commit.FileChanges[1].Binary {
		t.Fatalf("unexpected file changes: %#v", commit.FileChanges)
	}
}

func TestParseLogRejectsInvalidRecord(t *testing.T) {
	_, err := ParseLog([]byte("\x1ebroken"))
	if err == nil {
		t.Fatal("expected invalid record error")
	}
}

func TestLoadRepository(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dir := t.TempDir()
	runGit(t, dir, "init", "-b", "main")
	runGit(t, dir, "config", "user.name", "Grace Hopper")
	runGit(t, dir, "config", "user.email", "grace@example.com")
	if err := os.WriteFile(filepath.Join(dir, "hello.go"), []byte("package hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, "add", "hello.go")
	runGit(t, dir, "commit", "-m", "Initial release")
	runGit(t, dir, "tag", "v0.1.0")
	runGit(t, dir, "remote", "add", "origin", "git@github.com:example/hello.git")

	repo, err := Load(context.Background(), CommandRunner{}, dir)
	if err != nil {
		t.Fatal(err)
	}
	if repo.Name != filepath.Base(dir) || repo.Branch != "main" || repo.TrackedFiles != 1 {
		t.Fatalf("unexpected repository: %#v", repo)
	}
	if repo.Remote != "https://github.com/example/hello" {
		t.Fatalf("remote = %q", repo.Remote)
	}
	if len(repo.Commits) != 1 || len(repo.Commits[0].Tags) != 1 || repo.Commits[0].Tags[0] != "v0.1.0" {
		t.Fatalf("unexpected commits: %#v", repo.Commits)
	}
}

func TestLoadRejectsNonRepository(t *testing.T) {
	_, err := Load(context.Background(), CommandRunner{}, t.TempDir())
	if !errors.Is(err, ErrNotRepository) {
		t.Fatalf("got %v, want ErrNotRepository", err)
	}
}

func TestNormalizeRemoteRemovesCredentials(t *testing.T) {
	tests := map[string]string{
		"https://secret-token@github.com/example/demo.git?token=also-secret": "https://github.com/example/demo",
		"git@gitlab.com:example/demo.git":                                    "https://gitlab.com/example/demo",
		"/Users/example/local-repo":                                          "",
	}
	for input, want := range tests {
		if got := normalizeRemote(input); got != want {
			t.Errorf("normalizeRemote(%q) = %q, want %q", input, got, want)
		}
	}
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_DATE=2026-01-02T03:04:05Z", "GIT_COMMITTER_DATE=2026-01-02T03:04:05Z")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
}
