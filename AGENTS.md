## Overview

This project is a **Node.js CLI tool** built with:

- **TypeScript**
- **Ink** (React for CLIs)
- **npm** for dependency management

The goal of this project is to provide a clean, interactive terminal experience for working with Git worktrees and related workflows.

Agents contributing to this repository should prioritize:

- Predictable CLI behavior
- Clear, minimal UX
- Stability over cleverness

---

## Product Direction: Runtime-Agnostic By Design

Grove should support many environment runtimes, not only Docker Compose.

Current and expected runtime targets include:

- Docker Compose
- Kubernetes
- Node or npm script based local processes
- Custom shell workflows

When implementing features, keep these principles:

- Treat Docker as one provider, not the default architecture for all logic
- Keep core CLI flows and shared models provider-neutral
- Put runtime-specific behavior inside provider implementations
- Prefer explicit provider config over auto-detection when both exist
- Avoid hardcoding Docker-specific assumptions in shared command paths

Provider extensibility expectations:

- New runtimes should be addable without large command rewrites
- Each provider should own start, stop, and status lifecycle behavior
- Capability differences should be expressed explicitly (for example port discovery, logs, teardown safety)
- Destructive operations must require explicit confirmation logic

PR review guardrail for design drift:

- Ask: does this change make non-Docker providers easier, unchanged, or harder to support?
- If harder, refactor toward shared abstractions before merging when practical

---

## Getting Started

Install dependencies:

```bash
npm ci
```

Run the CLI locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm run test:run
```

---

## Project Structure (Expected)

Agents should assume a structure similar to:

```
/src
  /components     # Ink UI components
  /screens        # High-level CLI views
  /hooks          # Shared logic for Ink components
  /lib            # Core business logic (Git, filesystem, etc.)
  /commands       # CLI entrypoints / command handlers
  index.ts        # CLI entrypoint
```

### Guidelines

- Keep **UI (Ink)** separate from **business logic**
- Avoid mixing Git logic directly into components
- Prefer small, composable functions

---

## Coding Standards

### TypeScript

- Use strict typing wherever possible
- Avoid `any` unless absolutely necessary
- Prefer explicit return types for exported functions

### Formatting

- Prettier is enforced via CI
- Always run:

```bash
npx prettier --write .
```

---

## Testing

- All new logic should include tests where reasonable
- Tests should be deterministic and not depend on:
  - network access
  - global git config

- Prefer mocking filesystem and git interactions

Run tests:

```bash
npm run test:run
```

---

## CLI / TUI Guidelines (Ink)

This is the most important part of the project.

### Do

- Keep UI responsive and minimal
- Use clear, readable text
- Handle loading / empty states explicitly
- Ensure keyboard navigation works consistently

### Do NOT

- Block rendering with long synchronous operations
- Print excessive logs to stdout
- Break layout with uncontrolled text wrapping

### UX Principles

- Fast feedback > fancy visuals
- Clarity > density
- Terminal constraints are real — design for them

---

## Git / Worktree Safety

This tool interacts with Git. Mistakes can be destructive.

Agents MUST:

- Avoid destructive commands unless explicitly required
- Never delete branches or worktrees without confirmation logic
- Prefer read-only operations unless modifying state is necessary

---

## CI Requirements (MANDATORY)

All changes must pass CI before being considered complete.

CI runs:

```bash
npm ci
npx prettier --check .
npm run test:run
```

### Agent Checklist (before finishing a task)

You MUST ensure:

- [ ] Dependencies install cleanly (`npm ci`)
- [ ] Formatting passes (`prettier --check`)
- [ ] Tests pass (`npm run test:run`)
- [ ] No unused imports or obvious TypeScript errors
- [ ] CLI still runs without crashing

If any of these fail, fix them before completing the task.

---

## Making Changes

### When adding features

- Add logic in `/lib` first
- Then integrate into CLI (`/commands` or `/screens`)
- Then add UI components if needed

### When modifying UI

- Do not break existing flows
- Test in a real terminal (not just snapshots)

### When refactoring

- Do not mix refactors with feature changes
- Preserve behavior unless explicitly changing it

---

## What NOT to Do

- Do not introduce heavy dependencies without justification
- Do not rewrite large parts of the codebase without explicit instruction
- Do not change CLI output formats casually (this breaks UX expectations)
- Do not bypass tests or formatting checks

---

## Preferred Patterns

- Pure functions for core logic
- Small, reusable Ink components
- Clear separation of concerns
- Explicit error handling (no silent failures)

---

## If You’re Unsure

When in doubt:

- Choose the simpler solution
- Avoid breaking existing behavior
- Add a TODO comment explaining uncertainty

---

## Summary

This is a **developer-facing CLI tool**, not a web app.

Agents should optimize for:

- Reliability
- Simplicity
- Terminal UX quality

Not for:

- Over-engineering
- Visual complexity
- Abstract architecture experiments
