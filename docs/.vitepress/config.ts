import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Grove",
  description:
    "Mission control for parallel git worktrees. Isolated environments, Docker stacks, and AI agent workflows — managed from a single keyboard-driven terminal interface.",

  appearance: "dark",

  head: [["link", { rel: "icon", href: "/favicon.ico" }]],

  themeConfig: {
    siteTitle: "Grove",
    logo: null,

    nav: [
      { text: "Guide", link: "/getting-started/installation" },
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
          { text: "Installation", link: "/getting-started/installation" },
          { text: "Quick Start", link: "/getting-started/quickstart" },
          { text: "Core Concepts", link: "/getting-started/concepts" },
        ],
      },
      {
        text: "Guides",
        items: [
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
      copyright: "Grove — See the forest. Manage the trees.",
    },

    editLink: {
      pattern:
        "https://github.com/christinabranson/git-grove/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
