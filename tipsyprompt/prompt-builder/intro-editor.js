/* Lightweight, local Markdown authoring. Source is the canonical saved value. */
(function () {
  'use strict';

  let nextEditorId = 0;
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const textLabel = value => String(value).replace(/[\\[\]]/g, '\\$&');
  const SYMBOLS = [
    ['✦', 'star sparkle'], ['✧', 'star sparkle outline'], ['☾', 'crescent moon'], ['☽', 'crescent moon right'],
    ['♡', 'heart outline'], ['♥', 'heart'], ['❦', 'floral flourish'], ['❧', 'floral flourish right'],
    ['→', 'arrow right'], ['←', 'arrow left'], ['↔', 'arrow both'], ['•', 'bullet'], ['—', 'em dash'], ['…', 'ellipsis'],
    ['✨', 'sparkles'], ['🌙', 'moon'], ['💖', 'heart pink'], ['🌹', 'rose flower'], ['🔥', 'fire'], ['💫', 'star dizzy'],
    ['😊', 'smile happy'], ['😉', 'wink'], ['😏', 'smirk'], ['🥺', 'pleading'], ['😂', 'laugh'], ['😭', 'cry'],
    ['(=^･ω･^=)', 'cat kaomoji'], ['(｡♥‿♥｡)', 'love kaomoji'], ['¯\\_(ツ)_/¯', 'shrug kaomoji'], ['(╯°□°）╯︵ ┻━┻', 'table flip kaomoji']
  ];

  class IntroEditor {
    static markdownInputRule(text) {
      // Browsers use NBSP for a trailing space in contenteditable paragraphs.
      const normalized = text.replace(/\u00a0/g, ' ');
      if (/^[-+*] $/.test(normalized)) return {kind: 'block', command: 'insertUnorderedList'};
      const ordered = /^(\d{1,9})[.)] $/.exec(normalized);
      if (ordered) return {kind: 'block', command: 'insertOrderedList', start: Number(ordered[1])};
      const heading = /^(#{1,6}) $/.exec(normalized);
      if (heading) return {kind: 'block', command: 'formatBlock', value: 'h' + heading[1].length};
      if (normalized === '> ') return {kind: 'block', command: 'formatBlock', value: 'blockquote'};
      if (!/[*_~`)]$/.test(normalized)) return null;
      const tokens = window.marked.Lexer.lexInline(normalized, {gfm: true});
      const token = tokens.at(-1);
      if (!token || !['strong', 'em', 'del', 'codespan', 'link', 'image'].includes(token.type)) return null;
      // Only explicit Markdown links; an unfinished bare URL must remain editable.
      if (['link', 'image'].includes(token.type) && !/^!?\[/.test(token.raw)) return null;
      const start = normalized.length - token.raw.length;
      // Do not convert *word* halfway through typing **word**, or eat an escape.
      if (start > 0 && /[*_~`\\]/.test(normalized[start - 1])) return null;
      return {kind: 'inline', start, html: window.marked.Parser.parseInline([token])};
    }

    static viewIcon(view) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '1.7');
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = view === 'visual'
        ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
        : '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>';
      return icon;
    }

    constructor(container, options = {}) {
      if (!container) throw new Error('IntroEditor needs a container.');
      this.container = container;
      this.label = options.label || 'Text';
      this.value = String(options.value || '');
      this.onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
      this.getCSS = typeof options.getCSS === 'function' ? options.getCSS : () => '';
      this.advanced = Boolean(options.advanced);
      this.externalViewControls = Boolean(options.externalViewControls);
      this.id = `intro-editor-${++nextEditorId}`;
      this.view = 'visual';
      this.selection = null;
      this.sourceSelection = null;
      this.listeners = [];
      this.destroyed = false;

      this.turndown = new window.TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
      if (window.turndownPluginGfm) this.turndown.use(window.turndownPluginGfm.gfm);
      const escapeMarkdown = this.turndown.escape.bind(this.turndown);
      this.turndown.escape = text => text.split(/(\{\{[^{}]+\}\})/g).map(part => /^\{\{[^{}]+\}\}$/.test(part) ? part : escapeMarkdown(part)).join('');
      this.turndown.addRule('supportedInlineHTML', {
        filter: ['u', 'sub', 'sup', 'kbd', 'mark'],
        replacement: (content, node) => `<${node.nodeName.toLowerCase()}>${content}</${node.nodeName.toLowerCase()}>`
      });
      this.turndown.addRule('authoredPresentation', {
        filter: node => ['SPAN', 'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.nodeName) && Boolean(node.getAttribute('style')),
        replacement: (_, node) => node.nodeName === 'SPAN' ? node.outerHTML : `\n\n${node.outerHTML}\n\n`
      });
      this.turndown.addRule('collapsibleContent', {
        filter: ['details'],
        replacement: (_, node) => `\n\n${node.outerHTML}\n\n`
      });
      // Keep line breaks written inside paragraphs; paragraph boundaries remain Markdown.
      this.turndown.addRule('lineBreak', { filter: 'br', replacement: () => '  \n' });
      this.build();
    }

    listen(target, event, handler, options) {
      target.addEventListener(event, handler, options);
      this.listeners.push(() => target.removeEventListener(event, handler, options));
    }

    button(label, text, action, className = '') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `intro-editor-tool ${className}`.trim();
      button.title = label;
      button.setAttribute('aria-label', `${this.label}: ${label}`);
      button.textContent = text;
      this.listen(button, 'mousedown', event => { this.rememberSelection(); event.preventDefault(); });
      this.listen(button, 'click', action);
      return button;
    }

    build() {
      this.root = document.createElement('div');
      this.root.className = `intro-editor${this.advanced ? ' intro-editor-advanced' : ''}`;
      this.root.dataset.editor = this.id;
      this.root.innerHTML = `<div class="intro-editor-top"><div class="intro-editor-view" role="group" aria-label="${escapeHTML(this.label)} editor view"></div><span class="intro-editor-format">${this.advanced ? 'Markdown · HTML' : 'Markdown'}</span></div><div class="intro-editor-toolbar" role="toolbar" aria-label="${escapeHTML(this.label)} formatting"></div><div class="intro-editor-body"></div><div class="intro-editor-status" role="status" aria-live="polite"></div>`;
      this.container.appendChild(this.root);
      const viewGroup = this.root.querySelector('.intro-editor-view');
      if (this.externalViewControls) {
        this.root.querySelector('.intro-editor-top').remove();
      } else {
        this.visualButton = this.button('Visual', '', () => this.setView('visual'));
        this.sourceButton = this.button('Source', '', () => this.setView('source'));
        this.visualButton.append(IntroEditor.viewIcon('visual'));
        this.sourceButton.append(IntroEditor.viewIcon('source'));
        viewGroup.append(this.visualButton, this.sourceButton);
      }

      this.source = document.createElement('textarea');
      this.source.className = 'intro-editor-source';
      this.source.id = `${this.id}-source`;
      this.source.setAttribute('aria-label', `${this.label} source`);
      this.source.spellcheck = false;
      this.source.value = this.value;
      this.source.hidden = true;
      this.listen(this.source, 'input', () => this.updateValue(this.source.value));
      this.listen(this.source, 'drop', event => {
        // Opening cards reorder through their parent. Never insert their payload as text.
        if (event.dataTransfer?.types.includes('application/x-tipsy-opening-block')) event.preventDefault();
      });
      ['select', 'keyup', 'mouseup'].forEach(event => this.listen(this.source, event, () => this.rememberSelection()));

      const body = this.root.querySelector('.intro-editor-body');
      if (this.advanced) {
        this.frame = document.createElement('iframe');
        this.frame.className = 'intro-editor-frame';
        this.frame.title = `${this.label} visual editor`;
        this.frame.setAttribute('sandbox', 'allow-same-origin');
        this.frame.setAttribute('referrerpolicy', 'no-referrer');
        this.listen(this.frame, 'load', () => this.initializeFrame());
        // No scripts, forms, nested frames or remote styles are permitted in this preview.
        this.frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src http: https: data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><style id="editor-base"></style><style id="editor-authored"></style></head><body><div id="editor-content" contenteditable="true" role="textbox" aria-multiline="true"></div></body></html>';
        body.appendChild(this.frame);
        this.themeObserver = new MutationObserver(() => this.refreshPreview());
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      } else {
        this.visual = document.createElement('div');
        this.visual.className = 'intro-editor-visual';
        this.visual.contentEditable = 'true';
        this.visual.setAttribute('role', 'textbox');
        this.visual.setAttribute('aria-label', `${this.label} visual`);
        this.visual.setAttribute('aria-multiline', 'true');
        this.visual.dataset.placeholder = 'Start writing…';
        body.appendChild(this.visual);
        this.bindVisual();
        this.renderVisual();
      }
      body.appendChild(this.source);
      if (this.advanced) {
        const note = document.createElement('p');
        note.className = 'intro-editor-note';
        note.textContent = 'Visual edits may normalize markup. Source view preserves authored code.';
        this.root.appendChild(note);
      }
      this.buildToolbar();
      this.setView('visual', false);
      this.listen(document, 'pointerdown', event => {
        if (this.popover && !this.popover.contains(event.target) && !this.popoverButton?.contains(event.target)) this.closePopover();
      });
      this.listen(this.root, 'keydown', event => {
        if (event.key === 'Escape' && this.popover) { event.preventDefault(); this.closePopover(true); }
      });
    }

    initializeFrame() {
      if (this.destroyed) return;
      this.visual = this.frame.contentDocument?.getElementById('editor-content');
      if (!this.visual) return;
      this.visual.setAttribute('aria-label', `${this.label} visual`);
      this.bindVisual();
      this.refreshPreview();
      this.renderVisual();
    }

    bindVisual() {
      const doc = this.visual.ownerDocument;
      if (doc !== document) {
        this.listen(doc, 'pointerdown', () => this.closePopover());
        this.listen(doc, 'keydown', event => {
          if (event.key === 'Escape' && this.popover) { event.preventDefault(); this.closePopover(true); }
        });
      }
      this.listen(this.visual, 'input', event => {
        if (this.applyingMarkdown) return;
        if (!event.isComposing && ['insertText', 'insertCompositionText'].includes(event.inputType)) this.applyMarkdownInput();
        this.visualChanged();
      });
      this.listen(this.visual, 'compositionend', () => { this.applyMarkdownInput(); this.visualChanged(); });
      ['keyup', 'mouseup', 'focusout'].forEach(event => this.listen(this.visual, event, () => this.rememberSelection()));
      this.listen(doc, 'selectionchange', () => {
        if (doc.activeElement === this.visual || this.visual.contains(doc.activeElement)) this.rememberSelection();
      });
      this.listen(this.visual, 'click', event => { if (event.target.closest('a')) event.preventDefault(); });
      this.listen(this.visual, 'paste', event => {
        event.preventDefault();
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain') || '';
        this.rememberSelection();
        if (html) this.insertVisual(this.sanitize(html));
        else this.pasteMarkdown(text);
      });
      this.listen(this.visual, 'drop', event => {
        event.preventDefault();
        if (event.dataTransfer?.types.includes('application/x-tipsy-opening-block')) return;
        const text = event.dataTransfer?.getData('text/plain');
        const html = event.dataTransfer?.getData('text/html');
        if (html) this.insertVisual(this.sanitize(html));
        else if (text) this.pasteMarkdown(text);
      });
      this.listen(this.visual, 'keydown', event => {
        if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
          event.preventDefault();
          this.format({ b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]);
        }
      });
    }

    pasteMarkdown(text) {
      const selection = this.visual.ownerDocument.getSelection();
      const node = selection?.anchorNode;
      const parent = node?.nodeType === 1 ? node : node?.parentElement;
      // Code stays literal, including Markdown examples and deliberate escapes.
      if (parent?.closest('pre, code')) { this.command('insertText', text); return; }
      const parsed = window.marked.lexer(text, {gfm: true});
      const html = parsed.length === 1 && parsed[0].type === 'paragraph'
        ? window.marked.Parser.parseInline(parsed[0].tokens)
        : window.marked.parser(parsed);
      this.insertVisual(html);
    }

    applyMarkdownInput() {
      if (this.view !== 'visual' || this.applyingMarkdown) return;
      const doc = this.visual.ownerDocument;
      const selection = doc.getSelection();
      if (!selection?.isCollapsed || !selection.rangeCount) return;
      const caret = selection.getRangeAt(0);
      const node = caret.startContainer;
      if (node.nodeType !== 3 || !this.visual.contains(node) || node.parentElement.closest('pre, code, a')) return;
      const before = node.data.slice(0, caret.startOffset);
      const rule = IntroEditor.markdownInputRule(before);
      if (!rule) return;
      const block = node.parentElement.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote');
      if (rule.kind === 'block') {
        if (!block || !this.visual.contains(block) && block !== this.visual || block.closest('li, pre')) return;
        const prefix = doc.createRange();
        prefix.selectNodeContents(block);
        prefix.setEnd(node, caret.startOffset);
        if (prefix.toString() !== before) return;
      }
      const range = caret.cloneRange();
      range.setStart(node, rule.kind === 'inline' ? rule.start : 0);
      selection.removeAllRanges(); selection.addRange(range);
      this.applyingMarkdown = true;
      try {
        if (rule.kind === 'block') {
          doc.execCommand('delete');
          doc.execCommand(rule.command, false, rule.value || null);
          if (rule.command === 'insertOrderedList' && rule.start !== 1) {
            const anchor = selection.anchorNode;
            (anchor?.nodeType === 1 ? anchor : anchor?.parentElement)?.closest('ol')?.setAttribute('start', String(rule.start));
          }
        } else {
          const typing = ['bold', 'italic', 'strikeThrough'].map(command => [command, doc.queryCommandState(command)]);
          doc.execCommand('insertHTML', false, this.sanitize(rule.html));
          // Leave the completed inline syntax at its outer edge, ready for normal prose.
          let edge = selection.anchorNode?.parentElement;
          if (edge && this.visual.contains(edge)) {
            while (edge.parentElement !== this.visual && edge.parentElement?.matches('strong, b, em, i, del, s, strike, code, a')) edge = edge.parentElement;
            if (edge.matches('strong, b, em, i, del, s, strike, code, a')) {
              const after = doc.createRange(); after.setStartAfter(edge); after.collapse(true);
              selection.removeAllRanges(); selection.addRange(after);
            }
          }
          for (const [command, active] of typing) {
            if (doc.queryCommandState(command) !== active) doc.execCommand(command);
          }
        }
      } finally {
        this.applyingMarkdown = false;
        this.rememberSelection();
      }
    }

    sanitize(html) {
      const options = this.advanced ? {
        ADD_TAGS: ['style'],
        FORCE_BODY: true,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'button', 'textarea', 'select', 'option', 'link', 'meta', 'base', 'svg', 'math'],
        FORBID_ATTR: ['srcdoc', 'formaction', 'autofocus'],
        ALLOW_DATA_ATTR: true
      } : {
        ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'sub', 'sup', 'kbd', 'mark', 'details', 'summary', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a', 'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'align', 'start', 'type', 'checked', 'disabled', 'style', 'open'],
        ALLOW_DATA_ATTR: false
      };
      const clean = window.DOMPurify.sanitize(html, options);
      // DOMPurify handles script URLs. This stricter pass also excludes relative,
      // file and application URLs, so authored content cannot navigate the builder.
      const template = document.createElement('template');
      template.innerHTML = clean;
      if (!this.advanced) template.content.querySelectorAll('[style]').forEach(element => {
        const original = element.style;
        const safe = [];
        for (const name of ['color', 'background-color']) {
          const value = original.getPropertyValue(name).trim();
          if (/^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+\-]+\)|transparent|currentcolor|black|white|red|blue|green|yellow|pink|purple)$/i.test(value)) safe.push(`${name}: ${value}`);
        }
        const family = original.getPropertyValue('font-family').trim();
        if (/^(?:["']?(?:Inter|Outfit|Georgia|Arial|Times New Roman|Courier New)["']?|sans-serif|serif|monospace|system-ui)(?:\s*,\s*(?:sans-serif|serif|monospace|system-ui))*$/i.test(family)) safe.push(`font-family: ${family}`);
        const size = original.getPropertyValue('font-size').trim();
        if (/^(?:\d{1,2}(?:\.\d+)?px|[0-3](?:\.\d+)?(?:em|rem))$/.test(size)) safe.push(`font-size: ${size}`);
        const align = original.getPropertyValue('text-align').trim();
        if (/^(left|center|right|justify)$/.test(align)) safe.push(`text-align: ${align}`);
        if (safe.length) element.setAttribute('style', safe.join('; '));
        else element.removeAttribute('style');
      });
      template.content.querySelectorAll('strike').forEach(element => {
        const replacement = document.createElement('del');
        while (element.firstChild) replacement.appendChild(element.firstChild);
        element.replaceWith(replacement);
      });
      template.content.querySelectorAll('[align]').forEach(element => {
        const align = element.getAttribute('align');
        if (/^(left|center|right|justify)$/.test(align)) element.style.textAlign = align;
        element.removeAttribute('align');
      });
      template.content.querySelectorAll('input').forEach(element => {
        if (element.getAttribute('type')?.toLowerCase() !== 'checkbox') {
          element.remove();
          return;
        }
        element.setAttribute('disabled', '');
        if (element.checked) element.setAttribute('checked', '');
        else element.removeAttribute('checked');
      });
      template.content.querySelectorAll('[href], [src]').forEach(element => {
        ['href', 'src'].forEach(attribute => {
          if (!element.hasAttribute(attribute)) return;
          const value = element.getAttribute(attribute).trim();
          const allowedDataImage = this.advanced && attribute === 'src' && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value);
          if (!allowedDataImage && !this.validURL(value, attribute === 'href')) element.removeAttribute(attribute);
        });
        if (element.tagName === 'A') element.setAttribute('rel', 'noopener noreferrer');
      });
      return template.innerHTML;
    }

    validURL(value, link = false) {
      try {
        const url = new URL(value);
        return ['https:', 'http:', ...(link ? ['mailto:'] : [])].includes(url.protocol);
      } catch (_) { return false; }
    }

    renderVisual() {
      if (!this.visual) return;
      const html = window.marked.parse(this.value, { gfm: true, breaks: false });
      this.visual.innerHTML = this.sanitize(html);
      this.lastVisualHTML = this.visual.innerHTML;
      this.selection = null;
    }

    visualChanged() {
      if (!this.visual) return;
      if (this.visual.innerHTML === this.lastVisualHTML) return;
      this.lastVisualHTML = this.visual.innerHTML;
      const html = this.sanitize(this.visual.innerHTML);
      let next;
      if (this.advanced) {
        const probe = document.createElement('template');
        probe.innerHTML = html;
        probe.content.querySelectorAll('style').forEach(style => style.remove());
        const hasText = Boolean(probe.content.textContent.replace(/[\s\u200B-\u200D\uFEFF]/g, ''));
        const hasStructure = Boolean(probe.content.querySelector('img[src], hr, table, video[src], audio[src]'));
        next = hasText || hasStructure ? html : '';
      } else next = this.turndown.turndown(html);
      this.updateValue(next);
      this.rememberSelection();
    }

    updateValue(value) {
      if (value === this.value) return;
      this.value = value;
      if (this.source.value !== value) this.source.value = value;
      this.onChange(value);
    }

    getValue() { return this.value; }

    setValue(value) {
      this.value = String(value ?? '');
      this.source.value = this.value;
      this.renderVisual();
    }

    setView(view, focus = true) {
      this.closePopover();
      if (view === 'visual' && this.view !== 'visual') this.renderVisual();
      this.view = view;
      this.source.hidden = view !== 'source';
      if (this.frame) this.frame.hidden = view !== 'visual';
      else if (this.visual) this.visual.hidden = view !== 'visual';
      this.visualButton?.setAttribute('aria-pressed', String(view === 'visual'));
      this.sourceButton?.setAttribute('aria-pressed', String(view === 'source'));
      if (focus) (view === 'source' ? this.source : this.visual)?.focus();
    }

    refreshPreview() {
      if (!this.frame?.contentDocument || !this.visual) return;
      const style = getComputedStyle(this.root);
      const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
      this.frame.contentDocument.getElementById('editor-base').textContent = `
        :root { color-scheme: dark; } * { box-sizing: border-box; }
        html { min-height: 100%; background: ${token('--bg-deep', '#15131a')}; color: ${token('--cream', '#f2eff5')}; }
        body { margin: 0; padding: 16px; font: 14px/1.65 ${token('--sans', 'sans-serif')}; overflow-wrap: anywhere; }
        #editor-content { min-height: calc(100vh - 32px); outline: none; }
        p, ul, ol, blockquote, pre, table { margin: 0 0 .85em; }
        p:last-child { margin-bottom: 0; } h1,h2,h3,h4,h5,h6 { margin: 1em 0 .45em; line-height: 1.3; font-family: ${token('--serif', 'sans-serif')}; }
        h1 { font-size: 1.8em; } h2 { font-size: 1.55em; } h3 { font-size: 1.3em; } h4,h5,h6 { font-size: 1.1em; }
        ul,ol { padding-left: 1.6em; } blockquote { border-left: 3px solid ${token('--red', '#ff2e88')}; padding-left: 1em; }
        a { color: ${token('--red', '#ff2e88')}; text-decoration: underline; } img { max-width: 100%; height: auto; }
        code,pre { font-family: ui-monospace, monospace; } pre { white-space: pre-wrap; background: ${token('--bg-card', '#1a171f')}; padding: 12px; border-radius: 7px; }
        table { border-collapse: collapse; width: 100%; } td,th { border: 1px solid ${token('--border', '#2e2935')}; padding: 7px; text-align: left; }
        hr { border: 0; border-top: 1px solid ${token('--border', '#2e2935')}; margin: 1.2em 0; }
      `;
      this.frame.contentDocument.getElementById('editor-authored').textContent = String(this.getCSS() || '');
    }

    rememberSelection() {
      if (this.view === 'source') {
        this.sourceSelection = [this.source.selectionStart, this.source.selectionEnd];
        return;
      }
      if (!this.visual) return;
      const selection = this.visual.ownerDocument.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (this.visual.contains(range.commonAncestorContainer) || range.commonAncestorContainer === this.visual) this.selection = range.cloneRange();
    }

    restoreSelection() {
      if (this.view === 'source') {
        this.source.focus();
        if (this.sourceSelection) this.source.setSelectionRange(...this.sourceSelection);
        return;
      }
      if (!this.visual) return;
      this.visual.focus();
      const selection = this.visual.ownerDocument.getSelection();
      if (this.selection && this.visual.contains(this.selection.commonAncestorContainer)) {
        selection.removeAllRanges(); selection.addRange(this.selection);
      } else {
        const range = this.visual.ownerDocument.createRange();
        range.selectNodeContents(this.visual); range.collapse(false);
        selection.removeAllRanges(); selection.addRange(range);
      }
    }

    selectedText() {
      if (this.view === 'source') return this.source.value.slice(this.source.selectionStart, this.source.selectionEnd);
      return this.selection?.toString() || '';
    }

    replaceSource(replacement, selectOffset = null, selectLength = null) {
      this.restoreSelection();
      const start = this.source.selectionStart;
      // insertText joins the browser's native undo history; setRangeText is the fallback.
      const inserted = document.execCommand('insertText', false, replacement);
      if (!inserted) this.source.setRangeText(replacement, this.source.selectionStart, this.source.selectionEnd, 'end');
      if (selectOffset !== null) this.source.setSelectionRange(start + selectOffset, start + selectOffset + (selectLength ?? 0));
      this.updateValue(this.source.value);
      this.rememberSelection();
    }

    wrapSource(before, after = before, placeholder = 'text', toggle = false) {
      const raw = this.selectedText();
      if (toggle) {
        const [start,end] = this.sourceSelection || [this.source.selectionStart,this.source.selectionEnd];
        if (start >= before.length && this.source.value.slice(start-before.length,start) === before && this.source.value.slice(end,end+after.length) === after) {
          this.sourceSelection = [start-before.length,end+after.length];
          this.replaceSource(raw,0,raw.length); return;
        }
        if (raw.startsWith(before) && raw.endsWith(after) && raw.length >= before.length+after.length) {
          const inner=raw.slice(before.length,raw.length-after.length);
          this.replaceSource(inner,0,inner.length); return;
        }
      }
      const selected = raw || placeholder;
      this.replaceSource(before + selected + after, before.length, selected.length);
    }

    prefixSourceLines(prefix, placeholder = 'Text') {
      const [start, end] = this.sourceSelection || [this.source.selectionStart, this.source.selectionEnd];
      const value = this.source.value;
      const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
      const effectiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
      const nextBreak = value.indexOf('\n', effectiveEnd);
      const lineEnd = nextBreak === -1 ? value.length : nextBreak;
      const selected = value.slice(lineStart, lineEnd) || placeholder;
      this.sourceSelection = [lineStart, lineEnd];
      this.replaceSource(selected.split('\n').map((line, index) => (typeof prefix === 'function' ? prefix(index) : prefix) + line.replace(/^(?:#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/, '')).join('\n'));
    }

    command(command, value = null) {
      if (!this.visual) return;
      this.restoreSelection();
      this.visual.ownerDocument.execCommand(command, false, value);
      this.visualChanged();
    }

    insertVisual(html) { this.command('insertHTML', this.sanitize(html)); }

    format(action) {
      this.closePopover();
      if (this.view === 'source') {
        const wraps = { bold: ['**'], italic: ['*'], underline: ['<u>', '</u>'], strikeThrough: ['~~'], subscript: ['<sub>', '</sub>'], superscript: ['<sup>', '</sup>'], inlineCode: ['`'], codeBlock: ['\n```\n', '\n```\n'] };
        if (wraps[action]) { const [before,after=before]=wraps[action]; this.wrapSource(before,after,'text',true); return; }
        if (action === 'quote') { this.prefixSourceLines('> '); return; }
        if (action === 'unordered') { this.prefixSourceLines('- '); return; }
        if (action === 'ordered') { this.prefixSourceLines(index => `${index + 1}. `); return; }
        if (action === 'hr') { this.replaceSource('\n\n---\n\n'); return; }
        if (action === 'table') { this.replaceSource('\n\n| Heading | Heading |\n| --- | --- |\n| Text | Text |\n| Text | Text |\n\n'); return; }
        if (action === 'undo' || action === 'redo') { this.restoreSelection(); document.execCommand(action); this.updateValue(this.source.value); return; }
        if (action === 'removeFormat') {
          const html = window.marked.parse(this.selectedText(), { gfm: true });
          const holder = document.createElement('div'); holder.innerHTML = this.sanitize(html);
          this.replaceSource(holder.textContent.trim());
          return;
        }
      } else {
        if (action === 'inlineCode') { this.insertVisual(`<code>${escapeHTML(this.selectedText() || 'code')}</code>`); return; }
        if (action === 'codeBlock') { this.command('formatBlock', 'pre'); return; }
        if (action === 'quote') { this.command('formatBlock', 'blockquote'); return; }
        if (action === 'unordered') { this.command('insertUnorderedList'); return; }
        if (action === 'ordered') { this.command('insertOrderedList'); return; }
        if (action === 'hr') { this.command('insertHorizontalRule'); return; }
        if (action === 'table') { this.insertVisual('<table><thead><tr><th>Heading</th><th>Heading</th></tr></thead><tbody><tr><td>Text</td><td>Text</td></tr><tr><td>Text</td><td>Text</td></tr></tbody></table><p><br></p>'); return; }
        this.command(action);
      }
    }

    buildToolbar() {
      const toolbar = this.root.querySelector('.intro-editor-toolbar');
      const headings = this.button('Headings', 'H⌄', () => this.showHeadings(headings));
      headings.setAttribute('aria-expanded', 'false');
      toolbar.appendChild(headings);
      [
        ['Bold', 'B', 'bold', 'intro-editor-bold'], ['Italic', 'I', 'italic', 'intro-editor-italic'],
        ['Underline', 'U', 'underline', 'intro-editor-underline'], ['Strikethrough', 'S', 'strikeThrough', 'intro-editor-strike'],
        ['Quote', '❞', 'quote'], ['Inline code', '</>', 'inlineCode'], ['Code block', '{ }', 'codeBlock'],
        ['Bulleted list', '• ≡', 'unordered'], ['Numbered list', '1. ≡', 'ordered']
      ].forEach(([label, text, action, className]) => toolbar.appendChild(this.button(label, text, () => this.format(action), className)));
      toolbar.appendChild(this.button('Insert link', '↗', () => this.showInsertDialog('link')));
      toolbar.appendChild(this.button('Insert image', '▧', () => this.showInsertDialog('image')));
      toolbar.appendChild(this.button('Insert table', '▦', () => this.format('table')));
      toolbar.appendChild(this.button('Horizontal rule', '―', () => this.format('hr')));
      const symbols = this.button('Symbols and emoji', '☺', () => this.showSymbols(symbols));
      symbols.setAttribute('aria-expanded', 'false');
      toolbar.appendChild(symbols);
      toolbar.appendChild(this.button('Clear formatting', 'Tx', () => this.format('removeFormat')));
      toolbar.appendChild(this.button('Undo', '↶', () => this.format('undo')));
      toolbar.appendChild(this.button('Redo', '↷', () => this.format('redo')));
    }

    openPopover(button, title) {
      this.closePopover();
      this.rememberSelection();
      this.popoverButton = button;
      button.setAttribute('aria-expanded', 'true');
      const popover = document.createElement('div');
      popover.className = 'intro-editor-popover';
      popover.setAttribute('role', 'group');
      popover.setAttribute('aria-label', title);
      this.root.appendChild(popover);
      const toolbar = this.root.querySelector('.intro-editor-toolbar');
      popover.style.top = `${toolbar.offsetTop + toolbar.offsetHeight + 4}px`;
      this.popover = popover;
      return popover;
    }

    closePopover(focus = false) {
      if (!this.popover) return;
      this.popover.remove(); this.popover = null;
      this.popoverButton?.setAttribute('aria-expanded', 'false');
      if (focus) this.popoverButton?.focus();
      this.popoverButton = null;
    }

    showHeadings(button) {
      if (this.popoverButton === button) { this.closePopover(true); return; }
      const popover = this.openPopover(button, 'Text structure');
      for (let level = 0; level <= 6; level++) {
        const option = this.button(level ? `Heading ${level}` : 'Paragraph', level ? `H${level}` : '¶', () => {
          this.closePopover();
          if (this.view === 'source') {
            this.prefixSourceLines(level ? '#'.repeat(level) + ' ' : '', level ? 'Heading' : 'Text');
          } else this.command('formatBlock', level ? `h${level}` : 'p');
        });
        popover.appendChild(option);
      }
      popover.appendChild(this.button('Superscript', 'x²', () => this.format('superscript')));
      popover.appendChild(this.button('Subscript', 'x₂', () => this.format('subscript')));
      popover.querySelector('button')?.focus();
    }

    showSymbols(button) {
      if (this.popoverButton === button) { this.closePopover(true); return; }
      const popover = this.openPopover(button, 'Symbols and emoji');
      popover.classList.add('intro-editor-symbols');
      const search = document.createElement('input');
      search.type = 'search'; search.placeholder = 'Search symbols and emoji…';
      search.setAttribute('aria-label', `${this.label}: Search symbols and emoji`);
      const grid = document.createElement('div'); grid.className = 'intro-editor-symbol-grid';
      const populate = () => {
        grid.replaceChildren();
        const entries = SYMBOLS.filter(([symbol, keywords]) => `${symbol} ${keywords}`.toLowerCase().includes(search.value.toLowerCase()));
        entries.forEach(([symbol, keywords]) => {
          const choice = this.button(keywords, symbol, () => {
            this.closePopover();
            if (this.view === 'source') this.replaceSource(symbol);
            else this.command('insertText', symbol);
          });
          if (symbol.length > 4) choice.classList.add('intro-editor-kaomoji');
          grid.appendChild(choice);
        });
        if (!entries.length) { const empty = document.createElement('span'); empty.textContent = 'No matching symbols'; grid.appendChild(empty); }
      };
      this.listen(search, 'input', populate);
      popover.append(search, grid); populate(); search.focus();
    }

    showInsertDialog(type) {
      this.closePopover();
      this.rememberSelection();
      const image = type === 'image';
      const selected = this.selectedText();
      const dialog = document.createElement('dialog');
      dialog.className = 'intro-editor-dialog';
      dialog.setAttribute('aria-labelledby', `${this.id}-dialog-title`);
      dialog.innerHTML = `<form><h3 id="${this.id}-dialog-title">Insert ${type}</h3><label for="${this.id}-url">${image ? 'Image URL' : 'Link URL'}</label><input id="${this.id}-url" name="url" type="url" placeholder="https://" required><label for="${this.id}-text">${image ? 'Alt text' : 'Link text'}</label><input id="${this.id}-text" name="text" type="text"><p class="intro-editor-dialog-hint">${image ? 'Use a public HTTPS or HTTP image URL.' : 'Use an HTTPS, HTTP, or mailto link.'}</p><div class="intro-editor-dialog-actions"><button type="button" class="intro-editor-dialog-cancel">Cancel</button><button type="submit">Apply</button></div></form>`;
      this.root.appendChild(dialog);
      this.dialog = dialog;
      const url = dialog.querySelector('[name="url"]');
      const text = dialog.querySelector('[name="text"]');
      text.value = selected;
      const close = () => { dialog.close(); dialog.remove(); this.dialog = null; this.restoreSelection(); };
      this.listen(dialog.querySelector('.intro-editor-dialog-cancel'), 'click', close);
      this.listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
      this.listen(dialog, 'click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      });
      this.listen(url, 'input', () => url.setCustomValidity(''));
      this.listen(dialog.querySelector('form'), 'submit', event => {
        event.preventDefault();
        const href = url.value.trim();
        if (!this.validURL(href, !image)) { url.setCustomValidity(image ? 'Enter a complete HTTP or HTTPS image URL.' : 'Enter a complete HTTP, HTTPS, or mailto link.'); url.reportValidity(); return; }
        const label = text.value || (image ? '' : href);
        close();
        if (this.view === 'source') {
          const destination = href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');
          this.replaceSource(`${image ? '!' : ''}[${textLabel(label)}](${destination})`);
        } else this.insertVisual(image ? `<img src="${escapeHTML(href)}" alt="${escapeHTML(label)}">` : `<a href="${escapeHTML(href)}">${escapeHTML(label)}</a>`);
      });
      dialog.showModal(); url.focus();
    }

    destroy() {
      this.destroyed = true;
      this.closePopover();
      if (this.dialog?.open) this.dialog.close();
      this.themeObserver?.disconnect();
      this.listeners.forEach(remove => remove());
      this.listeners = [];
      this.root.remove();
    }
  }

  window.IntroEditor = IntroEditor;
})();
