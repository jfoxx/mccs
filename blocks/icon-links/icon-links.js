export default function decorate(block) {
  const ul = document.createElement('ul');
  ul.className = 'icon-links-list';

  [...block.children].forEach((row) => {
    const cols = [...row.children];
    const li = document.createElement('li');
    li.className = 'icon-links-item';

    // Column 0: icon (picture or img)
    const iconCol = cols[0];
    // Column 1: label — may itself be a link, or just text; column 2 may hold the href
    const labelCol = cols[1];
    const linkCol = cols[2];

    // Resolve the href: prefer an explicit link column, then a link inside the label column
    const explicitLink = linkCol?.querySelector('a');
    const labelLink = labelCol?.querySelector('a');
    const href = explicitLink?.href || labelLink?.href || '#';

    // Build the label text
    const rawLabel = labelLink?.textContent.trim() || labelCol?.textContent.trim() || '';

    const a = document.createElement('a');
    a.href = href;
    a.className = 'icon-links-anchor';
    a.setAttribute('aria-label', rawLabel);

    // Icon wrapper
    if (iconCol) {
      const iconWrap = document.createElement('span');
      iconWrap.className = 'icon-links-icon';
      const picture = iconCol.querySelector('picture');
      const img = iconCol.querySelector('img');
      if (picture) {
        iconWrap.append(picture);
      } else if (img) {
        iconWrap.append(img);
      }
      a.append(iconWrap);
    }

    // Label
    if (rawLabel) {
      const span = document.createElement('span');
      span.className = 'icon-links-label';
      span.textContent = rawLabel;
      a.append(span);
    }

    li.append(a);
    ul.append(li);
  });

  block.replaceChildren(ul);

  // Set --icon-half so CSS can split into exactly 2 rows when wrapping occurs.
  // Top row gets ceil(n/2), bottom gets floor(n/2) (smaller on bottom per spec).
  const count = ul.children.length;
  const half = Math.ceil(count / 2);
  ul.style.setProperty('--icon-half', half);

  // Detect wrapping by comparing the vertical position of the first and last
  // item. Remove is-split first so we always measure the natural flex layout —
  // otherwise the grid it applies would always appear as 2 rows and the class
  // would never be removed on wide viewports.
  const checkWrap = () => {
    const items = [...ul.children];
    if (items.length < 2) return;
    ul.classList.remove('is-split');
    const firstTop = items[0].getBoundingClientRect().top;
    const lastTop = items[items.length - 1].getBoundingClientRect().top;
    ul.classList.toggle('is-split', Math.round(lastTop) > Math.round(firstTop));
  };

  const ro = new ResizeObserver(checkWrap);
  ro.observe(ul);
}
