import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { daFetch } from 'https://da.live/nx/utils/daFetch.js';

const DA_ORIGIN = 'https://admin.da.live';
const AEM_ORIGIN = 'https://admin.hlx.page';
const CONTENT_ORIGIN = 'https://content.da.live';

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
};

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

async function loadConfig() {
  const resp = await daFetch(
    `${CONTENT_ORIGIN}/${state.org}/${state.site}/.da/msm.json`,
  );
  if (!resp.ok) throw new Error(`Failed to load MSM config (${resp.status})`);
  const json = await resp.json();
  const rows = json.data ?? json;
  state.sites = rows.map((r) => {
    const raw = r.site || r.Site || r.url || r.Url || r.URL || r.repo || r.Repo || '';
    const parts = raw.split('/').filter(Boolean);
    const site = parts[parts.length - 1]
      || (r.name || r.Name || '').toLowerCase().replace(/\s+/g, '-');
    return {
      name: r.name || r.Name || site,
      site,
    };
  });
}

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

async function copyContent(pagePath, destSite) {
  const body = new FormData();
  body.append('destination', `/${state.org}/${destSite}${pagePath}`);
  const resp = await daFetch(
    `${DA_ORIGIN}/copy/${state.org}/${state.site}${pagePath}`,
    { method: 'POST', body },
  );
  return resp.ok || resp.status === 204;
}

async function aemAdminPost(action, targetSite, pagePath) {
  const aemPath = pagePath.replace(/\.html$/, '');
  const resp = await daFetch(
    `${AEM_ORIGIN}/${action}/${state.org}/${targetSite}/main${aemPath}`,
    {
      method: 'POST',
      headers: {
        'X-Content-Source-Authorization': `Bearer ${state.token}`,
        'Cache-Control': 'no-cache',
      },
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
  const aemPath = pagePath.replace(/\.html$/, '');
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

  let done = 0;
  const total = tasks.length;
  renderProgress(0, total, 'Starting preview…');

  for (const task of tasks) {
    const pagePath = getPagePath(task.pageName);
    const key = actionKey(task.pageName, task.targetSite);

    try {
      if (task.action === 'overwrite') {
        addLog(`Copying ${task.pageName} → ${task.targetSite}`, 'info');
        const copied = await copyContent(pagePath, task.targetSite);
        if (!copied) {
          addLog(`Failed to copy ${task.pageName} → ${task.targetSite}`, 'error');
          state.statuses[key] = 'error';
          done += 1;
          renderProgress(done, total, `Error copying ${task.pageName}`);
          continue;
        }
        addLog(`Copied ${task.pageName} → ${task.targetSite}`, 'success');
        state.statuses[key] = 'copied';
      }

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

    done += 1;
    renderProgress(done, total, `Processed ${task.pageName} (${done}/${total})`);
    renderResultsCells();
  }

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

  let done = 0;
  const total = tasks.length;
  renderProgress(0, total, 'Starting publish…');

  for (const task of tasks) {
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

    done += 1;
    renderProgress(done, total, `Published ${done}/${total}`);
    renderResultsCells();
  }

  state.isProcessing = false;
  renderProgress(total, total, 'Publish complete');
  renderActionBar();
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function render() {
  const app = $('#app');
  app.innerHTML = `
    <header class="msm-header msm-animate-in">
      <h1>Multi-Site Manager Dashboard</h1>
      <span class="msm-org-badge">${state.org} / ${state.site}</span>
    </header>

    <section class="msm-sites msm-animate-in msm-stagger-1">
      <h3>Satellite Sites</h3>
      <div class="msm-site-chips">
        ${state.sites.map((s) => `<span class="msm-chip">${s.name}</span>`).join('')}
      </div>
    </section>

    <section class="msm-search msm-animate-in msm-stagger-2">
      <label for="path-input">Browse Content Path</label>
      <div class="msm-search-row">
        <input class="msm-input" id="path-input" type="text"
               placeholder="/services or /about" value="${state.currentPath}">
        <button class="msm-btn msm-btn-primary" id="browse-btn">Browse</button>
      </div>
      <div class="msm-filter-row" id="filter-row" style="display:none">
        <input class="msm-input" id="filter-input" type="text"
               placeholder="Filter results by name…">
      </div>
    </section>

    <div id="breadcrumb-area"></div>
    <div id="results-area"></div>
    <div id="action-area"></div>
    <div id="progress-area"></div>
    <div id="log-area"></div>
  `;

  bindCoreEvents();
}

function bindCoreEvents() {
  $('#browse-btn').addEventListener('click', () => {
    const path = $('#path-input').value.trim() || '/';
    browse(path);
  });

  $('#path-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      browse(e.target.value.trim() || '/');
    }
  });

  $('#filter-input')?.addEventListener('input', (e) => {
    state.filter = e.target.value.toLowerCase();
    renderResultsTable();
  });
}

function renderBreadcrumb() {
  const parts = state.currentPath.split('/').filter(Boolean);
  let crumbs = `<a href="#" class="msm-bc-link" data-path="/">root</a>`;
  let accumulated = '';
  parts.forEach((p, i) => {
    accumulated += `/${p}`;
    const sep = '<span class="msm-bc-sep">/</span>';
    if (i === parts.length - 1) {
      crumbs += `${sep}<span class="msm-bc-current">${p}</span>`;
    } else {
      crumbs += `${sep}<a href="#" class="msm-bc-link" data-path="${accumulated}">${p}</a>`;
    }
  });

  const area = $('#breadcrumb-area');
  area.innerHTML = `<nav class="msm-breadcrumb msm-animate-in">${crumbs}</nav>`;
  area.querySelectorAll('.msm-bc-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      browse(link.dataset.path);
    });
  });
}

function renderResults(loading = false) {
  if (loading) {
    $('#results-area').innerHTML = `
      <div class="msm-results-card">
        <div class="msm-loading" style="min-height:200px">
          <div class="msm-spinner"></div>
          <p>Loading content…</p>
        </div>
      </div>`;
    return;
  }

  renderBreadcrumb();

  const hasContent = state.pages.length > 0 || state.folders.length > 0;
  if (!hasContent) {
    $('#results-area').innerHTML = `
      <div class="msm-results-card msm-animate-in">
        <div class="msm-empty">
          <div class="msm-empty-icon">📂</div>
          <h3>No content found</h3>
          <p>No pages found at <strong>${state.currentPath}</strong>. Try a different path.</p>
        </div>
      </div>`;
    $('#action-area').innerHTML = '';
    return;
  }

  if (state.pages.length > 0) {
    const filterRow = $('#filter-row');
    if (filterRow) filterRow.style.display = 'flex';
  }

  let foldersHtml = '';
  if (state.folders.length) {
    foldersHtml = `<div class="msm-folders msm-animate-in">
      ${state.folders.map((f) => {
    const folderPath = `${state.currentPath.replace(/\/+$/, '')}/${f.name}`;
    return `<a href="#" class="msm-folder" data-path="${folderPath}">
              <span class="msm-folder-icon">📁</span>${f.name}
            </a>`;
  }).join('')}
    </div>`;
  }

  const resultsArea = $('#results-area');
  resultsArea.innerHTML = `
    ${foldersHtml}
    <div class="msm-results-card msm-animate-in msm-stagger-1" id="results-card">
      <div class="msm-results-header">
        <h3>Pages</h3>
        <span class="msm-results-count">${state.pages.length} page${state.pages.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="msm-table-wrap" id="table-wrap"></div>
    </div>`;

  renderResultsTable();

  resultsArea.querySelectorAll('.msm-folder').forEach((f) => {
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
    <table class="msm-table">
      <thead>
        <tr>
          <th>Page</th>
          ${state.sites.map((s) => `<th>
            ${s.name}
            <select class="msm-select msm-bulk-select" data-site="${s.site}">
              <option value="">Bulk…</option>
              <option value="skip">All: Skip</option>
              <option value="overwrite">All: Include</option>
            </select>
          </th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${filtered.map((page) => renderRow(page)).join('')}
      </tbody>
    </table>`;

  if (!filtered.length) {
    wrap.innerHTML += `<div class="msm-empty" style="padding:24px">
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
      <span class="msm-page-name">${displayName}</span>
      <span class="msm-page-path">${pagePath}</span>
    </td>
    ${cells.join('')}
  </tr>`;
}

function renderSiteCell(key, status, currentAction, targetSite, pagePath) {
  const badgeMap = {
    exists: '<span class="msm-badge msm-badge-exists">Exists</span>',
    missing: '<span class="msm-badge msm-badge-missing">Not found</span>',
    copied: '<span class="msm-badge msm-badge-copied">Copied</span>',
    previewed: '<span class="msm-badge msm-badge-previewed">Previewed</span>',
    published: '<span class="msm-badge msm-badge-published">Published</span>',
    error: '<span class="msm-badge msm-badge-error">Error</span>',
  };

  const badge = badgeMap[status] || badgeMap.missing;

  const isProcessed = ['previewed', 'published', 'error'].includes(status);
  const disabled = isProcessed || state.isProcessing ? 'disabled' : '';

  let options;
  if (status === 'exists' || status === 'copied') {
    options = `
      <option value="skip" ${currentAction === 'skip' ? 'selected' : ''}>Skip</option>
      <option value="overwrite" ${currentAction === 'overwrite' ? 'selected' : ''}>Overwrite</option>`;
  } else {
    options = `
      <option value="skip" ${currentAction === 'skip' ? 'selected' : ''}>Skip</option>
      <option value="overwrite" ${currentAction === 'overwrite' ? 'selected' : ''}>Include</option>`;
  }

  let previewLink = '';
  if (status === 'previewed' || status === 'published') {
    const url = previewUrl(targetSite, pagePath);
    previewLink = `<a href="${url}" target="_blank" class="msm-preview-link">↗ Preview</a>`;
  }

  return `<td data-key="${key}">
    <div class="msm-site-cell">
      <div class="msm-site-status">${badge}</div>
      <select class="msm-select msm-action-select" data-key="${key}" ${disabled}>
        ${options}
      </select>
      ${previewLink}
    </div>
  </td>`;
}

function renderResultsCells() {
  document.querySelectorAll('.msm-action-select').forEach((sel) => {
    const { key } = sel.dataset;
    const status = state.statuses[key];
    const td = sel.closest('td');
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
    <div class="msm-action-bar msm-animate-in">
      <div class="msm-action-buttons">
        <button class="msm-btn msm-btn-primary" id="preview-btn"
                ${!hasWork || state.isProcessing ? 'disabled' : ''}>
          Preview Selected (${summary.total})
        </button>
        <button class="msm-btn msm-btn-accent" id="publish-btn"
                ${!hasPreviewed || state.isProcessing ? 'disabled' : ''}>
          Publish Previewed
        </button>
      </div>
      <div class="msm-action-summary">
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
    <div class="msm-progress msm-animate-in">
      <div class="msm-progress-info">
        <span>${message}</span>
        <span>${pct}%</span>
      </div>
      <div class="msm-progress-bar">
        <div class="msm-progress-fill${done}" style="width:${pct}%"></div>
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
    success: '✓', error: '✗', info: 'ℹ', warn: '⚠',
  };

  area.innerHTML = `
    <div class="msm-log msm-animate-in">
      <div class="msm-log-header">
        <h3>Activity Log</h3>
        <button class="msm-btn msm-btn-sm msm-btn-secondary" id="clear-log-btn">Clear</button>
      </div>
      <div class="msm-log-entries">
        ${state.log.slice().reverse().map((entry) => `
          <div class="msm-log-entry msm-log-${entry.type}">
            <span class="msm-log-icon">${iconMap[entry.type] || 'ℹ'}</span>
            <span class="msm-log-time">${entry.time}</span>
            <span>${entry.message}</span>
          </div>
        `).join('')}
      </div>
    </div>`;

  $('#clear-log-btn')?.addEventListener('click', () => {
    state.log = [];
    area.innerHTML = '';
  });

  const entries = area.querySelector('.msm-log-entries');
  if (entries) entries.scrollTop = 0;
}

function renderError(message) {
  const area = $('#results-area');
  area.innerHTML = `<div class="msm-error-banner">${message}</div>`;
}

/* ------------------------------------------------------------------ */
/*  Event Binding                                                      */
/* ------------------------------------------------------------------ */

function bindTableEvents() {
  document.querySelectorAll('.msm-action-select').forEach((sel) => {
    sel.removeEventListener('change', onActionChange);
    sel.addEventListener('change', onActionChange);
  });

  document.querySelectorAll('.msm-bulk-select').forEach((sel) => {
    sel.removeEventListener('change', onBulkAction);
    sel.addEventListener('change', onBulkAction);
  });
}

function onActionChange(e) {
  const { key } = e.target.dataset;
  state.actions[key] = e.target.value;
  renderActionBar();
}

function onBulkAction(e) {
  const targetSite = e.target.dataset.site;
  const action = e.target.value;
  if (!action) return;

  state.pages.forEach((page) => {
    const key = actionKey(page.name, targetSite);
    const status = state.statuses[key];
    if (['previewed', 'published', 'error'].includes(status)) return;

    state.actions[key] = action;
  });

  renderResultsTable();
  renderActionBar();
  e.target.value = '';
}

/* ------------------------------------------------------------------ */
/*  Init                                                               */
/* ------------------------------------------------------------------ */

async function init() {
  try {
    const { context, token } = await DA_SDK;
    state.org = context.org;
    state.site = context.repo;
    state.token = token;

    await loadConfig();
    render();
  } catch (err) {
    const app = $('#app');
    app.innerHTML = `
      <div class="msm-error-banner">
        Failed to initialize: ${err.message}.
        This app must run within the DA interface.
      </div>`;
  }
}

init();
