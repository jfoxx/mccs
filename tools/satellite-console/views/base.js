// eslint-disable-next-line import/no-unresolved
import { daFetch } from 'https://da.live/nx/utils/daFetch.js';
// eslint-disable-next-line import/no-unresolved
import { crawl } from 'https://da.live/nx/public/utils/tree.js';

const DA_ORIGIN = 'https://admin.da.live';
const AEM_ORIGIN = 'https://admin.hlx.page';

const state = {
  org: '',
  site: '',
  token: '',
  sites: [],
  currentPath: '/',
  pages: [],
  folders: [],
  siteContent: {},
  actions: {},
  statuses: {},
  previewDone: false,
  isProcessing: false,
  filter: '',
  log: [],
  treeData: {},
  treeLoading: false,
};

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

async function listPath(path) {
  const clean = path.replace(/\/+$/, '') || '/';
  const resp = await daFetch(`${DA_ORIGIN}/list/${state.org}/${state.site}${clean}`);
  if (!resp.ok) throw new Error(`Could not list ${clean}`);
  return resp.json();
}

async function listSitePath(targetSite, path) {
  try {
    const clean = path.replace(/\/+$/, '') || '/';
    const resp = await daFetch(`${DA_ORIGIN}/list/${state.org}/${targetSite}${clean}`);
    if (!resp.ok) return [];
    return resp.json();
  } catch {
    return [];
  }
}

async function aemAdminPost(action, targetSite, pagePath) {
  const aemPath = pagePath.replace(/\.html$/, '');
  const resp = await daFetch(
    `${AEM_ORIGIN}/${action}/${state.org}/${targetSite}/main${aemPath}`,
    {
      method: 'POST',
    },
  );
  return resp.ok;
}

async function previewPage(targetSite, pagePath) {
  return aemAdminPost('preview', targetSite, pagePath);
}

async function publishPage(targetSite, pagePath) {
  return aemAdminPost('live', targetSite, pagePath);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function actionKey(pageName, targetSite) {
  return `${pageName}::${targetSite}`;
}

function getPagePath(pageName) {
  const base = state.currentPath.replace(/\/+$/, '');
  return `${base}/${pageName}`;
}

function previewUrl(targetSite, pagePath) {
  let aemPath = pagePath.replace(/\.html$/, '');
  // Folder index pages: canonical URL is …/dir/ not …/dir/index
  if (/\/index$/i.test(aemPath)) {
    aemPath = aemPath.replace(/\/index$/i, '/');
    if (aemPath === '') aemPath = '/';
  }
  return `https://main--${targetSite}--${state.org}.aem.page${aemPath}`;
}

function addLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  state.log.push({ message, type, time });
  renderLog();
}

function getActionSummary() {
  let include = 0;
  Object.entries(state.actions).forEach(([, action]) => {
    if (action === 'overwrite') include += 1;
  });
  return { include, total: include };
}

/* ------------------------------------------------------------------ */
/*  Browse & Check                                                     */
/* ------------------------------------------------------------------ */

async function browse(path) {
  state.currentPath = path;
  state.pages = [];
  state.folders = [];
  state.siteContent = {};
  state.actions = {};
  state.statuses = {};
  state.previewDone = false;
  state.filter = '';

  renderResults(true);

  try {
    const items = await listPath(path);
    state.folders = items.filter((i) => i['content-type'] === 'application/folder');
    state.pages = items.filter((i) => i.ext === 'html');

    await checkSiteExistence(path);

    state.pages.forEach((page) => {
      state.sites.forEach((site) => {
        const key = actionKey(page.name, site.site);
        const exists = state.siteContent[site.site]?.has(page.name);
        state.actions[key] = 'skip';
        state.statuses[key] = exists ? 'exists' : 'missing';
      });
    });

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
  state.siteContent = {};
  state.actions = {};
  state.statuses = {};
  state.previewDone = false;
  state.filter = '';

  renderResults(true);

  try {
    state.pages = [{ name: fileName, ext: 'html' }];

    await checkSiteExistence(parentPath);

    state.pages.forEach((page) => {
      state.sites.forEach((site) => {
        const key = actionKey(page.name, site.site);
        const exists = state.siteContent[site.site]?.has(page.name);
        state.actions[key] = 'skip';
        state.statuses[key] = exists ? 'exists' : 'missing';
      });
    });

    renderResults();
  } catch (err) {
    renderError(err.message);
  }
}

async function checkSiteExistence(path) {
  const checks = state.sites.map(async (site) => {
    const items = await listSitePath(site.site, path);
    state.siteContent[site.site] = new Set(
      items.filter((i) => i.ext === 'html').map((i) => i.name),
    );
  });
  await Promise.all(checks);
}

/* ------------------------------------------------------------------ */
/*  Page Tree                                                          */
/* ------------------------------------------------------------------ */

async function loadTree() {
  state.treeLoading = true;
  renderTree();

  try {
    const files = [];
    const path = `/${state.org}/${state.site}/`;
    const basePath = `/${state.org}/${state.site}`;

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
    addLog(`Failed to load page tree: ${err.message}`, 'error');
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
      <div class="sc-tree-loading">
        <div class="sc-spinner"></div>
        <p>Loading page tree…</p>
      </div>`;
    return;
  }

  const hasNodes = Object.keys(state.treeData).length > 0;
  if (!hasNodes) {
    panel.innerHTML = '<p class="sc-tree-empty">No pages found.</p>';
    return;
  }

  panel.innerHTML = `
    <ul class="sc-tree-root">
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
        return `<li class="sc-tree-item sc-tree-file" data-path="${node.path}">
          <img class="sc-tree-icon" src="${fileIcon}" alt="">
          <span class="sc-tree-label">${displayName}</span>
        </li>`;
      }
      const hasChildren = Object.keys(node.children).length > 0;
      return `<li class="sc-tree-item sc-tree-folder">
        <div class="sc-tree-folder-row" data-path="${node.path}">
          <span class="sc-tree-arrow">▶</span>
          <img class="sc-tree-icon" src="icons/Smock_Folder_18_N.svg" alt="">
          <span class="sc-tree-label">${name}</span>
        </div>
        ${hasChildren ? `<ul class="sc-tree-children hidden">
          ${renderTreeNodes(node.children)}
        </ul>` : ''}
      </li>`;
    })
    .join('');
}

function bindTreeEvents() {
  document.querySelectorAll('.sc-tree-folder-row').forEach((row) => {
    row.addEventListener('click', () => {
      const children = row.nextElementSibling;
      if (children) {
        children.classList.toggle('hidden');
        const isOpen = !children.classList.contains('hidden');
        const arrow = row.querySelector('.sc-tree-arrow');
        arrow.textContent = isOpen ? '▼' : '▶';
        const icon = row.querySelector('.sc-tree-icon');
        icon.src = isOpen
          ? 'icons/Smock_FolderOpen_18_N.svg'
          : 'icons/Smock_Folder_18_N.svg';
      }
      highlightTreeItem(row);
      browse(row.dataset.path);
    });
  });

  document.querySelectorAll('.sc-tree-file').forEach((file) => {
    file.addEventListener('click', () => {
      highlightTreeItem(file);
      browseSinglePage(file.dataset.path);
    });
  });
}

function highlightTreeItem(el) {
  document.querySelectorAll('.sc-tree-active').forEach((item) => {
    item.classList.remove('sc-tree-active');
  });
  el.classList.add('sc-tree-active');
}

/* ------------------------------------------------------------------ */
/*  Preview & Publish                                                  */
/* ------------------------------------------------------------------ */

async function runPreview() {
  const tasks = [];
  Object.entries(state.actions).forEach(([key, action]) => {
    if (action === 'skip') return;
    const [pageName, targetSite] = key.split('::');
    tasks.push({ pageName, targetSite, action });
  });

  if (!tasks.length) return;

  state.isProcessing = true;
  renderActionBar();

  const total = tasks.length;
  renderProgress(0, total, 'Starting preview…');

  await tasks.reduce(async (prev, task, i) => {
    await prev;
    const pagePath = getPagePath(task.pageName);
    const key = actionKey(task.pageName, task.targetSite);

    try {
      addLog(`Previewing ${task.pageName} at ${task.targetSite}`, 'info');
      const previewed = await previewPage(task.targetSite, pagePath);
      if (previewed) {
        addLog(`Previewed ${task.pageName} at ${task.targetSite}`, 'success');
        state.statuses[key] = 'previewed';
      } else {
        addLog(`Failed to preview ${task.pageName} at ${task.targetSite}`, 'error');
        state.statuses[key] = 'error';
      }
    } catch (err) {
      addLog(`Error: ${err.message}`, 'error');
      state.statuses[key] = 'error';
    }

    renderProgress(i + 1, total, `Previewing ${i + 1}/${total}`);
    renderResultsCells();
  }, Promise.resolve());

  state.isProcessing = false;
  state.previewDone = true;
  renderProgress(total, total, 'Preview complete');
  renderActionBar();
}

async function runPublish() {
  const tasks = [];
  Object.entries(state.statuses).forEach(([key, status]) => {
    if (status !== 'previewed') return;
    const [pageName, targetSite] = key.split('::');
    tasks.push({ pageName, targetSite });
  });

  if (!tasks.length) return;

  state.isProcessing = true;
  renderActionBar();

  const total = tasks.length;
  renderProgress(0, total, 'Starting publish…');

  await tasks.reduce(async (prev, task, i) => {
    await prev;
    const pagePath = getPagePath(task.pageName);
    const key = actionKey(task.pageName, task.targetSite);

    try {
      addLog(`Publishing ${task.pageName} at ${task.targetSite}`, 'info');
      const published = await publishPage(task.targetSite, pagePath);
      if (published) {
        addLog(`Published ${task.pageName} at ${task.targetSite}`, 'success');
        state.statuses[key] = 'published';
      } else {
        addLog(`Failed to publish ${task.pageName} at ${task.targetSite}`, 'error');
        state.statuses[key] = 'error';
      }
    } catch (err) {
      addLog(`Error: ${err.message}`, 'error');
      state.statuses[key] = 'error';
    }

    renderProgress(i + 1, total, `Published ${i + 1}/${total}`);
    renderResultsCells();
  }, Promise.resolve());

  state.isProcessing = false;
  renderProgress(total, total, 'Publish complete');
  renderActionBar();
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function render(container) {
  container.innerHTML = `
    <section class="sc-sites">
      <h3>Satellite Sites</h3>
      <div class="sc-site-chips">
        ${state.sites.map((s) => `<span class="sc-chip">${s.name}</span>`).join('')}
      </div>
    </section>

    <div class="sc-layout">
      <aside class="sc-tree-panel">
        <div class="sc-tree-header">
          <h3>Page Tree</h3>
        </div>
        <div class="sc-tree-body" id="tree-panel">
          <div class="sc-tree-loading">
            <div class="sc-spinner"></div>
            <p>Loading page tree…</p>
          </div>
        </div>
      </aside>

      <div class="sc-content">
        <div id="breadcrumb-area"></div>
        <div id="results-area">
          <div class="sc-empty">
            <div class="sc-empty-icon">📂</div>
            <h3>Select a folder</h3>
            <p>Choose a folder from the page tree to browse its content.</p>
          </div>
        </div>
        <div id="action-area"></div>
        <div id="progress-area"></div>
        <div id="log-area"></div>
      </div>
    </div>
  `;

  loadTree();
}

function renderBreadcrumb() {
  const parts = state.currentPath.split('/').filter(Boolean);
  let crumbs = '<a href="#" class="sc-bc-link" data-path="/">root</a>';
  let accumulated = '';
  parts.forEach((p, i) => {
    accumulated += `/${p}`;
    const sep = '<span class="sc-bc-sep">/</span>';
    if (i === parts.length - 1) {
      crumbs += `${sep}<span class="sc-bc-current">${p}</span>`;
    } else {
      crumbs += `${sep}<a href="#" class="sc-bc-link" data-path="${accumulated}">${p}</a>`;
    }
  });

  const area = $('#breadcrumb-area');
  area.innerHTML = `<nav class="sc-breadcrumb">${crumbs}</nav>`;
  area.querySelectorAll('.sc-bc-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      browse(link.dataset.path);
    });
  });
}

function renderResults(loading = false) {
  if (loading) {
    $('#results-area').innerHTML = `
      <div class="sc-results-card">
        <div class="sc-loading" style="min-height:200px">
          <div class="sc-spinner"></div>
          <p>Loading content…</p>
        </div>
      </div>`;
    return;
  }

  renderBreadcrumb();

  const hasContent = state.pages.length > 0 || state.folders.length > 0;
  if (!hasContent) {
    $('#results-area').innerHTML = `
      <div class="sc-results-card">
        <div class="sc-empty">
          <div class="sc-empty-icon">📂</div>
          <h3>No content found</h3>
          <p>No pages found at <strong>${state.currentPath}</strong>. Try a different path.</p>
        </div>
      </div>`;
    $('#action-area').innerHTML = '';
    return;
  }

  let foldersHtml = '';
  if (state.folders.length) {
    foldersHtml = `<div class="sc-folders">
      ${state.folders.map((f) => {
    const folderPath = `${state.currentPath.replace(/\/+$/, '')}/${f.name}`;
    return `<a href="#" class="sc-folder" data-path="${folderPath}">
              <span class="sc-folder-icon">📁</span>${f.name}
            </a>`;
  }).join('')}
    </div>`;
  }

  const filterHtml = state.pages.length > 0
    ? `<div class="sc-filter-row">
        <sl-input id="filter-input" type="text"
               placeholder="Filter results by name…"></sl-input>
      </div>`
    : '';

  const resultsArea = $('#results-area');
  resultsArea.innerHTML = `
    ${foldersHtml}
    <div class="sc-results-card" id="results-card">
      <div class="sc-results-header">
        <h3>Pages</h3>
        <span class="sc-results-count">${state.pages.length} page${state.pages.length !== 1 ? 's' : ''}</span>
      </div>
      ${filterHtml}
      <div class="sc-table-wrap" id="table-wrap"></div>
    </div>`;

  renderResultsTable();

  $('#filter-input')?.addEventListener('input', (e) => {
    state.filter = e.target.value.toLowerCase();
    renderResultsTable();
  });

  resultsArea.querySelectorAll('.sc-folder').forEach((f) => {
    f.addEventListener('click', (e) => {
      e.preventDefault();
      browse(f.dataset.path);
    });
  });

  renderActionBar();
}

function renderResultsTable() {
  const wrap = $('#table-wrap');
  if (!wrap) return;

  const filtered = state.filter
    ? state.pages.filter((p) => p.name.toLowerCase().includes(state.filter))
    : state.pages;

  wrap.innerHTML = `
    <table class="sc-table">
      <thead>
        <tr>
          <th>Page</th>
          ${state.sites.map((s) => {
    const actionable = state.pages.filter((p) => {
      const st = state.statuses[actionKey(p.name, s.site)];
      return !['previewed', 'published', 'error'].includes(st);
    });
    const allChecked = actionable.length > 0
      && actionable.every((p) => state.actions[actionKey(p.name, s.site)] === 'overwrite');
    return `<th>
            <label class="sc-bulk-check">
              <input type="checkbox" class="sc-bulk-checkbox" data-site="${s.site}" ${allChecked ? 'checked' : ''}>
              ${s.name}
            </label>
          </th>`;
  }).join('')}
        </tr>
      </thead>
      <tbody>
        ${filtered.map((page) => renderRow(page)).join('')}
      </tbody>
    </table>`;

  if (!filtered.length) {
    wrap.innerHTML += `<div class="sc-empty" style="padding:24px">
      <p>No pages match the filter.</p>
    </div>`;
  }

  bindTableEvents();
}

function renderRow(page) {
  const pagePath = getPagePath(page.name);
  const displayName = page.name.replace(/\.html$/, '');

  const cells = state.sites.map((site) => {
    const key = actionKey(page.name, site.site);
    const status = state.statuses[key] || 'missing';
    const action = state.actions[key] || 'skip';
    return renderSiteCell(key, status, action, site.site, pagePath);
  });

  return `<tr data-page="${page.name}">
    <td>
      <span class="sc-page-name">${displayName}</span>
      <span class="sc-page-path">${pagePath}</span>
    </td>
    ${cells.join('')}
  </tr>`;
}

function renderSiteCell(key, status, currentAction, targetSite, pagePath) {
  const badgeMap = {
    exists: '<span class="sc-badge sc-badge-exists">Exists</span>',
    missing: '<span class="sc-badge sc-badge-missing">Not found</span>',
    previewed: '<span class="sc-badge sc-badge-previewed">Previewed</span>',
    published: '<span class="sc-badge sc-badge-published">Published</span>',
    error: '<span class="sc-badge sc-badge-error">Error</span>',
  };

  const badge = badgeMap[status] || badgeMap.missing;

  const isProcessed = ['previewed', 'published', 'error'].includes(status);
  const disabled = isProcessed || state.isProcessing ? 'disabled' : '';
  const checked = currentAction === 'overwrite' ? 'checked' : '';

  let previewLink = '';
  if (status === 'previewed' || status === 'published') {
    const url = previewUrl(targetSite, pagePath);
    previewLink = `<a href="${url}" target="_blank" class="sc-preview-link">↗ Preview</a>`;
  }

  return `<td data-key="${key}">
    <div class="sc-site-cell">
      <div class="sc-site-status">${badge}</div>
      <input type="checkbox" class="sc-action-checkbox" data-key="${key}" ${checked} ${disabled}>
      ${previewLink}
    </div>
  </td>`;
}

function renderResultsCells() {
  document.querySelectorAll('.sc-action-checkbox').forEach((cb) => {
    const { key } = cb.dataset;
    const status = state.statuses[key];
    const td = cb.closest('td');
    if (!td) return;

    const [pageName, targetSite] = key.split('::');
    const pagePath = getPagePath(pageName);
    const action = state.actions[key] || 'skip';
    td.innerHTML = renderSiteCell(key, status, action, targetSite, pagePath)
      .replace(/^<td[^>]*>/, '').replace(/<\/td>$/, '');
  });

  bindTableEvents();
}

function renderActionBar() {
  const area = $('#action-area');
  if (!state.pages.length) {
    area.innerHTML = '';
    return;
  }

  const summary = getActionSummary();
  const hasWork = summary.total > 0;
  const hasPreviewed = Object.values(state.statuses).some((s) => s === 'previewed');

  area.innerHTML = `
    <div class="sc-action-bar">
      <div class="sc-action-buttons">
        <sl-button id="preview-btn"
                ${!hasWork || state.isProcessing ? 'disabled' : ''}>
          Preview Selected (${summary.total})
        </sl-button>
        <sl-button id="publish-btn"
                ${!hasPreviewed || state.isProcessing ? 'disabled' : ''}>
          Publish Previewed
        </sl-button>
      </div>
      <div class="sc-action-summary">
        <strong>${summary.include}</strong> included ·
        <strong>${state.pages.length * state.sites.length - summary.total}</strong> skipped
      </div>
    </div>`;

  $('#preview-btn')?.addEventListener('click', runPreview);
  $('#publish-btn')?.addEventListener('click', runPublish);
}

function renderProgress(current, total, message) {
  const area = $('#progress-area');
  const pct = total ? Math.round((current / total) * 100) : 0;
  const done = current === total ? ' done' : '';

  area.innerHTML = `
    <div class="sc-progress">
      <div class="sc-progress-info">
        <span>${message}</span>
        <span>${pct}%</span>
      </div>
      <div class="sc-progress-bar">
        <div class="sc-progress-fill${done}" style="width:${pct}%"></div>
      </div>
    </div>`;
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
    <div class="sc-log">
      <div class="sc-log-header">
        <h3>Activity Log</h3>
        <sl-button id="clear-log-btn">Clear</sl-button>
      </div>
      <div class="sc-log-entries">
        ${state.log.slice().reverse().map((entry) => `
          <div class="sc-log-entry sc-log-${entry.type}">
            <span class="sc-log-icon">${iconMap[entry.type] || 'ℹ'}</span>
            <span class="sc-log-time">${entry.time}</span>
            <span>${entry.message}</span>
          </div>
        `).join('')}
      </div>
    </div>`;

  $('#clear-log-btn')?.addEventListener('click', () => {
    state.log = [];
    area.innerHTML = '';
  });

  const entries = area.querySelector('.sc-log-entries');
  if (entries) entries.scrollTop = 0;
}

function renderError(message) {
  const area = $('#results-area');
  area.innerHTML = `<div class="sc-error-banner">${message}</div>`;
}

/* ------------------------------------------------------------------ */
/*  Event Binding                                                      */
/* ------------------------------------------------------------------ */

function bindTableEvents() {
  document.querySelectorAll('.sc-action-checkbox').forEach((cb) => {
    cb.removeEventListener('change', onActionChange);
    cb.addEventListener('change', onActionChange);
  });

  document.querySelectorAll('.sc-bulk-checkbox').forEach((cb) => {
    cb.removeEventListener('change', onBulkAction);
    cb.addEventListener('change', onBulkAction);
  });
}

function onActionChange(e) {
  const { key } = e.target.dataset;
  state.actions[key] = e.target.checked ? 'overwrite' : 'skip';
  renderActionBar();
}

function onBulkAction(e) {
  const targetSite = e.target.dataset.site;
  const include = e.target.checked;

  state.pages.forEach((page) => {
    const key = actionKey(page.name, targetSite);
    const status = state.statuses[key];
    if (['previewed', 'published', 'error'].includes(status)) return;

    state.actions[key] = include ? 'overwrite' : 'skip';
  });

  renderResultsTable();
  renderActionBar();
}

/* ------------------------------------------------------------------ */
/*  Init                                                               */
/* ------------------------------------------------------------------ */

export function initBase({
  org, site, token, config, container,
}) {
  state.org = org;
  state.site = site;
  state.token = token;
  state.sites = config.satellites;
  render(container);
}
