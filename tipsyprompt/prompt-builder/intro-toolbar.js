/* Auri's grouped toolbar, adapted to Tipsy's local Visual / Source editors. */
(function () {
  'use strict';
  const Editor = window.IntroEditor;
  const data = window.IntroToolbarData;
  const icons = window.IntroToolbarIcons;
  const html = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key, value);
    for (const [tag, attrs] of icons[name] || icons.type) {
      const child = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attrs)) if (key !== 'key') child.setAttribute(key, value);
      svg.append(child);
    }
    return svg;
  }
  function button(editor, label, name, action, options = {}) {
    const el = make('button', `intro-editor-tool auri-tool ${options.className || ''}`);
    el.type = 'button'; el.title = options.hint || label;
    el.setAttribute('aria-label', `${editor.label}: ${label}`);
    if (name) el.append(icon(name));
    if (options.text) el.append(make('span', '', options.text));
    if (options.pressed !== undefined) el.setAttribute('aria-pressed', String(options.pressed));
    if (options.disabled) el.disabled = true;
    el.addEventListener('pointerdown', () => editor.rememberSelection());
    el.addEventListener('mousedown', event => { editor.rememberSelection(); event.preventDefault(); });
    el.addEventListener('click', action);
    return el;
  }
  const separator = () => { const el = make('span','auri-divider'); el.setAttribute('aria-hidden','true'); return el; };
  const note = (parent, text) => parent.append(make('p', 'auri-menu-note', text));
  function stored() { try { const value=JSON.parse(localStorage.getItem('tipsy-auri-picker') || '{}'); return value && typeof value==='object' && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } }
  let library = stored();
  if (!Array.isArray(library.recent)) library.recent = [];
  if (!Array.isArray(library.favorite)) library.favorite = [];
  const saveLibrary = () => { try { localStorage.setItem('tipsy-auri-picker', JSON.stringify(library)); } catch (_) {} };
  const allGlyphs = data.categories.flatMap(category => category.items.map(item => ({...item, section:category.id})));
  const rememberSelection = Editor.prototype.rememberSelection;
  Editor.prototype.rememberSelection = function () {
    rememberSelection.call(this);
    if (!this.toolbarFormattingButtons) return;
    for (const [action, control] of Object.entries(this.toolbarFormattingButtons)) {
      let active = false;
      if (this.view === 'visual' && this.visual && this.selection) {
        const range=this.selection;
        const node=range.startContainer.nodeType===3?range.startContainer:range.startContainer.childNodes[range.startOffset]||range.startContainer;
        const element=node.nodeType===1?node:node.parentElement;
        const styled=element?.closest(action==='bold'?'strong,b':'em,i');
        active=Boolean(styled&&this.visual.contains(styled));
      }
      else if (this.view === 'source') {
        const marker=action==='bold'?'**':'*', start=this.source.selectionStart, end=this.source.selectionEnd;
        active = this.source.value.slice(Math.max(0,start-marker.length),start)===marker && this.source.value.slice(end,end+marker.length)===marker;
        if(action==='italic' && this.source.value.slice(Math.max(0,start-2),start)==='**')active=false;
      }
      control.setAttribute('aria-pressed',String(active));
    }
  };

  Editor.prototype.placePopover = function () {
    if (!this.popover || !this.popoverButton) return;
    const popup = this.popover, anchor = this.popoverButton.getBoundingClientRect();
    const margin = 12, available = window.innerHeight - margin * 2;
    popup.style.maxHeight = `${available}px`;
    const bounds = popup.getBoundingClientRect();
    const left = Math.max(margin, Math.min(anchor.left - 8, window.innerWidth - bounds.width - margin));
    const below = window.innerHeight - anchor.bottom - margin - 8;
    const above = anchor.top - margin - 8;
    const upwards = bounds.height > below && above > below;
    popup.style.maxHeight = `${Math.max(120, upwards ? above : below)}px`;
    const height = Math.min(bounds.height, Math.max(120, upwards ? above : below));
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(margin, upwards ? anchor.top - height - 8 : anchor.bottom + 8)}px`;
  };
  Editor.prototype.openPopover = function (trigger, title) {
    this.closePopover(); this.rememberSelection();
    this.popoverButton = trigger; trigger.setAttribute('aria-expanded','true');
    const popup = make('div','intro-editor-popover auri-popover');
    popup.setAttribute('role','dialog'); popup.setAttribute('aria-label',`${this.label}: ${title}`);
    popup.style.visibility = 'hidden';
    const header = make('div','auri-menu-heading');
    header.append(make('span','',title),button(this,'Close menu','x',()=>this.closePopover(true)));
    const panel = make('div','auri-menu-panel');
    popup.append(header,panel); document.body.append(popup); this.popover = popup;
    popup.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.closePopover(true); }
      if (['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key) && event.target.tagName === 'BUTTON') {
        const siblings = Array.from(event.target.parentElement.querySelectorAll(':scope > button:not(:disabled)'));
        if (siblings.length < 2) return;
        const at = siblings.indexOf(event.target), delta = ['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1;
        event.preventDefault(); siblings[(at + delta + siblings.length) % siblings.length]?.focus();
      }
    });
    requestAnimationFrame(() => {
      if (this.popover !== popup) return;
      this.placePopover(); popup.style.visibility = '';
      if (!popup.contains(document.activeElement)) panel.querySelector('button:not(:disabled),input,select')?.focus();
    });
    return panel;
  };
  function menu(editor, trigger, title, build) {
    if (editor.popoverButton === trigger) { editor.closePopover(true); return; }
    build(editor.openPopover(trigger,title));
  }
  Editor.prototype.menuStrip = function (parent, entries) {
    const strip = make('div','auri-menu-strip');
    for (const entry of entries) {
      if (!entry) { strip.append(separator()); continue; }
      const [label, name, action, options = {}] = entry;
      strip.append(button(this,label,name,action,options));
    }
    parent.append(strip); return strip;
  };
  Editor.prototype.insertText = function (text) {
    if (this.view === 'source') this.replaceSource(text);
    else this.command('insertText',text);
  };
  Editor.prototype.insertMarkup = function (source, visual) {
    this.closePopover();
    if (this.view === 'source') this.replaceSource(source);
    else this.insertVisual(visual === undefined ? window.marked.parse(source) : visual);
  };
  Editor.prototype.wrapMarkup = function (before, after, placeholder='text') {
    this.closePopover();
    if (this.view === 'source') this.wrapSource(before,after,placeholder);
    else this.insertVisual(before + (this.selectedHTML() || html(placeholder)) + after);
  };
  Editor.prototype.selectedHTML = function () {
    if (!this.selection || !this.visual?.contains(this.selection.commonAncestorContainer)) return '';
    const holder = document.createElement('div'); holder.append(this.selection.cloneContents());
    return this.sanitize(holder.innerHTML);
  };
  Editor.prototype.notice = function (text) { this.root.querySelector('.intro-editor-status').textContent = text; };
  Editor.prototype.applyPresentation = function (property, value) {
    this.wrapMarkup(`<span style="${property}: ${html(value)}">`,'</span>');
  };
  Editor.prototype.alignText = function (align) {
    this.closePopover();
    if (this.view === 'source') {
      const [start,end] = this.sourceSelection || [this.source.selectionStart,this.source.selectionEnd];
      const lineStart = this.source.value.lastIndexOf('\n',Math.max(0,start - 1)) + 1;
      const effectiveEnd=end>start && this.source.value[end-1]==='\n' ? end-1 : end;
      const nextBreak = this.source.value.indexOf('\n',effectiveEnd);
      const lineEnd = nextBreak < 0 ? this.source.value.length : nextBreak;
      this.sourceSelection = [start === 0 ? 0 : lineStart,lineEnd];
      const content = this.source.value.slice(...this.sourceSelection) || 'Text';
      this.replaceSource(`<div style="text-align: ${align}">${this.sanitize(window.marked.parse(content)).trim()}</div>`);
    } else this.command({left:'justifyLeft',center:'justifyCenter',right:'justifyRight',justify:'justifyFull'}[align]);
  };
  Editor.prototype.transformSourceLines = function (transform) {
    const [start,end] = this.sourceSelection || [this.source.selectionStart,this.source.selectionEnd];
    const value = this.source.value;
    const from = start === 0 ? 0 : value.lastIndexOf('\n',start - 1) + 1;
    const boundary = value.indexOf('\n',end > start && value[end - 1] === '\n' ? end - 1 : end);
    const to = boundary < 0 ? value.length : boundary;
    this.sourceSelection = [from,to]; this.replaceSource(transform(value.slice(from,to)));
  };
  Editor.prototype.indentText = function (outdent) {
    this.closePopover();
    if (this.view === 'source') this.transformSourceLines(text => text.split('\n').map(line => outdent ? line.replace(/^( {1,4}|\t)/,'') : '    '+line).join('\n'));
    else this.command(outdent ? 'outdent' : 'indent');
  };
  Editor.prototype.selectionElement = function () {
    const node = this.selection?.startContainer;
    return node?.nodeType === 1 ? node : node?.parentElement;
  };
  Editor.prototype.moveLine = function (direction) {
    this.closePopover();
    if (this.view === 'source') {
      const value = this.source.value, [start,end] = this.sourceSelection || [0,0];
      const lines = value.split('\n'), first = value.slice(0,start).split('\n').length - 1;
      const last = value.slice(0,end > start && value[end - 1] === '\n' ? end - 1 : end).split('\n').length - 1;
      if (direction < 0 && first === 0 || direction > 0 && last === lines.length - 1) return;
      const from = direction < 0 ? first - 1 : first, to = direction < 0 ? last : last + 1;
      const chunk = lines.slice(from,to+1);
      if (direction < 0) chunk.push(chunk.shift()); else chunk.unshift(chunk.pop());
      const position = lines.slice(0,from).join('\n').length + (from ? 1 : 0);
      const originalLineStart = lines.slice(0,first).join('\n').length + (first ? 1 : 0);
      const selectionOffset = (direction < 0 ? 0 : chunk[0].length + 1) + start - originalLineStart;
      this.sourceSelection = [position,position + lines.slice(from,to+1).join('\n').length];
      this.replaceSource(chunk.join('\n'),selectionOffset,end-start);
    } else {
      const block = this.selectionElement()?.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,div');
      if (!block || block === this.visual || !this.visual.contains(block)) return;
      const sibling = direction < 0 ? block.previousElementSibling : block.nextElementSibling;
      if (!sibling) return;
      const range = this.visual.ownerDocument.createRange();
      const first = direction < 0 ? sibling : block, last = direction < 0 ? block : sibling;
      range.setStartBefore(first); range.setEndAfter(last); this.selection = range;
      this.insertVisual(last.outerHTML + first.outerHTML);
    }
  };
  Editor.prototype.showHeadings = function (trigger) {
    menu(this,trigger,'Headings',parent => {
      const entries = [1,2,3,4,5,6].map(level=>[`Heading ${level}`,`heading-${level}`,()=>{
        this.closePopover();
        if (this.view==='source') this.prefixSourceLines('#'.repeat(level)+' ','Heading');
        else this.command('formatBlock',`h${level}`);
      }]);
      entries.push(null,['Paragraph','pilcrow',()=>{this.closePopover();if(this.view==='source')this.prefixSourceLines('');else this.command('formatBlock','p');}],null,['Superscript','superscript',()=>this.format('superscript')],['Subscript','subscript',()=>this.format('subscript')]);
      this.menuStrip(parent,entries);
    });
  };
  Editor.prototype.showTypography = function (trigger) {
    menu(this,trigger,'Typography',parent=>{
      const tabs=make('div','auri-menu-tabs'), content=make('div','auri-menu-panel');
      parent.append(tabs,content);
      const choose = kind=>{
        content.replaceChildren();
        tabs.querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.kind===kind)));
        if(kind==='unicode'){
          note(content,'Unicode styles change the characters in your exported text.');
          const list=make('div','auri-font-list');
          data.styles.forEach(style=>{
            list.append(button(this,`Unicode style: ${style.name}`,null,()=>{
              const selected=this.selectedText();
              if(!selected){this.notice('Select the text you want to restyle.');this.closePopover(true);return;}
              const prior=this.fancyOrigin;
              const sameSource=prior?.value===this.value && prior.view===this.view;
              let sameRange=false;
              if(sameSource && this.view==='source') sameRange=prior.start===this.source.selectionStart&&prior.end===this.source.selectionEnd;
              else if(sameSource && prior.range && this.selection) sameRange=prior.range.compareBoundaryPoints(0,this.selection)===0&&prior.range.compareBoundaryPoints(2,this.selection)===0;
              const transform=text=>style.name==='Plain'?data.plainText(text):data.styledText(style.name,text);
              this.closePopover();
              if(this.view==='source') {
                const original=sameRange?prior.original:selected;
                const result=style.name==='Plain'&&sameRange?original:transform(original);
                this.replaceSource(result,0,result.length);
                this.fancyOrigin={original,value:this.value,view:this.view,start:this.source.selectionStart,end:this.source.selectionEnd};
              } else {
                const original=sameRange?prior.original:this.selectedHTML();
                const fragment=document.createElement('div');fragment.innerHTML=original;
                if(!(sameRange&&style.name==='Plain')){
                  const walker=document.createTreeWalker(fragment,NodeFilter.SHOW_TEXT);
                  let textNode;while((textNode=walker.nextNode()))textNode.nodeValue=transform(textNode.nodeValue);
                }
                this.restoreSelection();
                const wrapperTag=fragment.querySelector('p,div,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote')?'div':'span';
                this.visual.ownerDocument.execCommand('insertHTML',false,`<${wrapperTag} id="${this.id}-restyle">${this.sanitize(fragment.innerHTML)}</${wrapperTag}>`);
                const wrapper=this.visual.querySelector(`#${this.id}-restyle`);
                if(wrapper){wrapper.removeAttribute('id');const range=this.visual.ownerDocument.createRange();range.selectNodeContents(wrapper);const selection=this.visual.ownerDocument.getSelection();selection.removeAllRanges();selection.addRange(range);}
                this.visualChanged();this.rememberSelection();
                this.fancyOrigin={original,value:this.value,view:this.view,range:this.selection?.cloneRange()};
              }
            },{text:style.name==='Plain'?'Plain / Normal Text':style.sample || style.name,className:'auri-font-choice'}));
          });
          content.append(list);
        }else{
          note(content,kind==='reading'?'Editor display only. This does not change your export.':'Typeface is written to the export as HTML.');
          const list=make('div','auri-menu-list');
          [['Inter','Inter, sans-serif'],['Outfit','Outfit, sans-serif'],['Serif','Georgia, serif'],['Monospace','monospace']].forEach(([label,family])=>{
            const control=button(this,`${kind==='reading'?'Editor font':'Typeface'}: ${label}`,'type',()=>{
              if(kind==='reading'){
                this.root.style.setProperty('--auri-reading-font',family);
                if(this.visual)this.visual.style.fontFamily=family;
                this.closePopover(true);
              }else this.applyPresentation('font-family',family);
            },{text:label,className:'auri-menu-item'});control.style.fontFamily=family;list.append(control);
          });content.append(list);
        }
        requestAnimationFrame(()=>this.placePopover());
      };
      [['typeface','Typeface','type'],['reading','Reading typography','book-open'],['unicode','Unicode Styles','case-sensitive']].forEach(([kind,label,name])=>{
        const tab=button(this,label,name,()=>choose(kind));tab.dataset.kind=kind;tabs.append(tab);
      });choose('unicode');
    });
  };
  Editor.prototype.showColors = function(trigger){
    menu(this,trigger,'Text palette',parent=>{
      const tabs=make('div','auri-menu-tabs'),content=make('div','auri-menu-panel');parent.append(tabs,content);
      let mode='color',current=this.lastColor||'#ff2e88';
      const draw=()=>{
        tabs.querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));
        content.replaceChildren();
        const preview=make('div','auri-color-preview','Aa'); preview.style.background=mode==='background-color'?current:'var(--bg-deep)';preview.style.color=mode==='background-color'?'#15131a':current;
        const fields=make('div','auri-color-fields');
        const pickerLabel=make('label','','Color'),picker=make('input');picker.type='color';picker.value=current;picker.setAttribute('aria-label',`${this.label}: Choose color`);pickerLabel.append(picker);
        const hexLabel=make('label','','Hex'),hex=make('input');hex.type='text';hex.value=current;hex.maxLength=7;hex.setAttribute('aria-label',`${this.label}: Hex color`);hexLabel.append(hex);fields.append(pickerLabel,hexLabel);
        const sync=value=>{if(!/^#[0-9a-f]{6}$/i.test(value))return;current=value;picker.value=value;hex.value=value;preview.style.background=mode==='background-color'?value:'var(--bg-deep)';preview.style.color=mode==='background-color'?'#15131a':value;};
        picker.addEventListener('input',()=>sync(picker.value));hex.addEventListener('input',()=>sync(hex.value));
        const swatches=make('div','auri-swatches');
        ['#ff2e88','#fd3da4','#ee2f9f','#d62976','#7151a9','#b956c7','#d4af6a','#57c683','#69b9db','#f2eff5','#a39dad','#15131a'].forEach(color=>{
          const swatch=button(this,`Color ${color}`,null,()=>sync(color));swatch.style.background=color;swatches.append(swatch);
        });
        const apply=button(this,'Apply color','check',()=>{if(!/^#[0-9a-f]{6}$/i.test(hex.value)){hex.setCustomValidity('Use a six-digit hex color.');hex.reportValidity();return;}this.lastColor=current;if(mode==='code'){this.closePopover();this.insertText(current);}else this.applyPresentation(mode,current);},{text:mode==='code'?'Insert hex code':'Apply color',className:'auri-menu-item'});
        content.append(preview,fields,make('p','auri-section-label','Palette'),swatches,apply);note(content,mode==='code'?'Inserts the color code at your selection.':'Color is written to the export as inline HTML.');
      };
      [['color','Text color','baseline'],['background-color','Highlight color','highlighter'],['code','Color code','hash']].forEach(([value,label,name])=>{const tab=button(this,label,name,()=>{mode=value;draw();});tab.dataset.mode=value;tabs.append(tab);});draw();
    });
  };
  Editor.prototype.showSymbols = function(trigger){
    menu(this,trigger,'Characters & symbols',parent=>{
      this.popover.classList.add('auri-picker-popover');
      const tabs=make('div','auri-picker-tabs'),search=make('input','auri-picker-search');search.type='search';search.placeholder='Search all sections…';search.setAttribute('aria-label',`${this.label}: Search characters`);
      const controls=make('div','auri-picker-controls'),keepLabel=make('label',''),keep=make('input');keep.type='checkbox';keep.checked=!!library.keepOpen;keepLabel.append(keep,document.createTextNode(' Keep open'));
      const actions=make('select');actions.setAttribute('aria-label',`${this.label}: Character action`);[['insert','Insert character'],['favorite','Add / remove favorite'],['copy','Copy character']].forEach(([value,label])=>{const option=make('option','',label);option.value=value;actions.append(option);});controls.append(keepLabel,actions);
      const layout=make('div','auri-picker-layout'),rail=make('div','auri-picker-rail'),content=make('div','auri-picker-content'),status=make('p','auri-picker-status'),grid=make('div','auri-picker-grid'),more=button(this,'Show more characters','chevron-down',()=>{limit+=96;populate();},{text:'Show more',className:'auri-picker-more'});
      content.append(status,grid,more);layout.append(rail,content);parent.append(tabs,search,controls,layout);
      let section='emoji',group='all',limit=96;
      keep.addEventListener('change',()=>{library.keepOpen=keep.checked;saveLibrary();});
      const populate=()=>{
        grid.replaceChildren(); const query=search.value.trim().toLocaleLowerCase();
        let entries=query?allGlyphs:allGlyphs.filter(item=>item.section===section);
        if(group==='recent')entries=library.recent.map(id=>allGlyphs.find(item=>item.id===id)).filter(Boolean);
        else if(group==='favorite')entries=allGlyphs.filter(item=>library.favorite.includes(item.id));
        else if(group!=='all')entries=entries.filter(item=>item.groups.includes(group));
        if(query)entries=entries.filter(item=>`${item.text} ${item.name} ${item.keywords} ${item.code}`.toLocaleLowerCase().includes(query));
        const category=data.categories.find(cat=>cat.id===section);
        status.textContent=`${group==='recent'?'Recent':group==='favorite'?'Favorites':query?'Search':category.label} · ${entries.length.toLocaleString()} results`;
        entries.slice(0,limit).forEach(item=>{
          const choice=button(this,`${item.name}${library.favorite.includes(item.id)?' · favorite':''}`,null,async()=>{
            if(actions.value==='favorite'){library.favorite=library.favorite.includes(item.id)?library.favorite.filter(id=>id!==item.id):[item.id,...library.favorite].slice(0,200);saveLibrary();populate();return;}
            if(actions.value==='copy'){try{await navigator.clipboard.writeText(item.text);status.textContent=`Copied ${item.name}`;}catch(_){status.textContent='Copy unavailable in this browser.';}return;}
            this.insertText(item.text);library.recent=[item.id,...library.recent.filter(id=>id!==item.id)].slice(0,48);saveLibrary();
            if(!keep.checked)this.closePopover();else {status.textContent=`Inserted ${item.name}`;choice.focus();}
          },{text:item.text,className:`auri-glyph${['kaomoji','combos'].includes(item.section)?' auri-glyph-wide':''}`});
          if(library.favorite.includes(item.id))choice.dataset.favorite='true';grid.append(choice);
        });
        if(!entries.length)grid.append(make('p','auri-empty','No matching characters.'));more.hidden=entries.length<=limit;
      };
      const drawRail=()=>{
        rail.replaceChildren();const category=data.categories.find(cat=>cat.id===section);
        [['recent','Recent','history'],['favorite','Favorites','star'],['all','All','grid-2x2'],...category.groups.map(g=>[g.id,g.label,g.icon])].forEach(([id,label,name])=>rail.append(button(this,`Character group: ${label}`,name,()=>{group=id;limit=96;drawRail();populate();},{pressed:group===id})));
      };
      data.categories.forEach(category=>{const tab=button(this,`Characters: ${category.label}`,category.icon,()=>{section=category.id;group='all';limit=96;search.value='';tabs.querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.section===section)));drawRail();populate();},{pressed:category.id===section});tab.dataset.section=category.id;tabs.append(tab);});
      search.addEventListener('input',()=>{group='all';limit=96;drawRail();populate();});drawRail();populate();search.focus();
    });
  };
  Editor.prototype.showTools = function(trigger){
    menu(this,trigger,'Tools',parent=>{
      this.menuStrip(parent,[['Undo','undo-2',()=>this.format('undo')],['Redo','redo-2',()=>this.format('redo')],null,['Clear formatting','eraser',()=>this.format('removeFormat')]]);
      const list=make('div','auri-menu-list');
      list.append(button(this,'Insert date','history',()=>{this.closePopover();const date=new Date();this.insertText(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);},{text:'Insert today’s date',className:'auri-menu-item'}));
      const whitespace=make('details');whitespace.append(make('summary','','Whitespace characters'));const choices=make('div','auri-menu-list');
      data.whitespace.forEach(item=>choices.append(button(this,`Insert ${item.name}`,null,()=>{this.closePopover();this.insertText(item.text);},{text:`${item.name} · ${item.code}`,className:'auri-menu-item'})));whitespace.append(choices);list.append(whitespace);parent.append(list);
    });
  };
  Editor.prototype.showToolbarSettings = function(trigger){
    menu(this,trigger,'Toolbar settings',parent=>{
      const row=make('label','auri-setting-row'),sticky=make('input');sticky.type='checkbox';sticky.checked=this.root.classList.contains('auri-toolbar-sticky');row.append(sticky,document.createTextNode('Keep toolbar visible while editing'));sticky.addEventListener('change',()=>{this.root.classList.toggle('auri-toolbar-sticky',sticky.checked);});parent.append(row);
      note(parent,'This setting only changes this editor’s display.');
    });
  };
  Editor.prototype.buildToolbar = function () {
    const toolbar=this.root.querySelector('.intro-editor-toolbar');toolbar.replaceChildren();
    const row=make('div','auri-toolbar-row');toolbar.append(row);
    const group=(label,name,build)=>{let trigger;trigger=button(this,label,name,()=>build(trigger));trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');const chevron=make('span','auri-chevron');chevron.append(icon('chevron-down'));trigger.append(chevron);row.append(trigger);return trigger;};
    this.toolbarFormattingButtons={};
    const basic=(label,name,action)=>{const control=button(this,label,name,()=>this.format(action),{pressed:false});this.toolbarFormattingButtons[action]=control;row.append(control);};
    const simple=(label,name,entries)=>group(label,name,trigger=>menu(this,trigger,label,parent=>this.menuStrip(parent,typeof entries==='function'?entries():entries)));
    group('Headings','heading',trigger=>this.showHeadings(trigger));
    group('Typography','type',trigger=>this.showTypography(trigger));
    group('Text palette','palette',trigger=>this.showColors(trigger));row.append(separator());
    basic('Bold','bold','bold');basic('Italic','italic','italic');
    simple('Text decorations','underline',[
      ['Underline','underline',()=>this.format('underline')],['Strikethrough','strikethrough',()=>this.format('strikeThrough')],['Highlight','highlighter',()=>this.wrapMarkup('<mark>','</mark>')],['Spoiler','eye-off',()=>{this.closePopover();const text=this.selectedText()||'spoiler';this.insertText(`||${text}||`);}],null,['Horizontal rule','minus',()=>this.format('hr')]
    ]);row.append(separator());
    simple('Alignment','align-left',['left','center','right','justify'].map(align=>[`Align ${align}`,`align-${align}`,()=>this.alignText(align)]));
    simple('Indentation','indent-increase',()=>{
      const available=this.view==='source'||Boolean(this.selectionElement()?.closest('li'));
      return [['Indent','indent-increase',()=>this.indentText(false),{disabled:!available,hint:available?'Indent':'Select a list item to indent in Visual view'}],['Outdent','indent-decrease',()=>this.indentText(true),{disabled:!available,hint:available?'Outdent':'Select a list item to outdent in Visual view'}]];
    });
    simple('Blocks','blocks',[
      ['Inline code','code',()=>this.format('inlineCode')],['Code block','square-code',()=>this.format('codeBlock')],['Keyboard text','keyboard',()=>this.wrapMarkup('<kbd>','</kbd>','Ctrl')],null,
      ['Inline math source','sigma',()=>{this.closePopover();this.insertText(`$${this.selectedText()||'x = y'}$`);} ,{hint:'Insert inline math delimiters; shown as source'}],['Math block source','square-function',()=>{this.closePopover();this.insertText(`\n$$\n${this.selectedText()||'x = y'}\n$$\n`);},{hint:'Insert math delimiters; shown as source'}],null,
      ['Block quote','quote',()=>this.format('quote')],['Callout','message-square',()=>this.insertMarkup('> [!NOTE]\n> '+(this.selectedText()||'Note'))]
    ]);
    simple('Lists','list',[
      ['Collapsible section','chevrons-up-down',()=>this.wrapMarkup('<details><summary>Details</summary><p>','</p></details>','Details content')],null,
      ['Bulleted list','list',()=>this.format('unordered')],['Numbered list','list-ordered',()=>this.format('ordered')],['Task list','list-todo',()=>{this.closePopover();if(this.view==='source')this.prefixSourceLines('- [ ] ');else this.insertVisual('<ul><li><input type="checkbox" disabled> '+(this.selectedHTML()||'Task')+'</li></ul>');}],null,
      ['Move line up','arrow-up',()=>this.moveLine(-1)],['Move line down','arrow-down',()=>this.moveLine(1)]
    ]);
    simple('Tables','table',[['Insert table','table-2',()=>this.format('table')]]);
    simple('Links & images','link',[
      ['Insert link','link',()=>this.showInsertDialog('link')],['Insert image','image-plus',()=>this.showInsertDialog('image')]
    ]);row.append(separator());
    const symbols=button(this,'Symbols and emoji','smile',()=>this.showSymbols(symbols));symbols.setAttribute('aria-haspopup','dialog');symbols.setAttribute('aria-expanded','false');row.append(symbols);
    row.append(button(this,'Translate — no translation provider connected','languages',()=>{},{disabled:true,hint:'Translation is not connected in this builder.'}));
    group('Tools','wrench',trigger=>this.showTools(trigger));
    group('Toolbar settings','settings',trigger=>this.showToolbarSettings(trigger));
    this.listen(window,'resize',()=>this.placePopover());
    this.listen(window,'scroll',event=>{
      if (this.popover?.contains(event.target)) return;
      this.placePopover();
    },true);
  };
})();
