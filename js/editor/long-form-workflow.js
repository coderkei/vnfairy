/* Long-form writing tools layered onto the existing VNFairy card editor. */
(function (root) {
  const Editor = typeof VNFairyEditor !== 'undefined' ? VNFairyEditor : root.VNFairyEditor;
  if (!Editor) return;

  const proto = Editor.prototype;
  if (proto.__longFormWorkflowInstalled) return;
  proto.__longFormWorkflowInstalled = true;

  const baseMethods = {};
  [
    'finishProjectLoad', 'selectScene', 'saveProject', 'applyHistoryState',
    'addDialogueStep', 'duplicateStep', 'deleteStep', 'moveStep',
    'selectDialogueStep', 'updateStepSpeaker', 'updateStepText', 'updateStepDuration'
  ].forEach(name => { baseMethods[name] = proto[name]; });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createId(prefix) {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return `${prefix}_${root.crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  const SCRIPT_SHORTCUT_COUNT = 9;

  function allSpeakerOptions(editor, selected) {
    const options = [{ id: 'narrator', name: 'Narrator' }];
    (editor.project.assets && editor.project.assets.characters || []).forEach(character => {
      options.push({ id: character.id, name: character.name || character.id });
    });
    const shortcuts = editor.getScriptSpeakerShortcuts ? editor.getScriptSpeakerShortcuts() : [];
    return options.map(option => {
      const shortcutIndex = shortcuts.indexOf(option.id);
      return {
        ...option,
        shortcut: shortcutIndex >= 0 ? `Alt+${shortcutIndex + 1}` : '',
        selected: option.id === selected
      };
    });
  }

  function speakerOptions(editor, selected) {
    return allSpeakerOptions(editor, selected);
  }

  function escapeSelectorValue(value) {
    return String(value).replace(/[^A-Za-z0-9_-]/g, '_');
  }

  proto.ensureLongFormModel = function () {
    if (!this.project) return;
    this.project.config = this.project.config || {};
    this.project.presets = this.project.presets || {};
    this.project.presets.scenes = Array.isArray(this.project.presets.scenes) ? this.project.presets.scenes : [];
    this.project.presets.dialogueLayouts = Array.isArray(this.project.presets.dialogueLayouts) ? this.project.presets.dialogueLayouts : [];
    this.project.presets.characterPlacements = Array.isArray(this.project.presets.characterPlacements) ? this.project.presets.characterPlacements : [];
    this.project.presets.poseSets = Array.isArray(this.project.presets.poseSets) ? this.project.presets.poseSets : this.project.presets.characterPlacements;
    this.project.presets.characterPlacements = this.project.presets.poseSets;
    this.project.scenes = this.project.scenes || {};
    Object.values(this.project.scenes).forEach(scene => {
      if (!scene || typeof scene !== 'object') return;
      scene.status = ['draft', 'review', 'final'].includes(scene.status) ? scene.status : 'draft';
      scene.tags = Array.isArray(scene.tags) ? scene.tags.filter(Boolean) : (scene.tags ? String(scene.tags).split(',').map(tag => tag.trim()).filter(Boolean) : []);
      scene.notes = scene.notes || '';
      scene.bookmarked = !!scene.bookmarked;
      scene.dialogue = Array.isArray(scene.dialogue) ? scene.dialogue : [];
    });
    if (root.VNFairyCore && root.VNFairyCore.migrations && root.VNFairyCore.migrations.ensureDialogueLineIds) {
      root.VNFairyCore.migrations.ensureDialogueLineIds(this.project);
    }
    this.selectedDialogueIds = this.selectedDialogueIds instanceof Set ? this.selectedDialogueIds : new Set();
    const validIds = new Set();
    Object.values(this.project.scenes).forEach(scene => (scene.dialogue || []).forEach(step => step && step.id && validIds.add(step.id)));
    this.selectedDialogueIds = new Set([...this.selectedDialogueIds].filter(id => validIds.has(id)));
  };

  proto.getScriptSpeakerShortcuts = function () {
    if (!this.project) return Array(SCRIPT_SHORTCUT_COUNT).fill('');
    const characters = this.project.assets && Array.isArray(this.project.assets.characters)
      ? this.project.assets.characters
      : [];
    const validIds = new Set(['narrator', ...characters.map(character => character.id).filter(Boolean)]);
    const defaults = ['narrator', ...characters.map(character => character.id).filter(Boolean)]
      .slice(0, SCRIPT_SHORTCUT_COUNT);
    const configured = this.project.config && this.project.config.scriptSpeakerShortcuts;
    const source = Array.isArray(configured) ? configured : defaults;
    return Array.from({ length: SCRIPT_SHORTCUT_COUNT }, (_, index) => {
      const speakerId = source[index] || '';
      return validIds.has(speakerId) ? speakerId : '';
    });
  };

  proto.getActiveWritingScene = function () {
    return this.project && this.activeSceneId && this.project.scenes && this.project.scenes[this.activeSceneId];
  };

  proto.getSpeakerNameForWriting = function (speakerId) {
    if (speakerId === 'narrator' || !speakerId) return 'Narrator';
    const character = (this.project.assets.characters || []).find(item => item.id === speakerId);
    return character ? (character.name || character.id) : speakerId;
  };

  proto.getWritingStats = function (scene) {
    const counts = {};
    let words = 0;
    let seconds = 0;
    (scene && scene.dialogue || []).forEach(step => {
      const text = String(step && step.text || '').trim();
      if (text) words += text.split(/\s+/).length;
      const speaker = this.getSpeakerNameForWriting(step && step.speaker);
      counts[speaker] = (counts[speaker] || 0) + 1;
      seconds += Number(step && step.duration) || 0;
    });
    seconds += (words / 150) * 60;
    const lines = Object.entries(counts).filter(([, count]) => count).map(([speaker, count]) => `${speaker} ${count}`).join(' · ');
    return { words, seconds, lines };
  };

  proto.formatWritingDuration = function (seconds) {
    if (!seconds) return '0m';
    const rounded = Math.max(1, Math.round(seconds));
    if (rounded < 60) return `${rounded}s`;
    const minutes = Math.floor(rounded / 60);
    const remainder = rounded % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  };

  proto.renderWritingStats = function () {
    const statsElement = document.getElementById('writing-stats');
    const scene = this.getActiveWritingScene();
    if (!statsElement || !scene) return;
    const stats = this.getWritingStats(scene);
    statsElement.innerHTML = `
      <span class="writing-stat"><strong>${stats.words.toLocaleString()}</strong> words</span>
      <span class="writing-stat"><strong>${this.formatWritingDuration((stats.words / 150) * 60)}</strong> playtime</span>
      <span class="writing-stat"><strong>${this.formatWritingDuration(stats.seconds)}</strong> scene duration</span>
      <span class="writing-stat"><strong>${scene.dialogue.length}</strong> lines</span>
      <span class="writing-stat"><strong>${this.escapeHtml(stats.lines || 'No speakers yet')}</strong> line counts</span>
    `;
  };

  proto.populateWritingPresetMenus = function () {
    const presets = this.project && this.project.presets;
    if (!presets) return;
    const menus = [
      ['scene-preset-select', presets.scenes, 'Choose scene preset...'],
      ['dialogue-layout-preset-select', presets.dialogueLayouts, 'Choose dialogue preset...'],
      ['character-placement-preset-select', presets.poseSets, 'Choose pose set...']
    ];
    menus.forEach(([id, items, placeholder]) => {
      const select = document.getElementById(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = '';
      const first = document.createElement('option');
      first.value = '';
      first.textContent = placeholder;
      select.appendChild(first);
      items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
      });
      select.value = items.some(item => item.id === current) ? current : '';
    });
  };

  proto.refreshLongFormUi = function () {
    this.ensureLongFormModel();
    this.renderWritingStats();
    this.populateWritingPresetMenus();
    this.renderScriptBulkSpeakerOptions();
    this.renderWritingKeyboardHelp();
    if (this.dialogueView === 'script') this.renderScriptView();
  };

  proto.renderWritingKeyboardHelp = function () {
    const helper = document.querySelector('.keyboard-help');
    if (!helper || !this.project) return;
    helper.innerHTML = '';
    [['Enter', 'next line'], ['Tab', 'next field'], ['Alt+1–9', 'speaker shortcuts']].forEach(([key, label]) => {
      const keyElement = document.createElement('span');
      keyElement.className = 'keyboard-key';
      keyElement.textContent = key;
      const labelElement = document.createElement('span');
      labelElement.className = 'keyboard-label';
      labelElement.textContent = label;
      helper.append(keyElement, labelElement);
    });
    const configureButton = document.createElement('button');
    configureButton.type = 'button';
    configureButton.className = 'keyboard-help-configure';
    configureButton.id = 'btn-configure-script-shortcuts';
    configureButton.textContent = 'Configure';
    configureButton.onclick = () => this.openScriptShortcutModal();
    helper.appendChild(configureButton);
  };

  proto.renderScriptShortcutModal = function () {
    const list = document.getElementById('script-shortcuts-list');
    if (!list || !this.project) return;
    const shortcuts = this.getScriptSpeakerShortcuts();
    const options = allSpeakerOptions(this);
    list.innerHTML = '';
    for (let index = 0; index < SCRIPT_SHORTCUT_COUNT; index += 1) {
      const row = document.createElement('label');
      row.className = 'script-shortcut-row';

      const key = document.createElement('span');
      key.className = 'keyboard-key';
      key.textContent = `Alt+${index + 1}`;

      const select = document.createElement('select');
      select.className = 'select-input';
      select.dataset.shortcutSlot = String(index);
      select.setAttribute('aria-label', `Speaker for Alt+${index + 1}`);

      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Unassigned';
      select.appendChild(empty);
      options.forEach(option => {
        const item = document.createElement('option');
        item.value = option.id;
        item.textContent = option.name;
        item.selected = option.id === shortcuts[index];
        select.appendChild(item);
      });
      row.append(key, select);
      list.appendChild(row);
    }
  };

  proto.openScriptShortcutModal = function () {
    this.renderScriptShortcutModal();
    document.getElementById('script-shortcuts-modal')?.classList.remove('hidden');
  };

  proto.saveScriptShortcutConfig = function () {
    const list = document.getElementById('script-shortcuts-list');
    if (!list || !this.project) return;
    const values = Array.from(list.querySelectorAll('select[data-shortcut-slot]'))
      .sort((a, b) => Number(a.dataset.shortcutSlot) - Number(b.dataset.shortcutSlot))
      .map(select => select.value || '');
    this.project.config = this.project.config || {};
    this.project.config.scriptSpeakerShortcuts = Array.from({ length: SCRIPT_SHORTCUT_COUNT }, (_, index) => values[index] || '');
    this.triggerAutoSave();
    this.renderWritingKeyboardHelp();
    this.renderScriptBulkSpeakerOptions();
    if (this.dialogueView === 'script') this.renderScriptView();
    document.getElementById('script-shortcuts-modal')?.classList.add('hidden');
  };

  proto.setDialogueView = function (view) {
    this.dialogueView = view === 'script' ? 'script' : 'cards';
    const cards = document.querySelector('.timeline-timeline');
    const script = document.getElementById('script-editor');
    const cardsButton = document.getElementById('btn-dialogue-cards-view');
    const scriptButton = document.getElementById('btn-dialogue-script-view');
    if (cards) cards.classList.toggle('hidden', this.dialogueView !== 'cards');
    if (script) script.classList.toggle('hidden', this.dialogueView !== 'script');
    if (cardsButton) {
      cardsButton.classList.toggle('active', this.dialogueView === 'cards');
      cardsButton.setAttribute('aria-selected', this.dialogueView === 'cards' ? 'true' : 'false');
    }
    if (scriptButton) {
      scriptButton.classList.toggle('active', this.dialogueView === 'script');
      scriptButton.setAttribute('aria-selected', this.dialogueView === 'script' ? 'true' : 'false');
    }
    if (this.dialogueView === 'script') {
      this.renderScriptView();
      const firstText = document.querySelector('#script-lines .script-line-text');
      if (firstText && !document.activeElement.closest('#script-lines')) firstText.focus();
    }
  };

  proto.renderScriptBulkSpeakerOptions = function () {
    const select = document.getElementById('script-bulk-speaker');
    if (!select || !this.project) return;
    const current = select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose speaker...';
    select.appendChild(placeholder);
    speakerOptions(this).forEach(option => {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.shortcut ? `${option.name} · ${option.shortcut}` : option.name;
      select.appendChild(item);
    });
    select.value = current;
    this.convertSelect(select);
  };

  proto.renderScriptSelectionCount = function () {
    const count = document.getElementById('script-selection-count');
    if (count) count.textContent = `${this.selectedDialogueIds ? this.selectedDialogueIds.size : 0} selected`;
  };

  proto.renderScriptView = function () {
    this.ensureLongFormModel();
    const list = document.getElementById('script-lines');
    const scene = this.getActiveWritingScene();
    if (!list || !scene) return;
    list.innerHTML = '';
    const isInactiveCutscene = scene.isCutscene && ['video', 'image'].includes(scene.cutsceneType || 'video');
    if (isInactiveCutscene) {
      list.innerHTML = '<div class="empty-state" style="min-height:180px; padding:20px;">Script editing is unavailable for this cutscene mode.</div>';
      this.renderScriptSelectionCount();
      return;
    }
    (scene.dialogue || []).forEach((step, index) => {
      if (!step.id) return;
      const row = document.createElement('div');
      row.className = `script-line${this.selectedDialogueIds.has(step.id) ? ' selected' : ''}`;
      row.id = `script-line-${escapeSelectorValue(step.id)}`;
      row.dataset.lineId = step.id;

      const lineNumber = document.createElement('span');
      lineNumber.className = 'script-line-number';
      lineNumber.textContent = `${index + 1}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'script-line-check';
      checkbox.checked = this.selectedDialogueIds.has(step.id);
      checkbox.title = 'Select line';
      checkbox.setAttribute('aria-label', `Select line ${index + 1}`);
      checkbox.onchange = () => this.toggleDialogueSelection(step.id, checkbox.checked);

      const speaker = document.createElement('select');
      speaker.className = 'select-input script-speaker';
      speaker.setAttribute('data-asset-type', 'speaker');
      speaker.setAttribute('aria-label', `Speaker for line ${index + 1}`);
      speaker.title = 'Speaker (use your configured Alt+number shortcut)';
      speakerOptions(this, step.speaker || 'narrator').forEach(option => {
        const item = document.createElement('option');
        item.value = option.id;
        item.textContent = option.name;
        item.title = option.shortcut;
        item.selected = option.selected;
        speaker.appendChild(item);
      });
      speaker.onchange = event => this.updateDialogueById(step.id, { speaker: event.target.value });

      const text = document.createElement('textarea');
      text.className = 'textarea-input script-line-text';
      text.rows = 2;
      text.placeholder = 'Write the next line...';
      text.value = step.text || '';
      text.style.fontWeight = step.bold ? 'bold' : 'normal';
      text.style.fontStyle = step.italic ? 'italic' : 'normal';
      text.style.textDecoration = step.underline ? 'underline' : 'none';
      text.oninput = event => this.updateDialogueTextById(step.id, event.target.value);
      text.onkeydown = event => this.handleScriptLineKeydown(event, step.id);

      const actions = document.createElement('div');
      actions.className = 'script-line-actions';

      const bookmark = document.createElement('button');
      bookmark.type = 'button';
      bookmark.className = `script-line-bookmark${step.bookmarked ? ' is-bookmarked' : ''}`;
      bookmark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75V21l-5-3.25L7 21V4.75Z"></path></svg>';
      bookmark.title = step.bookmarked ? 'Remove line bookmark' : 'Bookmark line for revision';
      bookmark.setAttribute('aria-label', bookmark.title);
      bookmark.onclick = () => this.toggleDialogueBookmark(step.id);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'script-line-delete';
      deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.75 11H7.75L7 9Zm3 2v7h1.5v-7H10Zm2.5 0v7H14v-7h-1.5Z"></path></svg>';
      deleteButton.title = 'Delete line';
      deleteButton.setAttribute('aria-label', `Delete line ${index + 1}`);
      deleteButton.onclick = () => this.deleteDialogueLineById(step.id);

      actions.append(bookmark, deleteButton);
      row.append(lineNumber, checkbox, speaker, text, actions);
      list.appendChild(row);
    });
    this.convertAllAssetSelects();
    this.renderScriptSelectionCount();
  };

  proto.toggleDialogueSelection = function (lineId, selected) {
    this.selectedDialogueIds = this.selectedDialogueIds || new Set();
    if (selected) this.selectedDialogueIds.add(lineId);
    else this.selectedDialogueIds.delete(lineId);
    const row = document.getElementById(`script-line-${escapeSelectorValue(lineId)}`);
    if (row) row.classList.toggle('selected', selected);
    this.renderScriptSelectionCount();
  };

  proto.updateDialogueTextById = function (lineId, text) {
    const scene = this.getActiveWritingScene();
    const index = scene ? scene.dialogue.findIndex(step => step.id === lineId) : -1;
    if (index < 0) return;
    this.updateStepText(index, text);
  };

  proto.updateDialogueById = function (lineId, patch) {
    const scene = this.getActiveWritingScene();
    const index = scene ? scene.dialogue.findIndex(step => step.id === lineId) : -1;
    if (index < 0) return;
    Object.assign(scene.dialogue[index], patch);
    this.triggerAutoSave();
    this.renderTimeline();
    this.renderScriptView();
    this.renderWritingStats();
  };

  proto.handleScriptLineKeydown = function (event, lineId) {
    const scene = this.getActiveWritingScene();
    if (!scene) return;
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.addDialogueLineAfter(lineId, true);
      return;
    }
    if (event.altKey && /^\d$/.test(event.key)) {
      const shortcutIndex = Number(event.key) - 1;
      const speakerId = this.getScriptSpeakerShortcuts()[shortcutIndex];
      if (!speakerId) return;
      event.preventDefault();
      this.updateDialogueById(lineId, { speaker: speakerId });
    }
  };

  proto.addDialogueLineAfter = function (lineId, focusNewLine = false) {
    const scene = this.getActiveWritingScene();
    if (!scene) return;
    const currentIndex = scene.dialogue.findIndex(step => step.id === lineId);
    const insertAt = currentIndex < 0 ? scene.dialogue.length : currentIndex + 1;
    const previous = scene.dialogue[Math.max(0, insertAt - 1)] || {};
    const line = {
      id: createId('line'),
      text: '',
      speaker: scene.isCutscene && ['text', 'autotext'].includes(scene.cutsceneType) ? 'narrator' : (previous.speaker || 'narrator'),
      layout: scene.isCutscene && ['text', 'autotext'].includes(scene.cutsceneType)
        ? { left: null, center: null, right: null }
        : clone(previous.layout || { left: null, center: null, right: null })
    };
    if (scene.cutsceneType === 'autotext') line.duration = 3;
    scene.dialogue.splice(insertAt, 0, line);
    this.activeStepIndex = insertAt;
    this.triggerAutoSave();
    this.renderTimeline();
    this.renderScriptView();
    this.renderWritingStats();
    if (focusNewLine) {
      setTimeout(() => {
        const field = document.querySelector(`#script-line-${escapeSelectorValue(line.id)} .script-line-text`);
        if (field) field.focus();
      }, 0);
    }
  };

  proto.selectDialogueLineById = function (lineId, view = 'script') {
    const scene = this.getActiveWritingScene();
    if (!scene) return;
    const index = scene.dialogue.findIndex(step => step.id === lineId);
    if (index < 0) return;
    if (view) this.setDialogueView(view);
    this.selectDialogueStep(index);
    setTimeout(() => {
      const row = document.getElementById(`script-line-${escapeSelectorValue(lineId)}`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    }, 0);
  };

  proto.selectAllDialogueLines = function () {
    const scene = this.getActiveWritingScene();
    this.selectedDialogueIds = new Set((scene && scene.dialogue || []).map(step => step.id).filter(Boolean));
    this.renderScriptView();
  };

  proto.clearDialogueSelection = function () {
    this.selectedDialogueIds = new Set();
    this.renderScriptView();
  };

  proto.getSelectedDialogueIndexes = function () {
    const scene = this.getActiveWritingScene();
    return (scene && scene.dialogue || []).map((step, index) => this.selectedDialogueIds.has(step.id) ? index : -1).filter(index => index >= 0);
  };

  proto.applyBulkSpeaker = function () {
    const speaker = document.getElementById('script-bulk-speaker')?.value;
    if (!speaker) return;
    const scene = this.getActiveWritingScene();
    const indexes = this.getSelectedDialogueIndexes();
    if (!scene || !indexes.length) return;
    indexes.forEach(index => { scene.dialogue[index].speaker = speaker; });
    this.triggerAutoSave();
    this.renderTimeline();
    this.renderScriptView();
    this.renderWritingStats();
  };

  proto.duplicateSelectedDialogue = function () {
    const scene = this.getActiveWritingScene();
    const indexes = this.getSelectedDialogueIndexes();
    if (!scene || !indexes.length) return;
    const selected = indexes.map(index => clone(scene.dialogue[index]));
    selected.forEach(step => { step.id = createId('line'); });
    const insertAt = indexes[indexes.length - 1] + 1;
    scene.dialogue.splice(insertAt, 0, ...selected);
    this.selectedDialogueIds = new Set(selected.map(step => step.id));
    this.triggerAutoSave();
    this.renderTimeline();
    this.renderScriptView();
    this.renderWritingStats();
  };

  proto.moveSelectedDialogue = function (direction) {
    const scene = this.getActiveWritingScene();
    if (!scene || !this.selectedDialogueIds.size) return;
    if (direction < 0) {
      for (let index = 0; index < scene.dialogue.length; index += 1) {
        if (this.selectedDialogueIds.has(scene.dialogue[index].id) && index > 0 && !this.selectedDialogueIds.has(scene.dialogue[index - 1].id)) {
          [scene.dialogue[index - 1], scene.dialogue[index]] = [scene.dialogue[index], scene.dialogue[index - 1]];
        }
      }
    } else {
      for (let index = scene.dialogue.length - 1; index >= 0; index -= 1) {
        if (this.selectedDialogueIds.has(scene.dialogue[index].id) && index < scene.dialogue.length - 1 && !this.selectedDialogueIds.has(scene.dialogue[index + 1].id)) {
          [scene.dialogue[index + 1], scene.dialogue[index]] = [scene.dialogue[index], scene.dialogue[index + 1]];
        }
      }
    }
    this.triggerAutoSave();
    this.renderTimeline();
    this.renderScriptView();
    this.renderWritingStats();
  };

  proto.toggleDialogueBookmark = function (lineId) {
    const scene = this.getActiveWritingScene();
    const step = scene && scene.dialogue.find(item => item.id === lineId);
    if (!step) return;
    step.bookmarked = !step.bookmarked;
    this.triggerAutoSave();
    this.renderScriptView();
  };

  proto.deleteDialogueLineById = function (lineId) {
    const scene = this.getActiveWritingScene();
    const index = scene ? scene.dialogue.findIndex(step => step.id === lineId) : -1;
    if (index < 0) return;
    this.deleteStep(index);
  };

  proto.toggleStorySearch = function () {
    const panel = document.getElementById('story-search-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) document.getElementById('story-search-input')?.focus();
  };

  proto.getStorySearchMatches = function (query, caseSensitive = false) {
    if (!this.project || !query) return [];
    const needle = caseSensitive ? query : query.toLowerCase();
    const matches = [];
    Object.values(this.project.scenes || {}).forEach(scene => {
      const metadata = [
        ['scene name', scene.name || ''],
        ['tags', (scene.tags || []).join(', ')]
      ];
      metadata.forEach(([kind, value]) => {
        const haystack = caseSensitive ? String(value) : String(value).toLowerCase();
        if (haystack.includes(needle)) matches.push({ scene, kind, text: value });
      });
      (scene.dialogue || []).forEach((step, index) => {
        const haystack = caseSensitive ? String(step.text || '') : String(step.text || '').toLowerCase();
        if (haystack.includes(needle)) matches.push({ scene, step, index, kind: 'dialogue', text: step.text || '' });
      });
      const notes = caseSensitive ? String(scene.notes || '') : String(scene.notes || '').toLowerCase();
      if (notes.includes(needle)) matches.push({ scene, kind: 'notes', text: scene.notes || '' });
    });
    return matches;
  };

  proto.renderStorySearchResults = function () {
    const results = document.getElementById('story-search-results');
    const input = document.getElementById('story-search-input');
    if (!results || !input) return;
    const query = input.value;
    const matches = this.getStorySearchMatches(query, !!document.getElementById('story-search-case-sensitive')?.checked);
    results.innerHTML = '';
    if (!query) {
      results.innerHTML = '<span class="muted">Search the whole story by dialogue text or scene notes.</span>';
      return;
    }
    const summary = document.createElement('div');
    summary.className = 'muted';
    summary.textContent = `${matches.length} match${matches.length === 1 ? '' : 'es'} across the story`;
    results.appendChild(summary);
    matches.slice(0, 80).forEach(match => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'story-search-result';
      const sceneLabel = document.createElement('span');
      sceneLabel.className = 'story-search-result-scene';
      sceneLabel.textContent = match.scene.name || match.scene.id;
      const copy = document.createElement('span');
      copy.className = 'story-search-result-copy';
      copy.textContent = `${match.kind === 'notes' ? 'Note: ' : ''}${match.text}`;
      button.append(sceneLabel, copy);
      button.onclick = () => {
        this.selectScene(match.scene.id);
        if (match.step) this.selectDialogueLineById(match.step.id, 'script');
        else this.setDialogueView('cards');
      };
      results.appendChild(button);
    });
    if (matches.length > 80) {
      const more = document.createElement('span');
      more.className = 'muted';
      more.textContent = 'Showing the first 80 matches.';
      results.appendChild(more);
    }
  };

  proto.replaceAllStoryMatches = function () {
    const search = document.getElementById('story-search-input')?.value || '';
    const replacement = document.getElementById('story-replace-input')?.value || '';
    if (!search || !this.project) return;
    const caseSensitive = !!document.getElementById('story-search-case-sensitive')?.checked;
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    let replacements = 0;
    Object.values(this.project.scenes || {}).forEach(scene => {
      (scene.dialogue || []).forEach(step => {
        const original = String(step.text || '');
        const next = original.replace(regex, () => { replacements += 1; return replacement; });
        step.text = next;
      });
      const notes = String(scene.notes || '');
      scene.notes = notes.replace(regex, () => { replacements += 1; return replacement; });
      scene.name = String(scene.name || '').replace(regex, () => { replacements += 1; return replacement; });
      scene.tags = (scene.tags || []).map(tag => String(tag).replace(regex, () => { replacements += 1; return replacement; }));
    });
    if (!replacements) return;
    this.triggerAutoSave();
    this.renderTimeline();
    this.renderScriptView();
    this.renderWritingStats();
    this.renderStorySearchResults();
    this.showToast(`Replaced ${replacements} match${replacements === 1 ? '' : 'es'}`);
  };

  proto.duplicateScene = function (sceneId) {
    const source = this.project && this.project.scenes && this.project.scenes[sceneId];
    if (!source) return;
    const nextIdBase = String(sceneId).replace(/[^A-Za-z0-9_-]/g, '_') + '_copy';
    let nextId = nextIdBase;
    let suffix = 2;
    while (this.project.scenes[nextId]) nextId = `${nextIdBase}_${suffix++}`;
    const copy = clone(source);
    copy.id = nextId;
    copy.name = `${source.name || sceneId} Copy`;
    copy.dialogue = (copy.dialogue || []).map(step => ({ ...step, id: createId('line') }));
    if (copy.nextSceneId === sceneId) copy.nextSceneId = nextId;
    (copy.choices || []).forEach(choice => { if (choice.targetSceneId === sceneId) choice.targetSceneId = nextId; });
    (copy.conditionalBranches || []).forEach(branch => { if (branch.targetSceneId === sceneId) branch.targetSceneId = nextId; });
    this.project.scenes[nextId] = copy;

    const group = (this.project.sceneGroups || []).find(item => (item.sceneIds || []).includes(sceneId));
    const list = group ? group.sceneIds : (this.project.ungroupedSceneIds = this.project.ungroupedSceneIds || []);
    const sourceIndex = list.indexOf(sceneId);
    list.splice(sourceIndex < 0 ? list.length : sourceIndex + 1, 0, nextId);
    this.refreshScenesTree();
    this.selectScene(nextId);
    this.triggerAutoSave();
    this.showToast('Scene duplicated');
  };

  proto.promptForPresetName = function (fallback) {
    const name = root.prompt('Preset name', fallback);
    return name && name.trim() ? name.trim() : null;
  };

  proto.saveScenePreset = function () {
    const scene = this.getActiveWritingScene();
    if (!scene) return;
    const name = this.promptForPresetName(`${scene.name || 'Scene'} foundation`);
    if (!name) return;
    const source = clone(scene);
    ['id', 'name', 'dialogue', 'choices', 'nextSceneId', 'conditionalBranches', 'sceneGroups', 'ungroupedSceneIds'].forEach(key => delete source[key]);
    this.project.presets.scenes.push({ id: createId('preset_scene'), name, ...source });
    this.populateWritingPresetMenus();
    this.triggerAutoSave();
  };

  proto.applyScenePreset = function () {
    const id = document.getElementById('scene-preset-select')?.value;
    const preset = (this.project.presets.scenes || []).find(item => item.id === id);
    const scene = this.getActiveWritingScene();
    if (!preset || !scene) return;
    const source = clone(preset);
    delete source.id;
    delete source.name;
    Object.assign(scene, source);
    this.selectScene(scene.id);
    this.triggerAutoSave();
  };

  proto.getActiveOrSelectedDialogueLines = function () {
    const scene = this.getActiveWritingScene();
    if (!scene) return [];
    const selected = (scene.dialogue || []).filter(step => this.selectedDialogueIds && this.selectedDialogueIds.has(step.id));
    if (selected.length) return selected;
    if (this.activeStepIndex !== null && scene.dialogue[this.activeStepIndex]) return [scene.dialogue[this.activeStepIndex]];
    return [];
  };

  proto.saveDialogueLayoutPreset = function () {
    const lines = this.getActiveOrSelectedDialogueLines();
    if (!lines.length) return;
    const name = this.promptForPresetName('Dialogue layout');
    if (!name) return;
    const source = lines[0];
    this.project.presets.dialogueLayouts.push({
      id: createId('preset_dialogue'),
      name,
      speaker: source.speaker || 'narrator',
      layout: clone(source.layout || { left: null, center: null, right: null }),
      bold: !!source.bold,
      italic: !!source.italic,
      underline: !!source.underline
    });
    this.populateWritingPresetMenus();
    this.triggerAutoSave();
  };

  proto.applyDialogueLayoutPreset = function () {
    const id = document.getElementById('dialogue-layout-preset-select')?.value;
    const preset = (this.project.presets.dialogueLayouts || []).find(item => item.id === id);
    const lines = this.getActiveOrSelectedDialogueLines();
    if (!preset || !lines.length) return;
    lines.forEach(line => Object.assign(line, {
      speaker: preset.speaker,
      layout: clone(preset.layout),
      bold: !!preset.bold,
      italic: !!preset.italic,
      underline: !!preset.underline
    }));
    this.triggerAutoSave();
    this.renderTimeline();
    this.renderScriptView();
    this.renderWritingStats();
  };

  proto.saveCharacterPlacementPreset = function () {
    const lines = this.getActiveOrSelectedDialogueLines();
    if (!lines.length) return;
    const name = this.promptForPresetName('Character placement');
    if (!name) return;
    const poseSet = {
      id: createId('preset_placement'),
      name,
      layout: clone(lines[0].layout || { left: null, center: null, right: null })
    };
    this.project.presets.poseSets.push(poseSet);
    this.populateWritingPresetMenus();
    this.triggerAutoSave();
  };

  proto.applyCharacterPlacementPreset = function () {
    const id = document.getElementById('character-placement-preset-select')?.value;
    const preset = (this.project.presets.characterPlacements || []).find(item => item.id === id);
    const lines = this.getActiveOrSelectedDialogueLines();
    if (!preset || !lines.length) return;
    lines.forEach(line => { line.layout = clone(preset.layout); });
    this.triggerAutoSave();
    this.renderTimeline();
    this.renderScriptView();
  };

  function wrap(name, callback) {
    if (!baseMethods[name]) return;
    proto[name] = function (...args) {
      const result = baseMethods[name].apply(this, args);
      callback.call(this, result, args);
      return result;
    };
  }

  wrap('finishProjectLoad', function () {
    this.ensureLongFormModel();
    this.dialogueView = this.dialogueView || 'cards';
    this.refreshLongFormUi();
  });
  wrap('selectScene', function () {
    this.ensureLongFormModel();
    this.selectedDialogueIds = new Set();
    this.refreshLongFormUi();
    this.renderSceneWritingMetadata();
  });
  proto.saveProject = function (...args) {
    this.ensureLongFormModel();
    return baseMethods.saveProject.apply(this, args);
  };
  wrap('applyHistoryState', function () {
    this.ensureLongFormModel();
    this.refreshLongFormUi();
    this.renderSceneWritingMetadata();
  });
  ['addDialogueStep', 'duplicateStep', 'deleteStep', 'moveStep'].forEach(name => wrap(name, function () {
    this.ensureLongFormModel();
    this.refreshLongFormUi();
  }));
  wrap('selectDialogueStep', function () {
    this.refreshLongFormUi();
  });
  wrap('updateStepSpeaker', function () {
    this.renderWritingStats();
    if (this.dialogueView === 'script') this.renderScriptView();
  });
  wrap('updateStepText', function () {
    this.renderWritingStats();
  });
  wrap('updateStepDuration', function () {
    this.renderWritingStats();
  });

  proto.renderSceneWritingMetadata = function () {
    const scene = this.getActiveWritingScene();
    if (!scene) return;
    const status = document.getElementById('scene-status-select');
    const tags = document.getElementById('scene-tags-input');
    const notes = document.getElementById('scene-notes-input');
    const bookmarked = document.getElementById('scene-bookmarked');
    if (status) status.value = scene.status || 'draft';
    if (tags) tags.value = (scene.tags || []).join(', ');
    if (notes) notes.value = scene.notes || '';
    if (bookmarked) bookmarked.checked = !!scene.bookmarked;
  };

  proto.initLongFormWorkflow = function () {
    if (this.longFormWorkflowInitialized) return;
    this.longFormWorkflowInitialized = true;
    this.dialogueView = 'cards';
    this.selectedDialogueIds = new Set();

    const bind = (id, event, handler) => {
      const element = document.getElementById(id);
      if (element) element[event] = handler;
    };
    bind('btn-dialogue-cards-view', 'onclick', () => this.setDialogueView('cards'));
    bind('btn-dialogue-script-view', 'onclick', () => this.setDialogueView('script'));
    bind('btn-configure-script-shortcuts', 'onclick', () => this.openScriptShortcutModal());
    bind('btn-save-script-shortcuts', 'onclick', () => this.saveScriptShortcutConfig());
    bind('btn-story-search', 'onclick', () => this.toggleStorySearch());
    bind('btn-writing-presets', 'onclick', () => document.getElementById('preset-panel')?.classList.toggle('hidden'));
    bind('btn-duplicate-scene', 'onclick', () => this.duplicateScene(this.activeSceneId));
    bind('btn-script-select-all', 'onclick', () => this.selectAllDialogueLines());
    bind('btn-script-clear-selection', 'onclick', () => this.clearDialogueSelection());
    bind('btn-script-apply-speaker', 'onclick', () => this.applyBulkSpeaker());
    bind('btn-script-duplicate-selected', 'onclick', () => this.duplicateSelectedDialogue());
    bind('btn-script-move-up', 'onclick', () => this.moveSelectedDialogue(-1));
    bind('btn-script-move-down', 'onclick', () => this.moveSelectedDialogue(1));
    bind('btn-script-add-line', 'onclick', () => this.addDialogueLineAfter(null, true));
    bind('btn-story-replace-all', 'onclick', () => this.replaceAllStoryMatches());
    bind('btn-save-scene-preset', 'onclick', () => this.saveScenePreset());
    bind('btn-apply-scene-preset', 'onclick', () => this.applyScenePreset());
    bind('btn-save-dialogue-layout-preset', 'onclick', () => this.saveDialogueLayoutPreset());
    bind('btn-apply-dialogue-layout-preset', 'onclick', () => this.applyDialogueLayoutPreset());
    bind('btn-save-character-placement-preset', 'onclick', () => this.saveCharacterPlacementPreset());
    bind('btn-apply-character-placement-preset', 'onclick', () => this.applyCharacterPlacementPreset());
    ['story-search-input', 'story-search-case-sensitive'].forEach(id => bind(id, 'oninput', () => this.renderStorySearchResults()));

    bind('scene-status-select', 'onchange', event => {
      const scene = this.getActiveWritingScene();
      if (!scene) return;
      scene.status = event.target.value;
      this.refreshScenesTree();
      this.triggerAutoSave();
    });
    bind('scene-tags-input', 'oninput', event => {
      const scene = this.getActiveWritingScene();
      if (!scene) return;
      scene.tags = event.target.value.split(',').map(tag => tag.trim()).filter(Boolean);
      this.refreshScenesTree();
      this.triggerAutoSave();
    });
    bind('scene-notes-input', 'oninput', event => {
      const scene = this.getActiveWritingScene();
      if (!scene) return;
      scene.notes = event.target.value;
      this.renderStorySearchResults();
      this.triggerAutoSave();
    });
    bind('scene-bookmarked', 'onchange', event => {
      const scene = this.getActiveWritingScene();
      if (!scene) return;
      scene.bookmarked = event.target.checked;
      this.refreshScenesTree();
      this.triggerAutoSave();
    });

    root.addEventListener('keydown', event => {
      if (!this.project || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        this.setDialogueView(this.dialogueView === 'script' ? 'cards' : 'script');
      }
    });
    this.refreshLongFormUi();
    this.renderSceneWritingMetadata();
  };

  root.addEventListener('load', () => {
    if (root.editor) root.editor.initLongFormWorkflow();
  });
})(typeof window !== 'undefined' ? window : globalThis);
