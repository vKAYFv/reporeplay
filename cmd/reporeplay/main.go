package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/vKAYFv/reporeplay/internal/analyzer"
	"github.com/vKAYFv/reporeplay/internal/gitrepo"
	"github.com/vKAYFv/reporeplay/internal/model"
	"github.com/vKAYFv/reporeplay/internal/report"
)

var version = "dev"

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "reporeplay: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 {
		return runBuild(ctx, nil, stdout, stderr)
	}
	switch args[0] {
	case "build":
		return runBuild(ctx, args[1:], stdout, stderr)
	case "serve":
		return runServe(ctx, args[1:], stdout, stderr)
	case "version", "--version", "-v":
		fmt.Fprintf(stdout, "RepoReplay %s\n", version)
		return nil
	case "help", "--help", "-h":
		printUsage(stdout)
		return nil
	default:
		if args[0] != "" && args[0][0] != '-' {
			return runBuild(ctx, args, stdout, stderr)
		}
		return fmt.Errorf("unknown option %q (try reporeplay help)", args[0])
	}
}

func runBuild(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("build", flag.ContinueOnError)
	flags.SetOutput(stderr)
	output := "reporeplay.html"
	flags.StringVar(&output, "output", output, "output HTML path")
	flags.StringVar(&output, "o", output, "output HTML path (shorthand)")
	jsonOutput := flags.Bool("json", false, "write the analysis as JSON to stdout")
	pretty := flags.Bool("pretty", false, "pretty-print JSON output")
	if err := flags.Parse(args); err != nil {
		return err
	}
	path, err := onePath(flags.Args())
	if err != nil {
		return err
	}

	data, err := analyze(ctx, path)
	if err != nil {
		return err
	}
	if *jsonOutput {
		payload, err := report.JSON(data, *pretty)
		if err != nil {
			return err
		}
		_, err = fmt.Fprintln(stdout, string(payload))
		return err
	}
	payload, err := report.HTML(data)
	if err != nil {
		return err
	}
	output, err = filepath.Abs(output)
	if err != nil {
		return fmt.Errorf("resolve output path: %w", err)
	}
	if err := os.WriteFile(output, payload, 0o644); err != nil {
		return fmt.Errorf("write report: %w", err)
	}
	fmt.Fprintf(stdout, "✓ Analyzed %s: %d commits, %d contributors, %d files\n", data.Repository.Name, data.Summary.Commits, data.Summary.Contributors, data.Summary.TrackedFiles)
	fmt.Fprintf(stdout, "✓ Report written to %s\n", output)
	return nil
}

func runServe(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	flags.SetOutput(stderr)
	port := flags.Int("port", 4173, "local port")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *port < 0 || *port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535")
	}
	path, err := onePath(flags.Args())
	if err != nil {
		return err
	}
	data, err := analyze(ctx, path)
	if err != nil {
		return err
	}
	payload, err := report.HTML(data)
	if err != nil {
		return err
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		return fmt.Errorf("start local server: %w", err)
	}
	defer listener.Close()
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(payload)
	})
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second, ErrorLog: log.New(stderr, "", 0)}
	serverCtx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-serverCtx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	fmt.Fprintf(stdout, "RepoReplay is serving %s at http://%s\nPress Ctrl+C to stop.\n", data.Repository.Name, listener.Addr())
	err = server.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func analyze(ctx context.Context, path string) (model.Report, error) {
	raw, err := gitrepo.Load(ctx, gitrepo.CommandRunner{}, path)
	if err != nil {
		return model.Report{}, err
	}
	return analyzer.Analyze(raw), nil
}

func onePath(args []string) (string, error) {
	if len(args) == 0 {
		return ".", nil
	}
	if len(args) > 1 {
		return "", fmt.Errorf("expected one repository path, got %d", len(args))
	}
	return args[0], nil
}

func printUsage(w io.Writer) {
	fmt.Fprintln(w, `RepoReplay turns local Git history into an interactive, standalone report.

Usage:
  reporeplay build [flags] [path]   Build reporeplay.html
  reporeplay serve [flags] [path]   Preview on localhost
  reporeplay version                Print version

Build flags:
  -o, --output FILE   Output path (default reporeplay.html)
      --json          Print analysis JSON instead of HTML
      --pretty        Pretty-print JSON

Serve flags:
      --port PORT     Local port (default 4173)`)
}
