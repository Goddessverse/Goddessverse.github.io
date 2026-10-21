(() => {
  'use strict';
  const M = window.IntroModel;
  const state = M.createState();
  const panel = document.getElementById('panel-introduction');
  const editors = new Map();
  const sectionViews = {description: 'visual', opening: 'visual', creatorNote: 'visual'};
  const touched = new Set();
  const history = [];
  const redoHistory = [];
  let blockSequence = 0;
  let forceValidation = false;
  let selectedContentsTarget = null;
  const names = {name: 'Name', description: 'Description', opening: 'Opening', creatorNote: 'Creator Note'};
  const sections = Object.keys(names);
  const sectionId = key => 'intro-' + key;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, className, action) => {
    const node = element('button', className, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };
  function help(label, text) {
    const wrap = element('span', 'intro-help');
    const trigger = button('i', '', () => {});
    trigger.setAttribute('aria-label', 'About ' + label);
    const tooltip = element('span', '', text);
    tooltip.id = 'help-' + (++blockSequence);
    tooltip.setAttribute('role', 'tooltip');
    trigger.setAttribute('aria-describedby', tooltip.id);
    wrap.append(trigger, tooltip);
    return wrap;
  }
  function changed(field) {
    touched.add(field);
    update();
    if (window.updatePreview) window.updatePreview();
  }
  function component(parent, label, id, tooltip, optional = false) {
    const wrap = element('div', 'intro-component');
    wrap.id = id;
    wrap.dataset.toc = label;
    const heading = element('div', 'intro-component-label', label);
    if (tooltip) heading.append(help(label, tooltip));
    if (optional) heading.append(element('span', 'intro-requirement opt', 'optional'));
    wrap.append(heading);
    parent.append(wrap);
    return wrap;
  }
  function rich(parent, label, value, setValue, options = {}) {
    const mount = element('div');
    parent.append(mount);
    const section = mount.closest('.intro-section').id.slice('intro-'.length);
    const editor = new IntroEditor(mount, {label, value, onChange: setValue, externalViewControls: true, ...options});
    editor.setView(sectionViews[section], false);
    editors.set(mount, editor);
    return editor;
  }
  function composerControls(field) {
    const section = document.getElementById(sectionId(field));
    const composer = document.getElementById('composer-' + field);
    const header = element('div', 'intro-composer-controls');
    const controls = element('div', 'intro-composer-switches');
    const modes = section.querySelector('.intro-modes');
    if (modes) controls.append(modes);
    const views = element('div', 'intro-editor-view');
    views.setAttribute('role', 'group');
    views.setAttribute('aria-label', names[field] + ' editor view');
    for (const view of ['visual', 'source']) {
      const toggle = button('', 'intro-editor-tool', () => {
        if (sectionViews[field] === view) return;
        sectionViews[field] = view;
        for (const [mount, editor] of editors) {
          if (section.contains(mount)) editor.setView(view, false);
        }
        views.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.view === view)));
      });
      toggle.dataset.view = view;
      toggle.title = titleCase(view) + ' view';
      toggle.setAttribute('aria-label', names[field] + ': ' + titleCase(view));
      toggle.setAttribute('aria-pressed', String(sectionViews[field] === view));
      toggle.append(IntroEditor.viewIcon(view));
      views.append(toggle);
    }
    controls.append(views);
    const format = element('span', 'intro-editor-format', 'Markdown');
    format.id = 'format-' + field;
    header.append(controls, format);
    composer.prepend(header);
  }
  function input(parent, label, value, onChange, options = {}) {
    const id = 'intro-input-' + (++blockSequence);
    const title = element('label', 'input-label', label);
    title.htmlFor = id;
    const field = element(options.multiline ? 'textarea' : 'input', options.className || '');
    if (!options.multiline) field.type = options.type || 'text';
    field.id = id;
    field.value = value;
    if (options.placeholder) field.placeholder = options.placeholder;
    field.addEventListener('input', () => onChange(field.value));
    parent.append(title, field);
    return field;
  }
  function clearEditors(parent) {
    for (const [mount, editor] of editors) {
      if (parent.contains(mount)) { editor.destroy(); editors.delete(mount); }
    }
    parent.replaceChildren();
  }
  function assembled(parent, field) {
    const detail = element('details', 'intro-assembled');
    detail.append(element('summary', '', 'Assembled source'));
    const code = element('pre');
    code.dataset.assembled = field;
    code.setAttribute('aria-label', names[field] + ' assembled source');
    detail.append(code);
    parent.append(detail);
  }
  function imageFields(parent, value, onChange, label = 'Opening Image') {
    const preview = element('img', 'intro-image-preview');
    preview.hidden = true;
    preview.loading = 'lazy';
    preview.referrerPolicy = 'no-referrer';
    const loadNote = element('p', 'intro-field-note');
    function renderPreview() {
      loadNote.textContent = '';
      preview.alt = value.alt || '';
      if (M.isValidImageURL(value.url)) { preview.src = value.url.trim(); preview.hidden = false; }
      else { preview.removeAttribute('src'); preview.hidden = true; }
    }
    input(parent, label, value.url, text => { value.url = text; onChange(); renderPreview(); }, {type: 'url', placeholder: 'https://…'});
    const gap = element('div'); gap.style.marginTop = '14px'; parent.append(gap);
    input(gap, 'Image alt text', value.alt, text => { value.alt = text; preview.alt = text; onChange(); });
    preview.addEventListener('error', () => { preview.hidden = true; loadNote.textContent = 'Image could not be loaded. The URL remains in your draft.'; });
    parent.append(preview, loadNote);
    renderPreview();
  }
  function renderDescription() {
    const composer = document.getElementById('composer-description');
    const single = state.description.mode === 'native';
    composer.classList.toggle('intro-composer-single', single);
    composer.classList.toggle('intro-composer-group', !single);
    const host = document.getElementById('description-fields');
    clearEditors(host);
    const draft = state.description;
    document.getElementById('format-description').textContent = draft.mode === 'advanced' ? 'Markdown · HTML' : 'Markdown';
    if (draft.mode === 'native') {
      rich(host, 'Description', draft.native, value => { draft.native = value; changed('description'); });
    } else if (draft.mode === 'advanced') {
      const content = component(host, 'Content', 'description-content');
      const editor = rich(content, 'Advanced Description', draft.advanced.content, value => { draft.advanced.content = value; changed('description'); }, {advanced: true, getCSS: () => draft.advanced.css});
      const css = component(host, 'CSS', 'description-css', null, true);
      input(css, 'Description CSS', draft.advanced.css, value => { draft.advanced.css = value; editor.refreshPreview(); changed('description'); }, {multiline: true, className: 'intro-css', placeholder: '.intro { color: #D4AF6A; }'});
      css.append(element('p', 'intro-field-note', 'Applies to this Description preview and is included in its exported source.'));
      assembled(host, 'description');
    } else {
      const guided = draft.intermediate;
      for (const [key, label, hint] of [
        ['hook', 'Hook', 'The world, the stakes, or the dynamic in one line.'],
        ['orientation', 'User Orientation', 'Who {{user}} is in this world, or what pulls them in.'],
        ['focus', 'Story Focus', 'The tension or question the story will orbit.']
      ]) {
        rich(component(host, label, 'description-' + key, hint), label, guided[key], value => { guided[key] = value; changed('description'); });
      }
      const tags = component(host, 'Tags', 'description-tags');
      const row = element('div', 'intro-tags');
      const delimiter = element('div');
      const entry = element('div');
      row.append(delimiter, entry); tags.append(row);
      const delim = input(delimiter, 'Delimiter', guided.delimiter, value => { guided.delimiter = value; changed('description'); });
      delim.title = 'Symbol used between tags in the tagline.';
      input(entry, 'Tags, separated by commas', guided.tags, value => { guided.tags = value; changed('description'); });
      rich(component(host, 'Content Warning', 'description-warning', null, true), 'Content Warning', guided.warning, value => { guided.warning = value; changed('description'); });
      assembled(host, 'description');
    }
    update(); updateTOC();
  }
  function renderOpening() {
    const composer = document.getElementById('composer-opening');
    const single = state.opening.mode === 'native';
    composer.classList.toggle('intro-composer-single', single);
    composer.classList.toggle('intro-composer-group', !single);
    const host = document.getElementById('opening-fields');
    clearEditors(host);
    const draft = state.opening;
    if (draft.mode === 'native') {
      rich(host, 'Opening', draft.native, value => { draft.native = value; changed('opening'); });
    } else if (draft.mode === 'intermediate') {
      const guided = draft.intermediate;
      rich(component(host, 'Opening Narration', 'opening-narration'), 'Opening Narration', guided.narration, value => { guided.narration = value; changed('opening'); });
      const image = component(host, 'Opening Image', 'opening-image', null, true);
      const values = {url: guided.image, alt: guided.alt};
      imageFields(image, values, () => { guided.image = values.url; guided.alt = values.alt; changed('opening'); });
      rich(component(host, 'Opening dialogue', 'opening-dialogue'), 'Opening dialogue', guided.dialogue, value => { guided.dialogue = value; changed('opening'); });
      rich(component(host, 'Closing beat', 'opening-beat'), 'Closing beat', guided.beat, value => { guided.beat = value; changed('opening'); });
      assembled(host, 'opening');
    } else {
      const actions = element('div', 'intro-block-actions');
      for (const type of ['narration', 'dialogue', 'image']) {
        actions.append(button('+ ' + titleCase(type), 'intro-action', () => {
          rememberBlocks();
          const block = {id: 'block-' + (++blockSequence), type, content: '', url: '', alt: ''};
          draft.alternate.push(block); renderOpening(); changed('opening');
          const card = document.getElementById(block.id);
          card.scrollIntoView({block: 'nearest'});
          card.querySelector('.intro-editor-visual:not([hidden]), .intro-editor-source:not([hidden]), input')?.focus();
        }));
      }
      host.append(actions);
      const undo = element('div', 'intro-undo');
      undo.hidden = history.length === 0 && redoHistory.length === 0;
      undo.append(element('span', '', 'Block arrangement changed.'), button('Undo', 'intro-action', () => {
        if (!history.length) return;
        redoHistory.push(draft.alternate.map(block => ({...block})));
        restoreBlocks(history.pop()); renderOpening(); changed('opening');
      }));
      undo.querySelector('button').disabled = history.length === 0;
      const redo = button('Redo', 'intro-action', () => {
        if (!redoHistory.length) return;
        history.push(draft.alternate.map(block => ({...block})));
        restoreBlocks(redoHistory.pop()); renderOpening(); changed('opening');
      });
      redo.disabled = redoHistory.length === 0;
      undo.append(redo);
      host.append(undo);
      if (!draft.alternate.length) host.append(element('p', 'intro-empty', 'Add narration, dialogue, or an image to begin.'));
      draft.alternate.forEach((block, index) => renderBlock(host, block, index));
      assembled(host, 'opening');
    }
    update(); updateTOC();
  }
  function titleCase(value) { return value[0].toUpperCase() + value.slice(1); }
  function rememberBlocks() {
    history.push(state.opening.alternate.map(block => ({...block})));
    redoHistory.length = 0;
    if (history.length > 20) history.shift();
  }
  function restoreBlocks(snapshot) {
    const current = new Map(state.opening.alternate.map(block => [block.id, block]));
    // Undo arrangement changes without rolling back later edits to surviving blocks.
    state.opening.alternate = snapshot.map(block => ({...block, ...current.get(block.id)}));
  }
  function renderBlock(host, block, index) {
    const card = element('div', 'intro-block');
    card.id = block.id;
    card.dataset.toc = (index + 1) + '. ' + titleCase(block.type);
    const label = titleCase(block.type) + ' ' + (index + 1);
    const header = element('div', 'intro-block-header');
    const handle = button('⠿', 'intro-drag', () => {});
    handle.draggable = false;
    handle.setAttribute('aria-label', 'Drag ' + label);
    handle.title = 'Drag to reorder. The block menu also has Move up and Move down.';
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const start = {x: event.clientX, y: event.clientY};
      let point = start, active = false, finished = false, target = null, after = false, frame = 0;
      handle.setPointerCapture(event.pointerId);
      const cards = [...host.querySelectorAll('.intro-block')];
      function locate() {
        cards.forEach(item => item.classList.remove('drop-before', 'drop-after'));
        target = cards.find(item => {
          const rect = item.getBoundingClientRect();
          return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
        });
        if (!target || target === card) { target = null; return; }
        const rect = target.getBoundingClientRect();
        after = point.y > rect.top + rect.height / 2;
        target.classList.add(after ? 'drop-after' : 'drop-before');
      }
      function tick() {
        if (!active) return;
        const top = document.querySelector('.builder-header').getBoundingClientRect().bottom + 55;
        if (point.y < top) window.scrollBy(0, -12);
        else if (point.y > window.innerHeight - 60) window.scrollBy(0, 12);
        locate();
        frame = requestAnimationFrame(tick);
      }
      function move(e) {
        if (e.pointerId !== event.pointerId) return;
        point = {x: e.clientX, y: e.clientY};
        if (!active && Math.hypot(point.x - start.x, point.y - start.y) > 5) {
          active = true; card.classList.add('is-dragging'); tick();
        }
        if (active) { e.preventDefault(); locate(); }
      }
      function finish(e, cancelled = false) {
        if (finished || (e.pointerId !== undefined && e.pointerId !== event.pointerId)) return;
        finished = true;
        const wasActive = active;
        active = false;
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', escape);
        window.removeEventListener('blur', cancel);
        handle.removeEventListener('lostpointercapture', cancel);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        cards.forEach(item => item.classList.remove('drop-before', 'drop-after', 'is-dragging'));
        if (wasActive && target && !cancelled) {
          const from = state.opening.alternate.findIndex(item => item.id === block.id);
          let to = state.opening.alternate.findIndex(item => item.id === target.id) + (after ? 1 : 0);
          if (from < to) to--;
          if (from !== to) {
            rememberBlocks(); M.moveBlock(state, block.id, to); renderOpening(); changed('opening');
            document.getElementById(block.id)?.querySelector('.intro-drag')?.focus({preventScroll: true});
          }
        }
      }
      function cancel(e) { finish(e, true); }
      function escape(e) { if (e.key === 'Escape') { e.preventDefault(); cancel(e); } }
      window.addEventListener('pointermove', move, {passive: false});
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', escape);
      window.addEventListener('blur', cancel);
      handle.addEventListener('lostpointercapture', cancel);
    });
    header.append(handle, element('span', 'intro-block-title', label));
    const menu = element('details', 'intro-block-menu');
    const summary = element('summary', '', '⋯'); summary.setAttribute('aria-label', label + ' actions');
    const options = element('div');
    function action(text, callback, disabled) {
      const actionButton = button(text, '', () => { rememberBlocks(); callback(); renderOpening(); changed('opening'); document.getElementById(block.id)?.querySelector('.intro-drag')?.focus(); });
      actionButton.disabled = Boolean(disabled); options.append(actionButton);
    }
    action('Move up', () => M.moveBlock(state, block.id, index - 1), index === 0);
    action('Move down', () => M.moveBlock(state, block.id, index + 1), index === state.opening.alternate.length - 1);
    action('Duplicate', () => state.opening.alternate.splice(index + 1, 0, {...block, id: 'block-' + (++blockSequence)}));
    action('Remove', () => M.removeBlock(state, block.id));
    menu.append(summary, options); header.append(menu); card.append(header); host.append(card);
    if (block.type === 'image') imageFields(card, block, () => changed('opening'), label + ' URL');
    else rich(card, label, block.content, value => { block.content = value; changed('opening'); });
  }
  function update() {
    const sources = M.assemble(state);
    const errors = M.validate(state);
    for (const field of sections) {
      const count = M.count(sources[field]);
      const counter = document.getElementById('counter-' + field);
      counter.textContent = count.toLocaleString() + ' / ' + M.LIMITS[field].toLocaleString();
      counter.classList.toggle('over-limit', count > M.LIMITS[field]);
      const ownErrors = errors.filter(error => error.field === field);
      const visibleErrors = forceValidation || touched.has(field) ? ownErrors : [];
      document.getElementById('error-' + field).textContent = visibleErrors.map(error => error.message).join(' ');
      document.getElementById(sectionId(field)).classList.toggle('has-error', Boolean(visibleErrors.length));
    }
    document.getElementById('f-name').setAttribute('aria-invalid', String(Boolean((forceValidation || touched.has('name')) && errors.some(error => error.field === 'name'))));
    panel.querySelectorAll('[data-assembled]').forEach(node => { node.textContent = sources[node.dataset.assembled]; });
    document.querySelectorAll('[data-intro-mode]').forEach(node => {
      node.setAttribute('aria-pressed', String(state[node.dataset.introSection].mode === node.dataset.introMode));
    });
    return errors;
  }
  function updateTOC() {
    const links = document.getElementById('intro-toc-links');
    const select = document.getElementById('intro-jump');
    const previous = select.value;
    links.replaceChildren(); select.replaceChildren();
    for (const field of sections) {
      const section = document.getElementById(sectionId(field));
      const entries = [[section.id, names[field], false], ...Array.from(section.querySelectorAll('[data-toc]')).map(node => [node.id, node.dataset.toc, true])];
      for (const [id, label, nested] of entries) {
        const link = element('a', nested ? 'intro-toc-sub' : '', label);
        link.href = '#' + id;
        link.addEventListener('click', event => { event.preventDefault(); jump(id); });
        links.append(link);
        const option = element('option', '', (nested ? '　' : '') + label); option.value = id; select.append(option);
      }
    }
    if (Array.from(select.options).some(option => option.value === previous)) select.value = previous;
    highlightTOC();
  }
  function setSectionExpanded(section, expanded) {
    section.querySelector('.intro-section-toggle').setAttribute('aria-expanded', String(expanded));
    section.querySelector('.intro-section-body').hidden = !expanded;
    section.classList.toggle('is-collapsed', !expanded);
  }
  panel.querySelectorAll('.intro-section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      setSectionExpanded(toggle.closest('.intro-section'), toggle.getAttribute('aria-expanded') !== 'true');
      highlightTOC();
    });
  });
  function jump(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const section = target?.closest('.intro-section');
    if (section) setSectionExpanded(section, true);
    selectedContentsTarget = id;
    highlightTOC();
    target?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    if (target) { target.tabIndex = -1; target.focus({preventScroll: true}); }
  }
  function highlightTOC() {
    if (!panel.classList.contains('active')) return;
    const links = [...document.querySelectorAll('#intro-toc-links a')];
    const threshold = document.querySelector('.builder-header').getBoundingClientRect().height + (window.innerWidth < 1200 ? 100 : 42);
    let active = links[0];
    for (const link of links) {
      const target = document.getElementById(link.hash.slice(1));
      if (target?.getClientRects().length && target.getBoundingClientRect().top <= threshold) active = link;
    }
    // A clicked section can be too close to the page bottom to reach the scroll threshold.
    const selected = links.find(link => link.hash.slice(1) === selectedContentsTarget);
    if (selected && document.getElementById(selectedContentsTarget)?.getClientRects().length) active = selected;
    else selectedContentsTarget = null;
    for (const link of links) {
      if (link === active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    }
    if (active && document.activeElement !== document.getElementById('intro-jump')) document.getElementById('intro-jump').value = active.hash.slice(1);
  }
  document.getElementById('f-name').addEventListener('input', event => { state.name = event.target.value; changed('name'); });
  document.querySelectorAll('[data-intro-mode]').forEach(node => node.addEventListener('click', () => {
    const field = node.dataset.introSection;
    if (state[field].mode === node.dataset.introMode) return;
    M.switchMode(state, field, node.dataset.introMode);
    if (field === 'description') renderDescription(); else renderOpening();
    changed(field);
  }));
  document.getElementById('intro-jump').addEventListener('change', event => jump(event.target.value));
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (scrollPending) return;
    scrollPending = true; requestAnimationFrame(() => { highlightTOC(); scrollPending = false; });
  }, {passive: true});
  window.addEventListener('resize', highlightTOC);
  function resumeContentsTracking(event) {
    if (event.target.closest?.('.section-navigation, .intro-toc, .intro-toc-mobile, .sidebar')) return;
    if (event.type === 'keydown' && (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) || event.target.closest?.('input, textarea, select, [contenteditable="true"]'))) return;
    selectedContentsTarget = null;
  }
  // Return to position-based tracking when the user scrolls or interacts with the page.
  for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown']) window.addEventListener(type, resumeContentsTracking, {passive: true});
  document.addEventListener('builder:panel', () => { selectedContentsTarget = null; highlightTOC(); });
  document.addEventListener('builder:scroll-top', () => { selectedContentsTarget = null; });
  document.addEventListener('click', event => panel.querySelectorAll('.intro-block-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') panel.querySelectorAll('.intro-block-menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); }); });
  window.Introduction = {
    getSources: () => M.assemble(state),
    validate: (showErrors = false) => { if (showErrors) forceValidation = true; return update(); },
    showField: field => {
      showPanel('introduction', document.getElementById('nav-introduction'));
      jump(sectionId(field));
    }
  };
  Object.keys(sectionViews).forEach(composerControls);
  renderDescription(); renderOpening();
  rich(document.getElementById('creator-note-editor'), 'Creator Note', state.creatorNote, value => { state.creatorNote = value; changed('creatorNote'); });
  update(); updateTOC();
})();
