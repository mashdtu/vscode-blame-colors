import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface BlameInfo {
  commitHash: string;
  author: string;
  authorEmail: string;
  authorTime: Date;
  summary: string;
  isUncommitted: boolean;
}

const UNCOMMITTED_HASH = '0'.repeat(40);

async function getBlame(filePath: string): Promise<Map<number, BlameInfo> | null> {
  try {
    const { stdout } = await execFileAsync('git', ['blame', '--porcelain', '--', filePath], {
      cwd: path.dirname(filePath),
      maxBuffer: 20 * 1024 * 1024,
    });
    return parse(stdout);
  } catch {
    return null;
  }
}

function parse(output: string): Map<number, BlameInfo> {
  const result = new Map<number, BlameInfo>();
  const cache = new Map<string, Partial<BlameInfo>>();
  const lines = output.split('\n');
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (!m) { i++; continue; }
    const hash = m[1];
    const line = parseInt(m[2], 10) - 1;
    if (!cache.has(hash)) cache.set(hash, {});
    const e = cache.get(hash)!;
    i++;
    while (i < lines.length && !lines[i].startsWith('\t')) {
      const l = lines[i++];
      if (l.startsWith('author ') && e.author === undefined) e.author = l.slice(7).trim();
      else if (l.startsWith('author-mail ') && e.authorEmail === undefined) e.authorEmail = l.slice(12).trim().replace(/^<|>$/g, '');
      else if (l.startsWith('author-time ') && e.authorTime === undefined) e.authorTime = new Date(parseInt(l.slice(12), 10) * 1000);
      else if (l.startsWith('summary ') && e.summary === undefined) e.summary = l.slice(8).trim();
    }
    i++;
    result.set(line, {
      commitHash: hash,
      author: e.author ?? 'Unknown',
      authorEmail: e.authorEmail ?? '',
      authorTime: e.authorTime ?? new Date(0),
      summary: e.summary ?? '',
      isUncommitted: hash === UNCOMMITTED_HASH,
    });
  }
  return result;
}

function authorColor(email: string, sat: number, light: number): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (Math.imul(31, h) + email.charCodeAt(i)) | 0;
  return `hsl(${(Math.abs(h) % 360 + 60) % 360}, ${sat}%, ${light}%)`;
}

function blameHover(info: BlameInfo): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;
  md.supportThemeIcons = true;
  if (info.isUncommitted) {
    md.appendMarkdown(`$(git-commit) **Not yet committed**`);
  } else {
    const esc = (s: string) => s.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
    md.appendMarkdown(`$(git-commit) \`${info.commitHash.slice(0, 8)}\`\n\n`);
    md.appendMarkdown(`$(person) **${esc(info.author)}**`);
    if (info.authorEmail) md.appendMarkdown(` \\<${esc(info.authorEmail)}\\>`);
    md.appendMarkdown(`\n\n$(calendar) ${info.authorTime.toLocaleString()} *(${timeAgo(info.authorTime)})*\n\n---\n\n*${esc(info.summary)}*`);
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
  const decorationTypes = new Map<string, vscode.TextEditorDecorationType>();
  const blameData = new Map<string, Map<number, BlameInfo>>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let enabled = true;

  function makeDecorationType(color: string): vscode.TextEditorDecorationType {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="16"><rect width="4" height="16" fill="${color}"/></svg>`;
    const dt = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`),
      gutterIconSize: 'contain',
      border: '0px solid transparent',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    context.subscriptions.push(dt);
    return dt;
  }

  function clearDecorations(editor: vscode.TextEditor) {
    for (const dt of decorationTypes.values()) editor.setDecorations(dt, []);
  }

  async function applyBlame(editor: vscode.TextEditor) {
    if (!enabled) return;
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') return;

    const blameMap = await getBlame(doc.uri.fsPath);
    if (!vscode.window.visibleTextEditors.some(e => e.document === doc)) return;

    clearDecorations(editor);
    if (!blameMap?.size) { blameData.delete(doc.uri.toString()); return; }
    blameData.set(doc.uri.toString(), blameMap);

    const cfg = vscode.workspace.getConfiguration('gitBlameColors');
    const sat = cfg.get<number>('saturation', 38);
    const light = cfg.get<number>('lightness', 56);

    const groups = new Map<string, { color: string; decs: vscode.DecorationOptions[] }>();
    for (const [line, info] of blameMap) {
      if (line >= doc.lineCount) continue;
      const key = info.isUncommitted ? '__uncommitted__' : info.authorEmail;
      const color = info.isUncommitted ? 'rgba(120,120,120,0.55)' : authorColor(info.authorEmail, sat, light);
      if (!groups.has(key)) groups.set(key, { color, decs: [] });
      groups.get(key)!.decs.push({
        range: new vscode.Range(line, 0, line, doc.lineAt(line).text.length),
        hoverMessage: blameHover(info),
      });
    }

    for (const [key, { color, decs }] of groups) {
      if (!decorationTypes.has(key)) decorationTypes.set(key, makeDecorationType(color));
      editor.setDecorations(decorationTypes.get(key)!, decs);
    }
  }

  function schedule(editor: vscode.TextEditor, ms = 150) {
    const key = editor.document.uri.toString();
    clearTimeout(pending.get(key));
    pending.set(key, setTimeout(() => { pending.delete(key); applyBlame(editor); }, ms));
  }

  const blameExtensions = ['eamodio.gitlens', 'mhutchie.git-graph', 'donjayamanne.githistory'];
  const hasBlameExtension = blameExtensions.some(id => vscode.extensions.getExtension(id));

  if (!hasBlameExtension) {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider({ scheme: 'file' }, {
        provideHover(doc, pos) {
          if (!enabled) return null;
          const info = blameData.get(doc.uri.toString())?.get(pos.line);
          return info ? new vscode.Hover(blameHover(info)) : null;
        },
      }),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('gitBlameColors.toggle', () => {
      enabled = !enabled;
      const editor = vscode.window.activeTextEditor;
      if (editor) enabled ? schedule(editor, 0) : clearDecorations(editor);
      vscode.window.showInformationMessage(`Git Blame Colors: ${enabled ? 'Enabled' : 'Disabled'}`);
    }),
    vscode.commands.registerCommand('gitBlameColors.refresh', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) { blameData.delete(editor.document.uri.toString()); schedule(editor, 0); }
    }),
    vscode.window.onDidChangeActiveTextEditor(e => { if (e) schedule(e); }),
    vscode.workspace.onDidSaveTextDocument(doc => {
      const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
      if (editor) { blameData.delete(doc.uri.toString()); schedule(editor, 0); }
    }),
    vscode.workspace.onDidCloseTextDocument(doc => blameData.delete(doc.uri.toString())),
  );

  for (const editor of vscode.window.visibleTextEditors) schedule(editor, 0);
}

export function deactivate() {}

