---
layout: home

hero:
  name: "GitGrove"
  text: "See the forest.\nManage the trees."
  tagline: Manage parallel development workflows with isolated git worktrees, environments, and AI coding sessions.
  actions:
    - theme: brand
      text: Why GitGrove?
      link: /getting-started/why
    - theme: alt
      text: Quick Start
      link: /getting-started/quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/christinabranson/git-grove

features:
  - title: No more "let me stash this first"
    details: Each branch lives in its own directory. Switch contexts in seconds — running servers, node_modules, and editor state stay exactly where you left them.
  - title: AI agent-safe by default
    details: Point an AI agent at a worktree and it cannot touch your other branches. Grove shows every agent's status in one place, so you always know what's running where.
  - title: Zero lock-in
    details: Grove wraps standard git worktrees. Remove it and everything still works — no custom abstractions to unlearn, no vendor lock-in.
  - title: One command to start
    details: "`grove start feat/my-feature` creates the worktree, assigns unique ports, and boots the environment. No manual port tracking."
  - title: See everything at once
    details: The TUI shows all your branches, their running environments, AI agent status, and change footprints — at a glance, from one terminal.
  - title: Works with your stack
    details: "Auto-detects Docker Compose, Vite, and Node. Per-worktree environment files with unique ports so your stacks never conflict."
---
