---
name: finding-duplicate-functions
description: "Find semantic duplicates in codebases - functions that serve the same purpose but were implemented independently. Use when auditing LLM-generated code, reducing tech debt, or consolidating utils/helpers."
version: 1.0.0
source: https://github.com/obra/superpowers-lab/tree/main/skills/finding-duplicate-functions
category: universal
tags: [duplicates, refactoring, tech-debt, code-quality, maintainability]
---

# Finding Duplicate-Intent Functions

## Overview

LLM-generated codebases accumulate semantic duplicates: functions that serve the same purpose but were implemented independently. Classical copy-paste detectors (jscpd) find syntactic duplicates but miss "same intent, different implementation."

This skill uses a two-phase approach: classical extraction followed by LLM-powered intent clustering.

## When to Use

- Codebase has grown organically with multiple contributors (human or LLM)
- You suspect utility functions have been reimplemented multiple times
- Before major refactoring to identify consolidation opportunities
- After jscpd has been run and syntactic duplicates are already handled

## Quick Reference

| Phase | Tool | Model | Output |
|-------|------|-------|--------|
| 1. Extract | `scripts/extract-functions.sh` | - | `catalog.json` |
| 2. Categorize | `scripts/categorize-prompt.md` | active host model | `categorized.json` |
| 3. Split | `scripts/prepare-category-analysis.sh` | - | `categories/*.json` |
| 4. Detect | `scripts/find-duplicates-prompt.md` | active host model | `duplicates/*.json` |
| 5. Report | `scripts/generate-report.sh` | - | `report.md` |

## Process

```dot
digraph duplicate_detection {
  rankdir=TB;
  node [shape=box];

  extract [label="1. Extract function catalog\n./scripts/extract-functions.sh"];
  categorize [label="2. Categorize by domain\n(bounded analysis)"];
  split [label="3. Split into categories\n./scripts/prepare-category-analysis.sh"];
  detect [label="4. Find duplicates per category\n(selected category analysis)"];
  report [label="5. Generate report\n./scripts/generate-report.sh"];
  review [label="6. Human review & consolidate"];

  extract -> categorize -> split -> detect -> report -> review;
}
```

### Phase 1: Extract Function Catalog

```bash
./scripts/extract-functions.sh src/ -o catalog.json
```

Options:
- `-o FILE`: Output file (default: stdout)
- `-c N`: Lines of context to capture (default: 15)
- `-t GLOB`: File types (default: `*.ts,*.tsx,*.js,*.jsx`)
- `--include-tests`: Include test files (excluded by default)

Test files (`*.test.*`, `*.spec.*`, `__tests__/**`) are excluded by default since test utilities are less likely to be consolidation candidates.

### Phase 2: Categorize by Domain

Use `scripts/categorize-prompt.md` in the current context, or delegate when authorized and useful under the stored workflow contract. Follow the host and user's model selection rules.

Insert the contents of `catalog.json` where indicated in the prompt template. Save output as `categorized.json`.

### Phase 3: Split into Categories

```bash
./scripts/prepare-category-analysis.sh categorized.json ./categories
```

Creates one JSON file per category. Inspect categories containing a plausible duplicate pair; two functions can be semantically duplicated. Narrow large categories by behavior and callers before loading bodies.

### Phase 4: Find Duplicates (Per Category)

Analyze selected category files with `scripts/find-duplicates-prompt.md`. Reuse the extracted catalog; do not rescan the repository per category. Process sequentially or assign disjoint categories within the stored workflow contract, with no recursive fanout or model switching just because a category exists.

Save each output as `./duplicates/{category}.json`.

### Phase 5: Generate Report

```bash
./scripts/generate-report.sh ./duplicates ./duplicates-report.md
```

Produces a prioritized markdown report grouped by confidence level.

### Phase 6: Human Review

In audit mode, report findings without edits. When consolidation is authorized, trace callers, side effects and boundary differences before treating a HIGH confidence candidate as interchangeable:
1. Verify the recommended survivor has tests
2. Update callers to use the survivor
3. Delete the duplicates
4. Run tests

## High-Risk Duplicate Zones

Focus extraction on these areas first - they accumulate duplicates fastest:

| Zone | Common Duplicates |
|------|-------------------|
| `utils/`, `helpers/`, `lib/` | General utilities reimplemented |
| Validation code | Same checks written multiple ways |
| Error formatting | Error-to-string conversions |
| Path manipulation | Joining, resolving, normalizing paths |
| String formatting | Case conversion, truncation, escaping |
| Date formatting | Same formats implemented repeatedly |
| API response shaping | Similar transformations for different endpoints |

## Common Mistakes

**Extracting too much**: Focus on exported functions and public methods. Internal helpers are less likely to be duplicated across files.

**Skipping the categorization step**: Going straight to duplicate detection on the full catalog produces noise. Categories focus the comparison.

**Treating model choice as evidence**: A model label does not establish semantic equivalence. Compare observable behavior, errors, side effects and callers, then verify the authorized consolidation with relevant tests.

**Consolidating without tests**: Before deleting duplicates, ensure the survivor has tests covering all use cases of the deleted functions.
