import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { execa } from "execa";
import type { Worktree } from "../types.js";
import { openInEditor } from "./editor.js";
import { loadWorktrees, detectDefaultBranch, resolveWorktreeRoot } from "../data/worktrees.js";
import { WorktreeList } from "./WorktreeList.js";
import { DetailPanel } from "./DetailPanel.js";
import { CompactFootprint } from "./ChangeFootprint.js";
import { KeybindBar } from "./KeybindBar.js";
import { FilterBar } from "./FilterBar.js";
import { useTerminalSize } from "./useTerminalSize.js";
import { LOGO } from "./logo.js";

type AppView = "main" | "help" | "confirmDelete" | "newWorktree";
type NewWorktreeStep = "name" | "base";

interface AppProps {
  repoPath: string;
  initialWorktrees: Worktree[];
}

export function App({ repoPath, initialWorktrees }: AppProps) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();

  const [worktrees, setWorktrees] = useState<Worktree[]>(initialWorktrees);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [footprintExpanded, setFootprintExpanded] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterActive, setFilterActive] = useState(false);
  const [view, setView] = useState<AppView>("main");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [newWorktreeStep, setNewWorktreeStep] = useState<NewWorktreeStep>("name");
  const [newWorktreeName, setNewWorktreeName] = useState("");
  const [newWorktreeBase, setNewWorktreeBase] = useState("");

  const filteredWorktrees = worktrees.filter((wt) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return wt.branch.toLowerCase().includes(q);
  });

  const selectedWorktree = filteredWorktrees[selectedIndex] ?? null;

  const flash = useCallback((msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    flash("syncing...");
    try {
      const { worktrees: updated, ghWarning } = await loadWorktrees(repoPath);
      setWorktrees(updated);
      flash(ghWarning ?? "synced");
    } catch (err) {
      flash(`sync failed: ${(err as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [repoPath, isSyncing, flash]);

  const handleOpenInEditor = useCallback(async () => {
    if (!selectedWorktree) return;
    try {
      const displayName = await openInEditor(selectedWorktree.path);
      flash(`opening in ${displayName}…`);
    } catch (err) {
      flash(`could not open editor: ${(err as Error).message}`);
    }
  }, [selectedWorktree, flash]);

  const handleDockerUp = useCallback(async () => {
    if (!selectedWorktree?.docker) return;
    const { projectName } = selectedWorktree.docker;
    flash(`starting ${projectName}...`);
    try {
      await execa(
        "docker",
        [
          "compose",
          "-p",
          projectName,
          "--env-file",
          ".env.worktree",
          "up",
          "-d",
          "--build",
        ],
        { cwd: selectedWorktree.path },
      );
      flash(`${projectName} started`);
      await handleSync();
    } catch (err) {
      flash(`docker up failed: ${(err as Error).message}`);
    }
  }, [selectedWorktree, flash, handleSync]);

  const handleDelete = useCallback(async () => {
    if (!selectedWorktree || selectedWorktree.isMain) return;
    try {
      const { execa } = await import("execa");
      const docker = selectedWorktree.docker;
      if (
        docker &&
        docker.state !== "not started" &&
        docker.state !== "stopped"
      ) {
        flash(`stopping docker stack…`);
        try {
          await execa(
            "docker",
            [
              "compose",
              "-p",
              docker.projectName,
              "--env-file",
              ".env.worktree",
              "down",
            ],
            { cwd: selectedWorktree.path },
          );
        } catch {
          // non-fatal — proceed with removal
        }
      }
      flash(`removing ${selectedWorktree.branch}…`);
      await execa(
        "git",
        ["worktree", "remove", "--force", selectedWorktree.path],
        { cwd: repoPath },
      );
      flash(`removed ${selectedWorktree.branch}`);
      setSelectedIndex(0);
      await handleSync();
    } catch (err) {
      flash(`delete failed: ${(err as Error).message}`);
    }
  }, [selectedWorktree, repoPath, flash, handleSync]);

  const handleDockerDown = useCallback(async () => {
    if (!selectedWorktree?.docker) return;
    const { projectName } = selectedWorktree.docker;
    flash(`stopping ${projectName}...`);
    try {
      await execa(
        "docker",
        ["compose", "-p", projectName, "--env-file", ".env.worktree", "down"],
        { cwd: selectedWorktree.path },
      );
      flash(`${projectName} stopped`);
      await handleSync();
    } catch (err) {
      flash(`docker down failed: ${(err as Error).message}`);
    }
  }, [selectedWorktree, flash, handleSync]);

  const handleNewWorktree = useCallback(async (name: string, base: string) => {
    try {
      const { join } = await import("path");
      const { mkdir, writeFile } = await import("fs/promises");
      const { loadGroveConfig } = await import("../data/groveConfig.js");

      const groveConfig = await loadGroveConfig(repoPath);
      const worktreeRoot = resolveWorktreeRoot(repoPath, groveConfig?.worktrees?.root);
      const resolvedBase = base.trim() || (await detectDefaultBranch(repoPath));
      const worktreePath = join(worktreeRoot, name.replace(/\//g, "-"));

      flash(`creating ${name}…`);
      await execa("git", ["worktree", "add", "-b", name, worktreePath, resolvedBase], { cwd: repoPath });

      const groveMetaDir = join(worktreePath, ".grove");
      await mkdir(groveMetaDir, { recursive: true });
      await writeFile(join(groveMetaDir, "meta.json"), JSON.stringify({ baseBranch: resolvedBase }, null, 2));

      flash(`created ${name}`);
      await handleSync();
    } catch (err) {
      flash(`create failed: ${(err as Error).message}`);
    }
  }, [repoPath, flash, handleSync]);

  useInput((input, key) => {
    if (filterActive) {
      if (key.escape) {
        setFilterActive(false);
        setFilterText("");
        setSelectedIndex(0);
      }
      return;
    }

    if (view === "help") {
      if (key.escape || input === "q" || input === "?") setView("main");
      return;
    }

    if (view === "confirmDelete") {
      if (input === "y" || input === "Y") {
        setView("main");
        void handleDelete();
      } else {
        setView("main");
      }
      return;
    }

    if (view === "newWorktree") {
      if (key.escape) {
        setView("main");
        setNewWorktreeName("");
        setNewWorktreeBase("");
        setNewWorktreeStep("name");
      }
      return;
    }

    if (input === "D" && selectedWorktree && !selectedWorktree.isMain) {
      setView("confirmDelete");
      return;
    }
    if (input === "q") {
      exit();
      return;
    }
    if (input === "?") {
      setView("help");
      return;
    }
    if (input === "s") {
      void handleSync();
      return;
    }
    if (input === "n") {
      setNewWorktreeName("");
      setNewWorktreeBase("");
      setNewWorktreeStep("name");
      setView("newWorktree");
      return;
    }
    if (input === "o") {
      void handleOpenInEditor();
      return;
    }
    if (input === "x") {
      setFootprintExpanded((v) => !v);
      return;
    }
    if (input === "/") {
      setFilterActive(true);
      return;
    }

    if (input === "u" && selectedWorktree?.docker) {
      void handleDockerUp();
      return;
    }
    if (input === "d" && selectedWorktree?.docker) {
      void handleDockerDown();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      setFootprintExpanded(false);
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(filteredWorktrees.length - 1, i + 1));
      setFootprintExpanded(false);
    }
  });

  // Layout sizing
  const leftWidth = Math.floor(columns * 0.35);
  const rightWidth = columns - leftWidth;
  const listHeight = Math.floor((rows - 4) * 0.65);
  const footprintHeight = rows - 4 - listHeight;
  const detailHeight = rows - 4;

  if (view === "help") {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="cyan">{LOGO}</Text>
        <Text> </Text>
        <Text bold color="cyan">
          Keyboard Shortcuts
        </Text>
        <Text> </Text>
        <Text>
          <Text color="cyan">↑/k</Text> <Text color="gray">move up</Text>
        </Text>
        <Text>
          <Text color="cyan">↓/j</Text> <Text color="gray">move down</Text>
        </Text>
        <Text>
          <Text color="cyan">n</Text> <Text color="gray">new worktree</Text>
        </Text>
        <Text>
          <Text color="cyan">s</Text> <Text color="gray">sync worktrees</Text>
        </Text>
        <Text>
          <Text color="cyan">o</Text> <Text color="gray">open in editor</Text>
        </Text>
        <Text>
          <Text color="cyan">u</Text> <Text color="gray">docker up</Text>
        </Text>
        <Text>
          <Text color="cyan">d</Text> <Text color="gray">docker down</Text>
        </Text>
        <Text>
          <Text color="cyan">D</Text>{" "}
          <Text color="gray">delete worktree (with confirmation)</Text>
        </Text>
        <Text>
          <Text color="cyan">x</Text>{" "}
          <Text color="gray">expand/collapse change footprint</Text>
        </Text>
        <Text>
          <Text color="cyan">/</Text> <Text color="gray">filter worktrees</Text>
        </Text>
        <Text>
          <Text color="cyan">Esc</Text> <Text color="gray">clear filter</Text>
        </Text>
        <Text>
          <Text color="cyan">q</Text> <Text color="gray">quit</Text>
        </Text>
        <Text>
          <Text color="cyan">?</Text> <Text color="gray">toggle this help</Text>
        </Text>
        <Text> </Text>
        <Text color="gray">Press any key to close</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows}>
      {/* Header */}
      <Box paddingX={1}>
        <Text bold color="cyan">
          grove
        </Text>
        <Text color="gray"> · {worktrees.length} worktrees</Text>
        {statusMessage && <Text color="yellow"> {statusMessage}</Text>}
        {isSyncing && <Text color="gray"> (syncing…)</Text>}
      </Box>

      {/* Main layout */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Left column */}
        <Box flexDirection="column" width={leftWidth}>
          <WorktreeList
            worktrees={filteredWorktrees}
            selectedIndex={selectedIndex}
            width={leftWidth}
            height={listHeight}
          />
          {selectedWorktree?.changeFootprint && (
            <CompactFootprint
              footprint={selectedWorktree.changeFootprint}
              width={leftWidth}
            />
          )}
        </Box>

        {/* Right panel */}
        <DetailPanel
          worktree={selectedWorktree}
          width={rightWidth}
          height={detailHeight}
          footprintExpanded={footprintExpanded}
        />
      </Box>

      {/* Bottom bar */}
      {filterActive ? (
        <FilterBar
          value={filterText}
          onChange={setFilterText}
          onSubmit={() => setFilterActive(false)}
          onEscape={() => {
            setFilterActive(false);
            setFilterText("");
          }}
        />
      ) : view === "newWorktree" && newWorktreeStep === "name" ? (
        <Box paddingX={1}>
          <Text color="cyan">new  </Text>
          <TextInput
            value={newWorktreeName}
            onChange={setNewWorktreeName}
            onSubmit={(val) => {
              if (val.trim()) setNewWorktreeStep("base");
              else setView("main");
            }}
            placeholder="branch name..."
          />
          <Text color="gray"> (Esc to cancel)</Text>
        </Box>
      ) : view === "newWorktree" && newWorktreeStep === "base" ? (
        <Box paddingX={1}>
          <Text color="cyan">base </Text>
          <TextInput
            value={newWorktreeBase}
            onChange={setNewWorktreeBase}
            onSubmit={(val) => {
              setView("main");
              void handleNewWorktree(newWorktreeName, val);
            }}
            placeholder="base branch (empty = repo default)..."
          />
          <Text color="gray"> (Esc to cancel)</Text>
        </Box>
      ) : view === "confirmDelete" ? (
        <Box paddingX={1}>
          <Text color="red">Delete </Text>
          <Text color="white" bold>
            {selectedWorktree?.branch}
          </Text>
          <Text color="red">? </Text>
          <Text color="gray">[ </Text>
          <Text color="cyan" bold>
            y
          </Text>
          <Text color="gray"> ] yes [ </Text>
          <Text color="cyan" bold>
            any key
          </Text>
          <Text color="gray"> ] cancel</Text>
        </Box>
      ) : (
        <KeybindBar worktree={selectedWorktree} />
      )}
    </Box>
  );
}
