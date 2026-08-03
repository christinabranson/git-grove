import { loadWorktrees } from "../data/worktrees.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  openInEditor,
  editorDisplayName,
  resolveEditor,
} from "../tui/editor.js";

export async function runOpen(
  repoPath: string,
  branch?: string,
): Promise<void> {
  const [{ worktrees }, groveConfig] = await Promise.all([
    loadWorktrees(repoPath),
    loadGroveConfig(repoPath),
  ]);
  const target = branch
    ? worktrees.find((wt) => wt.branch === branch)
    : worktrees[0];
  if (!target) {
    throw new Error(`No worktree found for branch: ${branch}`);
  }
  const editor = await resolveEditor(groveConfig?.editor);
  if (!editor) {
    throw new Error(
      "No editor found — set $VISUAL, $EDITOR, or run `grove config set editor <cmd>`",
    );
  }
  console.log(`Opening ${target.branch} in ${editorDisplayName(editor.bin)}…`);
  await openInEditor(target.path, groveConfig?.editor);
}
