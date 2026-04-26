import * as vscode from "vscode";
import { buildAuthorsHtml } from "./authorsView.js";

export interface AuthorEntry {
  author: string;
  email: string;
  lines: number;
  repoLines: number;
  totalLines: number;
  hue: number;
  defaultHue: number;
}

export interface PanelResult {
  hues: Record<string, number>;
  reset: string[];
}

export function showAuthorsPanel(
  authors: AuthorEntry[],
  sat: number,
  light: number,
  title = "Git Blame Author Colors",
): Promise<PanelResult | undefined> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "gitBlameAuthors",
      title,
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );

    panel.webview.html = buildAuthorsHtml(authors, sat, light, title);

    let resolved = false;
    panel.webview.onDidReceiveMessage((msg) => {
      resolved = true;
      panel.dispose();
      resolve(
        msg.type === "apply"
          ? { hues: msg.hues, reset: msg.reset ?? [] }
          : undefined,
      );
    });
    panel.onDidDispose(() => {
      if (!resolved) resolve(undefined);
    });
  });
}
