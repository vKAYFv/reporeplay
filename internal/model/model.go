package model

import "time"

type RawRepository struct {
	Name         string
	Root         string
	Branch       string
	Head         string
	Remote       string
	TrackedFiles int
	TrackedPaths []string
	Commits      []RawCommit
}

type RawCommit struct {
	Hash        string
	ShortHash   string
	Author      string
	Email       string
	Date        time.Time
	Subject     string
	Tags        []string
	FileChanges []RawFileChange
}

type RawFileChange struct {
	Path      string
	Additions int
	Deletions int
	Binary    bool
}

type Report struct {
	SchemaVersion int           `json:"schemaVersion"`
	GeneratedAt   string        `json:"generatedAt"`
	Repository    Repository    `json:"repository"`
	Summary       Summary       `json:"summary"`
	Timeline      []Period      `json:"timeline"`
	Activity      []ActivityDay `json:"activity"`
	Contributors  []Contributor `json:"contributors"`
	HotFiles      []FileStat    `json:"hotFiles"`
	Directories   []Directory   `json:"directories"`
	Languages     []Language    `json:"languages"`
	Milestones    []Milestone   `json:"milestones"`
	Commits       []CommitEvent `json:"commits"`
}

type Repository struct {
	Name   string `json:"name"`
	Branch string `json:"branch"`
	Head   string `json:"head"`
	Remote string `json:"remote,omitempty"`
}

type Summary struct {
	Commits      int    `json:"commits"`
	Contributors int    `json:"contributors"`
	TrackedFiles int    `json:"trackedFiles"`
	FilesTouched int    `json:"filesTouched"`
	Additions    int    `json:"additions"`
	Deletions    int    `json:"deletions"`
	ActiveDays   int    `json:"activeDays"`
	FirstCommit  string `json:"firstCommit"`
	LastCommit   string `json:"lastCommit"`
}

type Period struct {
	Key          string `json:"key"`
	Label        string `json:"label"`
	Commits      int    `json:"commits"`
	Additions    int    `json:"additions"`
	Deletions    int    `json:"deletions"`
	FilesChanged int    `json:"filesChanged"`
	Contributors int    `json:"contributors"`
}

type ActivityDay struct {
	Date    string `json:"date"`
	Commits int    `json:"commits"`
}

type Contributor struct {
	Name        string  `json:"name"`
	Commits     int     `json:"commits"`
	Additions   int     `json:"additions"`
	Deletions   int     `json:"deletions"`
	FirstCommit string  `json:"firstCommit"`
	LastCommit  string  `json:"lastCommit"`
	Share       float64 `json:"share"`
}

type FileStat struct {
	Path        string  `json:"path"`
	Commits     int     `json:"commits"`
	Additions   int     `json:"additions"`
	Deletions   int     `json:"deletions"`
	Churn       int     `json:"churn"`
	LastChanged string  `json:"lastChanged"`
	TopAuthor   string  `json:"topAuthor"`
	Score       float64 `json:"score"`
}

type Directory struct {
	Name      string `json:"name"`
	Files     int    `json:"files"`
	Commits   int    `json:"commits"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type Language struct {
	Name  string  `json:"name"`
	Files int     `json:"files"`
	Share float64 `json:"share"`
}

type Milestone struct {
	Tag     string `json:"tag"`
	Hash    string `json:"hash"`
	Date    string `json:"date"`
	Subject string `json:"subject"`
}

type CommitEvent struct {
	Hash         string   `json:"hash"`
	ShortHash    string   `json:"shortHash"`
	Author       string   `json:"author"`
	Date         string   `json:"date"`
	Subject      string   `json:"subject"`
	Tags         []string `json:"tags,omitempty"`
	FilesChanged int      `json:"filesChanged"`
	Additions    int      `json:"additions"`
	Deletions    int      `json:"deletions"`
}
