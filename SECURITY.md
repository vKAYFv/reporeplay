# Security policy

## Supported versions

Security fixes are provided for the latest tagged release.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's **Security → Report a vulnerability** flow for this repository.

Include the affected version, reproduction steps, impact, and any suggested mitigation. You should receive an acknowledgement within seven days. Please allow time for a fix and coordinated release before public disclosure.

## Security boundaries

RepoReplay runs Git in the repository selected by the user and writes only to the explicit report destination. It does not execute hooks, evaluate repository source files, contact remotes, or include author email addresses in generated output.

The HTML report is designed for local viewing. Commit subjects and repository metadata are JSON-encoded with HTML escaping before being embedded, then escaped again when rendered into dynamic markup.
