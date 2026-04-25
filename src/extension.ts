import * as vscode from "vscode";
import { execFile } from "child_process";
import * as path from "path";
import { promisify } from "util";
import { showAuthorsPanel, AuthorEntry, PanelResult } from "./colorPicker.js";

const execFileAsync = promisify(execFile);

interface BlameInfo {
  commitHash: string;
  author: string;
  authorEmail: string;
  authorTime: Date;
  summary: string;
  isUncommitted: boolean;
}

const UNCOMMITTED_HASH = "0".repeat(40);

async function getBlame(
  filePath: string,
): Promise<Map<number, BlameInfo> | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["blame", "--porcelain", "--", filePath],
      {
        cwd: path.dirname(filePath),
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    return parse(stdout);
  } catch {
    return null;
  }
}

function parse(output: string): Map<number, BlameInfo> {
  const result = new Map<number, BlameInfo>();
  const cache = new Map<string, Partial<BlameInfo>>();
  const lines = output.split("\n");
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (!m) {
      i++;
      continue;
    }
    const hash = m[1];
    const line = parseInt(m[2], 10) - 1;
    if (!cache.has(hash)) cache.set(hash, {});
    const e = cache.get(hash)!;
    i++;
    while (i < lines.length && !lines[i].startsWith("\t")) {
      const l = lines[i++];
      if (l.startsWith("author ") && e.author === undefined)
        e.author = l.slice(7).trim();
      else if (l.startsWith("author-mail ") && e.authorEmail === undefined)
        e.authorEmail = l.slice(12).trim().replace(/^<|>$/g, "");
      else if (l.startsWith("author-time ") && e.authorTime === undefined)
        e.authorTime = new Date(parseInt(l.slice(12), 10) * 1000);
      else if (l.startsWith("summary ") && e.summary === undefined)
        e.summary = l.slice(8).trim();
    }
    i++;
    result.set(line, {
      commitHash: hash,
      author: e.author ?? "Unknown",
      authorEmail: e.authorEmail ?? "",
      authorTime: e.authorTime ?? new Date(0),
      summary: e.summary ?? "",
      isUncommitted: hash === UNCOMMITTED_HASH,
    });
  }
  return result;
}

async function getRepoLinesByAuthor(
  repoRoot: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--pretty=format:AUTHOR:%ae', '--numstat', '--no-merges'],
      { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 },
    );
    let currentEmail = '';
    for (const line of stdout.split('\n')) {
      if (line.startsWith('AUTHOR:')) {
        currentEmail = line.slice(7).trim();
      } else {
        const m = line.match(/^(\d+)\t\d+\t/);
        if (m && currentEmail) {
          result.set(currentEmail, (result.get(currentEmail) ?? 0) + parseInt(m[1], 10));
        }
      }
    }
  } catch { /* non-git dir or error */ }
  return result;
}

async function getRepoCurrentLinesByAuthor(
  repoRoot: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    // Diff from the empty tree to HEAD gives every tracked file.
    // Binary files show as "-\t-\tfilename" — filter those out so we
    // don't run git blame on JARs / class files and get inflated counts.
    const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
    const { stdout: diffOut } = await execFileAsync(
      "git",
      ["diff", "--numstat", EMPTY_TREE, "HEAD"],
      { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
    );
    const textFiles = diffOut
      .split("\n")
      .filter((l) => l.length > 0 && !l.startsWith("-\t"))
      .map((l) => l.split("\t")[2]?.trim())
      .filter((f): f is string => Boolean(f));

    const BATCH = 20;
    for (let i = 0; i < textFiles.length; i += BATCH) {
      const batch = textFiles.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (file) => {
          try {
            const { stdout } = await execFileAsync(
              "git",
              ["blame", "--line-porcelain", "--", file],
              { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
            );
            for (const line of stdout.split("\n")) {
              if (line.startsWith("author-mail ")) {
                const email = line.slice(12).trim().replace(/^<|>$/g, "");
                result.set(email, (result.get(email) ?? 0) + 1);
              }
            }
          } catch { /* error blaming file */ }
        }),
      );
    }
  } catch { /* non-git dir */ }
  return result;
}

async function getRepoAuthorNames(
  repoRoot: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--format=%ae\t%an"],
      { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
    );
    for (const line of stdout.split("\n")) {
      const tab = line.indexOf("\t");
      if (tab === -1) continue;
      const email = line.slice(0, tab).trim();
      const name = line.slice(tab + 1).trim();
      if (email && name && !result.has(email)) result.set(email, name);
    }
  } catch { /* non-git dir */ }
  return result;
}

export function authorHue(email: string): number {
  let h = 0;
  for (let i = 0; i < email.length; i++)
    h = (Math.imul(31, h) + email.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 360) + 60) % 360;
}

function resolveHue(email: string): number {
  const hues = vscode.workspace
    .getConfiguration("gitBlameColors")
    .get<Record<string, number>>("authorHues", {});
  return hues[email] ?? authorHue(email);
}

function blameHover(info: BlameInfo): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;
  md.supportThemeIcons = true;
  if (info.isUncommitted) {
    md.appendMarkdown(`$(git-commit) **Not yet committed**`);
  } else {
    const esc = (s: string) => s.replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&");
    md.appendMarkdown(`$(git-commit) \`${info.commitHash.slice(0, 8)}\`\n\n`);
    md.appendMarkdown(`$(person) **${esc(info.author)}**`);
    if (info.authorEmail) md.appendMarkdown(` \\<${esc(info.authorEmail)}\\>`);
    md.appendMarkdown(
      `\n\n$(calendar) ${info.authorTime.toLocaleString()} *(${timeAgo(info.authorTime)})*\n\n---\n\n*${esc(info.summary)}*`,
    );
  }
  return md;
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo ago`;
  return `${Math.floor(s / 31536000)}y ago`;
}

export function activate(context: vscode.ExtensionContext): void {
  const decorationTypes = new Map<
    string,
    Map<string, vscode.TextEditorDecorationType>
  >();
  const blameData = new Map<string, Map<number, BlameInfo>>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let enabled = true;

  function makeDecorationType(color: string): vscode.TextEditorDecorationType {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="16"><rect width="3" height="16" fill="${color}"/></svg>`;
    return vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.parse(
        `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      ),
      gutterIconSize: "contain",
      border: "0px solid transparent",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  function clearDecorations(editor: vscode.TextEditor) {
    const docKey = editor.document.uri.toString();
    const dtMap = decorationTypes.get(docKey);
    if (dtMap) {
      for (const dt of dtMap.values()) {
        editor.setDecorations(dt, []);
        dt.dispose();
      }
      decorationTypes.delete(docKey);
    }
  }

  async function applyBlame(editor: vscode.TextEditor) {
    if (!enabled) return;
    const doc = editor.document;
    if (doc.uri.scheme !== "file") return;

    const blameMap = await getBlame(doc.uri.fsPath);
    if (!vscode.window.visibleTextEditors.some((e) => e.document === doc))
      return;

    clearDecorations(editor);
    if (!blameMap?.size) {
      blameData.delete(doc.uri.toString());
      return;
    }
    blameData.set(doc.uri.toString(), blameMap);

    const cfg = vscode.workspace.getConfiguration("gitBlameColors");
    const sat = cfg.get<number>("saturation", 38);
    const light = cfg.get<number>("lightness", 56);
    const ageWindowDays = cfg.get<number>("ageWindowDays", 0);
    const now = Date.now();

    let oldestCommitMs = now;
    for (const [, info] of blameMap) {
      if (!info.isUncommitted) {
        const t = info.authorTime.getTime();
        if (t < oldestCommitMs) oldestCommitMs = t;
      }
    }
    const fileAgeMs = Math.max(now - oldestCommitMs, 1);
    const ageWindowMs = ageWindowDays === 0
      ? fileAgeMs
      : Math.min(Math.max(ageWindowDays, 1) * 24 * 60 * 60 * 1000, fileAgeMs);
    const SAT_LEVELS = [1.0, 0.89, 0.77, 0.66, 0.54, 0.43, 0.31, 0.20];

    const groups = new Map<
      string,
      { color: string; decs: vscode.DecorationOptions[] }
    >();
    for (const [line, info] of blameMap) {
      if (line >= doc.lineCount) continue;
      if (info.isUncommitted) continue;
      const ageMs = now - info.authorTime.getTime();
      const ageFactor = Math.min(1, Math.max(0, ageMs / ageWindowMs));
      const bucket = Math.min(
        SAT_LEVELS.length - 1,
        Math.floor(ageFactor * SAT_LEVELS.length),
      );
      const key = `${info.authorEmail}:${bucket}`;
      const color = `hsl(${resolveHue(info.authorEmail)}, ${Math.max(10, sat * SAT_LEVELS[bucket]).toFixed(1)}%, ${light}%)`;
      if (!groups.has(key)) groups.set(key, { color, decs: [] });
      groups.get(key)!.decs.push({
        range: new vscode.Range(line, 0, line, doc.lineAt(line).text.length),
        hoverMessage: blameHover(info),
      });
    }

    const docKey = doc.uri.toString();
    const dtMap = new Map<string, vscode.TextEditorDecorationType>();
    decorationTypes.set(docKey, dtMap);
    for (const [key, { color, decs }] of groups) {
      const dt = makeDecorationType(color);
      dtMap.set(key, dt);
      editor.setDecorations(dt, decs);
    }
  }

  function schedule(editor: vscode.TextEditor, ms = 150) {
    const key = editor.document.uri.toString();
    clearTimeout(pending.get(key));
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        applyBlame(editor);
      }, ms),
    );
  }

  const blameExtensions = [
    "eamodio.gitlens",
    "mhutchie.git-graph",
    "donjayamanne.githistory",
  ];
  const hasBlameExtension = blameExtensions.some((id) =>
    vscode.extensions.getExtension(id),
  );

  if (!hasBlameExtension) {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        { scheme: "file" },
        {
          provideHover(doc, pos) {
            if (!enabled) return null;
            const info = blameData.get(doc.uri.toString())?.get(pos.line);
            return info ? new vscode.Hover(blameHover(info)) : null;
          },
        },
      ),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("gitBlameColors.toggle", () => {
      enabled = !enabled;
      const editor = vscode.window.activeTextEditor;
      if (editor) enabled ? schedule(editor, 0) : clearDecorations(editor);
      vscode.window.showInformationMessage(
        `Git Blame Colors: ${enabled ? "Enabled" : "Disabled"}`,
      );
    }),
    vscode.commands.registerCommand("gitBlameColors.refresh", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        blameData.delete(editor.document.uri.toString());
        schedule(editor, 0);
      }
    }),
    vscode.commands.registerCommand("gitBlameColors.setAgeWindow", async () => {
      const cfg = vscode.workspace.getConfiguration("gitBlameColors");
      const current = cfg.get<number>("ageWindowDays", 0);
      const input = await vscode.window.showInputBox({
        title: "Git Blame Colors: Set Age Window",
        prompt: "Days for the age window (0 = always scale to oldest commit). Commits older than the window get minimum saturation.",
        value: String(current),
        validateInput: (v) => {
          const n = Number(v);
          return Number.isInteger(n) && n >= 0 ? null : "Enter a whole number >= 0 (0 = scale to repo age)";
        },
      });
      if (input === undefined) return;
      await cfg.update("ageWindowDays", parseInt(input, 10), vscode.ConfigurationTarget.Global);
      for (const e of vscode.window.visibleTextEditors) {
        blameData.delete(e.document.uri.toString());
        schedule(e, 0);
      }
    }),
    vscode.commands.registerCommand("gitBlameColors.showAuthors", async () => {
      const editor = vscode.window.activeTextEditor;
      const blameMap = editor
        ? blameData.get(editor.document.uri.toString())
        : undefined;
      if (!blameMap?.size) {
        vscode.window.showInformationMessage("No blame data for current file.");
        return;
      }
      const cfg = vscode.workspace.getConfiguration("gitBlameColors");
      const sat = cfg.get<number>("saturation", 38);
      const light = cfg.get<number>("lightness", 56);
      const authorHues = cfg.get<Record<string, number>>("authorHues", {});

      const authorMap = new Map<string, AuthorEntry>();
      const fileDir = path.dirname(editor!.document.uri.fsPath);
      const { stdout: rootOut } = await execFileAsync(
        "git", ["rev-parse", "--show-toplevel"], { cwd: fileDir }
      ).catch(() => ({ stdout: fileDir }));
      const repoRoot = rootOut.trim();
      const [repoLines, repoCurrentLines, authorNames] = await Promise.all([
        getRepoLinesByAuthor(repoRoot),
        getRepoCurrentLinesByAuthor(repoRoot),
        getRepoAuthorNames(repoRoot),
      ]);

      // Build from all known repo contributors, not just those in the current file
      for (const [email, totalLines] of repoLines) {
        if (!authorMap.has(email)) {
          authorMap.set(email, {
            author: authorNames.get(email) ?? email,
            email,
            lines: 0,
            repoLines: repoCurrentLines.get(email) ?? 0,
            totalLines,
            hue: authorHues[email] ?? authorHue(email),
            defaultHue: authorHue(email),
          });
        }
      }
      for (const [email, live] of repoCurrentLines) {
        if (!authorMap.has(email)) {
          authorMap.set(email, {
            author: authorNames.get(email) ?? email,
            email,
            lines: 0,
            repoLines: live,
            totalLines: repoLines.get(email) ?? 0,
            hue: authorHues[email] ?? authorHue(email),
            defaultHue: authorHue(email),
          });
        }
      }
      // Count lines attributed to each author in the current file
      for (const [, info] of blameMap) {
        if (info.isUncommitted) continue;
        if (!authorMap.has(info.authorEmail)) {
          authorMap.set(info.authorEmail, {
            author: info.author,
            email: info.authorEmail,
            lines: 0,
            repoLines: repoCurrentLines.get(info.authorEmail) ?? 0,
            totalLines: repoLines.get(info.authorEmail) ?? 0,
            hue: authorHues[info.authorEmail] ?? authorHue(info.authorEmail),
            defaultHue: authorHue(info.authorEmail),
          });
        } else {
          // Prefer name from blame over git log
          authorMap.get(info.authorEmail)!.author = info.author;
        }
        authorMap.get(info.authorEmail)!.lines++;
      }

      const authors = [...authorMap.values()].sort((a, b) => b.repoLines - a.repoLines);
      const result = await showAuthorsPanel(authors, sat, light);
      if (!result) return;

      const updatedHues = { ...authorHues, ...result.hues };
      for (const email of result.reset) delete updatedHues[email];
      await cfg.update(
        "authorHues",
        updatedHues,
        vscode.ConfigurationTarget.Global,
      );

      for (const dtMap of decorationTypes.values()) {
        for (const dt of dtMap.values()) dt.dispose();
      }
      decorationTypes.clear();
      for (const e of vscode.window.visibleTextEditors) {
        blameData.delete(e.document.uri.toString());
        schedule(e, 0);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((e) => {
      if (e) schedule(e);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === doc,
      );
      if (editor) {
        blameData.delete(doc.uri.toString());
        schedule(editor, 0);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const key = doc.uri.toString();
      blameData.delete(key);
      const dtMap = decorationTypes.get(key);
      if (dtMap) {
        for (const dt of dtMap.values()) dt.dispose();
        decorationTypes.delete(key);
      }
    }),
  );

  for (const editor of vscode.window.visibleTextEditors) schedule(editor, 0);
}

export function deactivate() {}
