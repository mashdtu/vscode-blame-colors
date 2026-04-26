import * as vscode from "vscode";
import { BlameInfo } from "./git.js";

export function blameHover(info: BlameInfo): vscode.MarkdownString {
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
