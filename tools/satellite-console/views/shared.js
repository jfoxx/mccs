export const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ */
/*  Tree                                                               */
/* ------------------------------------------------------------------ */

export function buildTreeStructure(files, basePath) {
  const tree = {};
  files.forEach((file) => {
    const parts = file.path.replace(basePath, '').split('/').filter(Boolean);
    let current = tree;
    parts.forEach((part, i) => {
      if (!current[part]) {
        current[part] = {
          isFile: i === parts.length - 1,
          children: {},
          path: `/${parts.slice(0, i + 1).join('/')}`,
        };
      }
      current = current[part].children;
    });
  });
  return tree;
}

function getFoldersAtPath(treeData, treePath) {
  let node = treeData;
  if (treePath !== '/') {
    const parts = treePath.split('/').filter(Boolean);
    for (const part of parts) {
      if (node[part]) {
        node = node[part].children;
      } else {
        return [];
      }
    }
  }
  return Object.entries(node)
    .filter(([, n]) => !n.isFile)
    .sort(([a], [b]) => a.localeCompare(b));
}

export function renderTree(panel, treeData, treeLoading, msgs, browseFn, currentPath = '/') {
  if (!panel) return;

  if (treeLoading) {
    panel.innerHTML = `
      <div class="sc-tree-loading">
        <div class="sc-spinner"></div>
        <p>${msgs.loading}</p>
      </div>`;
    return;
  }

  if (!Object.keys(treeData).length) {
    panel.innerHTML = `<p class="sc-tree-empty">${msgs.empty}</p>`;
    return;
  }

  const folders = getFoldersAtPath(treeData, currentPath);

  let html = '';
  if (currentPath !== '/') {
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    html += `<a href="#" class="sc-tree-back" data-path="${parentPath}">
      <img class="sc-tree-back-icon" src="icons/Smock_Back_18_N.svg" alt="">
      <span>Up one level</span>
    </a>`;
  }

  if (folders.length) {
    html += `<ul class="sc-tree-root">${folders.map(([name, n]) => `
      <li class="sc-tree-item">
        <div class="sc-tree-folder-row" data-path="${n.path}">
          <img class="sc-tree-icon" src="icons/Smock_Folder_18_N.svg" alt="">
          <span class="sc-tree-label">${name}</span>
          <span class="sc-tree-arrow">▶</span>
        </div>
      </li>`).join('')}</ul>`;
  } else {
    html += '<p class="sc-tree-empty">No subfolders</p>';
  }

  panel.innerHTML = html;

  panel.querySelectorAll('.sc-tree-folder-row').forEach((row) => {
    row.addEventListener('click', () => browseFn(row.dataset.path));
  });

  panel.querySelector('.sc-tree-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    browseFn(e.currentTarget.dataset.path);
  });
}

/* ------------------------------------------------------------------ */
/*  Breadcrumb                                                         */
/* ------------------------------------------------------------------ */

export function renderBreadcrumb(area, currentPath, browseFn) {
  const parts = currentPath.split('/').filter(Boolean);
  const sep = '<span class="sc-bc-sep">/</span>';
  let crumbs = '<a href="#" class="sc-bc-link" data-path="/">root</a>';
  let accumulated = '';

  parts.forEach((p, i) => {
    accumulated += `/${p}`;
    crumbs += i === parts.length - 1
      ? `${sep}<span class="sc-bc-current">${p}</span>`
      : `${sep}<a href="#" class="sc-bc-link" data-path="${accumulated}">${p}</a>`;
  });

  area.innerHTML = `<nav class="sc-breadcrumb">${crumbs}</nav>`;
  area.querySelectorAll('.sc-bc-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      browseFn(link.dataset.path);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Log & Error                                                        */
/* ------------------------------------------------------------------ */

const LOG_ICONS = {
  success: '<img src="icons/CheckmarkSize100.svg" alt="success">',
  error: '<img src="icons/CrossSize100.svg" alt="error">',
  info: '<img src="icons/InfoSmall.svg" alt="info">',
  warn: '<img src="icons/AlertSmall.svg" alt="warning">',
};

export function renderLog(area, log, onClear) {
  if (!log.length) {
    area.innerHTML = '';
    return;
  }

  area.innerHTML = `
    <div class="sc-log">
      <div class="sc-log-header">
        <h3>Activity Log</h3>
        <sl-button class="sc-log-clear">Clear</sl-button>
      </div>
      <div class="sc-log-entries">
        ${log.slice().reverse().map((entry) => `
          <div class="sc-log-entry sc-log-${entry.type}">
            <span class="sc-log-icon">${LOG_ICONS[entry.type] || 'ℹ'}</span>
            <span class="sc-log-time">${entry.time}</span>
            <span>${entry.message}</span>
          </div>
        `).join('')}
      </div>
    </div>`;

  area.querySelector('.sc-log-clear')?.addEventListener('click', () => {
    onClear();
    area.innerHTML = '';
  });

  const entries = area.querySelector('.sc-log-entries');
  if (entries) entries.scrollTop = 0;
}

export function renderError(area, message) {
  area.innerHTML = `<div class="sc-error-banner">${message}</div>`;
}
