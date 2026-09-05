package analyzer

import (
	"math"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/vKAYFv/reporeplay/internal/model"
)

const maxHotFiles = 12

type contributorWork struct {
	name      string
	commits   int
	additions int
	deletions int
	first     time.Time
	last      time.Time
}

type fileWork struct {
	path      string
	commits   int
	additions int
	deletions int
	last      time.Time
	authors   map[string]int
}

type periodWork struct {
	period  model.Period
	authors map[string]struct{}
}

func Analyze(raw model.RawRepository) model.Report {
	contributors := make(map[string]*contributorWork)
	files := make(map[string]*fileWork)
	periods := make(map[string]*periodWork)
	activity := make(map[string]int)
	directories := make(map[string]*model.Directory)
	languages := make(map[string]int)
	milestones := make([]model.Milestone, 0)
	events := make([]model.CommitEvent, 0, len(raw.Commits))
	activeDays := make(map[string]struct{})
	var additions, deletions int
	first, last := raw.Commits[0].Date, raw.Commits[0].Date

	for _, commit := range raw.Commits {
		if commit.Date.Before(first) {
			first = commit.Date
		}
		if commit.Date.After(last) {
			last = commit.Date
		}
		day := commit.Date.Format("2006-01-02")
		activeDays[day] = struct{}{}
		activity[day]++

		authorKey := strings.ToLower(strings.TrimSpace(commit.Email))
		if authorKey == "" {
			authorKey = strings.ToLower(commit.Author)
		}
		contributor := contributors[authorKey]
		if contributor == nil {
			contributor = &contributorWork{name: commit.Author, first: commit.Date, last: commit.Date}
			contributors[authorKey] = contributor
		}
		contributor.commits++
		if commit.Date.Before(contributor.first) {
			contributor.first = commit.Date
		}
		if commit.Date.After(contributor.last) {
			contributor.last = commit.Date
		}

		month := commit.Date.Format("2006-01")
		period := periods[month]
		if period == nil {
			period = &periodWork{period: model.Period{Key: month, Label: commit.Date.Format("Jan 2006")}, authors: make(map[string]struct{})}
			periods[month] = period
		}
		period.period.Commits++
		period.authors[authorKey] = struct{}{}

		event := model.CommitEvent{Hash: commit.Hash, ShortHash: commit.ShortHash, Author: commit.Author, Date: commit.Date.Format(time.RFC3339), Subject: commit.Subject, Tags: commit.Tags}
		for _, change := range commit.FileChanges {
			event.FilesChanged++
			event.Additions += change.Additions
			event.Deletions += change.Deletions
			additions += change.Additions
			deletions += change.Deletions
			contributor.additions += change.Additions
			contributor.deletions += change.Deletions
			period.period.Additions += change.Additions
			period.period.Deletions += change.Deletions
			period.period.FilesChanged++

			file := files[change.Path]
			if file == nil {
				file = &fileWork{path: change.Path, authors: make(map[string]int)}
				files[change.Path] = file
			}
			file.commits++
			file.additions += change.Additions
			file.deletions += change.Deletions
			file.authors[commit.Author]++
			if commit.Date.After(file.last) {
				file.last = commit.Date
			}

			directoryName := topLevel(change.Path)
			directory := directories[directoryName]
			if directory == nil {
				directory = &model.Directory{Name: directoryName}
				directories[directoryName] = directory
			}
			directory.Commits++
			directory.Additions += change.Additions
			directory.Deletions += change.Deletions
		}
		for _, tag := range commit.Tags {
			milestones = append(milestones, model.Milestone{Tag: tag, Hash: commit.ShortHash, Date: day, Subject: commit.Subject})
		}
		events = append(events, event)
	}

	for _, file := range files {
		directory := directories[topLevel(file.path)]
		directory.Files++
	}
	for _, path := range raw.TrackedPaths {
		ext := strings.ToLower(filepath.Ext(path))
		languages[languageName(ext)]++
	}

	result := model.Report{
		SchemaVersion: 1,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Repository:    model.Repository{Name: raw.Name, Branch: raw.Branch, Head: short(raw.Head, 8), Remote: raw.Remote},
		Summary:       model.Summary{Commits: len(raw.Commits), Contributors: len(contributors), TrackedFiles: raw.TrackedFiles, FilesTouched: len(files), Additions: additions, Deletions: deletions, ActiveDays: len(activeDays), FirstCommit: first.Format("2006-01-02"), LastCommit: last.Format("2006-01-02")},
		Contributors:  contributorList(contributors, len(raw.Commits)),
		HotFiles:      fileList(files),
		Directories:   directoryList(directories),
		Languages:     languageList(languages),
		Milestones:    milestones,
		Commits:       events,
	}
	result.Timeline = periodList(periods)
	result.Activity = activityList(activity)
	sort.Slice(result.Milestones, func(i, j int) bool { return result.Milestones[i].Date > result.Milestones[j].Date })
	return result
}

func contributorList(values map[string]*contributorWork, total int) []model.Contributor {
	result := make([]model.Contributor, 0, len(values))
	for _, value := range values {
		result = append(result, model.Contributor{Name: value.name, Commits: value.commits, Additions: value.additions, Deletions: value.deletions, FirstCommit: value.first.Format("2006-01-02"), LastCommit: value.last.Format("2006-01-02"), Share: round(float64(value.commits) / float64(total) * 100)})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Commits > result[j].Commits })
	return result
}

func fileList(values map[string]*fileWork) []model.FileStat {
	result := make([]model.FileStat, 0, len(values))
	for _, value := range values {
		churn := value.additions + value.deletions
		result = append(result, model.FileStat{Path: value.path, Commits: value.commits, Additions: value.additions, Deletions: value.deletions, Churn: churn, LastChanged: value.last.Format("2006-01-02"), TopAuthor: topAuthor(value.authors), Score: round(float64(value.commits)*2 + math.Sqrt(float64(churn)))})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Score == result[j].Score {
			return result[i].Path < result[j].Path
		}
		return result[i].Score > result[j].Score
	})
	if len(result) > maxHotFiles {
		result = result[:maxHotFiles]
	}
	return result
}

func periodList(values map[string]*periodWork) []model.Period {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]model.Period, 0, len(keys))
	for _, key := range keys {
		value := values[key]
		value.period.Contributors = len(value.authors)
		result = append(result, value.period)
	}
	return result
}

func activityList(values map[string]int) []model.ActivityDay {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]model.ActivityDay, 0, len(keys))
	for _, key := range keys {
		result = append(result, model.ActivityDay{Date: key, Commits: values[key]})
	}
	return result
}

func directoryList(values map[string]*model.Directory) []model.Directory {
	result := make([]model.Directory, 0, len(values))
	for _, value := range values {
		result = append(result, *value)
	}
	sort.Slice(result, func(i, j int) bool {
		left, right := result[i].Additions+result[i].Deletions, result[j].Additions+result[j].Deletions
		if left == right {
			return result[i].Name < result[j].Name
		}
		return left > right
	})
	if len(result) > 10 {
		result = result[:10]
	}
	return result
}

func languageList(values map[string]int) []model.Language {
	total := 0
	for _, count := range values {
		total += count
	}
	result := make([]model.Language, 0, len(values))
	for name, count := range values {
		result = append(result, model.Language{Name: name, Files: count, Share: round(float64(count) / float64(total) * 100)})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Files > result[j].Files })
	if len(result) > 8 {
		result = result[:8]
	}
	return result
}

func topAuthor(values map[string]int) string {
	name, count := "", -1
	for candidate, candidateCount := range values {
		if candidateCount > count || (candidateCount == count && candidate < name) {
			name, count = candidate, candidateCount
		}
	}
	return name
}

func topLevel(path string) string {
	path = strings.TrimPrefix(filepath.ToSlash(path), "./")
	if index := strings.IndexByte(path, '/'); index >= 0 {
		return path[:index]
	}
	return "(root)"
}

func languageName(ext string) string {
	names := map[string]string{".go": "Go", ".ts": "TypeScript", ".tsx": "TSX", ".js": "JavaScript", ".jsx": "JSX", ".swift": "Swift", ".py": "Python", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".css": "CSS", ".scss": "SCSS", ".html": "HTML", ".md": "Markdown", ".json": "JSON", ".yml": "YAML", ".yaml": "YAML", ".sh": "Shell", ".c": "C", ".h": "C/C++ headers", ".cpp": "C++", ".cs": "C#", ".rb": "Ruby", ".php": "PHP", ".sql": "SQL"}
	if name, ok := names[ext]; ok {
		return name
	}
	if ext == "" {
		return "Other"
	}
	return strings.TrimPrefix(strings.ToUpper(ext), ".")
}

func round(value float64) float64 { return math.Round(value*10) / 10 }
func short(value string, length int) string {
	if len(value) <= length {
		return value
	}
	return value[:length]
}
