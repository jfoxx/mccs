// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import { daFetch } from 'https://da.live/nx/utils/daFetch.js';

const DA_ORIGIN = 'https://admin.da.live';
const CONTENT_ORIGIN = 'https://content.da.live';

const state = {
  org: '',
  site: '',
  token: '',
  path: '',
  source: { name: '', site: '' },
  sourceExists: false,
  phase: 'ready',
  message: '',
  actions: null,
};

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ */
/*  Config & API                                                       */
/* ------------------------------------------------------------------ */

function parseSiteCol(raw) {
  const parts = (raw || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function parseBaseCol(row) {
  return parseSiteCol(row.base || row.Base || row.primary || row.Primary);
}

async function loadConfig() {
  const resp = await daFetch(
    `${CONTENT_ORIGIN}/${state.org}/.da/satellites.json`,
  );
  if (!resp.ok) throw new Error(`Satellite config not found at /${state.org}/.da/satellites.json (${resp.status})`);
  const json = await resp.json();
  const rows = json.data ?? json;

  let sourceSite = '';
  rows.forEach((r) => {
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    if (satellite === state.site) {
      sourceSite = parseBaseCol(r);
    }
  });

  if (!sourceSite) throw new Error(`Site "${state.site}" is not listed as a satellite in the satellite config`);

  let sourceTitle = sourceSite;
  rows.forEach((r) => {
    const base = parseBaseCol(r);
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    if (base === sourceSite && !satellite) {
      sourceTitle = (r.title || r.Title) || sourceSite;
    }
  });

  state.source = { name: sourceTitle, site: sourceSite };
}

function pagePath() {
  const clean = state.path.replace(/\.html$/, '');
  return `${clean}.html`;
}

async function checkSourceExists() {
  try {
    const resp = await daFetch(
      `${DA_ORIGIN}/source/${state.org}/${state.source.site}${pagePath()}`,
      { method: 'HEAD' },
    );
    state.sourceExists = resp.ok;
  } catch {
    state.sourceExists = false;
  }
}

async function fetchSourceContent() {
  const resp = await daFetch(
    `${DA_ORIGIN}/source/${state.org}/${state.source.site}${pagePath()}`,
  );
  if (!resp.ok) throw new Error(`Failed to fetch source (${resp.status})`);
  return rewriteLinks(await resp.text());
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

function extractMainContent(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const main = doc.querySelector('main');
  return main ? main.innerHTML : doc.body.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

async function handleOverwrite() {
  state.phase = 'loading';
  state.message = 'Overwriting with source content…';
  renderStatus();

  try {
    const html = await fetchSourceContent();
    const fileName = pagePath().split('/').pop();
    const blob = new Blob([html], { type: 'text/html' });
    const body = new FormData();
    body.append('data', blob, fileName);

    const putResp = await daFetch(
      `${DA_ORIGIN}/source/${state.org}/${state.site}${pagePath()}`,
      { method: 'PUT', body },
    );

    if (!putResp.ok) throw new Error(`Failed to save (${putResp.status})`);

    state.phase = 'overwrite-done';
    state.message = 'Content overwritten successfully.';
  } catch (err) {
    state.phase = 'error';
    state.message = err.message;
  }

  renderStatus();
}

async function handleMerge() {
  state.phase = 'loading';
  state.message = 'Merging source content…';
  renderStatus();

  try {
    const html = await fetchSourceContent();
    const content = extractMainContent(html);
    state.actions.sendHTML(content);

    state.phase = 'merge-done';
    state.message = 'Source content merged into your document.';
  } catch (err) {
    state.phase = 'error';
    state.message = err.message;
  }

  renderStatus();
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function renderStatus() {
  const el = $('#cs-status');
  if (!el) return;

  if (state.phase === 'ready' || state.phase === 'confirm') {
    el.innerHTML = '';
    return;
  }

  const icons = {
    loading: '<div class="cs-spinner-sm"></div>',
    'overwrite-done': '<img src="../msm/icons/CheckmarkSize100.svg" alt="" class="cs-status-icon cs-icon-success">',
    'merge-done': '<img src="../msm/icons/CheckmarkSize100.svg" alt="" class="cs-status-icon cs-icon-success">',
    error: '<img src="../msm/icons/CrossSize100.svg" alt="" class="cs-status-icon cs-icon-error">',
  };

  const reloadBtn = state.phase === 'overwrite-done'
    ? '<sl-button id="cs-reload" size="small">Reload Page</sl-button>'
    : '';

  el.innerHTML = `
    <div class="cs-status cs-status-${state.phase}">
      ${icons[state.phase] || ''}
      <span>${state.message}</span>
      ${reloadBtn}
    </div>`;

  $('#cs-reload')?.addEventListener('click', () => {
    const editUrl = `https://da.live/edit#/${state.org}/${state.site}${state.path}`;
    state.actions.setHref(editUrl);
  });

  const btns = document.querySelectorAll('.cs-action-btn');
  btns.forEach((btn) => { btn.disabled = state.phase === 'loading'; });
}

function renderConfirm() {
  const el = $('#cs-confirm');
  if (!el) return;

  if (state.phase === 'confirm') {
    el.innerHTML = `
      <div class="cs-confirm-box">
        <p>This will <strong>replace</strong> your current page content with the source version. This cannot be undone.</p>
        <div class="cs-confirm-actions">
          <sl-button id="cs-confirm-yes" variant="primary" size="small">Confirm Overwrite</sl-button>
          <sl-button id="cs-confirm-no" size="small">Cancel</sl-button>
        </div>
      </div>`;

    $('#cs-confirm-yes')?.addEventListener('click', () => {
      el.innerHTML = '';
      handleOverwrite();
    });

    $('#cs-confirm-no')?.addEventListener('click', () => {
      state.phase = 'ready';
      el.innerHTML = '';
    });
  } else {
    el.innerHTML = '';
  }
}

function render() {
  const app = $('#app');

  const sourceStatusHtml = state.sourceExists
    ? '<span class="cs-badge cs-badge-exists">Source available</span>'
    : '<span class="cs-badge cs-badge-missing">Not in source</span>';

  const actionsHtml = state.sourceExists
    ? `<div class="cs-section">
        <div class="cs-label">Sync from Source</div>
        <div class="cs-actions">
          <sl-button class="cs-action-btn" id="cs-btn-overwrite">Overwrite</sl-button>
          <sl-button class="cs-action-btn" id="cs-btn-merge">Merge</sl-button>
        </div>
        <div id="cs-confirm"></div>
        <p class="cs-help">
          <strong>Overwrite</strong> replaces your page with the source version.<br>
          <strong>Merge</strong> inserts source content at your cursor position.
        </p>
      </div>`
    : `<div class="cs-section">
        <p class="cs-no-source">This page does not exist in the source site.</p>
      </div>`;

  app.innerHTML = `
    <div class="cs-panel">
      <div class="cs-section">
        <div class="cs-label">Source</div>
        <div class="cs-source-info">
          <span class="cs-chip">${state.source.name}</span>
          <span class="cs-path">${state.org}/${state.source.site}</span>
        </div>
      </div>

      <div class="cs-section">
        <div class="cs-label">Current Page</div>
        <div class="cs-page-info">
          <code class="cs-page-path">${state.path}</code>
          ${sourceStatusHtml}
        </div>
      </div>

      ${actionsHtml}

      <div id="cs-status"></div>
    </div>
  `;

  $('#cs-btn-overwrite')?.addEventListener('click', () => {
    state.phase = 'confirm';
    renderConfirm();
  });

  $('#cs-btn-merge')?.addEventListener('click', handleMerge);
}

/* ------------------------------------------------------------------ */
/*  Init                                                               */
/* ------------------------------------------------------------------ */

async function init() {
  try {
    const { context, token, actions } = await DA_SDK;
    state.org = context.org;
    state.site = context.repo;
    state.token = token;
    state.path = context.path || '';
    state.actions = actions;

    if (!state.path) throw new Error('No document path — open this plugin while editing a page');

    await loadConfig();
    await checkSourceExists();
    render();
  } catch (err) {
    const app = $('#app');
    app.innerHTML = `
      <div class="cs-error">
        ${err.message}.<br>
        Ensure <code>satellites.json</code> exists in your org's <code>.da</code> folder.
      </div>`;
  }
  document.body.style.display = '';
}

init();
