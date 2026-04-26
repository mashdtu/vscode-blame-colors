import * as vscode from "vscode";
import { execFile } from "child_process";
import * as path from "path";
import { promisify } from "util";
import { showAuthorsPanel, AuthorEntry, PanelResult } from "./colorPicker.js";
import {
  BlameInfo,
  getBlame,
  getRepoLinesByAuthor,
  getRepoCurrentLinesByAuthor,
  getRepoAuthorNames,
} from "./git.js";
import { authorHue } from "./colors.js";
import { blameHover } from "./hover.js";

const execFileAsync = promisify(execFile);

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
    const hues = cfg.get<Record<string, number>>("authorHues", {});
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
      const color = `hsl(${hues[info.authorEmail] ?? authorHue(info.authorEmail)}, ${Math.max(10, sat * SAT_LEVELS[bucket]).toFixed(1)}%, ${light}%)`;
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
  );

  // ── shared helper ──────────────────────────────────────────────────────────
  async function applyHueResult(
    result: PanelResult,
    cfg: vscode.WorkspaceConfiguration,
  ) {
    const authorHues = cfg.get<Record<string, number>>("authorHues", {});
    const updatedHues = { ...authorHues, ...result.hues };
    for (const email of result.reset) delete updatedHues[email];
    await cfg.update("authorHues", updatedHues, vscode.ConfigurationTarget.Global);
    for (const dtMap of decorationTypes.values()) {
      for (const dt of dtMap.values()) dt.dispose();
    }
    decorationTypes.clear();
    for (const e of vscode.window.visibleTextEditors) {
      blameData.delete(e.document.uri.toString());
      schedule(e, 0);
    }
  }

  context.subscriptions.push(
    // ── Show Authors (Repo) ─────────────────────────────────────────────────
    vscode.commands.registerCommand("gitBlameColors.showAuthorsRepo", async () => {
      const editor = vscode.window.activeTextEditor;
      const blameMap = editor
        ? blameData.get(editor.document.uri.toString())
        : undefined;

      const cfg = vscode.workspace.getConfiguration("gitBlameColors");
      const sat = cfg.get<number>("saturation", 38);
      const light = cfg.get<number>("lightness", 56);
      const authorHues = cfg.get<Record<string, number>>("authorHues", {});

      // Resolve repo root: prefer active file, fall back to first workspace folder
      const fallbackDir =
        editor?.document.uri.fsPath
          ? path.dirname(editor.document.uri.fsPath)
          : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!fallbackDir) {
        vscode.window.showInformationMessage("No git repository found.");
        return;
      }
      const { stdout: rootOut } = await execFileAsync(
        "git", ["rev-parse", "--show-toplevel"], { cwd: fallbackDir }
      ).catch(() => ({ stdout: fallbackDir }));
      const repoRoot = rootOut.trim();

      const authorMap = new Map<string, AuthorEntry>();
      const [repoLines, repoCurrentLines, authorNames] = await Promise.all([
        getRepoLinesByAuthor(repoRoot),
        getRepoCurrentLinesByAuthor(repoRoot),
        getRepoAuthorNames(repoRoot),
      ]);

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
      if (blameMap) {
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
            authorMap.get(info.authorEmail)!.author = info.author;
          }
          authorMap.get(info.authorEmail)!.lines++;
        }
      }

      const authors = [...authorMap.values()]
        .filter((a) => a.totalLines > 0)
        .sort((a, b) => b.repoLines - a.repoLines);
      const result = await showAuthorsPanel(authors, sat, light, "Authors — Repo");
      if (!result) return;
      await applyHueResult(result, cfg);
    }),

    // ── Show Authors (File) ───────────────────────────────────────────────────
    vscode.commands.registerCommand("gitBlameColors.showAuthorsFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("Open a file to see its authors.");
        return;
      }
      const blameMap = blameData.get(editor.document.uri.toString());
      if (!blameMap?.size) {
        vscode.window.showInformationMessage("No blame data for current file.");
        return;
      }

      const cfg = vscode.workspace.getConfiguration("gitBlameColors");
      const sat = cfg.get<number>("saturation", 38);
      const light = cfg.get<number>("lightness", 56);
      const authorHues = cfg.get<Record<string, number>>("authorHues", {});

      const fileDir = path.dirname(editor.document.uri.fsPath);
      const { stdout: rootOut } = await execFileAsync(
        "git", ["rev-parse", "--show-toplevel"], { cwd: fileDir }
      ).catch(() => ({ stdout: fileDir }));
      const repoRoot = rootOut.trim();

      const [repoLines, repoCurrentLines] = await Promise.all([
        getRepoLinesByAuthor(repoRoot),
        getRepoCurrentLinesByAuthor(repoRoot),
      ]);

      const authorMap = new Map<string, AuthorEntry>();
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
        }
        authorMap.get(info.authorEmail)!.lines++;
      }

      const filename = path.basename(editor.document.uri.fsPath);
      const authors = [...authorMap.values()]
        .filter((a) => a.totalLines > 0)
        .sort((a, b) => b.lines - a.lines);
      const result = await showAuthorsPanel(authors, sat, light, `Authors — ${filename}`);
      if (!result) return;
      await applyHueResult(result, cfg);
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
