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
exports.pickColor = pickColor;
const vscode = __importStar(require("vscode"));
function pickColor(author, initial) {
    return new Promise(resolve => {
        const hex = cssColorToHex(initial);
        const panel = vscode.window.createWebviewPanel('gitBlameColorPicker', `Color for ${author}`, vscode.ViewColumn.Active, { enableScripts: true });
        panel.webview.html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background);
         color: var(--vscode-foreground); display:flex; flex-direction:column;
         align-items:center; justify-content:center; height:100vh; gap:16px; margin:0; }
  input[type=color] { width:120px; height:80px; border:none; cursor:pointer; background:none; }
  .hex { font-size:1.1em; font-family:monospace; letter-spacing:0.1em; }
  button { padding:8px 24px; font-size:1em; cursor:pointer;
           background:var(--vscode-button-background); color:var(--vscode-button-foreground);
           border:none; border-radius:4px; }
  button:hover { background:var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <input type="color" id="picker" value="${hex}">
  <div class="hex" id="hex">${hex}</div>
  <button id="ok">Apply</button>
  <script>
    const vscode = acquireVsCodeApi();
    const picker = document.getElementById('picker');
    const hexEl = document.getElementById('hex');
    picker.addEventListener('input', () => { hexEl.textContent = picker.value; });
    document.getElementById('ok').addEventListener('click', () => {
      vscode.postMessage({ color: picker.value });
    });
  </script>
</body>
</html>`;
        let resolved = false;
        panel.webview.onDidReceiveMessage(msg => {
            resolved = true;
            panel.dispose();
            resolve(msg.color);
        });
        panel.onDidDispose(() => { if (!resolved)
            resolve(undefined); });
    });
}
function cssColorToHex(color) {
    const m = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
        const c = m[1];
        if (c.length === 3)
            return '#' + c.split('').map(x => x + x).join('');
        return color.toLowerCase();
    }
    return '#888888';
}
//# sourceMappingURL=colorPicker.js.map