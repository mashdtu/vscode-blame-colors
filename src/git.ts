import { execFile } from "child_process";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface BlameInfo {
  commitHash: string;
  author: string;
  authorEmail: string;
  authorTime: Date;
  summary: string;
  isUncommitted: boolean;
}

export const UNCOMMITTED_HASH = "0".repeat(40);

export async function getBlame(
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

export interface LocBreakdown {
  totals: Map<string, number>;
  byFile: Map<string, Map<string, number>>;
}

export async function getRepoLinesByAuthor(
  repoRoot: string,
): Promise<LocBreakdown> {
  const totals = new Map<string, number>();
  const byFile = new Map<string, Map<string, number>>();
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--pretty=format:AUTHOR:%ae", "--numstat", "--no-merges"],
      { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 },
    );
    let currentEmail = "";
    for (const line of stdout.split("\n")) {
      if (line.startsWith("AUTHOR:")) {
        currentEmail = line.slice(7).trim();
      } else {
        const m = line.match(/^(\d+)\t\d+\t(.+)$/);
        if (m && currentEmail) {
          const added = parseInt(m[1], 10);
          const file = m[2].trim();
          totals.set(currentEmail, (totals.get(currentEmail) ?? 0) + added);
          if (!byFile.has(currentEmail)) byFile.set(currentEmail, new Map());
          const fm = byFile.get(currentEmail)!;
          fm.set(file, (fm.get(file) ?? 0) + added);
        }
      }
    }
  } catch { /* non-git dir or error */ }
  return { totals, byFile };
}

export async function getRepoCurrentLinesByAuthor(
  repoRoot: string,
): Promise<LocBreakdown> {
  const totals = new Map<string, number>();
  const byFile = new Map<string, Map<string, number>>();
  try {
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
                totals.set(email, (totals.get(email) ?? 0) + 1);
                if (!byFile.has(email)) byFile.set(email, new Map());
                const fm = byFile.get(email)!;
                fm.set(file, (fm.get(file) ?? 0) + 1);
              }
            }
          } catch { /* error blaming file */ }
        }),
      );
    }
  } catch { /* non-git dir */ }
  return { totals, byFile };
}

export async function getRepoAuthorNames(
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
