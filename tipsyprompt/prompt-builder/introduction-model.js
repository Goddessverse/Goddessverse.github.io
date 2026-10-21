(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.IntroModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIMITS = Object.freeze({ name: 50, description: 100000, opening: 20000, creatorNote: 2000 });
  const LABELS = Object.freeze({ name: 'Name', description: 'Description', opening: 'Opening', creatorNote: 'Creator Note' });
  const MODES = Object.freeze({ description: ['native', 'intermediate', 'advanced'], opening: ['native', 'intermediate', 'alternate'] });
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const join = parts => parts.map(clean).filter(Boolean).join('\n\n');

  function createState() {
    return {
      name: '',
      description: {
        mode: 'native', native: '', advanced: { content: '', css: '' },
        intermediate: { hook: '', orientation: '', focus: '', tags: '', delimiter: '✦', warning: '' }
      },
      opening: {
        mode: 'native', native: '',
        intermediate: { narration: '', image: '', alt: '', dialogue: '', beat: '' },
        alternate: []
      },
      creatorNote: ''
    };
  }

  function count(text) {
    let total = 0;
    for (const character of typeof text === 'string' ? text : '') total++;
    return total;
  }

  function isValidImageURL(value) {
    const url = clean(value);
    if (!/^https?:\/\//i.test(url) || /[\u0000-\u001f\u007f]/.test(url)) return false;
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
    } catch (_) {
      return false;
    }
  }

  function serializeImage(value, alt) {
    const url = clean(value);
    if (!isValidImageURL(url)) return '';
    const escapedAlt = clean(alt).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const escapedURL = url.replace(/[ ()]/g, character => ({ ' ': '%20', '(': '%28', ')': '%29' })[character]);
    return `![${escapedAlt}](${escapedURL})`;
  }

  function assembleDescription(state) {
    const description = state.description;
    if (description.mode === 'advanced') {
      const css = clean(description.advanced.css);
      return join([description.advanced.content, css ? `<style>\n${css}\n</style>` : '']);
    }
    if (description.mode === 'intermediate') {
      const guided = description.intermediate;
      const tags = clean(guided.tags).split(',').map(clean).filter(Boolean);
      const delimiter = clean(guided.delimiter);
      const tagline = tags.join(delimiter ? ` ${delimiter} ` : ' ');
      const warning = clean(guided.warning);
      return join([guided.hook, guided.orientation, guided.focus, tagline, warning ? `Content Warning: ${warning}` : '']);
    }
    return clean(description.native);
  }

  function assembleOpening(state) {
    const opening = state.opening;
    if (opening.mode === 'intermediate') {
      const guided = opening.intermediate;
      return join([
        guided.narration, serializeImage(guided.image, guided.alt), guided.dialogue, guided.beat
      ]);
    }
    if (opening.mode === 'alternate') {
      return join(opening.alternate.map(block => {
        if (block.type === 'image') return serializeImage(block.url, block.alt);
        if (block.type === 'narration' || block.type === 'dialogue') return block.content;
        return '';
      }));
    }
    return clean(opening.native);
  }

  function assemble(state) {
    return {
      name: clean(state.name), description: assembleDescription(state),
      opening: assembleOpening(state), creatorNote: clean(state.creatorNote)
    };
  }

  function validate(state) {
    const fields = assemble(state);
    const errors = [];
    for (const [field, value] of Object.entries(fields)) {
      if (field !== 'creatorNote' && !value) errors.push({ field, message: `${LABELS[field]} is required.` });
      const total = count(value);
      if (total > LIMITS[field]) {
        errors.push({ field, message: `${LABELS[field]} is ${total.toLocaleString('en-US')} characters; the limit is ${LIMITS[field].toLocaleString('en-US')}.` });
      }
    }
    const checkImage = (value, label) => {
      if (clean(value) && !isValidImageURL(value)) {
        errors.push({ field: 'opening', message: `${label} must use a valid http:// or https:// URL.` });
      }
    };
    if (state.opening.mode === 'intermediate') {
      checkImage(state.opening.intermediate.image, 'Opening image');
    } else if (state.opening.mode === 'alternate') {
      state.opening.alternate.forEach((block, index) => {
        if (block.type === 'image') checkImage(block.url, `Opening image block ${index + 1}`);
      });
    }
    return errors;
  }

  function switchMode(state, section, target) {
    if (!Object.prototype.hasOwnProperty.call(MODES, section) || !MODES[section].includes(target)) {
      throw new RangeError(`Unsupported Introduction mode: ${section}/${target}`);
    }
    state[section].mode = target;
    return state;
  }

  function moveBlock(state, id, targetIndex) {
    const blocks = state.opening.alternate;
    const sourceIndex = blocks.findIndex(block => block.id === id);
    if (sourceIndex === -1 || !Number.isInteger(targetIndex)) return state;
    const destination = Math.max(0, Math.min(blocks.length - 1, targetIndex));
    if (sourceIndex !== destination) blocks.splice(destination, 0, blocks.splice(sourceIndex, 1)[0]);
    return state;
  }

  function removeBlock(state, id) {
    const blocks = state.opening.alternate;
    const index = blocks.findIndex(block => block.id === id);
    if (index !== -1) blocks.splice(index, 1);
    return state;
  }

  return Object.freeze({ LIMITS, createState, assembleDescription, assembleOpening, assemble, count, validate, switchMode, isValidImageURL, serializeImage, moveBlock, removeBlock });
});
