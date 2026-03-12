/* global WebImporter */

// ─── Selectors to always strip ────────────────────────────────────────────────
// Based on observed DOM of lejeunenewriver.usmc-mccs.org / quantico.usmc-mccs.org
const REMOVE_SELECTORS = [
  // Site chrome
  'header',
  'footer',
  'nav',
  // MCCS-specific overlays & widgets
  '.mega-menu',
  '.location-overlay',
  '.location-modal',
  '[class*="location-picker"]',
  '[class*="location-modal"]',
  // Search
  '[class*="search-overlay"]',
  '[class*="search-modal"]',
  // Social share bar on articles (class-based)
  '[class*="social-share"]',
  '[class*="share-bar"]',
  '[class*="share-links"]',
  '[class*="article-share"]',
  '[class*="post-share"]',
  // Feedback / survey
  '[class*="feedback"]',
  '[class*="survey"]',
  // Outdated browser notice
  '[id*="outdated"]',
  '.outdated-browser',
  // Cookie / GDPR
  '.cookie-banner',
  '.cookie-notice',
  // Misc
  'script',
  'noscript',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detect the type of page being imported.
 * @param {string} pathname
 * @returns {'article'|'listing'|'home'}
 */
function getPageType(pathname) {
  if (pathname.match(/\/(news|stories|articles)\/.+/)) return 'article';
  if (pathname.match(/\/(news|stories|articles|events)(\/)?$/)) return 'listing';
  return 'home';
}

/**
 * Replaces all CSS background-image styles with real <img> elements.
 */
function fixBackgroundImages(root, document) {
  root.querySelectorAll('[style*="background-image"]').forEach((el) => {
    WebImporter.DOMUtils.replaceBackgroundByImg(el, document);
  });
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

/**
 * Builds and appends the Metadata block.
 * Also picks up the article publication date when present.
 */
function createMetadata(main, document, extras = {}) {
  const meta = {};

  const title = document.querySelector('title');
  if (title) meta.Title = title.textContent.replace(/[\n\t]/gm, '').trim();

  const desc = document.querySelector('[property="og:description"], [name="description"]');
  if (desc) meta.Description = desc.content;

  // Prefer the first <picture> in the page content; fall back to og:image
  const firstPicture = main.querySelector('picture');
  if (firstPicture) {
    meta.Image = firstPicture.cloneNode(true);
  } else {
    const ogImage = document.querySelector('[property="og:image"]');
    if (ogImage) {
      const img = document.createElement('img');
      img.src = ogImage.content;
      meta.Image = img;
    }
  }

  const keywords = document.querySelector('[name="keywords"]');
  if (keywords) meta.Tags = keywords.content;

  // Article-specific: published / last-updated date
  if (extras.publishedDate) meta['Published Date'] = extras.publishedDate;

  // Article type: 'news' or 'infographic'
  if (extras.type) meta.Type = extras.type;

  // Page template
  if (extras.Template) meta.Template = extras.Template;

  const block = WebImporter.Blocks.getMetadataBlock(document, meta);
  main.append(block);
  return meta;
}

// ─── Social share removal ─────────────────────────────────────────────────────

const SOCIAL_PLATFORMS = /^(facebook|x|twitter|x \(twitter\)|linkedin|email|instagram|pinterest|youtube|whatsapp)$/i;

/**
 * Removes social-share link lists that have no recognisable class name.
 * On the MCCS article pages these appear as a plain <ul> immediately after
 * the <h1>, containing items like "Facebook", "X (Twitter)", "LinkedIn", "Email".
 */
function removeSocialShareLinks(main) {
  main.querySelectorAll('ul').forEach((ul) => {
    const items = [...ul.querySelectorAll('li')];
    if (items.length > 0 && items.every((li) => SOCIAL_PLATFORMS.test(li.textContent.trim()))) {
      ul.remove();
    }
  });
}

// ─── Article page ─────────────────────────────────────────────────────────────

/**
 * Extracts the "Last Updated: DD Mon YYYY" string from the article body
 * and returns it, removing the element from the DOM.
 */
function extractArticleDate(main) {
  // The site renders something like: "Last Updated: 23 Jan 2026"
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (/last updated:/i.test(node.textContent)) {
      const dateText = node.textContent.replace(/last updated:\s*/i, '').trim();
      const parent = node.parentElement;
      parent.remove();
      return dateText;
    }
    node = walker.nextNode();
  }
  return null;
}

/**
 * Converts the "Other Stories" sidebar into a Related Articles block.
 * The sidebar has a heading like "Other Stories" followed by a list of links.
 *
 * Observed markup (Lejeune / Quantico):
 *   <aside class="..."> or a <div class="...other-stories...">
 *     <strong>Other Stories</strong>
 *     <ul> <li> <a href="...">title</a> </li> ... </ul>
 *     <a href="/stories">Read More Stories</a>
 *   </aside>
 */
function createRelatedArticlesBlock(main, document) {
  const candidates = [
    '[class*="other-stories"]',
    '[class*="related-stories"]',
    '[class*="related-articles"]',
    '[class*="sidebar"]',
    'aside',
  ];

  let sidebar = null;
  for (const sel of candidates) {
    sidebar = main.querySelector(sel);
    if (sidebar) break;
  }

  // Fallback: look for any element whose heading text is "Other Stories"
  if (!sidebar) {
    main.querySelectorAll('*').forEach((el) => {
      if (/other stories/i.test(el.textContent) && el.querySelector('a')) {
        sidebar = el;
      }
    });
  }

  if (!sidebar) return;

  const links = [...sidebar.querySelectorAll('a')].filter(
    (a) => !(/read more/i.test(a.textContent)),
  );

  if (!links.length) {
    sidebar.remove();
    return;
  }

  const cells = [['Related Articles']];
  links.forEach((a) => {
    const linkEl = document.createElement('a');
    linkEl.href = a.href;
    linkEl.textContent = a.textContent.trim();
    cells.push([linkEl]);
  });

  const table = WebImporter.DOMUtils.createTable(cells, document);
  sidebar.replaceWith(table);
}

/**
 * Determines whether the article body is image-only (infographic) or has
 * meaningful text content (news).
 *
 * Strategy: after stripping the sidebar, share bar, and metadata noise,
 * check whether any block-level text nodes with real content remain.
 * If the only content is images, it's an infographic.
 *
 * @param {HTMLElement} main
 * @returns {'infographic'|'news'}
 */
function detectArticleType(main) {
  // Collect all text from paragraph-level elements, excluding headings
  // (h1 is always the title, not body content) and the date/credit lines
  // that will be removed separately.
  const textNodes = [...main.querySelectorAll('p, li, td, blockquote')];
  const meaningfulText = textNodes
    .map((el) => el.textContent.trim())
    .filter((t) => t.length > 0 && !/^last updated:/i.test(t) && !/^marine corps community services$/i.test(t))
    .join('');

  return meaningfulText.length > 0 ? 'news' : 'infographic';
}

/**
 * Handles a news / story article page:
 * 1. Detects article type (news vs infographic)
 * 2. Extracts the article date for metadata
 * 3. Removes social share bar
 * 4. Converts "Other Stories" sidebar to Related Articles block
 * 5. Returns extras for the metadata block
 */
function handleArticlePage(main, document) {
  const type = detectArticleType(main);
  const publishedDate = extractArticleDate(main);
  removeSocialShareLinks(main);
  createRelatedArticlesBlock(main, document);

  // Remove "Marine Corps Community Services" credit line if it's a plain paragraph
  main.querySelectorAll('p, div').forEach((el) => {
    if (/^marine corps community services$/i.test(el.textContent.trim())) {
      el.remove();
    }
  });

  return { publishedDate, type };
}

// ─── Home / listing page blocks ───────────────────────────────────────────────

/**
 * Converts the hero carousel into a Carousel block.
 * The MCCS carousel uses elements with slide/item class names
 * and may use background images.
 */
function createCarouselBlock(main, document) {
  const candidates = [
    '[class*="carousel"]',
    '[class*="hero-slider"]',
    '[class*="slider"]',
  ];

  let container = null;
  for (const sel of candidates) {
    container = main.querySelector(sel);
    if (container) break;
  }
  if (!container) return;

  fixBackgroundImages(container, document);

  const slides = [...container.querySelectorAll('[class*="slide"], [class*="item"]')].filter(
    (el) => el.querySelector('img, picture') || el.style.backgroundImage,
  );

  if (!slides.length) {
    container.remove();
    return;
  }

  const cells = [['Carousel']];
  slides.forEach((slide) => {
    const img = slide.querySelector('picture, img');
    const heading = slide.querySelector('h1, h2, h3, h4');
    const text = slide.querySelector('p');
    const link = slide.querySelector('a');

    const content = document.createElement('div');
    if (heading) content.append(heading.cloneNode(true));
    if (text) content.append(text.cloneNode(true));
    if (link) content.append(link.cloneNode(true));

    cells.push([img ? img.cloneNode(true) : '', content]);
  });

  const table = WebImporter.DOMUtils.createTable(cells, document);
  container.replaceWith(table);
}

/**
 * Converts the category icon-link row into an Icon Links block.
 *
 * Observed markup: a container holding <a> or <figure> elements, each with
 * an <img> (the icon) and a heading/span (the label).
 * On the MCCS sites the icons have h5 labels inside each anchor.
 */
function createIconLinksBlock(main, document) {
  const candidates = [
    '[class*="icon-link"]',
    '[class*="category-nav"]',
    '[class*="service-link"]',
    '[class*="quick-link"]',
    '[class*="program-link"]',
  ];

  let container = null;
  for (const sel of candidates) {
    container = main.querySelector(sel);
    if (container) break;
  }
  if (!container) return;

  // Each child <a> has an icon img and a label (h5, span, or figcaption)
  const anchors = [...container.querySelectorAll('a')].filter(
    (a) => a.querySelector('img, picture, svg'),
  );
  if (!anchors.length) return;

  const cells = [['Icon Links']];
  anchors.forEach((a) => {
    const pic = a.querySelector('picture, img');
    const labelEl = a.querySelector('h5, h4, h3, span, figcaption, p');
    const labelText = (labelEl || a).textContent.trim();

    const linkEl = document.createElement('a');
    linkEl.href = a.href;
    linkEl.textContent = labelText;

    cells.push([pic ? pic.cloneNode(true) : '', linkEl]);
  });

  const table = WebImporter.DOMUtils.createTable(cells, document);
  container.replaceWith(table);
}

/**
 * Converts the 3 promotional banner boxes into a Promos block.
 * On MCCS sites these are clickable image banners (newsletter, Instagram, Facebook).
 */
function createPromosBlock(main, document) {
  const candidates = [
    '[class*="promo-banner"]',
    '[class*="social-banner"]',
    '[class*="promo-box"]',
    '[class*="banner-row"]',
    '[class*="promo-grid"]',
  ];

  let container = null;
  for (const sel of candidates) {
    container = main.querySelector(sel);
    if (container) break;
  }
  if (!container) return;

  const items = [...container.querySelectorAll('a, [class*="promo"], [class*="banner"]')].filter(
    (el) => el.querySelector('img, picture'),
  );
  if (!items.length) return;

  const cells = [['Promos']];
  items.forEach((item) => {
    const pic = item.querySelector('picture, img');
    const a = item.tagName === 'A' ? item : item.querySelector('a');
    const linkEl = document.createElement('a');
    linkEl.href = a ? a.href : '#';
    linkEl.textContent = a ? a.textContent.trim() : '';

    cells.push([pic ? pic.cloneNode(true) : '', linkEl]);
  });

  const table = WebImporter.DOMUtils.createTable(cells, document);
  container.replaceWith(table);
}

/**
 * Converts the news/stories card grid into a Cards block.
 * Handles both the homepage featured articles and the /stories listing page.
 */
function createCardsBlock(main, document) {
  const candidates = [
    '[class*="article-list"]',
    '[class*="news-list"]',
    '[class*="card-grid"]',
    '[class*="stories-grid"]',
    '[class*="news-grid"]',
  ];

  let container = null;
  for (const sel of candidates) {
    container = main.querySelector(sel);
    if (container) break;
  }
  if (!container) return;

  const cards = [...container.querySelectorAll(
    '[class*="card"], [class*="article-item"], [class*="news-item"], article',
  )];
  if (!cards.length) return;

  const cells = [['Cards']];
  cards.forEach((card) => {
    const pic = card.querySelector('picture, img');
    const tag = card.querySelector('[class*="tag"], [class*="category"], [class*="type"]');
    const heading = card.querySelector('h2, h3, h4');
    const excerpt = card.querySelector('p:not([class*="tag"]):not([class*="category"])');
    const link = card.querySelector('a[href]');

    const body = document.createElement('div');
    if (tag) {
      const p = document.createElement('p');
      p.textContent = tag.textContent.trim();
      body.append(p);
    }
    if (heading) body.append(heading.cloneNode(true));
    if (excerpt) body.append(excerpt.cloneNode(true));
    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = /read (article|more|story)/i.test(link.textContent)
        ? link.textContent.trim()
        : 'Read Article →';
      body.append(a);
    }

    cells.push([pic ? pic.cloneNode(true) : '', body]);
  });

  const table = WebImporter.DOMUtils.createTable(cells, document);
  container.replaceWith(table);
}

/**
 * The stories/news listing page may have a "Popular Topics" tag cloud sidebar.
 * Convert it to a simple Tags block so the topics aren't lost.
 */
function createTagsBlock(main, document) {
  let container = main.querySelector(
    '[class*="popular-topics"], [class*="tag-cloud"], [class*="topics"]',
  );
  if (!container) return;

  const heading = container.querySelector('h2, h3, h4, h5, strong');
  const links = [...container.querySelectorAll('a')];
  if (!links.length) {
    container.remove();
    return;
  }

  const cells = [['Tags']];
  links.forEach((a) => {
    const linkEl = document.createElement('a');
    linkEl.href = a.href;
    linkEl.textContent = a.textContent.trim();
    cells.push([linkEl]);
  });

  if (heading) {
    const hr = document.createElement('hr');
    container.before(hr);
    const h = document.createElement('h2');
    h.textContent = heading.textContent.trim();
    container.before(h);
  }

  const table = WebImporter.DOMUtils.createTable(cells, document);
  container.replaceWith(table);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default {
  /**
   * Core transformation — called once per URL by the importer.
   */
  transformDOM: ({ document, url }) => {
    const { pathname } = new URL(url);
    const pageType = getPageType(pathname);
    const main = document.querySelector('main') || document.body;

    // 1. Strip all chrome / UI chrome
    WebImporter.DOMUtils.remove(main, REMOVE_SELECTORS);

    // 2. Convert CSS background images to real <img> elements
    fixBackgroundImages(main, document);

    // 3. Page-type-specific transforms
    let metaExtras = {};

    if (pageType === 'article') {
      // Article: extract date, related articles sidebar, author credit
      metaExtras = handleArticlePage(main, document);
      metaExtras.Template = 'news';
    } else if (pageType === 'listing') {
      // Stories/news listing: cards + topic tags
      createCardsBlock(main, document);
      createTagsBlock(main, document);
    } else {
      // Home: carousel → icon links → promos → featured cards
      createCarouselBlock(main, document);
      createIconLinksBlock(main, document);
      createPromosBlock(main, document);
      createCardsBlock(main, document);
    }

    // 4. Metadata block (always last)
    createMetadata(main, document, metaExtras);

    return main;
  },

  /**
   * Maps source URLs to clean AEM document paths.
   * e.g. /news/my-article-title → /news/my-article-title
   */
  generateDocumentPath: ({ url }) => {
    let { pathname } = new URL(url);
    pathname = pathname.replace(/\/$/, '');
    pathname = pathname.replace(/\.html$/, '');
    if (!pathname || pathname === '/') pathname = '/index';
    return WebImporter.FileUtils.sanitizePath(pathname);
  },
};
