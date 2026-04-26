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
  title = "Git Blame Author Colors",
): string {
  const SAT_LEVELS = [1.0, 0.89, 0.77, 0.66, 0.54, 0.43, 0.31, 0.20];
  const totalLive = authors.reduce((s, a) => s + a.repoLines, 0);
  const totalAllTime = authors.reduce((s, a) => s + a.totalLines, 0);

  const breakdown: Record<string, {
    live: { lang: Record<string, number>; file: Record<string, number> };
    alltime: { lang: Record<string, number>; file: Record<string, number> };
  }> = {};

  // Aggregate totals across all authors
  const totalLiveByLang: Record<string, number> = {};
  const totalLiveByFile: Record<string, number> = {};
  const totalAllTimeByLang: Record<string, number> = {};
  const totalAllTimeByFile: Record<string, number> = {};
  for (const a of authors) {
    breakdown[a.email] = {
      live: { lang: a.liveByLang, file: a.liveByFile },
      alltime: { lang: a.allTimeByLang, file: a.allTimeByFile },
    };
    for (const [k, v] of Object.entries(a.liveByLang))    totalLiveByLang[k]    = (totalLiveByLang[k]    ?? 0) + v;
    for (const [k, v] of Object.entries(a.liveByFile))    totalLiveByFile[k]    = (totalLiveByFile[k]    ?? 0) + v;
    for (const [k, v] of Object.entries(a.allTimeByLang)) totalAllTimeByLang[k] = (totalAllTimeByLang[k] ?? 0) + v;
    for (const [k, v] of Object.entries(a.allTimeByFile)) totalAllTimeByFile[k] = (totalAllTimeByFile[k] ?? 0) + v;
  }
  breakdown["__total__"] = {
    live:    { lang: totalLiveByLang,    file: totalLiveByFile },
    alltime: { lang: totalAllTimeByLang, file: totalAllTimeByFile },
  };
  const breakdownJson = JSON.stringify(breakdown).replace(/`/g, "\\`");

  const rows = authors
    .map((a) => {
      const ageDots = SAT_LEVELS.map(
        (m) =>
          `<div class="age-dot" style="background: hsl(${a.hue}, ${Math.max(10, sat * m).toFixed(1)}%, ${light}%)"></div>`,
      ).join("");
      return `<tr class="author-top" data-email="${esc(a.email)}">
        <td class="colors"><div class="age-bar" data-hue="${a.hue}">${ageDots}</div></td>
        <td class="name">${esc(a.author)}</td>
        <td class="email" colspan="2">${esc(a.email)}</td>
        <td rowspan="2" style="vertical-align:middle"><button class="reset" data-email="${esc(a.email)}">Reset</button></td>
      </tr>
      <tr class="author-bottom" data-email="${esc(a.email)}">
        <td class="lines loc-cell" data-email="${esc(a.email)}" data-type="live">${a.repoLines.toLocaleString()} live loc</td>
        <td class="lines total loc-cell" data-email="${esc(a.email)}" data-type="alltime">${a.totalLines.toLocaleString()} all-time loc</td>
        <td><input type="range" min="0" max="359" value="${a.hue}" class="hue-slider"
             data-email="${esc(a.email)}" data-default-hue="${a.defaultHue}"></td>
      </tr>
      <tr class="author-detail" data-email="${esc(a.email)}">
        <td colspan="5">
          <div class="detail-panel">
            <div class="detail-tabs">
              <button class="tab-btn active" data-tab="lang">By Language</button>
              <button class="tab-btn" data-tab="file">By File</button>
            </div>
            <div class="detail-list"></div>
          </div>
        </td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background);
         color: var(--vscode-foreground); padding: 24px 32px; margin: 0; }
  .header { display: flex; align-items: baseline; justify-content: space-between;
             border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 16px; }
  h2 { margin: 0; font-size: 1.1em; font-weight: 600; }
  .totals { font-size: 0.82em; color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .totals span { margin-left: 14px; }
  .totals .loc-cell { cursor: pointer; }
  .totals .loc-cell:hover { color: var(--vscode-foreground); text-decoration: underline dotted; }
  .totals .loc-cell.active { color: var(--vscode-foreground); font-weight: 600;
                              border-bottom: 2px solid var(--vscode-focusBorder); }
  .total-detail { display: none; margin: 0 0 16px 0; padding: 8px 0;
                  border-bottom: 1px solid var(--vscode-panel-border); }
  .total-detail.open { display: block; }
  table { border-collapse: collapse; width: 100%; }
  th { padding: 3px 10px 8px; text-align: left; font-size: 0.8em; font-weight: 600;
       text-transform: uppercase; letter-spacing: 0.04em;
       color: var(--vscode-descriptionForeground);
       border-bottom: 1px solid var(--vscode-panel-border); }
  th:first-child { text-align: center; }
  td { padding: 3px 10px; vertical-align: middle; }
  .colors { width: 90px; text-align: center; vertical-align: middle; }
  .age-bar { display: flex; gap: 2px; align-items: center; }
  .age-dot { width: 10px; height: 22px; border-radius: 3px; flex-shrink: 0; }
  .name { font-weight: 500; }
  .email { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .lines { color: var(--vscode-descriptionForeground); font-size: 0.9em; white-space: nowrap; }
  .total { opacity: 0.7; }
  .loc-cell { cursor: pointer; user-select: none; }
  .loc-cell:hover { color: var(--vscode-foreground); text-decoration: underline dotted; }
  .loc-cell.active { color: var(--vscode-foreground); font-weight: 600;
                     border-bottom: 2px solid var(--vscode-focusBorder); }
  .hue-slider { -webkit-appearance: none; appearance: none; width: 140px; height: 14px;
                border-radius: 7px; cursor: pointer; border: none; outline: none;
                background: linear-gradient(to right,
                  hsl(0,60%,55%), hsl(60,60%,55%), hsl(120,60%,55%),
                  hsl(180,60%,55%), hsl(240,60%,55%), hsl(300,60%,55%), hsl(360,60%,55%)); }
  .hue-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px;
    border-radius: 50%; background: white; border: 2px solid rgba(0,0,0,0.4); cursor: pointer; }
  .hue-slider::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%;
    background: white; border: 2px solid rgba(0,0,0,0.4); cursor: pointer; box-sizing: border-box; }
  tr.author-top:hover, tr.author-top:hover + tr.author-bottom,
  tr.author-top:has(+ tr.author-bottom:hover), tr.author-bottom:hover { background: var(--vscode-list-hoverBackground); }
  tr.is-reset { opacity: 0.5; }
  tr.author-detail { display: none; }
  tr.author-detail.open { display: table-row; }
  tr.author-detail td { padding: 0; }
  .detail-panel { padding: 6px 10px 12px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
  .detail-tabs { display: flex; gap: 4px; margin-bottom: 6px; }
  .tab-btn { padding: 2px 10px; font-size: 0.8em; background: none;
             border: 1px solid var(--vscode-panel-border); border-radius: 3px;
             cursor: pointer; color: var(--vscode-descriptionForeground); }
  .tab-btn.active { background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-color: transparent; }
  .detail-list { max-height: 160px; overflow-y: auto; display: grid; grid-template-columns: 1fr auto; column-gap: 16px; }
  .detail-item { display: contents; }
  .detail-name { padding: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                 font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  .detail-count { padding: 2px 0; text-align: right; font-size: 0.85em;
                  color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .actions { margin-top: 20px; display: flex; gap: 10px; }
  button { padding: 7px 22px; font-size: 1em; cursor: pointer; border: none; border-radius: 4px; }
  .ok { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .ok:hover { background: var(--vscode-button-hoverBackground); }
  .reset-all { background: var(--vscode-button-secondaryBackground);
               color: var(--vscode-button-secondaryForeground); }
  .reset-all:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .cancel { background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground); }
  .cancel:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .reset { background: none; color: var(--vscode-descriptionForeground); font-size: 0.8em;
           padding: 3px 8px; border: 1px solid var(--vscode-panel-border); }
  .reset:hover { color: var(--vscode-foreground); border-color: var(--vscode-foreground); }
</style></head><body>
  <div class="header">
    <h2>${esc(title)}</h2>
    <div class="totals">
      <span class="loc-cell" data-email="__total__" data-type="live">${totalLive.toLocaleString()} live loc</span>
      <span class="loc-cell" data-email="__total__" data-type="alltime">${totalAllTime.toLocaleString()} all-time loc</span>
    </div>
  </div>
  <div class="total-detail" id="total-detail">
    <div class="detail-tabs">
      <button class="tab-btn active" id="total-tab-lang" onclick="switchTotalTab('lang')">By Language</button>
      <button class="tab-btn" id="total-tab-file" onclick="switchTotalTab('file')">By File</button>
    </div>
    <div class="detail-list" id="total-detail-list"></div>
  </div>
  <table>
    <tbody>${rows}</tbody>
  </table>
  <div class="actions">
    <button class="ok" id="ok">Apply</button>
    <button class="reset-all" id="reset-all">Reset All</button>
    <button class="cancel" id="cancel">Cancel</button>
  </div>
  <script>
    const SAT = ${sat};
    const LIGHT = ${light};
    const SAT_LEVELS = [1.0, 0.89, 0.77, 0.66, 0.54, 0.43, 0.31, 0.20];
    const BREAKDOWN = \`${breakdownJson}\`;
    const BD = JSON.parse(BREAKDOWN);
    const vscode = acquireVsCodeApi();
    const resetSet = new Set();
    let openEmail = null;
    let openType = null;
    let openTab = 'lang';

    function renderDetailList(listEl, email, type, tab) {
      const src = BD[email]?.[type]?.[tab] ?? {};
      const entries = Object.entries(src).sort((a, b) => b[1] - a[1]);
      if (entries.length === 0) {
        listEl.innerHTML = '<div class="detail-item"><span class="detail-name">No data</span></div>';
        return;
      }
      listEl.innerHTML = entries.map(([name, count]) =>
        \`<div class="detail-item">
          <span class="detail-name">\${name}</span>
          <span class="detail-count">\${Number(count).toLocaleString()}</span>
        </div>\`
      ).join('');
    }

    function showDetail(email, type, tab, anchorCell) {
      if (openEmail) {
        const prev = document.querySelector(\`.author-detail[data-email="\${CSS.escape(openEmail)}"]\`);
        if (prev) prev.classList.remove('open');
      }
      if (openEmail) setActiveLoc(openEmail, openType, false);
      openEmail = email; openType = type; openTab = tab;
      const row = document.querySelector(\`.author-detail[data-email="\${CSS.escape(email)}"]\`);
      if (!row) return;
      row.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      renderDetailList(row.querySelector('.detail-list'), email, type, tab);
      if (anchorCell) {
        row.querySelector('.detail-panel').style.paddingLeft = Math.max(10, anchorCell.offsetLeft) + 'px';
      }
      row.classList.add('open');
      setActiveLoc(email, type, true);
    }

    function setActiveLoc(email, type, active) {
      if (!email) return;
      document.querySelectorAll(\`.loc-cell[data-email="\${CSS.escape(email)}"][data-type="\${type}"]\`)
        .forEach(el => el.classList.toggle('active', active));
    }

    function hideDetail() {
      if (openEmail) {
        const row = document.querySelector(\`.author-detail[data-email="\${CSS.escape(openEmail)}"]\`);
        if (row) row.classList.remove('open');
        setActiveLoc(openEmail, openType, false);
      }
      openEmail = null; openType = null;
    }

    let openTotalType = null;
    let openTotalTab = 'lang';

    function showTotalDetail(type, tab) {
      const panel = document.getElementById('total-detail');
      const listEl = document.getElementById('total-detail-list');
      if (openTotalType === type && panel.classList.contains('open')) {
        panel.classList.remove('open');
        setActiveLoc('__total__', openTotalType, false);
        openTotalType = null;
        return;
      }
      if (openTotalType) setActiveLoc('__total__', openTotalType, false);
      openTotalType = type; openTotalTab = tab;
      document.getElementById('total-tab-lang').classList.toggle('active', tab === 'lang');
      document.getElementById('total-tab-file').classList.toggle('active', tab === 'file');
      renderDetailList(listEl, '__total__', type, tab);
      panel.classList.add('open');
      setActiveLoc('__total__', type, true);
    }

    function switchTotalTab(tab) {
      if (tab === openTotalTab || openTotalType === null) return;
      openTotalTab = tab;
      document.getElementById('total-tab-lang').classList.toggle('active', tab === 'lang');
      document.getElementById('total-tab-file').classList.toggle('active', tab === 'file');
      renderDetailList(document.getElementById('total-detail-list'), '__total__', openTotalType, tab);
    }

    document.querySelectorAll('.loc-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const { email, type } = cell.dataset;
        if (email === '__total__') {
          showTotalDetail(type, openTotalTab);
          return;
        }
        if (openEmail === email && openType === type) {
          hideDetail();
        } else {
          showDetail(email, type, openEmail === email ? openTab : 'lang', cell);
        }
      });
    });

    document.addEventListener('click', e => {
      const tabBtn = e.target.closest('.tab-btn');
      if (!tabBtn || !openEmail) return;
      const tab = tabBtn.dataset.tab;
      if (tab === openTab) return;
      openTab = tab;
      const row = document.querySelector(\`.author-detail[data-email="\${CSS.escape(openEmail)}"]\`);
      if (row) {
        row.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        renderDetailList(row.querySelector('.detail-list'), openEmail, openType, tab);
      }
    });

    function updateAgeDots(row, hue) {
      const dots = row.querySelectorAll('.age-dot');
      SAT_LEVELS.forEach((m, i) => {
        dots[i].style.background = \`hsl(\${hue}, \${Math.max(10, SAT * m).toFixed(1)}%, \${LIGHT}%)\`;
      });
    }
    document.querySelectorAll('.hue-slider').forEach(el => {
      el.addEventListener('input', () => {
        const bottomRow = el.closest('tr');
        const topRow = bottomRow.previousElementSibling;
        updateAgeDots(topRow, el.value);
        bottomRow.classList.remove('is-reset');
        topRow.classList.remove('is-reset');
        resetSet.delete(el.dataset.email);
      });
    });
    document.querySelectorAll('.reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const topRow = btn.closest('tr');
        const bottomRow = topRow.nextElementSibling;
        const slider = bottomRow.querySelector('.hue-slider');
        slider.value = slider.dataset.defaultHue;
        updateAgeDots(topRow, slider.dataset.defaultHue);
        bottomRow.classList.add('is-reset');
        topRow.classList.add('is-reset');
        resetSet.add(btn.dataset.email);
      });
    });
    document.getElementById('reset-all').addEventListener('click', () => {
      document.querySelectorAll('.author-top').forEach(topRow => {
        const bottomRow = topRow.nextElementSibling;
        const slider = bottomRow.querySelector('.hue-slider');
        slider.value = slider.dataset.defaultHue;
        updateAgeDots(topRow, slider.dataset.defaultHue);
        topRow.classList.add('is-reset');
        bottomRow.classList.add('is-reset');
        resetSet.add(slider.dataset.email);
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
