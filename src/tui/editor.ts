import { execa } from "execa";
import { existsSync } from "fs";

const EDITOR_CANDIDATES = ["code", "cursor", "windsurf", "vim", "nano"];

// macOS app bundle CLI paths for editors that may not have registered `code` in PATH
const MACOS_APP_PATHS: Partial<Record<string, string>> = {
  code: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  cursor: "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
  windsurf: "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf",
};

/** Returns the resolved full path for a binary, or null if not found. */
async function resolveBinPath(bin: string): Promise<string | null> {
  // 1. Try PATH first
  try {
    const { stdout } = await execa("which", [bin]);
    const p = stdout.trim();
    if (p) return p;
  } catch {
    // not in PATH
  }

  // 2. Fall back to known macOS app bundle locations
  const bundlePath = MACOS_APP_PATHS[bin];
  if (bundlePath && existsSync(bundlePath)) return bundlePath;

  return null;
}

/**
 * Resolve which editor to use, returning its full path so execa can spawn
 * it without relying on the child process PATH matching the shell PATH.
 *
 * Priority:
 *   1. grove config `editor` field
 *   2. $VISUAL environment variable
 *   3. $EDITOR environment variable
 *   4. First binary found (PATH or macOS app bundle) from EDITOR_CANDIDATES
 *
 * Returns `{ bin, path }` — `bin` is the short name for display, `path` is
 * what gets passed to execa.
 */
export async function resolveEditor(
  groveConfigEditor?: string,
): Promise<{ bin: string; path: string } | null> {
  const candidates = groveConfigEditor
    ? [groveConfigEditor]
    : [
        ...(process.env.VISUAL ? [process.env.VISUAL] : []),
        ...(process.env.EDITOR ? [process.env.EDITOR] : []),
        ...EDITOR_CANDIDATES,
      ];

  for (const candidate of candidates) {
    const resolved = await resolveBinPath(candidate);
    if (resolved) return { bin: candidate, path: resolved };
  }

  return null;
}

/** Display name for an editor binary — shown in flash messages. */
export function editorDisplayName(bin: string): string {
  switch (bin) {
    case "code":
      return "VS Code";
    case "cursor":
      return "Cursor";
    case "windsurf":
      return "Windsurf";
    case "vim":
      return "vim";
    case "nano":
      return "nano";
    default:
      return bin;
  }
}

/**
 * Open `targetPath` in the resolved editor.
 * Returns the display name used, so callers can show a meaningful flash message.
 * Throws if no editor is found.
 */
export async function openInEditor(
  targetPath: string,
  groveConfigEditor?: string,
): Promise<string> {
  const editor = await resolveEditor(groveConfigEditor);
  if (!editor)
    throw new Error(
      "no editor found — set $VISUAL, $EDITOR, or run `grove config set editor <cmd>`",
    );

  const isGui =
    editor.bin === "code" ||
    editor.bin === "cursor" ||
    editor.bin === "windsurf";
  const args = isGui ? ["-n", targetPath] : [targetPath];

  // Use the resolved full path so spawning succeeds regardless of child process PATH
  await execa(editor.path, args, { stdio: "ignore" });
  return editorDisplayName(editor.bin);
}
