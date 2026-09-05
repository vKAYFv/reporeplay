# Contributing to RepoReplay

Thanks for helping make repository history easier to understand.

## Before you start

- Search existing issues before creating a new one.
- Open an issue before a large change so scope and UX can be agreed first.
- Keep changes focused. RepoReplay intentionally avoids forge APIs, accounts, telemetry, and runtime web dependencies.
- Never include real private repository history in fixtures, screenshots, or bug reports.

## Local workflow

You need Go 1.24+ and Git.

```bash
git clone https://github.com/vKAYFv/reporeplay.git
cd reporeplay
make check
make build
```

For report changes, generate a report and inspect both desktop and narrow layouts:

```bash
./bin/reporeplay serve .
```

## Pull requests

A pull request should:

- explain the user-visible problem and the chosen solution;
- include tests for parsing or metric changes;
- preserve JSON field compatibility unless the schema version changes;
- pass `make check` on macOS, Linux, and Windows CI;
- update README caveats when a metric's interpretation changes.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
