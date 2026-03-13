/**
 * News Grid block — fetches all articles from query-index and displays
 * a full grid of cards with background images, type badge, and title.
 */

import { getRootPath } from '@dropins/tools/lib/aem/configs.js';

const QUERY_INDEX_URL = '/news/query-index.json';
const GRID_COUNT = 8;

/**
 * Fetches all articles and infographics from query-index.
 * @returns {Promise<{path: string, title: string, image: string, type: string}[]>}
 */
async function fetchArticles() {
  const root = (getRootPath() || '').replace(/\/$/, '');
  const url = `${root}${QUERY_INDEX_URL}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];

  const json = await resp.json();
  const { data = [] } = json;

  return data
    .filter((item) => item.path && item.image && !item.image.startsWith('about:'))
    .slice(0, GRID_COUNT)
    .map(({
      path, title, image, type,
    }) => ({
      path: `${root}${path}`.replace(/\/+/g, '/'),
      title,
      image,
      type,
    }));
}

export default async function decorate(block) {
  const grid = document.createElement('ul');
  grid.className = 'news-grid-list';

  const articles = await fetchArticles();

  articles.forEach(({
    path, title, image, type,
  }) => {
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
