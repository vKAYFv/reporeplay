package analyzer

import (
	"testing"
	"time"

	"github.com/vKAYFv/reporeplay/internal/model"
)

func TestAnalyzeBuildsRepositoryStory(t *testing.T) {
	jan := time.Date(2026, 1, 2, 12, 0, 0, 0, time.UTC)
	feb := time.Date(2026, 2, 3, 12, 0, 0, 0, time.UTC)
	raw := model.RawRepository{
		Name: "demo", Branch: "main", Head: "0123456789abcdef", TrackedFiles: 2,
		TrackedPaths: []string{"cmd/demo/main.go", "README.md"},
		Commits: []model.RawCommit{
			{Hash: "one", ShortHash: "one", Author: "Ada", Email: "ada@example.com", Date: feb, Subject: "Ship demo", Tags: []string{"v1.0.0"}, FileChanges: []model.RawFileChange{{Path: "cmd/demo/main.go", Additions: 20, Deletions: 2}}},
			{Hash: "two", ShortHash: "two", Author: "Grace", Email: "grace@example.com", Date: jan, Subject: "Start project", FileChanges: []model.RawFileChange{{Path: "README.md", Additions: 10}}},
		},
	}

	report := Analyze(raw)
	if report.Summary.Commits != 2 || report.Summary.Contributors != 2 || report.Summary.Additions != 30 || report.Summary.Deletions != 2 {
		t.Fatalf("unexpected summary: %#v", report.Summary)
	}
	if len(report.Timeline) != 2 || report.Timeline[0].Key != "2026-01" || report.Timeline[1].Key != "2026-02" {
		t.Fatalf("unexpected timeline: %#v", report.Timeline)
	}
	if len(report.Milestones) != 1 || report.Milestones[0].Tag != "v1.0.0" {
		t.Fatalf("unexpected milestones: %#v", report.Milestones)
	}
	if len(report.HotFiles) != 2 || report.HotFiles[0].Path != "cmd/demo/main.go" {
		t.Fatalf("unexpected hotspots: %#v", report.HotFiles)
	}
	if len(report.Languages) != 2 || report.Languages[0].Share != 50 {
		t.Fatalf("unexpected languages: %#v", report.Languages)
	}
}

func TestTopLevel(t *testing.T) {
	for input, want := range map[string]string{"README.md": "(root)", "cmd/app/main.go": "cmd", "./internal/a.go": "internal"} {
		if got := topLevel(input); got != want {
			t.Errorf("topLevel(%q) = %q, want %q", input, got, want)
		}
	}
}
