// eslint-disable-next-line import/no-unresolved
import { daFetch } from 'https://da.live/nx/utils/daFetch.js';
// eslint-disable-next-line import/no-unresolved
import { crawl } from 'https://da.live/nx/public/utils/tree.js';

const DA_ORIGIN = 'https://admin.da.live';

const state = {
  org: '',
  site: '',
  token: '',
  source: { name: '', site: '' },
  currentPath: '/',
  pages: [],
  folders: [],
  localPages: new Set(),
  copyStatuses: {},
  filter: '',
  log: [],
  treeData: {},
  treeLoading: false,
};

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

async function listSourcePath(path) {
  const clean = path.replace(/\/+$/, '') || '/';
  const resp = await daFetch(`${DA_ORIGIN}/list/${state.org}/${state.source.site}${clean}`);
  if (!resp.ok) throw new Error(`Could not list source path ${clean}`);
  return resp.json();
}

async function checkLocalExistence(path) {
  try {
    const clean = path.replace(/\/+$/, '') || '/';
    const resp = await daFetch(`${DA_ORIGIN}/list/${state.org}/${state.site}${clean}`);
    if (!resp.ok) return new Set();
    const items = await resp.json();
    return new Set(items.filter((i) => i.ext === 'html').map((i) => i.name));
  } catch {
    return new Set();
  }
}

async function copyPage(pagePath) {
  const sourceResp = await daFetch(
    `${DA_ORIGIN}/source/${state.org}/${state.source.site}${pagePath}`,
  );
  if (!sourceResp.ok) throw new Error(`Failed to read source (${sourceResp.status})`);

  const html = rewriteLinks(await sourceResp.text());
  const blob = new Blob([html], { type: 'text/html' });
  const body = new FormData();
  body.append('data', blob, pagePath.split('/').pop());

  const putResp = await daFetch(
    `${DA_ORIGIN}/source/${state.org}/${state.site}${pagePath}`,
    { method: 'PUT', body },
  );
  return putResp.ok;
}

async function deleteLocalPage(pagePath) {
  const resp = await daFetch(
    `${DA_ORIGIN}/source/${state.org}/${state.site}${pagePath}`,
    { method: 'DELETE' },
  );
  return resp.ok;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rewriteLinks(html) {
  const src = state.source.site;
  const dest = state.site;
  return html
    .replaceAll(`main--${src}--${state.org}.aem.page`, `main--${dest}--${state.org}.aem.page`)
    .replaceAll(`main--${src}--${state.org}.aem.live`, `main--${dest}--${state.org}.aem.live`)
    .replaceAll(`/${state.org}/${src}/`, `/${state.org}/${dest}/`);
}

function editUrl(pagePath) {
  const clean = pagePath.replace(/\.html$/, '');
  return `https://da.live/edit#/${state.org}/${state.site}${clean}`;
}

function getPagePath(pageName) {
  const base = state.currentPath.replace(/\/+$/, '');
  const page = state.pages.find((p) => p.name === pageName);
  const ext = page?.ext;

  let fileName = pageName;
  if (ext && !pageName.toLowerCase().endsWith(`.${String(ext).toLowerCase()}`)) {
    fileName = `${pageName}.${ext}`;
  }

  return `${base}/${fileName}`.replace(/\/+/g, '/');
}

function addLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  state.log.push({ message, type, time });
  renderLog();
}

/* ------------------------------------------------------------------ */
/*  Browse                                                             */
/* ------------------------------------------------------------------ */

async function browse(path) {
  state.currentPath = path;
  state.pages = [];
  state.folders = [];
  state.localPages = new Set();
  state.copyStatuses = {};
  state.filter = '';

  renderResults(true);

  try {
    const items = await listSourcePath(path);
    state.folders = items.filter((i) => i['content-type'] === 'application/folder');
    state.pages = items.filter((i) => i.ext === 'html');
    state.localPages = await checkLocalExistence(path);
    renderResults();
  } catch (err) {
    renderError(err.message);
  }
}

async function browseSinglePage(filePath) {
  const parentPath = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
  const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

  state.currentPath = parentPath;
  state.pages = [];
  state.folders = [];
  state.localPages = new Set();
  state.copyStatuses = {};
  state.filter = '';

  renderResults(true);

  try {
    state.pages = [{ name: fileName, ext: 'html' }];
    state.localPages = await checkLocalExistence(parentPath);
    renderResults();
  } catch (err) {
    renderError(err.message);
  }
}

/* ------------------------------------------------------------------ */
/*  Page Tree (crawls SOURCE site)                                     */
/* ------------------------------------------------------------------ */

async function loadTree() {
  state.treeLoading = true;
  renderTree();

  try {
    const files = [];
    const path = `/${state.org}/${state.source.site}/`;
    const basePath = `/${state.org}/${state.source.site}`;

    const { results } = crawl({
      path,
      callback: (item) => {
        if (item.path.endsWith('.html') || item.path.endsWith('.json')) {
          files.push(item);
        }
      },
      concurrent: 50,
      throttle: 3,
    });

    await results;
    state.treeData = buildTreeStructure(files, basePath);
  } catch (err) {
    state.treeData = {};
    addLog(`Failed to load source tree: ${err.message}`, 'error');
  }

  state.treeLoading = false;
  renderTree();
}

function buildTreeStructure(files, basePath) {
  const tree = {};
  files.forEach((file) => {
    const displayPath = file.path.replace(basePath, '');
    const parts = displayPath.split('/').filter(Boolean);
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

function renderTree() {
  const panel = $('#tree-panel');
  if (!panel) return;

  if (state.treeLoading) {
    panel.innerHTML = `
      <div class="sync-tree-loading">
        <div class="sync-spinner"></div>
        <p>Loading source tree…</p>
      </div>`;
    return;
  }

  const hasNodes = Object.keys(state.treeData).length > 0;
  if (!hasNodes) {
    panel.innerHTML = '<p class="sync-tree-empty">No pages found in source.</p>';
    return;
  }

  panel.innerHTML = `
    <ul class="sync-tree-root">
      ${renderTreeNodes(state.treeData)}
    </ul>`;
  bindTreeEvents();
}

function renderTreeNodes(tree) {
  return Object.entries(tree)
    .sort(([a, aNode], [b, bNode]) => {
      if (!aNode.isFile && bNode.isFile) return -1;
      if (aNode.isFile && !bNode.isFile) return 1;
      return a.localeCompare(b);
    })
    .map(([name, node]) => {
      if (node.isFile) {
        const displayName = name.replace(/\.(html|json)$/, '');
        const isJson = name.endsWith('.json');
        const fileIcon = isJson
          ? 'icons/Smock_FileData_18_N.svg'
          : 'icons/Smock_FileHTML_18_N.svg';
        return `<li class="sync-tree-item sync-tree-file" data-path="${node.path}">
          <img class="sync-tree-icon" src="${fileIcon}" alt="">
          <span class="sync-tree-label">${displayName}</span>
        </li>`;
      }
      const hasChildren = Object.keys(node.children).length > 0;
      return `<li class="sync-tree-item sync-tree-folder">
        <div class="sync-tree-folder-row" data-path="${node.path}">
          <span class="sync-tree-arrow">▶</span>
          <img class="sync-tree-icon" src="icons/Smock_Folder_18_N.svg" alt="">
          <span class="sync-tree-label">${name}</span>
        </div>
        ${hasChildren ? `<ul class="sync-tree-children hidden">
          ${renderTreeNodes(node.children)}
        </ul>` : ''}
      </li>`;
    })
    .join('');
}

function bindTreeEvents() {
  document.querySelectorAll('.sync-tree-folder-row').forEach((row) => {
    row.addEventListener('click', () => {
      const children = row.nextElementSibling;
      if (children) {
        children.classList.toggle('hidden');
        const isOpen = !children.classList.contains('hidden');
        const arrow = row.querySelector('.sync-tree-arrow');
        arrow.textContent = isOpen ? '▼' : '▶';
        const icon = row.querySelector('.sync-tree-icon');
        icon.src = isOpen
          ? 'icons/Smock_FolderOpen_18_N.svg'
          : 'icons/Smock_Folder_18_N.svg';
      }
      highlightTreeItem(row);
      browse(row.dataset.path);
    });
  });

  document.querySelectorAll('.sync-tree-file').forEach((file) => {
    file.addEventListener('click', () => {
      highlightTreeItem(file);
      browseSinglePage(file.dataset.path);
    });
  });
}

function highlightTreeItem(el) {
  document.querySelectorAll('.sync-tree-active').forEach((item) => {
    item.classList.remove('sync-tree-active');
  });
  el.classList.add('sync-tree-active');
}

/* ------------------------------------------------------------------ */
/*  Copy action                                                        */
/* ------------------------------------------------------------------ */

async function onCopy(pageName) {
  const pagePath = getPagePath(pageName);
  state.copyStatuses[pageName] = 'copying';
  renderResultsTable();

  try {
    addLog(`Copying ${pageName} from ${state.source.name}…`, 'info');
    const ok = await copyPage(pagePath);
    if (ok) {
      state.copyStatuses[pageName] = 'copied';
      state.localPages.add(pageName);
      addLog(`Copied ${pageName}`, 'success');
    } else {
      state.copyStatuses[pageName] = 'error';
      addLog(`Failed to copy ${pageName}`, 'error');
    }
  } catch (err) {
    state.copyStatuses[pageName] = 'error';
    addLog(`Error copying ${pageName}: ${err.message}`, 'error');
  }

  renderResultsTable();
}

async function onDelete(pageName) {
  const pagePath = getPagePath(pageName);
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Remove ${pageName} from this site? The file will be deleted; a later rollout will not see a local copy at this path.`)) {
    return;
  }
  state.copyStatuses[pageName] = 'deleting';
  renderResultsTable();

  try {
    addLog(`Deleting ${pageName}…`, 'info');
    const ok = await deleteLocalPage(pagePath);
    if (ok) {
      delete state.copyStatuses[pageName];
      state.localPages.delete(pageName);
      addLog(`Deleted ${pageName}`, 'success');
    } else {
      state.copyStatuses[pageName] = 'error';
      addLog(`Failed to delete ${pageName}`, 'error');
    }
  } catch (err) {
    state.copyStatuses[pageName] = 'error';
    addLog(`Error deleting ${pageName}: ${err.message}`, 'error');
  }

  renderResultsTable();
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function render(container) {
  container.innerHTML = `
    <section class="sync-source-info">
      <h3>Source</h3>
      <div class="sync-source-detail">
        <span class="sync-chip">${state.source.name}</span>
        <span class="sync-source-path">${state.org}/${state.source.site}</span>
      </div>
    </section>

    <div class="sync-layout">
      <aside class="sync-tree-panel">
        <div class="sync-tree-header">
          <h3>Source Pages</h3>
        </div>
        <div class="sync-tree-body" id="tree-panel">
          <div class="sync-tree-loading">
            <div class="sync-spinner"></div>
            <p>Loading source tree…</p>
          </div>
        </div>
      </aside>

      <div class="sync-content">
        <div id="breadcrumb-area"></div>
        <div id="results-area">
          <div class="sync-empty">
            <div class="sync-empty-icon">📂</div>
            <h3>Select a folder or page</h3>
            <p>Browse the source tree to find pages to copy into your site.</p>
          </div>
        </div>
        <div id="log-area"></div>
      </div>
    </div>
  `;

  loadTree();
}

function renderBreadcrumb() {
  const parts = state.currentPath.split('/').filter(Boolean);
  let crumbs = '<a href="#" class="sync-bc-link" data-path="/">root</a>';
  let accumulated = '';
  parts.forEach((p, i) => {
    accumulated += `/${p}`;
    const sep = '<span class="sync-bc-sep">/</span>';
    if (i === parts.length - 1) {
      crumbs += `${sep}<span class="sync-bc-current">${p}</span>`;
    } else {
      crumbs += `${sep}<a href="#" class="sync-bc-link" data-path="${accumulated}">${p}</a>`;
    }
  });

  const area = $('#breadcrumb-area');
  area.innerHTML = `<nav class="sync-breadcrumb">${crumbs}</nav>`;
  area.querySelectorAll('.sync-bc-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      browse(link.dataset.path);
    });
  });
}

function renderResults(loading = false) {
  if (loading) {
    $('#results-area').innerHTML = `
      <div class="sync-results-card">
        <div class="sync-loading" style="min-height:200px">
          <div class="sync-spinner"></div>
          <p>Loading content…</p>
        </div>
      </div>`;
    return;
  }

  renderBreadcrumb();

  const hasContent = state.pages.length > 0 || state.folders.length > 0;
  if (!hasContent) {
    $('#results-area').innerHTML = `
      <div class="sync-results-card">
        <div class="sync-empty">
          <div class="sync-empty-icon">📂</div>
          <h3>No content found</h3>
          <p>No pages found at <strong>${state.currentPath}</strong> in the source site.</p>
        </div>
      </div>`;
    return;
  }

  let foldersHtml = '';
  if (state.folders.length) {
    foldersHtml = `<div class="sync-folders">
      ${state.folders.map((f) => {
    const folderPath = `${state.currentPath.replace(/\/+$/, '')}/${f.name}`;
    return `<a href="#" class="sync-folder" data-path="${folderPath}">
              <span class="sync-folder-icon">📁</span>${f.name}
            </a>`;
  }).join('')}
    </div>`;
  }

  const filterHtml = state.pages.length > 0
    ? `<div class="sync-filter-row">
        <sl-input id="filter-input" type="text"
               placeholder="Filter results by name…"></sl-input>
      </div>`
    : '';

  const resultsArea = $('#results-area');
  resultsArea.innerHTML = `
    ${foldersHtml}
    <div class="sync-results-card" id="results-card">
      <div class="sync-results-header">
        <h3>Pages in Source</h3>
        <span class="sync-results-count">${state.pages.length} page${state.pages.length !== 1 ? 's' : ''}</span>
      </div>
      ${filterHtml}
      <div class="sync-table-wrap" id="table-wrap"></div>
    </div>`;

  renderResultsTable();

  $('#filter-input')?.addEventListener('input', (e) => {
    state.filter = e.target.value.toLowerCase();
    renderResultsTable();
  });

  resultsArea.querySelectorAll('.sync-folder').forEach((f) => {
    f.addEventListener('click', (e) => {
      e.preventDefault();
      browse(f.dataset.path);
    });
  });
}

function renderResultsTable() {
  const wrap = $('#table-wrap');
  if (!wrap) return;

  const filtered = state.filter
    ? state.pages.filter((p) => p.name.toLowerCase().includes(state.filter))
    : state.pages;

  wrap.innerHTML = `
    <table class="sync-table">
      <thead>
        <tr>
          <th>Page</th>
          <th>Local Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((page) => renderRow(page)).join('')}
      </tbody>
    </table>`;

  if (!filtered.length) {
    wrap.innerHTML += `<div class="sync-empty" style="padding:24px">
      <p>No pages match the filter.</p>
    </div>`;
  }

  bindTableEvents();
}

function renderRow(page) {
  const displayName = page.name.replace(/\.html$/, '');
  const pagePath = getPagePath(page.name);
  const existsLocally = state.localPages.has(page.name);
  const copyStatus = state.copyStatuses[page.name];

  let badge;
  let btnLabel;
  let btnDisabled = '';
  let editLink = '';

  if (copyStatus === 'copying') {
    badge = '<span class="sync-badge-status sync-badge-copying">Copying…</span>';
    btnLabel = 'Copying…';
    btnDisabled = 'disabled';
  } else if (copyStatus === 'deleting') {
    badge = '<span class="sync-badge-status sync-badge-copying">Deleting…</span>';
    btnLabel = 'Deleting…';
    btnDisabled = 'disabled';
  } else if (copyStatus === 'copied') {
    badge = '<span class="sync-badge-status sync-badge-copied">Copied</span>';
    btnLabel = 'Copied';
    btnDisabled = 'disabled';
    editLink = `<a href="${editUrl(pagePath)}" target="_blank" class="sync-edit-link">✎ Edit</a>`;
  } else if (copyStatus === 'error') {
    badge = '<span class="sync-badge-status sync-badge-error">Error</span>';
    btnLabel = 'Retry';
  } else if (existsLocally) {
    badge = '<span class="sync-badge-status sync-badge-exists">Exists locally</span>';
    btnLabel = 'Overwrite';
  } else {
    badge = '<span class="sync-badge-status sync-badge-missing">Not found</span>';
    btnLabel = 'Copy';
  }

  const actionsHtml = existsLocally && !['copying', 'deleting', 'copied'].includes(copyStatus || '')
    ? `<span class="sync-action-group">
        <sl-button class="sync-copy-btn" data-page="${page.name}" ${btnDisabled}>${btnLabel}</sl-button>
        <sl-button class="sync-delete-btn" variant="neutral" data-page="${page.name}" ${btnDisabled}>Delete</sl-button>
      </span>`
    : `<sl-button class="sync-copy-btn" data-page="${page.name}" ${btnDisabled}>${btnLabel}</sl-button>`;

  return `<tr data-page="${page.name}">
    <td>
      <span class="sync-page-name">${displayName}</span>
      <span class="sync-page-path">${pagePath}</span>
    </td>
    <td>${badge}</td>
    <td>
      ${actionsHtml}
      ${editLink}
    </td>
  </tr>`;
}

function renderLog() {
  const area = $('#log-area');
  if (!state.log.length) {
    area.innerHTML = '';
    return;
  }

  const iconMap = {
    success: '<img src="icons/CheckmarkSize100.svg" alt="success">',
    error: '<img src="icons/CrossSize100.svg" alt="error">',
    info: '<img src="icons/InfoSmall.svg" alt="info">',
    warn: '<img src="icons/AlertSmall.svg" alt="warning">',
  };

  area.innerHTML = `
    <div class="sync-log">
      <div class="sync-log-header">
        <h3>Activity Log</h3>
        <sl-button id="clear-log-btn">Clear</sl-button>
      </div>
      <div class="sync-log-entries">
        ${state.log.slice().reverse().map((entry) => `
          <div class="sync-log-entry sync-log-${entry.type}">
            <span class="sync-log-icon">${iconMap[entry.type] || 'ℹ'}</span>
            <span class="sync-log-time">${entry.time}</span>
            <span>${entry.message}</span>
          </div>
        `).join('')}
      </div>
    </div>`;

  $('#clear-log-btn')?.addEventListener('click', () => {
    state.log = [];
    area.innerHTML = '';
  });

  const entries = area.querySelector('.sync-log-entries');
  if (entries) entries.scrollTop = 0;
}

function renderError(message) {
  const area = $('#results-area');
  area.innerHTML = `<div class="sync-error-banner">${message}</div>`;
}

/* ------------------------------------------------------------------ */
/*  Event Binding                                                      */
/* ------------------------------------------------------------------ */

function bindTableEvents() {
  document.querySelectorAll('.sync-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { page } = btn.dataset;
      if (page) onCopy(page);
    });
  });
  document.querySelectorAll('.sync-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { page } = btn.dataset;
      if (page) onDelete(page);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Init                                                               */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line import/prefer-default-export
export function initSatellite({
  org, site, config, container,
}) {
  state.org = org;
  state.site = site;
  state.source = config.source;
  render(container);
}
