"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.showAuthorsPanel = showAuthorsPanel;
const vscode = __importStar(require("vscode"));
function showAuthorsPanel(authors, sat, light) {
    return new Promise(resolve => {
        const panel = vscode.window.createWebviewPanel('gitBlameAuthors', 'Git Blame — Author Colors', vscode.ViewColumn.Active, { enableScripts: true });
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const rows = authors.map(a => `<tr>
        <td><div class="swatch" style="background: hsl(${a.hue}, ${sat}%, ${light}%)"></div></td>
        <td class="name">${esc(a.author)}</td>
        <td class="email">${esc(a.email)}</td>
        <td class="lines">${a.lines} line${a.lines === 1 ? '' : 's'}</td>
        <td><input type="range" min="0" max="359" value="${a.hue}" class="hue-slider"
             data-email="${esc(a.email)}" data-default-hue="${a.defaultHue}"></td>
        <td><button class="reset" data-email="${esc(a.email)}">Reset</button></td>
      </tr>`).join('\n');
        panel.webview.html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background);
         color: var(--vscode-foreground); padding: 24px 32px; margin: 0; }
  h2 { margin-top: 0; font-size: 1.1em; font-weight: 600;
       border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 5px 10px; vertical-align: middle; }
  td:first-child { width: 36px; text-align: center; }
  .swatch { width: 22px; height: 22px; border-radius: 4px; display: inline-block; }
  .name { font-weight: 500; }
  .email { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .lines { color: var(--vscode-descriptionForeground); font-size: 0.9em; text-align: right; }
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
  <h2>Git Blame - Author Colors</h2>
  <table><tbody>${rows}</tbody></table>
  <div class="actions">
    <button class="ok" id="ok">Apply</button>
    <button class="cancel" id="cancel">Cancel</button>
  </div>
  <script>
    const SAT = ${sat};
    const LIGHT = ${light};
    const vscode = acquireVsCodeApi();
    const resetSet = new Set();
    document.querySelectorAll('.hue-slider').forEach(el => {
      el.addEventListener('input', () => {
        el.closest('tr').querySelector('.swatch').style.background =
          \`hsl(\${el.value}, \${SAT}%, \${LIGHT}%)\`;
        el.closest('tr').classList.remove('is-reset');
        resetSet.delete(el.dataset.email);
      });
    });
    document.querySelectorAll('.reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        const slider = row.querySelector('.hue-slider');
        slider.value = slider.dataset.defaultHue;
        row.querySelector('.swatch').style.background =
          \`hsl(\${slider.dataset.defaultHue}, \${SAT}%, \${LIGHT}%)\`;
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
        let resolved = false;
        panel.webview.onDidReceiveMessage(msg => {
            resolved = true;
            panel.dispose();
            resolve(msg.type === 'apply' ? { hues: msg.hues, reset: msg.reset ?? [] } : undefined);
        });
        panel.onDidDispose(() => { if (!resolved)
            resolve(undefined); });
    });
}
//# sourceMappingURL=colorPicker.js.map