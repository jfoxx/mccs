/**
 * News Grid block — fetches from the Base query-index (metadata) and the local index,
 * merges (local wins on duplicate paths), and renders cards. Article links always use
 * the current site origin + content-root, never the Base host.
 *
 * Page metadata (head or frontmatter → meta):
 * - news-base-query-index-url — absolute URL to Base /news/query-index.json (optional)
 * - content-root — path prefix for this site, e.g. /en (optional; default "")
 */

import { getMetadata } from '../../scripts/aem.js';

const QUERY_INDEX_PATH = '/news/query-index.json';
const GRID_COUNT = 8;

/** Meta name: full URL to Base site news index */
const META_NEWS_BASE_QUERY_INDEX_URL = 'news-base-query-index-url';

/** Meta name: site content root path prefix (replaces commerce config getRootPath) */
const META_CONTENT_ROOT = 'content-root';

function getContentRoot() {
  return (getMetadata(META_CONTENT_ROOT) || '').replace(/\/$/, '');
}

function normalizePath(p) {
  return (p || '').replace(/\/$/, '') || '/';
}

/**
 * Index `path` may be a site path (/news/foo) or a full URL; always return a path for linking.
 * @param {string} raw
 * @returns {string|null}
 */
function pathFromIndexField(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const pathAndQuery = `${u.pathname}${u.search || ''}`;
      return pathAndQuery || '/';
    } catch {
      return null;
    }
  }
  return s.startsWith('/') ? s : `/${s}`;
}

/**
 * Join current site base with a path. Do not collapse slashes in the whole string (that breaks `http://`).
 * @param {string} linkBase
 * @param {string} relPath path starting with /
 */
function hrefOnCurrentSite(linkBase, relPath) {
  const base = linkBase.replace(/\/$/, '');
  const path = relPath.startsWith('/') ? relPath : `/${relPath}`;
  return `${base}${path}`;
}

/**
 * @param {string} image
 * @param {string} assetBase origin + optional root, no trailing slash
 */
function resolveAssetUrl(image, assetBase) {
  if (!image || image.startsWith('about:')) return null;
  if (/^https?:\/\//i.test(image)) return image;
  const base = assetBase.replace(/\/$/, '');
  const p = image.startsWith('/') ? image : `/${image}`;
  return `${base}${p}`.replace(/\/+/g, '/');
}

/**
 * @param {object} item query-index row
 * @param {string} assetBase origin (+ site root) for resolving relative images (current site)
 * @param {string} linkBase base for article href (always current site so cards never link off-site)
 */
function mapRow(item, assetBase, linkBase) {
  const relPath = pathFromIndexField(item.path);
  if (!relPath) return null;
  const pathKey = normalizePath(relPath);
  const href = hrefOnCurrentSite(linkBase, relPath);
  const image = resolveAssetUrl(item.image, assetBase);
  if (!image) return null;
  return {
    pathKey,
    path: href,
    title: item.title,
    image,
    type: item.type,
  };
}

function uniqueByPathKey(items) {
  const seen = new Set();
  return items.filter((it) => {
    if (seen.has(it.pathKey)) return false;
    seen.add(it.pathKey);
    return true;
  });
}

/**
 * Local articles first, then Base-only articles until max.
 * @param {{ pathKey: string }[]} localMapped
 * @param {{ pathKey: string }[]} baseMapped
 */
function mergeOrdered(localMapped, baseMapped, max) {
  const localKeys = new Set(localMapped.map((x) => x.pathKey));
  const localSlice = localMapped.slice(0, max);
  if (localSlice.length >= max) return localSlice;
  const baseOnly = baseMapped.filter((b) => !localKeys.has(b.pathKey));
  return [...localSlice, ...baseOnly].slice(0, max);
}

async function fetchIndexData(url) {
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const json = await resp.json();
  const { data = [] } = json;
  return data;
}

/**
 * Fetches articles from Base index (config URL) + local query-index, merged.
 * @returns {Promise<{path: string, title: string, image: string, type: string}[]>}
 */
async function fetchArticles() {
  const root = getContentRoot();
  const siteBase = `${window.location.origin}${root}`;
  const localUrl = `${root}${QUERY_INDEX_PATH}`.replace(/\/+/g, '/');

  const metaBase = getMetadata(META_NEWS_BASE_QUERY_INDEX_URL);
  const baseIndexUrl = metaBase.trim() ? metaBase.trim() : '';

  const [localRaw, baseRaw] = await Promise.all([
    fetchIndexData(localUrl),
    baseIndexUrl ? fetchIndexData(baseIndexUrl) : Promise.resolve([]),
  ]);

  const localMapped = uniqueByPathKey(
    localRaw
      .map((item) => mapRow(item, siteBase, siteBase))
      .filter(Boolean),
  );

  // Base index rows: same paths, but hrefs/images resolve on the current site
  const baseMapped = uniqueByPathKey(
    baseRaw
      .map((item) => mapRow(item, siteBase, siteBase))
      .filter(Boolean),
  );

  const merged = mergeOrdered(localMapped, baseMapped, GRID_COUNT);

  return merged.map((row) => {
    const {
      path, title, image, type,
    } = row;
    return {
      path,
      title,
      image,
      type,
    };
  });
}

export default async function decorate(block) {
  const grid = document.createElement('ul');
  grid.className = 'news-grid-list';

  const articles = await fetchArticles();

  articles.forEach((article) => {
    const {
      path, title, image, type,
    } = article;
    const li = document.createElement('li');
    li.className = 'news-grid-item';

    const a = document.createElement('a');
    a.href = path;

    const bg = document.createElement('span');
    bg.className = 'news-grid-item-bg';
    bg.style.backgroundImage = `url(${image})`;

    const badge = document.createElement('span');
    badge.className = 'news-grid-item-badge';
    badge.textContent = (type || 'news').toUpperCase();

    const titleEl = document.createElement('span');
    titleEl.className = 'news-grid-item-title';
    titleEl.textContent = title;

    a.append(bg, badge, titleEl);
    li.append(a);
    grid.append(li);
  });

  block.replaceChildren(grid);
}
