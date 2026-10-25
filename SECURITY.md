# Security Policy

## Scope

Context Diet runs locally, makes no network calls, and executes no shell
commands. It reads text (from stdin, from a file under `--root`, or from
an MCP tool argument) and returns reduced text plus a manifest.

## What to know before use

- **File confinement:** `--input` paths must resolve under `--root`
  (default: the working directory). Paths outside the root are refused.
- **Secrets pass through:** the tool does not redact secrets. A summary
  goes to the same audience that could already see the source log, but
  do not pipe logs containing credentials you would not show the model.
  Redaction is on the roadmap.
- **No model, no exfiltration:** reduction is deterministic code. No
  prompt, log, or file content is sent anywhere.

## Reporting a vulnerability

Open an issue describing the problem without including secrets or
exploit details against live systems. We will respond with a fix or a
mitigation and credit the reporter unless they prefer otherwise.
