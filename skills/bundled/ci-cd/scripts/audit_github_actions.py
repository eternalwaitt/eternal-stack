#!/usr/bin/env python3
"""Static GitHub Actions audit with no third-party dependencies.

This is intentionally conservative: it flags risks and review points, not final
truth. Use it before and after editing workflows.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}
ACTION_REF_RE = re.compile(r"uses:\s*([^@\s]+)@([^\s#]+)")
HEX40_RE = re.compile(r"^[a-fA-F0-9]{40}$")
PLACEHOLDER_RE = re.compile(
    r"(test|dummy|example|placeholder|changeme|change-me|fake|mock|local|"
    r"build-time-only|not-a-real|xxxxx|12345)",
    re.IGNORECASE,
)


def add(findings: list[tuple[str, str, str, str]], severity: str, path: Path, line: int | str, message: str) -> None:
    findings.append((severity, str(path), str(line), message))


def line_no(lines: list[str], needle: str) -> int:
    for idx, line in enumerate(lines, 1):
        if needle in line:
            return idx
    return 1


def looks_placeholder(value: str) -> bool:
    cleaned = value.strip().strip("'\"")
    return bool(PLACEHOLDER_RE.search(cleaned))


def has_top_level_key(lines: list[str], key: str) -> bool:
    pattern = re.compile(rf"^{re.escape(key)}\s*:")
    return any(pattern.match(line) for line in lines)


def audit_workflow(path: Path, root: Path, findings: list[tuple[str, str, str, str]]) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    rel = path.relative_to(root)
    lines = text.splitlines()
    lower_name = path.name.lower()
    is_deploy = "deploy" in lower_name or "release" in lower_name

    if "pull_request_target" in text:
        add(findings, "high", rel, line_no(lines, "pull_request_target"), "`pull_request_target` needs explicit secret/untrusted-code review.")

    if not has_top_level_key(lines, "permissions"):
        add(findings, "medium", rel, "-", "No top-level `permissions`; default token permissions may be broader than intended.")
    elif re.search(r"permissions:\s*write-all", text):
        add(findings, "high", rel, line_no(lines, "permissions:"), "`permissions: write-all` is too broad for most workflows.")

    if not has_top_level_key(lines, "concurrency"):
        add(findings, "low", rel, "-", "No top-level `concurrency`; duplicate runs may waste time or conflict.")
    elif is_deploy and re.search(r"cancel-in-progress:\s*true", text):
        add(findings, "medium", rel, line_no(lines, "cancel-in-progress"), "Deploy workflow cancels in-progress runs; production deploys usually should serialize, not cancel.")

    if is_deploy and "environment:" not in text:
        add(findings, "medium", rel, "-", "Deploy/release workflow has no GitHub Environment gate.")

    if "timeout-minutes:" not in text:
        add(findings, "low", rel, "-", "No `timeout-minutes`; stuck jobs can consume runner time indefinitely.")

    for idx, line in enumerate(lines, 1):
        match = ACTION_REF_RE.search(line)
        if match:
            action_ref = match.group(2)
            if action_ref.startswith("./"):
                continue
            if not HEX40_RE.match(action_ref):
                add(findings, "medium", rel, idx, f"Action `{match.group(1)}@{action_ref}` is not pinned to a commit SHA.")

        if "${{ github.event" in line and "run:" not in line:
            add(findings, "medium", rel, idx, "GitHub event context used directly; ensure it is not interpolated into shell commands.")

        secret_match = re.search(
            r"^\s*[A-Z0-9_]*(PASSWORD|SECRET|TOKEN)[A-Z0-9_]*\s*:\s*([^#\s]+)",
            line,
            re.IGNORECASE,
        )
        if secret_match and "${{" not in secret_match.group(2) and not looks_placeholder(secret_match.group(2)):
            add(findings, "high", rel, idx, "Possible literal secret-like value in workflow.")

    if "docker/build-push-action" in text and "cache-from:" not in text:
        add(findings, "low", rel, line_no(lines, "docker/build-push-action"), "Docker build has no BuildKit cache configured.")

    if "playwright" in text.lower() and "upload-artifact" not in text:
        add(findings, "low", rel, line_no(lines, "playwright"), "Playwright workflow does not upload failure artifacts.")


def audit_dockerfile(path: Path, root: Path, findings: list[tuple[str, str, str, str]]) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    rel = path.relative_to(root)
    lines = text.splitlines()

    for idx, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("FROM ") and ":latest" in stripped:
            add(findings, "medium", rel, idx, "Base image uses `:latest`; pin an explicit version or digest.")
        if stripped.startswith(("ARG ", "ENV ")) and re.search(r"(SECRET|TOKEN|PASSWORD|KEY)", stripped, re.IGNORECASE):
            add(findings, "medium", rel, idx, "Secret-like value declared in Docker ARG/ENV; avoid baking secrets into images.")

    if "USER " not in text:
        add(findings, "medium", rel, "-", "No non-root `USER` instruction found.")
    if "HEALTHCHECK" not in text:
        add(findings, "low", rel, "-", "No Docker `HEALTHCHECK`; ensure runtime health is checked elsewhere.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit GitHub Actions and Docker CI/CD risks.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    args = parser.parse_args()

    root = Path(args.repo).resolve()
    findings: list[tuple[str, str, str, str]] = []

    workflow_dir = root / ".github" / "workflows"
    workflows = sorted(list(workflow_dir.glob("*.yml")) + list(workflow_dir.glob("*.yaml"))) if workflow_dir.exists() else []
    if not workflows:
        add(findings, "high", Path("."), "-", "No GitHub Actions workflows found under `.github/workflows`.")

    for workflow in workflows:
        audit_workflow(workflow, root, findings)

    for dockerfile in sorted(root.rglob("Dockerfile*")):
        if ".git" not in dockerfile.parts and "node_modules" not in dockerfile.parts:
            audit_dockerfile(dockerfile, root, findings)

    findings.sort(key=lambda item: (SEVERITY_ORDER[item[0]], item[1], item[2], item[3]))

    print("# CI/CD Static Audit")
    print()
    print(f"Repository: `{root}`")
    print(f"Workflows: {len(workflows)}")
    print(f"Findings: {len(findings)}")
    print()

    if not findings:
        print("No findings from static checks. Still verify with real CI/deploy runs.")
        return 0

    print("| Severity | File | Line | Finding |")
    print("| --- | --- | ---: | --- |")
    for severity, path, line, message in findings:
        print(f"| {severity} | `{path}` | {line} | {message} |")

    return 1 if any(severity == "high" for severity, *_ in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
