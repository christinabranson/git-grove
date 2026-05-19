import { defineConfig } from "vitepress";

export default defineConfig({
  title: "GitGrove",
  description:
    "Manage parallel development workflows with isolated git worktrees, environments, and AI coding sessions.",

  base: "/git-grove/",

  appearance: "dark",

  themeConfig: {
    siteTitle: "GitGrove",
    logo: null,

    nav: [
      { text: "Guide", link: "/getting-started/why" },
      { text: "Commands", link: "/commands/init" },
      { text: "Examples", link: "/examples/docker" },
      {
        text: "GitHub",
        link: "https://github.com/christinabranson/git-grove",
      },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Why GitGrove?", link: "/getting-started/why" },
          { text: "Installation", link: "/getting-started/installation" },
          { text: "Quick Start", link: "/getting-started/quickstart" },
          { text: "Core Concepts", link: "/getting-started/concepts" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Common Workflows", link: "/guides/workflows" },
          { text: "AI Workflows", link: "/guides/ai-workflows" },
          { text: "Docker Compose", link: "/guides/docker" },
          { text: "Monorepos", link: "/guides/monorepos" },
          { text: "Reviewing PRs", link: "/guides/pull-requests" },
        ],
      },
      {
        text: "Command Reference",
        items: [
          { text: "grove setup", link: "/commands/init" },
          { text: "grove start", link: "/commands/create" },
          { text: "grove delete / prune", link: "/commands/cleanup" },
        ],
      },
      {
        text: "Examples",
        items: [
          { text: "Node Project", link: "/examples/node-script" },
          { text: "Docker Compose", link: "/examples/docker" },
          { text: "Docker + Custom Script", link: "/examples/docker-script" },
          { text: "Kubernetes Dev", link: "/examples/kubernetes" },
        ],
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/christinabranson/git-grove",
      },
    ],

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "GitGrove — See the forest. Manage the trees.",
    },

    editLink: {
      pattern:
        "https://github.com/christinabranson/git-grove/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
