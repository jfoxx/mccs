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

async function loadOrgConfig(org) {
  const resp = await daFetch(`${CONTENT_ORIGIN}/${org}/.da/msm.json`);
  if (!resp.ok) throw new Error(`MSM config not found at /${org}/.da/msm.json (${resp.status})`);
  const json = await resp.json();
  return json.data ?? json;
}

function detectRole(rows, currentSite) {
  let isPrimary = false;
  let isSatellite = false;

  rows.forEach((r) => {
    const primary = parseSiteCol(r.primary || r.Primary);
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    if (primary === currentSite) isPrimary = true;
    if (satellite === currentSite) isSatellite = true;
  });

  return { isPrimary, isSatellite };
}

function buildPrimaryConfig(rows, currentSite) {
  let primaryTitle = currentSite;
  const satellites = [];

  rows.forEach((r) => {
    const primary = parseSiteCol(r.primary || r.Primary);
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    const title = r.title || r.Title || '';

    if (primary !== currentSite) return;

    if (!satellite) {
      primaryTitle = title || currentSite;
    } else {
      satellites.push({ name: title || satellite, site: satellite });
    }
  });

  return { title: primaryTitle, satellites };
}

function buildSatelliteConfig(rows, currentSite) {
  let sourceSite = '';
  let myTitle = currentSite;

  rows.forEach((r) => {
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    if (satellite === currentSite) {
      sourceSite = parseSiteCol(r.primary || r.Primary);
      myTitle = (r.title || r.Title) || currentSite;
    }
  });

  let sourceTitle = sourceSite;
  rows.forEach((r) => {
    const primary = parseSiteCol(r.primary || r.Primary);
    const satellite = parseSiteCol(r.satellite || r.Satellite);
    if (primary === sourceSite && !satellite) {
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
    const { isPrimary, isSatellite } = detectRole(rows, site);

    const app = $('#app');

    if (isPrimary) {
      const config = buildPrimaryConfig(rows, site);
      app.innerHTML = `
        <header class="mc-header">
          <h1>MSM Console</h1>
          <span class="mc-role-badge mc-role-primary">Primary</span>
          <span class="mc-org-badge">${config.title}</span>
        </header>
        <div id="main-content"></div>
      `;
      const { initPrimary } = await import('./views/primary.js');
      initPrimary({
        org, site, token, config, container: $('#main-content'),
      });
    } else if (isSatellite) {
      const config = buildSatelliteConfig(rows, site);
      app.innerHTML = `
        <header class="mc-header">
          <h1>MSM Console</h1>
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
      throw new Error(`Site "${site}" is not listed as a primary or satellite in the MSM config`);
    }
  } catch (err) {
    const app = $('#app');
    app.innerHTML = `
      <div class="mc-error-banner">
        ${err.message}.<br>
        Ensure <code>msm.json</code> exists in your org's <code>.da</code> folder.
      </div>`;
  }
  document.body.style.display = '';
}

init();
