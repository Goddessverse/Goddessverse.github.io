(() => {
  'use strict';
  const root = document.documentElement;
  const sectionNav = document.querySelector('.section-navigation');
  const title = document.getElementById('section-navigation-title');
  const contents = document.getElementById('section-contents-links');
  const introMount = document.getElementById('introduction-contents-mount');
  const introTOC = document.querySelector('.intro-toc');
  const introHome = document.createComment('Introduction contents position for Rae theme');
  introTOC.before(introHome);
  const navButtons = [...document.querySelectorAll('.sidebar .nav-item')];
  const paths = {
    introduction: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4zM13 7a3 3 0 0 1 3-3h4v14h-3a4 4 0 0 0-4 3',
    pacing: 'M4 12h4l3-7 4 14 3-7h2',
    setting: 'm3 7 6-3 6 3 6-3v16l-6 3-6-3-6 3zM9 4v16M15 7v16',
    roleplay: 'M5 4h14v13H9l-4 4zM9 8h6M9 12h4',
    factions: 'M5 3v18M5 4h13l-3 4 3 4H5',
    characters: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M19 21v-2a4 4 0 0 0-3-4M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 3a4 4 0 0 1 0 8',
    'trackers-vis': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    'trackers-hid': 'm3 3 18 18M10 5a12 12 0 0 1 12 7 18 18 0 0 1-3 4M6 6a18 18 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1',
    'trackers-hyb': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 3v18M16 7h1M16 11h3M16 15h1',
    memory: 'M8 3H5v18h14V3h-3M8 3h8v5H8zM8 13h8M8 17h5',
    timeskip: 'M4 4v5h5M4 9a8 8 0 1 1-1 6M12 7v5l3 2',
    export: 'M12 16V3m-4 4 4-4 4 4M4 14v7h16v-7'
  };
  function icon(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'})) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[id] || paths.introduction); svg.append(path);
    return svg;
  }
  navButtons.forEach(button => {
    const id = button.getAttribute('onclick').match(/showPanel\('([^']+)'/)[1];
    button.dataset.panel = id;
    const svg = icon(id); svg.classList.add('nav-symbol');
    button.querySelector('.nav-dot').after(svg);
    const label = document.createElement('span'); label.className = 'nav-item-title';
    [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).forEach(node => label.append(node));
    svg.after(label);
  });

  let activePanel = document.querySelector('.panel.active');
  const backToTop = document.querySelector('.back-to-top');
  function syncBackToTop() {
    backToTop.hidden = window.scrollY < 60;
  }
  backToTop.addEventListener('click', () => {
    selectedContentsTarget = null;
    document.dispatchEvent(new Event('builder:scroll-top'));
    const heading = activePanel.querySelector('.introduction-heading, .field-label');
    if (heading) { heading.tabIndex = -1; heading.focus({preventScroll: true}); }
    window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  });
  let targetSequence = 0;
  let selectedContentsTarget = null;
  function makeLink(target, label, nested = false) {
    if (!target.id) target.id = 'contents-target-' + (++targetSequence);
    target.dataset.contentsTarget = '';
    const link = document.createElement('a');
    link.href = '#' + target.id;
    link.textContent = label;
    if (nested) link.className = 'contents-sub';
    link.addEventListener('click', event => {
      event.preventDefault();
      selectedContentsTarget = target.id;
      highlightContents();
      target.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
      target.tabIndex = -1; target.focus({preventScroll: true});
    });
    contents.append(link);
  }
  function refreshContents() {
    if (root.dataset.theme !== 'goddess') return;
    const id = activePanel.id.slice(6);
    title.textContent = activePanel.querySelector('.introduction-heading, .field-label')?.textContent || 'Contents';
    sectionNav.setAttribute('aria-label', title.textContent + ' table of contents');
    document.querySelector('.section-navigation-symbol').replaceChildren(icon(id));
    introMount.hidden = id !== 'introduction';
    contents.hidden = id === 'introduction';
    // Keep Introduction's original links and their mode/block navigation handlers.
    if (id === 'introduction') return;
    contents.replaceChildren();
    const headings = activePanel.querySelectorAll('.input-label, .section-divider, .check-label, .char-block-header, .export-field-label');
    for (const heading of headings) {
      if (!heading.getClientRects().length) continue;
      const clean = heading.cloneNode(true);
      clean.querySelectorAll('button, .check-hint, .badge').forEach(node => node.remove());
      const label = clean.textContent.trim().replace(/\s+/g, ' ');
      if (!label) continue;
      const target = heading.closest('.input-group, .check-group, .export-field') || heading;
      makeLink(target, label, Boolean(heading.closest('.char-block') && !heading.classList.contains('char-block-header')));
    }
    if (!contents.children.length) makeLink(activePanel, title.textContent);
    highlightContents();
  }
  function highlightContents() {
    if (root.dataset.theme !== 'goddess' || activePanel.id === 'panel-introduction') return;
    const links = [...contents.querySelectorAll('a')];
    let active = links[0];
    const threshold = window.innerWidth <= 1100 ? 100 : 48;
    for (const link of links) {
      if (document.getElementById(link.hash.slice(1)).getBoundingClientRect().top <= threshold) active = link;
    }
    const selected = links.find(link => link.hash.slice(1) === selectedContentsTarget);
    if (selected) active = selected;
    else selectedContentsTarget = null;
    links.forEach(link => link === active ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current'));
  }
  function syncTheme() {
    if (root.dataset.theme === 'goddess') introMount.append(introTOC);
    else introHome.after(introTOC);
    refreshContents();
  }
  // Release the mobile drawer's inert main content before the link focuses its target.
  sectionNav.addEventListener('click', event => {
    if (event.target.closest('a[href^="#"]') && root.classList.contains('navigation-open')) document.dispatchEvent(new Event('builder:close-navigation'));
  }, true);
  const panelObserver = new MutationObserver(() => {
    if (activePanel.id !== 'panel-introduction') queueRefresh();
  });
  function selectPanel() {
    selectedContentsTarget = null;
    activePanel = document.querySelector('.panel.active');
    navButtons.forEach(button => button.classList.contains('active') ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current'));
    panelObserver.disconnect();
    panelObserver.observe(activePanel, {subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'hidden']});
    refreshContents();
    document.querySelector('.section-navigation-body').scrollTop = 0;
  }
  let refreshPending = false;
  function queueRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    requestAnimationFrame(() => { refreshPending = false; refreshContents(); });
  }
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => { scrollPending = false; highlightContents(); syncBackToTop(); });
  }, {passive: true});
  window.addEventListener('resize', highlightContents);
  function resumeContentsTracking(event) {
    if (event.target.closest?.('.section-navigation, .sidebar')) return;
    if (event.type === 'keydown' && (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) || event.target.closest?.('input, textarea, select, [contenteditable="true"]'))) return;
    selectedContentsTarget = null;
  }
  for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown']) window.addEventListener(type, resumeContentsTracking, {passive: true});
  document.addEventListener('builder:panel', selectPanel);
  document.addEventListener('builder:theme', syncTheme);
  const footer = document.querySelector('.sidebar-footer');
  const sizeFooter = () => root.style.setProperty('--sidebar-footer-height', footer.getBoundingClientRect().height + 'px');
  if (window.ResizeObserver) new ResizeObserver(sizeFooter).observe(footer);
  sizeFooter(); syncTheme(); selectPanel();
  syncBackToTop();
})();
