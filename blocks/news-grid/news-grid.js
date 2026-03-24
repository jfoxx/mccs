/**
 * News Grid block — fetches articles from the Base site query-index (absolute URL in
 * config) and the current site's query-index, merges them (local wins on duplicate
 * paths), and displays a grid of cards with background images, type badge, and title.
 */

import { getRootPath, getConfigValue } from '@dropins/tools/lib/aem/configs.js';

const QUERY_INDEX_PATH = '/news/query-index.json';
const GRID_COUNT = 8;

/** Config key: full URL to Base site news index, e.g. https://main--mccs--org.aem.live/news/query-index.json */
const NEWS_BASE_QUERY_INDEX_URL_KEY = 'news-base-query-index-url';

function normalizePath(p) {
  return (p || '').replace(/\/$/, '') || '/';
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
 * @param {string} assetBase origin (+ site root) for resolving relative images
 * @param {string} linkBase same base for article href
 */
function mapRow(item, assetBase, linkBase) {
  const rawPath = item.path;
  if (!rawPath) return null;
  const relPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const pathKey = normalizePath(relPath);
  const href = `${linkBase.replace(/\/$/, '')}${relPath}`.replace(/\/+/g, '/');
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
  const root = (getRootPath() || '').replace(/\/$/, '');
  const siteBase = `${window.location.origin}${root}`;
  const localUrl = `${root}${QUERY_INDEX_PATH}`.replace(/\/+/g, '/');

  let baseIndexUrl = '';
  try {
    const v = getConfigValue(NEWS_BASE_QUERY_INDEX_URL_KEY);
    if (typeof v === 'string' && v.trim()) baseIndexUrl = v.trim();
  } catch {
    baseIndexUrl = '';
  }

  let baseOrigin = '';
  if (baseIndexUrl) {
    try {
      baseOrigin = new URL(baseIndexUrl).origin;
    } catch {
      baseOrigin = '';
    }
  }

  const [localRaw, baseRaw] = await Promise.all([
    fetchIndexData(localUrl),
    baseOrigin ? fetchIndexData(baseIndexUrl) : Promise.resolve([]),
  ]);

  const localMapped = uniqueByPathKey(
    localRaw
      .map((item) => mapRow(item, siteBase, siteBase))
      .filter(Boolean),
  );

  const baseMapped = uniqueByPathKey(
    baseRaw
      .map((item) => mapRow(item, baseOrigin, baseOrigin))
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
