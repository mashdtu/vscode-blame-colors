import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlameInfo {
  commitHash: string;
  author: string;
  authorEmail: string;
  authorTime: Date;
  summary: string;
  isUncommitted: boolean;
}

const UNCOMMITTED_HASH = '0'.repeat(40);

// ---------------------------------------------------------------------------
// Git blame parsing
// ---------------------------------------------------------------------------

/**
 * Runs `git blame --porcelain` on the given absolute file path and returns a
 * map of 0-based line numbers to their BlameInfo.  Returns null when the file
 * is not tracked by git or git is unavailable.
 *
 * execFile is used (not exec) to avoid any shell-injection risk because
 * filePath is passed as a discrete argument, never interpolated into a string.
 */
async function runGitBlame(filePath: string): Promise<Map<number, BlameInfo> | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['blame', '--porcelain', '--', filePath],
      {
        cwd: path.dirname(filePath),
        maxBuffer: 20 * 1024 * 1024, // 20 MB – enough for very large files
      },
    );
    return parsePortcelain(stdout);
  } catch {
    return null;
  }
}

/**
 * Parses the output of `git blame --porcelain`.
 *
 * Porcelain format summary
 * ─────────────────────────
 * First occurrence of a commit:
 *   <40-char-hash> <orig-line> <final-line> <group-size>
 *   author <name>
 *   author-mail <email>
 *   author-time <unix>
 *   author-tz <tz>
 *   committer …
 *   summary <message>
 *   filename <name>
 *   \t<line content>
 *
 * Subsequent occurrences of the same commit only repeat the first header line
 * and the \t content line; no metadata lines are emitted again.
 */
function parsePortcelain(output: string): Map<number, BlameInfo> {
  const result = new Map<number, BlameInfo>();
  const cache = new Map<string, Partial<BlameInfo>>();
  const lines = output.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Header: <hash> <orig> <final> [<count>]
    const headerMatch = lines[i].match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (!headerMatch) {
      i++;
      continue;
    }

    const hash = headerMatch[1];
    const finalLine = parseInt(headerMatch[2], 10) - 1; // convert to 0-based

    if (!cache.has(hash)) {
      cache.set(hash, {});
    }
    const entry = cache.get(hash)!;

    i++;

    // Read metadata lines until the tab-prefixed content line
    while (i < lines.length && !lines[i].startsWith('\t')) {
      const l = lines[i];
      if (l.startsWith('author ') && entry.author === undefined) {
        entry.author = l.slice(7).trim();
      } else if (l.startsWith('author-mail ') && entry.authorEmail === undefined) {
        entry.authorEmail = l.slice(12).trim().replace(/^<|>$/g, '');
      } else if (l.startsWith('author-time ') && entry.authorTime === undefined) {
        entry.authorTime = new Date(parseInt(l.slice(12), 10) * 1000);
      } else if (l.startsWith('summary ') && entry.summary === undefined) {
        entry.summary = l.slice(8).trim();
      }
      i++;
    }

    i++; // skip the \t content line

    const isUncommitted = hash === UNCOMMITTED_HASH;
    result.set(finalLine, {
      commitHash: hash,
      author: entry.author ?? 'Unknown',
      authorEmail: entry.authorEmail ?? '',
      authorTime: entry.authorTime ?? new Date(0),
      summary: entry.summary ?? '',
      isUncommitted,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function authorColor(email: string, saturation: number, lightness: number): string {
  const hue = hashCode(email || 'unknown') % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  // decoration type keyed by author email (or '__uncommitted__')
  const decorationTypes = new Map<string, vscode.TextEditorDecorationType>();

  // cached blame data keyed by document URI string
  const blameData = new Map<string, Map<number, BlameInfo>>();

  // in-flight requests keyed by document URI string – used to debounce
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  let enabled = true;

  // -------------------------------------------------------------------------
  // Decoration-type factory
  // -------------------------------------------------------------------------

  function getDecorationType(key: string, color: string): vscode.TextEditorDecorationType {
    if (!decorationTypes.has(key)) {
      const cfg = vscode.workspace.getConfiguration('gitBlameColors');
      const width = Math.max(2, cfg.get<number>('blockWidth', 6));

      const dt = vscode.window.createTextEditorDecorationType({
        before: {
          contentText: '',
          backgroundColor: color,
          width: `${width}px`,
          margin: `0 ${width + 4}px 0 0`,
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      });
      decorationTypes.set(key, dt);
      context.subscriptions.push(dt);
    }
    return decorationTypes.get(key)!;
  }

  // -------------------------------------------------------------------------
  // Apply / clear decorations
  // -------------------------------------------------------------------------

  function clearDecorations(editor: vscode.TextEditor): void {
    for (const dt of decorationTypes.values()) {
      editor.setDecorations(dt, []);
    }
  }

  async function applyBlame(editor: vscode.TextEditor): Promise<void> {
    if (!enabled) return;
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') return;

    const filePath = doc.uri.fsPath;
    const blameMap = await runGitBlame(filePath);

    // Editor may have changed while git blame was running
    if (vscode.window.activeTextEditor?.document !== doc &&
        !vscode.window.visibleTextEditors.some(e => e.document === doc)) {
      return;
    }

    clearDecorations(editor);

    if (!blameMap || blameMap.size === 0) {
      blameData.delete(doc.uri.toString());
      return;
    }

    blameData.set(doc.uri.toString(), blameMap);

    const cfg = vscode.workspace.getConfiguration('gitBlameColors');
    const saturation = cfg.get<number>('saturation', 70);
    const lightness = cfg.get<number>('lightness', 55);

    // Group line ranges by decoration key (author email or '__uncommitted__')
    const rangesByKey = new Map<string, { ranges: vscode.Range[]; color: string }>();

    for (const [line, info] of blameMap) {
      if (line >= doc.lineCount) continue;

      const key = info.isUncommitted ? '__uncommitted__' : info.authorEmail;
      const color = info.isUncommitted
        ? 'rgba(120, 120, 120, 0.55)'
        : authorColor(info.authorEmail, saturation, lightness);

      if (!rangesByKey.has(key)) {
        rangesByKey.set(key, { ranges: [], color });
      }
      rangesByKey.get(key)!.ranges.push(new vscode.Range(line, 0, line, 0));
    }

    for (const [key, { ranges, color }] of rangesByKey) {
      const dt = getDecorationType(key, color);
      editor.setDecorations(dt, ranges);
    }
  }

  // Debounced wrapper so rapid editor switches don't flood git
  function scheduleApply(editor: vscode.TextEditor, delayMs = 150): void {
    const key = editor.document.uri.toString();
    const existing = pending.get(key);
    if (existing) clearTimeout(existing);
    const id = setTimeout(() => {
      pending.delete(key);
      applyBlame(editor);
    }, delayMs);
    pending.set(key, id);
  }

  // -------------------------------------------------------------------------
  // Hover provider
  // -------------------------------------------------------------------------

  const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
    provideHover(document, position): vscode.Hover | null {
      if (!enabled) return null;
      const blame = blameData.get(document.uri.toString())?.get(position.line);
      if (!blame) return null;

      const md = new vscode.MarkdownString(undefined, true);
      md.isTrusted = true;
      md.supportThemeIcons = true;

      if (blame.isUncommitted) {
        md.appendMarkdown(`$(git-commit) **Not yet committed**`);
      } else {
        md.appendMarkdown(`$(git-commit) \`${blame.commitHash.slice(0, 8)}\`\n\n`);
        md.appendMarkdown(`$(person) **${escapeMarkdown(blame.author)}**`);
        if (blame.authorEmail) {
          md.appendMarkdown(` \\<${escapeMarkdown(blame.authorEmail)}\\>`);
        }
        md.appendMarkdown(`\n\n`);
        md.appendMarkdown(`$(calendar) ${blame.authorTime.toLocaleString()}\n\n`);
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`*${escapeMarkdown(blame.summary)}*`);
      }

      return new vscode.Hover(md);
    },
  });

  context.subscriptions.push(hoverProvider);

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('gitBlameColors.toggle', () => {
      enabled = !enabled;
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        if (enabled) {
          scheduleApply(editor, 0);
        } else {
          clearDecorations(editor);
        }
      }
      vscode.window.showInformationMessage(
        `Git Blame Colors: ${enabled ? 'Enabled' : 'Disabled'}`,
      );
    }),

    vscode.commands.registerCommand('gitBlameColors.refresh', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        blameData.delete(editor.document.uri.toString());
        scheduleApply(editor, 0);
      }
    }),
  );

  // -------------------------------------------------------------------------
  // Event listeners
  // -------------------------------------------------------------------------

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) scheduleApply(editor);
    }),

    vscode.workspace.onDidSaveTextDocument(document => {
      const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
      if (editor) {
        blameData.delete(document.uri.toString());
        scheduleApply(editor, 0);
      }
    }),

    vscode.workspace.onDidCloseTextDocument(document => {
      blameData.delete(document.uri.toString());
    }),
  );

  // Apply to all visible editors on activation
  for (const editor of vscode.window.visibleTextEditors) {
    scheduleApply(editor, 0);
  }
}

export function deactivate(): void {
  // Decoration types registered via context.subscriptions are disposed automatically.
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
}
