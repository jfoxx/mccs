import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const ul = document.createElement('ul');
  ul.className = 'promos-list';

  [...block.children].forEach((row) => {
    const cols = [...row.children];
    const li = document.createElement('li');
    li.className = 'promos-item';

    const imageCol = cols[0];
    const linkCol = cols[1];

    // Resolve link — prefer explicit second column, then a link inside the image column
    const explicitLink = linkCol?.querySelector('a');
    const imageLink = imageCol?.querySelector('a');
    const href = explicitLink?.href || imageLink?.href || null;

    const picture = imageCol?.querySelector('picture');
    const img = imageCol?.querySelector('img');

    if (picture) {
      // Replace with optimized picture at promo width
      const optimized = createOptimizedPicture(
        img?.src || picture.querySelector('img')?.src,
        img?.alt || '',
        false,
        [{ width: '800' }],
      );

      if (href) {
        const a = document.createElement('a');
        a.href = href;
        a.className = 'promos-link';
        a.append(optimized);
        li.append(a);
      } else {
        li.append(optimized);
      }
    }

    ul.append(li);
  });

  block.replaceChildren(ul);
}
