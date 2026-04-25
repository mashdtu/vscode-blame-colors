import { AuthorEntry } from "./colorPicker.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAuthorsHtml(
  authors: AuthorEntry[],
  sat: number,
  light: number,
): string {
  const SAT_LEVELS = [1.0, 0.84, 0.68, 0.52, 0.36, 0.20];

  const rows = authors
    .map((a) => {
      const ageDots = SAT_LEVELS.map(
        (m) =>
          `<div class="age-dot" style="background: hsl(${a.hue}, ${Math.max(10, sat * m).toFixed(1)}%, ${light}%)"></div>`,
      ).join("");
      return `<tr>
        <td><div class="age-bar" data-hue="${a.hue}">${ageDots}</div></td>
        <td class="name">${esc(a.author)}</td>
        <td class="email">${esc(a.email)}</td>
        <td class="lines">${a.repoLines.toLocaleString()} live<br><span class="total">${a.totalLines.toLocaleString()} all-time</span></td>
        <td><input type="range" min="0" max="359" value="${a.hue}" class="hue-slider"
             data-email="${esc(a.email)}" data-default-hue="${a.defaultHue}"></td>
        <td><button class="reset" data-email="${esc(a.email)}">Reset</button></td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background);
         color: var(--vscode-foreground); padding: 24px 32px; margin: 0; }
  h2 { margin-top: 0; font-size: 1.1em; font-weight: 600;
       border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 5px 10px; vertical-align: middle; }
  td:first-child { width: 80px; text-align: center; }
  .age-bar { display: flex; gap: 2px; align-items: center; }
  .age-dot { width: 10px; height: 22px; border-radius: 3px; flex-shrink: 0; }
  .name { font-weight: 500; }
  .email { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .lines { color: var(--vscode-descriptionForeground); font-size: 0.9em; text-align: right; }
  .total { font-size: 0.8em; opacity: 0.7; }
  .hue-slider { -webkit-appearance: none; appearance: none; width: 140px; height: 14px;
                border-radius: 7px; cursor: pointer; border: none; outline: none;
                background: linear-gradient(to right,
                  hsl(0,60%,55%), hsl(60,60%,55%), hsl(120,60%,55%),
                  hsl(180,60%,55%), hsl(240,60%,55%), hsl(300,60%,55%), hsl(360,60%,55%)); }
  .hue-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px;
    border-radius: 50%; background: white; border: 2px solid rgba(0,0,0,0.4); cursor: pointer; }
  .hue-slider::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%;
    background: white; border: 2px solid rgba(0,0,0,0.4); cursor: pointer; box-sizing: border-box; }
  tr:hover { background: var(--vscode-list-hoverBackground); }
  tr.is-reset { opacity: 0.5; }
  .actions { margin-top: 20px; display: flex; gap: 10px; }
  button { padding: 7px 22px; font-size: 1em; cursor: pointer; border: none; border-radius: 4px; }
  .ok { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .ok:hover { background: var(--vscode-button-hoverBackground); }
  .cancel { background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground); }
  .cancel:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .reset { background: none; color: var(--vscode-descriptionForeground); font-size: 0.8em;
           padding: 3px 8px; border: 1px solid var(--vscode-panel-border); }
  .reset:hover { color: var(--vscode-foreground); border-color: var(--vscode-foreground); }
</style></head><body>
  <h2>Git Blame: Author Colors</h2>
  <table><tbody>${rows}</tbody></table>
  <div class="actions">
    <button class="ok" id="ok">Apply</button>
    <button class="cancel" id="cancel">Cancel</button>
  </div>
  <script>
    const SAT = ${sat};
    const LIGHT = ${light};
    const SAT_LEVELS = [1.0, 0.84, 0.68, 0.52, 0.36, 0.20];
    const vscode = acquireVsCodeApi();
    const resetSet = new Set();
    function updateAgeDots(row, hue) {
      const dots = row.querySelectorAll('.age-dot');
      SAT_LEVELS.forEach((m, i) => {
        dots[i].style.background = \`hsl(\${hue}, \${Math.max(10, SAT * m).toFixed(1)}%, \${LIGHT}%)\`;
      });
    }
    document.querySelectorAll('.hue-slider').forEach(el => {
      el.addEventListener('input', () => {
        const row = el.closest('tr');
        updateAgeDots(row, el.value);
        row.classList.remove('is-reset');
        resetSet.delete(el.dataset.email);
      });
    });
    document.querySelectorAll('.reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        const slider = row.querySelector('.hue-slider');
        slider.value = slider.dataset.defaultHue;
        updateAgeDots(row, slider.dataset.defaultHue);
        row.classList.add('is-reset');
        resetSet.add(btn.dataset.email);
      });
    });
    document.getElementById('ok').addEventListener('click', () => {
      const hues = {};
      document.querySelectorAll('.hue-slider').forEach(el => {
        if (!resetSet.has(el.dataset.email)) hues[el.dataset.email] = parseInt(el.value);
      });
      vscode.postMessage({ type: 'apply', hues, reset: [...resetSet] });
    });
    document.getElementById('cancel').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
  </script>
</body></html>`;
}
