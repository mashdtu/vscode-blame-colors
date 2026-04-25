# Git Blame Colors

Visualize git blame directly in the editor gutter. Each line gets a colored block whose hue is tied to its author. Older commits fade toward grey so recent work stands out at a glance. Hover any line to see the full commit details.

---

## Features

### Gutter color blocks
A thin colored block appears in the gutter beside every line. The hue is unique per author and consistent across files. Commits fade progressively toward grey the older they are: the newest commit in a file is fully saturated, the oldest is nearly monochrome, with four levels of aging in between.

### Hover for commit details
Hover over any line to see:
- Short commit hash
- Author name and email
- Commit date and relative time (e.g. *3d ago*)
- Commit summary message

If you have GitLens, git-graph, or githistory installed the extension defers hover to them to avoid duplication.

### Author color management
Open the **Show Authors** panel to see every author in the current file ranked by number of lines. Each row has a hue slider; drag it to pick a different hue for that author. A color swatch updates live as you drag. Click **Reset** on a row to revert that author back to their auto-generated hue. Click **Apply** to save, **Cancel** to discard.

### Toggle on/off
Quickly hide and show all blame decorations without reloading.

### Manual refresh
Force a re-run of git blame on the current file (useful after amending commits or rebasing).

---

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | Description |
|---|---|
| `Git Blame Colors: Toggle` | Show or hide all gutter blame blocks |
| `Git Blame Colors: Refresh` | Re-run blame on the current file |
| `Git Blame Colors: Show Authors` | Open the author color management panel |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `gitBlameColors.saturation` | `38` | HSL saturation (0–100) applied to author colors |
| `gitBlameColors.lightness` | `56` | HSL lightness (0–100) applied to author colors |
| `gitBlameColors.authorHues` | `{}` | Custom hue overrides per author email, e.g. `{"alice@example.com": 210}` |

Adjust saturation and lightness via **File > Preferences > Settings** and search for `gitBlameColors`. Hue overrides are written automatically by the Show Authors panel.

---

## Requirements

- VS Code 1.74 or later
- Git must be available on `PATH`
- The file must be inside a git repository

---

## Installation

### From a VSIX file (all platforms)

This extension is not published to the VS Code Marketplace. Install it from the packaged `.vsix` file.

**Prerequisites:** Node.js 18+, npm, and `vsce`:
```
npm install -g @vscode/vsce
```

#### Option A - using the Makefile (Linux / macOS)

```bash
git clone https://github.com/mashdtu/vscode-blame-colors
cd vscode-blame-colors
npm install
make install
```

`make install` compiles the TypeScript, packages a `.vsix`, and installs it into VS Code in one step.

Other useful targets:

| Target | Description |
|---|---|
| `make compile` | Compile TypeScript only |
| `make watch` | Watch mode - recompile on save |
| `make package` | Build the `.vsix` without installing |
| `make clean` | Remove `out/` and the `.vsix` |

#### Option B - manual steps (Linux / macOS / Windows)

```bash
git clone https://github.com/mashdtu/vscode-blame-colors
cd vscode-blame-colors
npm install
npm run compile
vsce package
```

This produces `git-blame-colors-0.0.1.vsix`. Install it:

**From the terminal:**
```bash
code --install-extension git-blame-colors-0.0.1.vsix
```

**From the VS Code UI:**
1. Open the Extensions view (`Ctrl+Shift+X`)
2. Click the `...` menu at the top right of the panel
3. Choose **Install from VSIX...**
4. Select the `.vsix` file

#### Windows (no Makefile)

The Makefile requires `make` (available via Git Bash, WSL, or `winget install GnuWin32.Make`). If you prefer plain PowerShell:

```powershell
git clone https://github.com/mashdtu/vscode-blame-colors
cd vscode-blame-colors
npm install
npm run compile
vsce package
code --install-extension git-blame-colors-0.0.1.vsix
```

---

## Uninstalling

Open the Extensions view, find **Git Blame Colors**, click the gear icon, and choose **Uninstall**. Or from a terminal:

```bash
code --uninstall-extension mashdtu.git-blame-colors
```

---

## How it works

On activation (and whenever you switch files or save), the extension runs `git blame --porcelain` on the current file in a child process. It parses the output to extract per-line author, email, commit hash, timestamp, and summary. Each line is assigned a `TextEditorDecorationType` with an SVG gutter icon whose color is `hsl(<hue>, <saturation * age_factor>%, <lightness>%)`. The age factor is computed relative to the oldest and newest commit in the current file, so desaturation is always proportional to the file's own history range.
