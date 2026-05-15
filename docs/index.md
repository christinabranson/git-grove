---
layout: home

hero:
  name: "Grove"
  text: "See the forest.\nManage the trees."
  tagline: Mission control for parallel git worktrees. Isolated environments, Docker stacks, and AI agent workflows — from one keyboard-driven terminal.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/installation
    - theme: alt
      text: Quick Start
      link: /getting-started/quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/christinabranson/git-grove

features:
  - title: Parallel environments
    details: Each branch gets its own isolated environment — its own Docker stack, unique ports, and database schema. Run as many as you need simultaneously.
  - title: AI agent-ready
    details: Agents discover their environment via `grove status --json` and report status back via `.worktree-manifest.json`. Grove displays it live in the TUI.
  - title: Zero lock-in
    details: Grove is a progressive enhancement on top of standard git and Docker. Remove it and everything still works — no custom abstractions to unlearn.
  - title: One command to start
    details: "`grove start feat/my-feature` creates the worktree, generates `.env.worktree` with unique ports, starts the shared stack, and boots the environment."
  - title: Keyboard-driven TUI
    details: See all worktrees, their environments, agent status, and change footprints at a glance. Navigate and manage without touching the CLI.
  - title: Docker-first
    details: Per-worktree Compose stacks with automatic project naming, shared infrastructure support, port allocation, and env contract validation.
---
