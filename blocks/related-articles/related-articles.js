/**
 * Related Articles block — fetches news from query-index and renders 4 random link cards.
 * Each card has a desaturated background image, title, and chevron.
 */

import { getRootPath } from '@dropins/tools/lib/aem/configs.js';

const QUERY_INDEX_URL = '/news/query-index.json';
const RELATED_COUNT = 4;

/**
 * Fisher–Yates shuffle.
 * @param {Array} arr
 * @returns {Array} shuffled copy
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fetches articles from query-index and returns 4 random (excluding current page).
 * @returns {Promise<{path: string, title: string, image?: string}[]>}
 */
async function fetchRelatedArticles() {
  const root = (getRootPath() || '').replace(/\/$/, '');
  const url = `${root}${QUERY_INDEX_URL}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];

  const json = await resp.json();
  const { data = [] } = json;
  if (!data.length) return [];

  const currentPath = window.location.pathname.replace(/\/$/, '') || '/index';

  const candidates = data.filter((item) => {
    const itemPath = (item.path || '').replace(/\/$/, '');
    if (!itemPath) return false;
    const itemFullPath = `${root}${itemPath}`.replace(/\/+/g, '/');
    if (itemFullPath === currentPath) return false;
    return item.type === 'news';
  });

  if (candidates.length <= RELATED_COUNT) {
    return candidates.map(({ path, title, image }) => ({ path, title, image }));
  }

  const picked = shuffle(candidates).slice(0, RELATED_COUNT);
  return picked.map(({ path, title, image }) => ({ path, title, image }));
}

function createChevron() {
  const span = document.createElement('span');
  span.className = 'related-articles-chevron';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = '›';
  return span;
}

export default async function decorate(block) {
  const wrapper = document.createElement('div');
  wrapper.className = 'related-articles-card';

  const header = document.createElement('div');
  header.className = 'related-articles-heading-wrap';
  const heading = document.createElement('h2');
  heading.textContent = 'Other Stories';
  heading.className = 'related-articles-heading';
  header.append(heading);
  wrapper.append(header);

  const list = document.createElement('ul');
  list.className = 'related-articles-list';

  // Check for existing links from document (importer)
  const existingLinks = [...block.querySelectorAll('a[href]')];
  if (existingLinks.length > 0) {
    existingLinks.forEach((link) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = link.href;
      a.className = 'related-articles-item';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'related-articles-item-title';
      titleSpan.textContent = link.textContent?.trim() || link.href;
      a.append(titleSpan, createChevron());
      li.append(a);
      list.append(li);
    });
  } else {
    const articles = await fetchRelatedArticles();
    articles.forEach(({ path, title, image }) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      const root = (getRootPath() || '').replace(/\/$/, '');
      a.href = `${root}${path}`.replace(/\/\//g, '/');
      a.className = 'related-articles-item';
      if (image) {
        const bg = document.createElement('span');
        bg.className = 'related-articles-item-bg';
        bg.style.backgroundImage = `url(${image})`;
        a.prepend(bg);
      }
      const titleSpan = document.createElement('span');
      titleSpan.className = 'related-articles-item-title';
      titleSpan.textContent = title || path;
      a.append(titleSpan, createChevron());
      li.append(a);
      list.append(li);
    });
  }

  wrapper.append(list);

  const readMore = document.createElement('a');
  readMore.className = 'related-articles-read-more';
  const root = (getRootPath() || '').replace(/\/$/, '');
  readMore.href = `${root}/news`.replace(/\/\//g, '/');
  readMore.textContent = 'Read More Stories';
  wrapper.append(readMore);

  block.replaceChildren(wrapper);
}
