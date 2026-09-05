package gitrepo

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/vKAYFv/reporeplay/internal/model"
)

var ErrNotRepository = errors.New("not a Git repository")

type Runner interface {
	Run(ctx context.Context, dir string, args ...string) ([]byte, error)
}

type CommandRunner struct{}

func (CommandRunner) Run(ctx context.Context, dir string, args ...string) ([]byte, error) {
	commandArgs := append([]string{"-C", dir}, args...)
	cmd := exec.CommandContext(ctx, "git", commandArgs...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return nil, fmt.Errorf("git %s: %s", strings.Join(args, " "), message)
	}
	return out, nil
}

func Load(ctx context.Context, runner Runner, path string) (model.RawRepository, error) {
	rootBytes, err := runner.Run(ctx, path, "rev-parse", "--show-toplevel")
	if err != nil {
		return model.RawRepository{}, fmt.Errorf("%w: %s", ErrNotRepository, path)
	}
	root := strings.TrimSpace(string(rootBytes))

	head, err := required(ctx, runner, root, "rev-parse", "HEAD")
	if err != nil {
		return model.RawRepository{}, fmt.Errorf("repository has no commits: %w", err)
	}
	branch, err := optional(ctx, runner, root, "symbolic-ref", "--quiet", "--short", "HEAD")
	if err != nil || branch == "" {
		branch = short(head, 8)
	}
	remote, _ := optional(ctx, runner, root, "remote", "get-url", "origin")
	filesBytes, err := runner.Run(ctx, root, "ls-files", "-z")
	if err != nil {
		return model.RawRepository{}, err
	}

	tags, err := loadTags(ctx, runner, root)
	if err != nil {
		return model.RawRepository{}, err
	}
	logBytes, err := runner.Run(ctx, root,
		"-c", "core.quotepath=false",
		"log", "--date=iso-strict", "--no-renames", "--numstat",
		"--format=%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s",
	)
	if err != nil {
		return model.RawRepository{}, err
	}
	commits, err := ParseLog(logBytes)
	if err != nil {
		return model.RawRepository{}, err
	}
	for i := range commits {
		commits[i].Tags = tags[commits[i].Hash]
	}

	return model.RawRepository{
		Name:         filepath.Base(root),
		Root:         root,
		Branch:       branch,
		Head:         head,
		Remote:       normalizeRemote(remote),
		TrackedFiles: countNUL(filesBytes),
		TrackedPaths: splitNUL(filesBytes),
		Commits:      commits,
	}, nil
}

func ParseLog(data []byte) ([]model.RawCommit, error) {
	records := bytes.Split(data, []byte{0x1e})
	commits := make([]model.RawCommit, 0, len(records))
	for _, raw := range records {
		raw = bytes.Trim(raw, "\r\n")
		if len(raw) == 0 {
			continue
		}
		lines := bytes.Split(raw, []byte("\n"))
		fields := bytes.Split(lines[0], []byte{0x1f})
		if len(fields) != 6 {
			return nil, fmt.Errorf("invalid git log record: expected 6 fields, got %d", len(fields))
		}
		date, err := time.Parse(time.RFC3339, string(fields[4]))
		if err != nil {
			return nil, fmt.Errorf("parse commit date %q: %w", fields[4], err)
		}
		commit := model.RawCommit{
			Hash:      string(fields[0]),
			ShortHash: string(fields[1]),
			Author:    string(fields[2]),
			Email:     string(fields[3]),
			Date:      date,
			Subject:   string(fields[5]),
		}
		for _, line := range lines[1:] {
			line = bytes.TrimSuffix(line, []byte("\r"))
			if len(line) == 0 {
				continue
			}
			parts := bytes.SplitN(line, []byte("\t"), 3)
			if len(parts) != 3 {
				continue
			}
			change := model.RawFileChange{Path: string(parts[2])}
			if string(parts[0]) == "-" || string(parts[1]) == "-" {
				change.Binary = true
			} else {
				change.Additions, _ = strconv.Atoi(string(parts[0]))
				change.Deletions, _ = strconv.Atoi(string(parts[1]))
			}
			commit.FileChanges = append(commit.FileChanges, change)
		}
		commits = append(commits, commit)
	}
	if len(commits) == 0 {
		return nil, errors.New("repository has no commits")
	}
	return commits, nil
}

func loadTags(ctx context.Context, runner Runner, root string) (map[string][]string, error) {
	out, err := runner.Run(ctx, root, "for-each-ref", "--format=%(refname:short)%00%(objectname)%00%(*objectname)", "refs/tags")
	if err != nil {
		return nil, err
	}
	result := make(map[string][]string)
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\x00")
		if len(parts) != 3 {
			continue
		}
		hash := parts[1]
		if parts[2] != "" {
			hash = parts[2]
		}
		result[hash] = append(result[hash], parts[0])
	}
	return result, nil
}

func required(ctx context.Context, runner Runner, dir string, args ...string) (string, error) {
	out, err := runner.Run(ctx, dir, args...)
	return strings.TrimSpace(string(out)), err
}

func optional(ctx context.Context, runner Runner, dir string, args ...string) (string, error) {
	out, err := runner.Run(ctx, dir, args...)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func countNUL(data []byte) int {
	if len(data) == 0 {
		return 0
	}
	return bytes.Count(data, []byte{0})
}

func splitNUL(data []byte) []string {
	parts := bytes.Split(data, []byte{0})
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if len(part) > 0 {
			result = append(result, string(part))
		}
	}
	return result
}

func short(value string, length int) string {
	if len(value) <= length {
		return value
	}
	return value[:length]
}

func normalizeRemote(remote string) string {
	remote = strings.TrimSpace(remote)
	if remote == "" {
		return ""
	}
	if parsed, err := url.Parse(remote); err == nil && parsed.Scheme != "" {
		if parsed.Scheme == "file" || parsed.Hostname() == "" {
			return ""
		}
		parsed.User = nil
		parsed.RawQuery = ""
		parsed.ForceQuery = false
		parsed.Fragment = ""
		parsed.Path = strings.TrimSuffix(parsed.Path, ".git")
		return parsed.String()
	}
	if at := strings.IndexByte(remote, '@'); at >= 0 {
		if colon := strings.IndexByte(remote[at+1:], ':'); colon >= 0 {
			colon += at + 1
			host, path := remote[at+1:colon], remote[colon+1:]
			if host != "" && path != "" {
				return "https://" + host + "/" + strings.TrimSuffix(path, ".git")
			}
		}
	}
	return ""
}
