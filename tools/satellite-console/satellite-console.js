// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import { daFetch } from 'https://da.live/nx/utils/daFetch.js';

const CONTENT_ORIGIN = 'https://content.da.live';

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

function parseSiteCol(raw) {
  const parts = (raw || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/** Base site column in Satellite.json (legacy: primary / Primary). */
function parseBaseCol(row) {
  return parseSiteCol(row.base || row.Base || row.primary || row.Primary);
}

async function loadOrgConfig(org) {
  const resp = await daFetch(`${CONTENT_ORIGIN}/${org}/.da/satellites.json`);
  if (!resp.ok) throw new Error(`Satellite config not found at /${org}/.da/satellites.json (${resp.status})`);
  const json = await resp.json();
  return json.data ?? json;
}

function detectRole(rows, currentSite) {
  let isBase = false;
  let isSatellite = false;

  rows.forEach((r) => {
    const base = parseBaseCol(r);
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    if (base === currentSite) isBase = true;
    if (satellite === currentSite) isSatellite = true;
  });

  return { isBase, isSatellite };
}

function buildBaseConfig(rows, currentSite) {
  let baseTitle = currentSite;
  const satellites = [];

  rows.forEach((r) => {
    const base = parseBaseCol(r);
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    const title = r.title || r.Title || '';

    if (base !== currentSite) return;

    if (!satellite) {
      baseTitle = title || currentSite;
    } else {
      satellites.push({ name: title || satellite, site: satellite });
    }
  });

  return { title: baseTitle, satellites };
}

function buildSatelliteConfig(rows, currentSite) {
  let sourceSite = '';
  let myTitle = currentSite;

  rows.forEach((r) => {
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    if (satellite === currentSite) {
      sourceSite = parseBaseCol(r);
      myTitle = (r.title || r.Title) || currentSite;
    }
  });

  let sourceTitle = sourceSite;
  rows.forEach((r) => {
    const base = parseBaseCol(r);
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    if (base === sourceSite && !satellite) {
      sourceTitle = (r.title || r.Title) || sourceSite;
    }
  });

  return {
    title: myTitle,
    source: { name: sourceTitle, site: sourceSite },
  };
}

/* ------------------------------------------------------------------ */
/*  Init                                                               */
/* ------------------------------------------------------------------ */

async function init() {
  try {
    const { context, token, actions } = await DA_SDK;
    const { org, repo: site } = context;

    const rows = await loadOrgConfig(org);
    const { isBase, isSatellite } = detectRole(rows, site);

    const app = $('#app');

    if (isBase) {
      const config = buildBaseConfig(rows, site);
      app.innerHTML = `
        <header class="mc-header">
          <h1>Satellite Console</h1>
          <span class="mc-role-badge mc-role-base">Base</span>
          <span class="mc-org-badge">${config.title}</span>
        </header>
        <div id="main-content"></div>
      `;
      const { initBase } = await import('./views/base.js');
      initBase({
        org, site, token, config, container: $('#main-content'),
      });
    } else if (isSatellite) {
      const config = buildSatelliteConfig(rows, site);
      app.innerHTML = `
        <header class="mc-header">
          <h1>Satellite Console</h1>
          <span class="mc-role-badge mc-role-satellite">Satellite</span>
          <span class="mc-org-badge">${config.title}</span>
        </header>
        <div id="main-content"></div>
      `;
      const { initSatellite } = await import('./views/satellite.js');
      initSatellite({
        org, site, token, actions, config, container: $('#main-content'),
      });
    } else {
      throw new Error(`Site "${site}" is not listed as a base or satellite in the satellite config`);
    }
  } catch (err) {
    const app = $('#app');
    app.innerHTML = `
      <div class="mc-error-banner">
        ${err.message}.<br>
        Ensure <code>satellites.json</code> exists in your org's <code>.da</code> folder.
      </div>`;
  }
  document.body.style.display = '';
}

init();
