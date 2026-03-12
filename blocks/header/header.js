import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const LOCATION_KEY = 'mccs-location';

const SOCIAL_ICONS = {
  email: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
  facebook: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  instagram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>',
  x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  flickr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.334 12.003a3.334 3.334 0 1 0 6.668 0 3.334 3.334 0 0 0-6.668 0zm12.001 0a3.334 3.334 0 1 0 6.668 0 3.334 3.334 0 0 0-6.668 0z"/></svg>',
};

const GLOBE_ICON = '<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0M2.04 4.326c.325 1.329 2.532 2.54 3.717 3.19.48.263.793.434.743.484q-.121.12-.242.234c-.416.396-.787.749-.758 1.266.035.634.618.824 1.214 1.017.577.188 1.168.38 1.286.983.082.417-.075.988-.22 1.52-.215.782-.406 1.48.22 1.48 1.5-.5 3.798-3.186 4-5 .138-1.243-2-2-3.5-2.5-.478-.16-.755.081-.99.284-.172.15-.322.279-.51.216-.445-.148-2.5-2-1.5-2.5.78-.39.952-.171 1.227.182.078.099.163.208.273.318.609.304.662-.132.723-.633.039-.322.081-.671.277-.867.434-.434 1.265-.791 2.028-1.12.712-.306 1.365-.587 1.579-.88A7 7 0 1 1 2.04 4.327Z"/></svg>';

const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

function getSocialIcon(name) {
  const key = name.toLowerCase().trim();
  return SOCIAL_ICONS[key] || `<span class="nav-social-label">${name}</span>`;
}

function buildSocialList(items, className) {
  const ul = document.createElement('ul');
  ul.className = className;
  [...items].forEach((item) => {
    const li = document.createElement('li');
    const name = item.textContent.trim();
    const existingLink = item.querySelector('a');
    const a = document.createElement('a');
    a.href = existingLink ? existingLink.href : '#';
    a.setAttribute('aria-label', name);
    a.innerHTML = getSocialIcon(name);
    li.append(a);
    ul.append(li);
  });
  return ul;
}

function buildNavList(items, className) {
  const ul = document.createElement('ul');
  ul.className = className;
  [...items].forEach((item) => {
    const li = document.createElement('li');
    const link = item.querySelector('a');
    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.textContent.trim();
      li.append(a);
    }
    if (li.hasChildNodes()) ul.append(li);
  });
  return ul;
}

// ── LOCATION PICKER ──────────────────────────────────────────────────────────

function updateLocationLabel(btn, name) {
  const label = btn.querySelector('.nav-location-label');
  if (label) label.textContent = name;
}

async function buildLocationModal(locationBtn) {
  // ── Modal shell ────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'location-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  const modal = document.createElement('div');
  modal.className = 'location-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Choose your location');

  // ── Fetch location content first so we can use the logo from it ────────────
  const fragment = await loadFragment('/navigation/locations');

  // Known HTML structure (two <div> sections after decorateMain):
  //
  // Section 0 (.default-content-wrapper):
  //   <p><picture>…logo…</picture></p>
  //   <h2>Choose Your Location</h2>
  //   <p>Welcome text…</p>
  //
  // Section 1 (.default-content-wrapper):
  //   <h2>Installations</h2>
  //   <p><a href="#">Name <em>State</em></a><br>…repeated…</p>
  //   <h2>Recruiting</h2>
  //   <p><a href="#">Name <em>State</em></a></p>
  //   <p><a href="#">Name <em>State</em></a></p>

  const wrappers = [...fragment.querySelectorAll('.default-content-wrapper')];
  const heroWrapper = wrappers[0];
  const dataWrapper = wrappers[1] || wrappers[0];

  // ── Modal top bar: logo (from locations fragment) + close ──────────────────
  const modalBar = document.createElement('div');
  modalBar.className = 'location-modal-bar';

  const modalLogo = document.createElement('a');
  modalLogo.href = '/';
  modalLogo.className = 'location-modal-logo';
  modalLogo.setAttribute('aria-label', 'MCCS Home');

  // The logo lives in the first <p> of the hero section
  const logoPicture = heroWrapper?.querySelector('picture');
  if (logoPicture) modalLogo.append(logoPicture.cloneNode(true));

  const closeBtn = document.createElement('button');
  closeBtn.className = 'location-modal-close';
  closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute('aria-label', 'Close location picker');
  closeBtn.innerHTML = CLOSE_ICON;

  modalBar.append(modalLogo, closeBtn);
  modal.append(modalBar);

  // ── Hero section ───────────────────────────────────────────────────────────
  if (heroWrapper) {
    const hero = document.createElement('div');
    hero.className = 'location-modal-hero';

    const heroH2 = heroWrapper.querySelector('h2');
    if (heroH2) {
      const h2 = document.createElement('h2');
      h2.textContent = heroH2.textContent.replace(/\*/g, '').trim();
      hero.append(h2);
    }

    // Welcome paragraph — skip the <p> that only contains the picture
    [...heroWrapper.querySelectorAll('p')].forEach((p) => {
      if (!p.querySelector('picture')) hero.append(p.cloneNode(true));
    });

    modal.append(hero);
  }

  // ── Location selection handler ─────────────────────────────────────────────
  function selectLocation(name) {
    localStorage.setItem(LOCATION_KEY, name);
    updateLocationLabel(locationBtn, name);
    closeModal(); // eslint-disable-line no-use-before-define
  }

  // Build a card from a name + sublabel
  function buildCard(name, sublabel) {
    const card = document.createElement('button');
    card.className = 'location-card';
    card.setAttribute('type', 'button');
    card.innerHTML = `<strong>${name}</strong>${sublabel ? `<span>${sublabel}</span>` : ''}`;
    card.addEventListener('click', () => selectLocation(name));
    return card;
  }

  // Parse location entries out of a <p> element.
  // Each entry is an <a href="#">Name <em>State</em></a>, separated by <br>.
  function parseLocationParagraph(p) {
    const entries = [];
    p.innerHTML.split(/<br\s*\/?>/i).forEach((chunk) => {
      const tmp = document.createElement('span');
      tmp.innerHTML = chunk.trim();
      const em = tmp.querySelector('em');
      const sublabel = em ? em.textContent.trim() : '';
      const name = tmp.textContent.replace(sublabel, '').trim();
      if (name) entries.push({ name, sublabel });
    });
    return entries;
  }

  // ── Build location sections from data wrapper ──────────────────────────────
  // Both <h2>Installations and <h2>Recruiting live in the same wrapper.
  // Walk the children and group by h2.
  const locationGroups = [];
  let currentGroup = null;
  [...(dataWrapper?.children || [])].forEach((node) => {
    if (node.tagName === 'H2') {
      currentGroup = { heading: node.textContent.trim(), paragraphs: [] };
      locationGroups.push(currentGroup);
    } else if (currentGroup && node.tagName === 'P') {
      currentGroup.paragraphs.push(node);
    }
  });

  const body = document.createElement('div');
  body.className = 'location-modal-body';

  locationGroups.forEach((group) => {
    const section = document.createElement('div');
    section.className = 'location-section';
    section.dataset.section = group.heading.toLowerCase().replace(/\s+/g, '-');

    const heading = document.createElement('h2');
    heading.textContent = group.heading;
    section.append(heading);

    const allEntries = group.paragraphs.flatMap((p) => parseLocationParagraph(p));
    if (allEntries.length) {
      const grid = document.createElement('div');
      grid.className = 'location-grid';
      allEntries.forEach(({ name, sublabel }) => grid.append(buildCard(name, sublabel)));
      section.append(grid);
    }

    body.append(section);
  });

  modal.append(body);
  overlay.append(modal);
  document.body.append(overlay);

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  function openModal() {
    overlay.classList.add('location-overlay--open');
    overlay.setAttribute('aria-hidden', 'false');
    locationBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeModal() {
    overlay.classList.remove('location-overlay--open');
    overlay.setAttribute('aria-hidden', 'true');
    locationBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    locationBtn.focus();
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('location-overlay--open')) closeModal();
  });

  return { openModal };
}

// ── MEGA MENU ────────────────────────────────────────────────────────────────

async function buildMegaMenu(hamburgerBtn) {
  const megaMenu = document.createElement('div');
  megaMenu.className = 'mega-menu';
  megaMenu.setAttribute('role', 'dialog');
  megaMenu.setAttribute('aria-modal', 'true');
  megaMenu.setAttribute('aria-label', 'Main navigation menu');
  megaMenu.setAttribute('aria-hidden', 'true');

  const menuBar = document.createElement('div');
  menuBar.className = 'mega-menu-bar';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'mega-menu-close';
  closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute('aria-label', 'Close menu');
  closeBtn.innerHTML = CLOSE_ICON;
  menuBar.append(closeBtn);
  megaMenu.append(menuBar);

  const contentArea = document.createElement('div');
  contentArea.className = 'mega-menu-content';

  const fragment = await loadFragment('/navigation/main-menu');
  const sections = [...fragment.children];

  // LEFT PANEL
  const leftPanel = document.createElement('div');
  leftPanel.className = 'mega-menu-left';

  const leftSection = sections[0];
  if (leftSection) {
    const lw = leftSection.querySelector('.default-content-wrapper') || leftSection;
    const lwClone = lw.cloneNode(true);
    const pic = lwClone.querySelector('picture');

    if (pic) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'mega-menu-image';
      imgWrap.append(pic);
      const picParent = pic.parentElement;
      if (picParent && picParent !== lwClone && !picParent.hasChildNodes()) picParent.remove();
      leftPanel.append(imgWrap);
    }

    const introWrap = document.createElement('div');
    introWrap.className = 'mega-menu-intro';
    [...lwClone.childNodes].forEach((node) => introWrap.append(node));
    leftPanel.append(introWrap);
  }

  // RIGHT PANEL
  const rightPanel = document.createElement('div');
  rightPanel.className = 'mega-menu-right';
  const columnsWrap = document.createElement('div');
  columnsWrap.className = 'mega-menu-columns';

  const rightSections = sections.slice(1);
  if (rightSections.length >= 2) {
    rightSections.forEach((sec) => {
      const col = document.createElement('div');
      col.className = 'mega-menu-column';
      const w = sec.querySelector('.default-content-wrapper') || sec;
      [...w.cloneNode(true).childNodes].forEach((node) => col.append(node));
      columnsWrap.append(col);
    });
  } else {
    const rw = rightSections[0]
      ? (rightSections[0].querySelector('.default-content-wrapper') || rightSections[0])
      : null;
    if (rw) {
      let col = null;
      [...rw.cloneNode(true).childNodes].forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && /^H[23]$/.test(node.tagName)) {
          col = document.createElement('div');
          col.className = 'mega-menu-column';
          columnsWrap.append(col);
        }
        if (col) col.append(node);
      });
    }
  }

  rightPanel.append(columnsWrap);
  contentArea.append(leftPanel, rightPanel);
  megaMenu.append(contentArea);
  document.querySelector('header').append(megaMenu);

  function openMenu() {
    megaMenu.classList.add('mega-menu--open');
    megaMenu.setAttribute('aria-hidden', 'false');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeMenu() {
    megaMenu.classList.remove('mega-menu--open');
    megaMenu.setAttribute('aria-hidden', 'true');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    hamburgerBtn.focus();
  }

  closeBtn.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && megaMenu.classList.contains('mega-menu--open')) closeMenu();
  });

  return { openMenu, closeMenu };
}

// ── DECORATE ──────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/navigation/header';
  const fragment = await loadFragment(navPath);

  block.textContent = '';

  const logoEl = fragment.querySelector('picture') || fragment.querySelector('img');

  let navItems = [];
  let socialItems = [];

  Array.from(fragment.querySelectorAll('ul')).some((ul) => {
    const items = [...ul.querySelectorAll('li')];
    if (!items.length) return false;
    const linkCount = items.filter((li) => li.querySelector('a')).length;
    if (linkCount === items.length && !navItems.length) {
      navItems = items;
    } else if (linkCount === 0 && !socialItems.length) {
      socialItems = items;
    }
    return navItems.length && socialItems.length;
  });

  // ── Hamburger ─────────────────────────────────────────────────────────────
  const hamburgerBtn = document.createElement('button');
  hamburgerBtn.className = 'nav-hamburger';
  hamburgerBtn.setAttribute('type', 'button');
  hamburgerBtn.setAttribute('aria-label', 'Open navigation menu');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
  hamburgerBtn.setAttribute('aria-controls', 'mega-menu');
  hamburgerBtn.innerHTML = `
    <span class="nav-hamburger-bar"></span>
    <span class="nav-hamburger-bar"></span>
    <span class="nav-hamburger-bar"></span>
    <span class="nav-hamburger-label">MENU</span>
  `;

  // ── Logo ──────────────────────────────────────────────────────────────────
  const navBrand = document.createElement('div');
  navBrand.className = 'nav-brand';
  const brandLink = document.createElement('a');
  brandLink.href = '/';
  brandLink.setAttribute('aria-label', 'MCCS Home');
  if (logoEl) brandLink.append(logoEl.closest('picture') || logoEl);
  navBrand.append(brandLink);

  // ── Desktop nav links ─────────────────────────────────────────────────────
  const navSections = document.createElement('div');
  navSections.className = 'nav-sections';
  navSections.append(buildNavList(navItems, 'nav-sections-list'));

  // ── Social icons ──────────────────────────────────────────────────────────
  const navSocialEl = document.createElement('div');
  navSocialEl.className = 'nav-social';
  navSocialEl.append(buildSocialList(socialItems, 'nav-social-list'));

  // ── Location picker button ────────────────────────────────────────────────
  const navLocation = document.createElement('div');
  navLocation.className = 'nav-location';

  const locationDivider = document.createElement('span');
  locationDivider.className = 'nav-location-divider';
  locationDivider.setAttribute('aria-hidden', 'true');

  const locationBtn = document.createElement('button');
  locationBtn.className = 'nav-location-btn';
  locationBtn.setAttribute('type', 'button');
  locationBtn.setAttribute('aria-label', 'Choose installation location');
  locationBtn.setAttribute('aria-expanded', 'false');
  locationBtn.setAttribute('aria-haspopup', 'dialog');

  const savedLocation = localStorage.getItem(LOCATION_KEY);
  locationBtn.innerHTML = `
    <span class="nav-location-label">${savedLocation || 'LOCATION'}</span>
    ${GLOBE_ICON}
  `;

  navLocation.append(locationDivider, locationBtn);

  // ── Assemble nav ──────────────────────────────────────────────────────────
  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.setAttribute('aria-label', 'Main navigation');
  nav.append(hamburgerBtn, navBrand, navSections, navSocialEl, navLocation);

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  // ── Hamburger → mega menu (lazy) ──────────────────────────────────────────
  let megaMenuHandlers = null;
  hamburgerBtn.addEventListener('click', async () => {
    if (!megaMenuHandlers) megaMenuHandlers = await buildMegaMenu(hamburgerBtn);
    megaMenuHandlers.openMenu();
  });

  // ── Location button → modal (lazy) ───────────────────────────────────────
  let locationModalHandlers = null;
  locationBtn.addEventListener('click', async () => {
    if (!locationModalHandlers) {
      locationModalHandlers = await buildLocationModal(locationBtn);
    }
    locationModalHandlers.openModal();
  });
}
