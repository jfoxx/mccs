import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const track = document.createElement('ul');
  track.className = 'link-slider-track';

  [...block.children].forEach((row) => {
    const [imageCol, linkCol] = row.children;
    const li = document.createElement('li');
    li.className = 'link-slider-item';

    const picture = imageCol?.querySelector('picture');
    const img = imageCol?.querySelector('img');
    const href = linkCol?.querySelector('a')?.href || linkCol?.textContent?.trim() || '#';

    if (picture && img) {
      const optimized = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '300' }]);
      const a = document.createElement('a');
      a.href = href;
      a.append(optimized);
      li.append(a);
    }

    if (li.hasChildNodes()) track.append(li);
  });

  // Custom progress-style scroll indicator
  const progressBar = document.createElement('div');
  progressBar.className = 'link-slider-progress';

  const progressFill = document.createElement('div');
  progressFill.className = 'link-slider-progress-fill';
  progressBar.append(progressFill);

  // Scroll buttons
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'link-slider-btn link-slider-prev';
  prev.setAttribute('aria-label', 'Scroll left');
  prev.innerHTML = '&#8249;';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'link-slider-btn link-slider-next';
  next.setAttribute('aria-label', 'Scroll right');
  next.innerHTML = '&#8250;';

  const controls = document.createElement('div');
  controls.className = 'link-slider-controls';
  controls.append(prev, next);

  const footer = document.createElement('div');
  footer.className = 'link-slider-footer';
  footer.append(progressBar, controls);

  const scrollAmount = () => track.clientWidth * 0.75;

  const updateState = () => {
    const { scrollLeft, scrollWidth, clientWidth } = track;
    const pct = scrollWidth > 0 ? ((scrollLeft + clientWidth) / scrollWidth) * 100 : 100;
    progressFill.style.width = `${pct}%`;
    prev.disabled = scrollLeft <= 0;
    next.disabled = scrollLeft + clientWidth >= scrollWidth - 1;
  };

  prev.addEventListener('click', () => {
    track.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
  });

  next.addEventListener('click', () => {
    track.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
  });

  track.addEventListener('scroll', updateState, { passive: true });

  // Re-run whenever the track's scroll width changes (images finishing loading
  // expand the track, making scrollWidth > clientWidth for the first time).
  const ro = new ResizeObserver(updateState);
  ro.observe(track);
  track.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', updateState, { once: true });
  });

  block.replaceChildren(track, footer);
}
