/*
 * VNFairy Designer
 *
 * Copyright (C) 2026 coderkei and VNFairy Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

class VNFairyEditor {
  constructor() {
    this.version = (window.VNFairyCore && window.VNFairyCore.versioning.DEFAULT_ENGINE_VERSION) || "2.0.0";
    this.project = null;
    this.assets = { bg: [], char: [], music: [], sound: [], video: [], metadata: {} };
    this.assetMetadata = {};
    
    this.activeSceneId = null;
    this.activeStepIndex = null;
    this.uploadingAssetType = null;
    this.editingCharacterId = null;
    this.selectedAssetKeys = new Set();
    this.selectedSceneIds = new Set();
    this.activeUniversalSelect = null;
    this.activeAssetReplacement = null;

    this.saveTimeout = null;
    this.undoStack = [];
    this.redoStack = [];
    this.historyLimit = 100;
    this.historyState = null;
    this.historyContext = null;
    this.historyCapturedAt = 0;
    this.isApplyingHistory = false;

    this.loadEditorTheme();
    this.loadEditorPalette();
    this.bindEvents();
  }

  loadEditorPalette() {
    const palette = localStorage.getItem('vnfairy-editor-palette') || 'sage';
    this.applyEditorPalette(palette, false);
  }

  applyEditorPalette(palette, announce = true) {
    const allowed = ['sage', 'slate', 'umber', 'plum'];
    const selectedPalette = allowed.includes(palette) ? palette : 'sage';
    document.documentElement.dataset.accentPalette = selectedPalette;
    localStorage.setItem('vnfairy-editor-palette', selectedPalette);

    document.querySelectorAll('.palette-option').forEach((option) => {
      option.classList.toggle('active', option.dataset.palette === selectedPalette);
    });

    const picker = document.getElementById('btn-palette-picker');
    if (picker) picker.title = `Editor palette: ${selectedPalette}`;

    if (announce) this.showToast(`Using ${selectedPalette} accent palette`);
  }

  togglePaletteMenu() {
    const menu = document.getElementById('palette-menu');
    const picker = document.getElementById('btn-palette-picker');
    if (!menu || !picker) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    picker.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) this.applyEditorPalette(document.documentElement.dataset.accentPalette || 'sage', false);
  }

  loadEditorTheme() {
    const savedTheme = localStorage.getItem('vnfairy-editor-theme') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light-mode');
      document.body.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
      document.body.classList.remove('light-mode');
    }
    // Update theme button state when page loads
    setTimeout(() => this.updateThemeButtonUI(savedTheme), 50);
  }

  updateThemeButtonUI(theme) {
    const btn = document.getElementById('btn-toggle-theme');
    if (btn) {
      btn.innerText = theme === 'light' ? 'Dark' : 'Light';
      btn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    }
  }

  toggleEditorTheme() {
    this.playSynthSFX('click');
    const isLight = document.documentElement.classList.contains('light-mode');
    const nextTheme = isLight ? 'dark' : 'light';
    
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light-mode');
      document.body.classList.add('light-mode');
      localStorage.setItem('vnfairy-editor-theme', 'light');
    } else {
      document.documentElement.classList.remove('light-mode');
      document.body.classList.remove('light-mode');
      localStorage.setItem('vnfairy-editor-theme', 'dark');
    }
    
    this.updateThemeButtonUI(nextTheme);
    
    // Re-render flowchart if it is active to refresh line stroke styling
    if (this.activeSceneId) {
      this.renderFlowchart();
    }
  }

  isNewerVersion(projVer, currVer) {
    return window.VNFairyCore && window.VNFairyCore.versioning
      ? window.VNFairyCore.versioning.isNewerVersion(projVer, currVer)
      : false;
  }

  showVersionError(projVer, currVer) {
    if (window.VNFairyDom) {
      window.VNFairyDom.showCompatibilityError({
        hiddenIds: ['editor-layout', 'dashboard-portal'],
        gameLabel: 'project',
        artifactVersion: projVer,
        currentVersion: currVer
      });
      return;
    }
    document.getElementById('editor-layout').classList.add('hidden');
    document.getElementById('dashboard-portal').classList.add('hidden');
    
    // Create error overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:#0f172a; color:#e2e8f0; font-family:var(--font-sans); padding:20px; box-sizing:border-box; z-index:99999;";
    overlay.innerHTML = `
      <div class="glass-panel" style="max-width:500px; padding:30px; text-align:center; border:1px solid rgba(239,68,68,0.2); border-radius:12px; background:rgba(30,41,59,0.7); box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <div style="font-size:3.5rem; margin-bottom:15px; color:#ef4444;">⚠️</div>
        <h2 style="margin:0 0 12px 0; font-size:1.5rem; font-family:var(--font-display); font-weight:700;">Version Incompatibility</h2>
        <p style="margin:0 0 20px 0; font-size:0.95rem; color:#94a3b8; line-height:1.6;">
          This project was created in a newer version of VNFairy (<strong style="color:#ef4444;">v${projVer}</strong>).
          <br>Your current version of VNFairy is <strong style="color:#38bdf8;">v${currVer}</strong>.
        </p>
        <p style="margin:0 0 24px 0; font-size:0.85rem; color:#64748b; line-height:1.5; font-style:italic;">
          Please update VNFairy to the latest version to open and edit this project.
        </p>
        <button class="btn-secondary" onclick="window.location.href='editor.html'" style="padding:10px 20px; font-size:0.9rem;">Back to Dashboard</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  openAboutModal() {
    const modal = document.getElementById('about-modal');
    if (!modal) return;
    
    // Generate diagnostics logs
    const screenRes = `${window.screen.width}x${window.screen.height}`;
    const windowRes = `${window.innerWidth}x${window.innerHeight}`;
    const userAgent = navigator.userAgent;
    const activeProject = this.projectId || 'offline-sandbox';
    const numScenes = this.project ? Object.keys(this.project.scenes || {}).length : 0;
    const numAssets = (this.assets.bg.length + this.assets.char.length + this.assets.music.length + this.assets.sound.length);
    
    let storageUsage = "Calculating...";
    try {
      let total = 0;
      for (const x in localStorage) {
        if (localStorage.hasOwnProperty(x)) {
          total += ((localStorage[x].length + x.length) * 2);
        }
      }
      storageUsage = `${(total / 1024).toFixed(2)} KB`;
    } catch(e) {
      storageUsage = "Unknown";
    }

    const isOffline = window.location.protocol === 'file:';
    const connectionStatus = isOffline ? "Offline (file:// sandbox)" : "Connected (Local API)";

    const diagnosticsText = `[VNFairy System Diagnostics Log]
Timestamp         : ${new Date().toISOString()}
User Agent        : ${userAgent}
Screen Resolution : ${screenRes} (Window: ${windowRes})
Active Project    : ${activeProject}
Loaded Scenes     : ${numScenes}
Registered Assets : ${numAssets}
LocalStorage Size : ${storageUsage}
Server Connection : ${connectionStatus}
Theme Configuration: ${localStorage.getItem('vnfairy-editor-theme') || 'dark'}
Accent Color      : ${this.project && this.project.config ? (this.project.config.accentColor || '#6366f1') : '#6366f1'}
`;

    const diagContent = document.getElementById('about-diagnostics-content');
    if (diagContent) {
      diagContent.innerText = diagnosticsText;
    }
    
    modal.classList.remove('hidden');
  }

  openGuideModal() {
    const modal = document.getElementById('guide-modal');
    if (!modal) return;
    
    // Switch to first topic automatically
    this.switchGuideTopic('guide-intro');
    
    modal.classList.remove('hidden');
  }

  switchGuideTopic(topicId) {
    this.playSynthSFX('click');
    
    // Hide all guide sections
    const sections = document.querySelectorAll('.guide-section');
    sections.forEach(sec => sec.classList.add('hidden'));
    
    // Deactivate all guide buttons
    const buttons = document.querySelectorAll('.guide-sidebar-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Show selected section
    const targetSection = document.getElementById(topicId);
    if (targetSection) {
      targetSection.classList.remove('hidden');
    }
    
    // Activate clicked button
    const btnId = `btn-sec-${topicId}`;
    const targetBtn = document.getElementById(btnId);
    if (targetBtn) {
      targetBtn.classList.add('active');
    }
    
    // Scroll content pane back to top
    const contentArea = document.getElementById('guide-content-area');
    if (contentArea) {
      contentArea.scrollTop = 0;
    }
  }

  // Load project and scan local assets
  async init() {
    // Check search parameters for project ID
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project') || urlParams.get('id');
    this.projectId = projectId;

    if (window.location.protocol === 'file:') {
      console.warn("Editor running offline via file:// protocol. Loading offline sandbox.");
      this.loadOfflineSandbox();
      return;
    }

    try {
      // 1. Fetch assets first so selector populating works
      await this.refreshAssets();

      if (!projectId) {
        // No project loaded, show projects list dashboard
        document.getElementById('dashboard-portal').classList.remove('hidden');
        document.getElementById('editor-layout').classList.add('hidden');
        await this.loadProjectsList();
        return;
      }

      // 2. Fetch project
      const response = await fetch(`/api/project?id=${projectId}`);
      if (!response.ok) throw new Error("Could not load project");
      const data = await response.json();
      
      if (data.vnFairyVersion && this.isNewerVersion(data.vnFairyVersion, this.version)) {
        this.showVersionError(data.vnFairyVersion, this.version);
        return;
      }
      
      const localRecovery = this.loadLocalRecovery();
      this.finishProjectLoad(localRecovery || data, localRecovery ? 'Recovered locally' : 'Saved to disk');

    } catch (err) {
      console.error("Editor init failed.", err);
      const recovered = this.loadLocalRecovery();
      if (recovered) this.finishProjectLoad(recovered, 'Recovered locally');
      else this.loadOfflineSandbox(true);
    }
  }

  finishProjectLoad(data, status = 'Saved to disk') {
    try {
      this.project = window.VNFairyCore && window.VNFairyCore.migrations
        ? window.VNFairyCore.migrations.migrateProject(data, { engineVersion: this.version })
        : data;
    } catch (error) {
      if (error.code === 'FUTURE_PROJECT_SCHEMA') {
        this.showVersionError(data && (data.engineVersion || data.vnFairyVersion || data.schemaVersion), this.version);
        return false;
      }
      throw error;
    }
    this.project.id = this.projectId || this.project.id || 'offline-sandbox';
    this.project.config = this.project.config || {};
    if (this.project.scenes) {
      Object.values(this.project.scenes).forEach(scene => {
        if (scene.choices) {
          scene.choices.forEach((choice, idx) => {
            if (!choice.id) choice.id = "choice_" + idx + "_" + Math.random().toString(36).slice(2, 7) + "_" + Date.now();
          });
        }
      });
    }
    if (this.project.config.galleryEnabled === undefined) this.project.config.galleryEnabled = false;
    if (this.project.config.galleryCharactersEnabled === undefined) this.project.config.galleryCharactersEnabled = false;
    if (this.project.config.galleryBackgroundsEnabled === undefined) this.project.config.galleryBackgroundsEnabled = false;
    if (this.project.config.musicEnabled === undefined) this.project.config.musicEnabled = false;
    this.project.unlockables = this.project.unlockables || [];

    document.getElementById('dashboard-portal').classList.add('hidden');
    document.getElementById('editor-layout').classList.remove('hidden');
    this.loadProjectMeta();
    this.refreshScenesTree();
    this.populateSceneGroupSelect();
    this.populateAssetDropdowns();
    this.refreshSettingsTab();
    this.renderAssetsTab();
    const selectedScene = this.project.startSceneId && this.project.scenes[this.project.startSceneId]
      ? this.project.startSceneId
      : Object.keys(this.project.scenes || {})[0];
    if (selectedScene) this.selectScene(selectedScene);
    this.initializeHistory();
    this.updateSaveStatus(status, status !== 'Saved to disk');
    return true;
  }

  localRecoveryKey() {
    return `vnfairy_editor_recovery_${this.projectId || 'offline-sandbox'}`;
  }

  loadLocalRecovery() {
    try {
      // A named project must never inherit the old global sandbox recovery
      // record. VNFairy 1.x used `vnfairy_sandbox_project` for all editor
      // saves, so using it here can replace a real project's data with an
      // unrelated blank sandbox while playback still loads the disk project.
      let raw = localStorage.getItem(this.localRecoveryKey());
      if (!raw && !this.projectId) raw = localStorage.getItem('vnfairy_sandbox_project');
      if (!raw) return null;

      const recovery = JSON.parse(raw);
      if (this.projectId && recovery && recovery.id && recovery.id !== this.projectId) return null;
      return recovery;
    } catch (err) {
      console.warn('Local recovery data could not be read.', err);
      return null;
    }
  }

  loadOfflineSandbox(saveFailed = false) {
    this.project = {
      artifactType: 'vnfairy-project',
      schemaVersion: 1,
      engineVersion: this.version,
      createdWithVersion: this.version,
      title: "Offline Story Sandbox",
      author: "Game Designer",
      config: {
        kineticMode: false,
        textSpeed: 40,
        titleScreen: { background: "", music: "", titleColor: "#ffffff", subtitleColor: "#a5d6a7", menuFontSize: 1.1 },
        credits: { background: "", music: "", text: "Built offline with VNFairy" },
        galleryEnabled: false,
        galleryCharactersEnabled: false,
        galleryBackgroundsEnabled: false,
        musicEnabled: false
      },
      assets: { backgrounds: [], characters: [], music: [], sound: [] },
      unlockables: [],
      startSceneId: "scene_start",
      scenes: {
        scene_start: {
          id: "scene_start",
          name: "The Beginning",
          background: "",
          music: "",
          dialogue: [
            { text: "This is a local sandbox storage project. Server saving is disabled.", layout: { left: null, center: null, right: null }, speaker: "narrator" }
          ],
          choices: []
        }
      }
    };
    // Ensure all choice options have unique IDs
    if (this.project.scenes) {
      Object.values(this.project.scenes).forEach(scene => {
        if (scene.choices) {
          scene.choices.forEach((choice, idx) => {
            if (!choice.id) {
              choice.id = "choice_" + idx + "_" + Math.random().toString(36).substr(2, 5) + "_" + Date.now();
            }
          });
        }
      });
    }
    this.finishProjectLoad(this.project, saveFailed ? 'Save failed' : 'Recovered locally');
  }

  // Project auto-save mechanism
  async saveProject(showNotification = false) {
    if (!this.project) return false;
    this.updateSaveStatus("Saving…");
    
    // Sync project metadata from inputs
    if (window.VNFairyCore && window.VNFairyCore.migrations) {
      this.project = window.VNFairyCore.migrations.stampProjectForWrite(this.project, { engineVersion: this.version });
    } else {
      this.project.vnFairyVersion = this.version;
    }
    this.project.title = document.getElementById('project-title-input').value;
    this.project.author = document.getElementById('project-author-input').value;
    this.project.config.kineticMode = document.getElementById('settings-kinetic-mode').checked;
    this.project.config.debugModeEnabled = document.getElementById('settings-debug-mode').checked;
    this.project.config.textSpeed = parseInt(document.getElementById('settings-text-speed').value) || 40;
    this.project.startSceneId = document.getElementById('settings-start-scene').value;
    this.project.config.launchBehavior = document.getElementById('settings-launch-behavior').value;
    this.project.config.uiClickSound = document.getElementById('settings-ui-click-sound').value;
    this.project.config.theme = document.getElementById('settings-ui-theme').value;
    this.project.config.accentColor = document.getElementById('settings-ui-accent').value;

    this.project.config.galleryEnabled = document.getElementById('settings-gallery-enabled').checked;
    this.project.config.galleryCharactersEnabled = document.getElementById('settings-gallery-chars-enabled').checked;
    this.project.config.galleryBackgroundsEnabled = document.getElementById('settings-gallery-bgs-enabled').checked;
    this.project.config.musicEnabled = document.getElementById('settings-music-enabled').checked;

    // Title configs
    this.project.config.titleScreen = this.project.config.titleScreen || {};
    this.project.config.titleScreen.background = document.getElementById('settings-title-bg').value;
    this.project.config.titleScreen.music = document.getElementById('settings-title-music').value;
    this.project.config.titleScreen.titleColor = document.getElementById('settings-title-color').value;
    this.project.config.titleScreen.menuLayout = document.getElementById('settings-title-layout').value;
    const menuFontSize = parseFloat(document.getElementById('settings-menu-font-size').value);
    this.project.config.titleScreen.menuFontSize = Number.isFinite(menuFontSize) ? menuFontSize : 1.1;
    this.project.config.titleScreen.hideTitleText = document.getElementById('settings-hide-title-text').checked;
    this.project.config.titleScreen.noShading = document.getElementById('settings-no-shading').checked;
    this.project.config.titleScreen.menuButtonColor = document.getElementById('settings-menu-btn-color').value;
    this.project.config.titleScreen.menuButtonBorder = document.getElementById('settings-menu-btn-border').value;
    this.project.config.titleScreen.menuButtonBgStyle = document.getElementById('settings-menu-btn-bg-style').value;
    this.project.config.titleScreen.menuButtonBgColor = document.getElementById('settings-menu-btn-bg-color').value;
    this.project.config.titleScreen.menuButtonBgOpacity = parseInt(document.getElementById('settings-menu-btn-bg-opacity').value) !== undefined ? parseInt(document.getElementById('settings-menu-btn-bg-opacity').value) : 25;

    // Credits configs
    this.project.config.credits = this.project.config.credits || {};
    this.project.config.credits.background = document.getElementById('settings-credits-bg').value;
    this.project.config.credits.music = document.getElementById('settings-credits-music').value;
    this.project.config.credits.text = document.getElementById('settings-credits-text').value;
    this.project.config.credits.noShading = document.getElementById('settings-credits-no-shading').checked;
    this.project.config.credits.noDimming = document.getElementById('settings-credits-no-dimming').checked;
    this.captureHistoryChange();

    try {
      let saveUrl = '/api/project';
      if (this.projectId) {
        saveUrl += `?id=${this.projectId}`;
      }
      const response = await fetch(saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.project)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Save API error");
      localStorage.removeItem(this.localRecoveryKey());
      this.updateSaveStatus("Saved to disk");
      if (showNotification) this.showToast("Saved to disk");
      return true;
    } catch (err) {
      console.warn("Could not save to disk; retaining a local recovery copy.", err);
      try {
        localStorage.setItem(this.localRecoveryKey(), JSON.stringify(this.project));
        this.updateSaveStatus("Recovered locally", true);
      } catch (storageError) {
        console.error("Local recovery also failed.", storageError);
        this.updateSaveStatus("Save failed", true);
      }
      return false;
    }
  }

  // Set timeout to delay save after keystrokes (debouncing)
  triggerAutoSave() {
    this.captureHistoryChange();
    this.updateSaveStatus("Unsaved changes...");
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => { this.saveProject(); }, 1500);
  }

  updateSaveStatus(statusText, warning = false) {
    const statusElem = document.getElementById('save-status');
    if (!statusElem) return;
    statusElem.innerText = statusText;
    statusElem.style.color = warning ? "var(--warning)" : "var(--text-muted)";
    statusElem.dataset.state = statusText.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  }

  initializeHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.historyState = this.project ? JSON.stringify(this.project) : null;
    this.historyContext = null;
    this.historyCapturedAt = 0;
    this.updateHistoryButtons();
  }

  captureHistoryChange() {
    if (!this.project || this.isApplyingHistory) return;
    const currentState = JSON.stringify(this.project);
    if (!this.historyState) {
      this.historyState = currentState;
      return;
    }
    if (currentState === this.historyState) return;

    const activeElement = document.activeElement;
    const context = `${this.activeSceneId || ''}:${this.activeStepIndex ?? ''}:${activeElement && activeElement.id || ''}`;
    const now = Date.now();
    const shouldCoalesce = context === this.historyContext && now - this.historyCapturedAt < 750;
    if (!shouldCoalesce) {
      this.undoStack.push(this.historyState);
      if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    }
    this.historyState = currentState;
    this.historyContext = context;
    this.historyCapturedAt = now;
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  undo() {
    if (!this.project || !this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.applyHistoryState(this.undoStack.pop(), 'Undo applied');
  }

  redo() {
    if (!this.project || !this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.project));
    this.applyHistoryState(this.redoStack.pop(), 'Redo applied');
  }

  applyHistoryState(serializedState, message) {
    const previousSceneId = this.activeSceneId;
    const previousStepIndex = this.activeStepIndex;
    this.isApplyingHistory = true;
    try {
      this.project = JSON.parse(serializedState);
      this.historyState = serializedState;
      this.historyContext = null;
      this.loadProjectMeta();
      this.refreshScenesTree();
      this.populateSceneGroupSelect();
      this.refreshSettingsTab();
      this.renderAssetsTab();
      const sceneId = this.project.scenes[previousSceneId]
        ? previousSceneId
        : (this.project.startSceneId || Object.keys(this.project.scenes || {})[0]);
      if (sceneId) {
        this.selectScene(sceneId);
        const dialogue = this.project.scenes[sceneId].dialogue || [];
        if (dialogue.length) this.selectDialogueStep(Math.min(previousStepIndex || 0, dialogue.length - 1));
      }
      this.updateSaveStatus('Unsaved changes...');
      this.showToast(message);
    } finally {
      this.isApplyingHistory = false;
      this.updateHistoryButtons();
    }
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveProject(), 500);
  }

  updateHistoryButtons() {
    const undoButton = document.getElementById('btn-undo');
    const redoButton = document.getElementById('btn-redo');
    if (undoButton) undoButton.disabled = this.undoStack.length === 0;
    if (redoButton) redoButton.disabled = this.redoStack.length === 0;
  }

  // Load project name/author headers
  loadProjectMeta() {
    document.getElementById('project-title-input').value = this.project.title || "";
    document.getElementById('project-author-input').value = this.project.author || "";
  }

  // Fetch file structures on the server data folder
  async refreshAssets() {
    try {
      const response = await fetch(`/api/assets?project=${this.projectId || 'demo'}`);
      if (!response.ok) throw new Error("Could not load assets");
      this.assets = await response.json();
      this.assetMetadata = this.assets.metadata || {};
      
      this.renderAssetsTab();
      if (this.project) this.populateAssetDropdowns();

      // If universal select modal is active, refresh its list too
      const modal = document.getElementById('universal-select-modal');
      if (modal && !modal.classList.contains('hidden')) {
        const searchInput = document.getElementById('universal-search-input');
        const filter = searchInput ? searchInput.value : "";
        this.renderUniversalSelectModalList(filter);
      }
    } catch (e) {
      console.warn("Could not fetch server assets. Asset upload disabled offline.", e);
    }
  }

  // Render lists in the Sidebar Assets tab
  renderAssetsTab() {
    if (!this.project) return;
    this.ensureAssetLibrary();
    this.refreshAssetFolderFilter();
    const types = ['bg', 'char', 'music', 'sound', 'video'];
    const unused = types.reduce((count, type) => count + this.getAssetRecords(type).filter(record => !(record.metadata.usageCount || 0)).length, 0);
    const summary = document.getElementById('asset-manager-summary');
    const sidebarSummary = document.getElementById('asset-sidebar-summary');
    const unusedSummary = document.getElementById('asset-manager-unused-summary');
    if (unusedSummary) unusedSummary.textContent = unused ? `${unused} unused asset${unused === 1 ? '' : 's'} · unused assets are marked below` : 'All uploaded assets are in use';
    const counts = {
      bg: this.getAssetFilenames('bg').length,
      char: this.getAssetFilenames('char').length + (this.project.assets.characters || []).length,
      music: this.getAssetFilenames('music').length,
      sound: this.getAssetFilenames('sound').length,
      video: this.getAssetFilenames('video').length
    };
    const managedTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (summary) summary.textContent = `${managedTotal} asset${managedTotal === 1 ? '' : 's'}`;
    if (sidebarSummary) sidebarSummary.textContent = `${managedTotal} asset${managedTotal === 1 ? '' : 's'} across ${Object.values(counts).filter(Boolean).length} categories`;
    Object.entries(counts).forEach(([type, count]) => {
      const badge = document.getElementById(`asset-count-${type}`);
      if (badge) badge.textContent = count;
      const sidebarBadge = document.getElementById(`asset-sidebar-count-${type}`);
      if (sidebarBadge) sidebarBadge.textContent = count;
    });

    const queries = {};
    types.forEach(type => { queries[type] = (document.getElementById(`search-asset-${type}`)?.value || '').toLowerCase().trim(); });
    this.renderAssetFileList('bg', document.getElementById('asset-bg-list'), queries.bg, record => this.renderImageAssetCard('bg', record));
    this.renderAssetFileList('music', document.getElementById('asset-music-list'), queries.music, record => this.renderAudioAssetItem('music', record));
    this.renderAssetFileList('sound', document.getElementById('asset-sound-list'), queries.sound, record => this.renderAudioAssetItem('sound', record));
    this.renderAssetFileList('video', document.getElementById('asset-video-list'), queries.video, record => this.renderVideoAssetCard(record));

    const charAssetList = document.getElementById('asset-char-list');
    if (charAssetList) {
      charAssetList.innerHTML = '';
      const spriteHeading = document.createElement('div');
      spriteHeading.className = 'asset-subsection-heading';
      spriteHeading.textContent = 'Sprite files';
      charAssetList.appendChild(spriteHeading);
      const spriteGrid = document.createElement('div');
      spriteGrid.className = 'asset-grid management-asset-grid management-character-sprite-grid';
      this.getAssetRecords('char').filter(record => this.assetMatches('char', record, queries.char)).forEach(record => spriteGrid.appendChild(this.renderImageAssetCard('char', record)));
      if (!spriteGrid.children.length) spriteGrid.innerHTML = '<div class="muted asset-empty-state">No matching sprite files.</div>';
      charAssetList.appendChild(spriteGrid);
      const characterHeading = document.createElement('div');
      characterHeading.className = 'asset-subsection-heading';
      characterHeading.textContent = 'Characters and default expressions';
      charAssetList.appendChild(characterHeading);
      const characterGrid = document.createElement('div');
      characterGrid.className = 'character-assets-grid';
      const projectChars = this.project.assets.characters || [];
      projectChars.filter(char => !queries.char || String(char.name || char.id).toLowerCase().includes(queries.char)).forEach(char => {
        const div = document.createElement('div');
        div.className = 'char-asset-item';
        const header = document.createElement('div');
        header.className = 'char-asset-header';
        header.innerHTML = `<span class="asset-name" style="color:${this.escapeHtml(char.color || '#fff')}"><span class="asset-type-badge">Character</span>${this.escapeHtml(char.name || char.id)}<span class="muted">Default: ${this.escapeHtml(char.defaultExpression || (char.sprites || [])[0]?.id || 'none')}</span></span>`;
        const actions = document.createElement('div');
        actions.innerHTML = '<button type="button" class="scene-action-btn">Edit</button><button type="button" class="scene-action-btn btn-danger-text">Delete</button>';
        actions.children[0].onclick = () => this.openCharacterModal(char.id);
        actions.children[1].onclick = () => this.deleteCharacter(char.id);
        header.appendChild(actions);
        div.appendChild(header);
        const sprites = document.createElement('div');
        sprites.className = 'char-sprites-grid';
        (char.sprites || []).forEach(sprite => {
          const spriteCard = document.createElement('div');
          spriteCard.className = 'char-sprite-card is-previewable';
          spriteCard.title = `${sprite.name || sprite.id}${sprite.id === char.defaultExpression ? ' · default' : ''}`;
          spriteCard.innerHTML = `<img src="${this.escapeHtml(sprite.path || '')}" alt="${this.escapeHtml(sprite.name || sprite.id)}">`;
          if (sprite.path) {
            spriteCard.onclick = event => {
              event.stopPropagation();
              this.previewImageAsset(sprite.path, sprite.name || sprite.id);
            };
          }
          sprites.appendChild(spriteCard);
        });
        div.appendChild(sprites);
        const defaultSprite = (char.sprites || []).find(sprite => sprite.id === char.defaultExpression) || (char.sprites || [])[0];
        if (defaultSprite?.path) {
          div.classList.add('is-previewable');
          div.onclick = event => {
            if (event.target.closest('button')) return;
            this.previewImageAsset(defaultSprite.path, char.name || char.id);
          };
        }
        characterGrid.appendChild(div);
      });
      if (!characterGrid.children.length) characterGrid.innerHTML = '<div class="muted asset-empty-state">No matching configured characters.</div>';
      charAssetList.appendChild(characterGrid);
    }
    this.renderAssetSidebarOverview();
    this.updateAssetSelectionUI();
    return;

    // Search queries
    const bgQuery = (document.getElementById('search-asset-bg')?.value || "").toLowerCase().trim();
    const charQuery = (document.getElementById('search-asset-char')?.value || "").toLowerCase().trim();
    const musicQuery = (document.getElementById('search-asset-music')?.value || "").toLowerCase().trim();
    const soundQuery = (document.getElementById('search-asset-sound')?.value || "").toLowerCase().trim();
    const videoQuery = (document.getElementById('search-asset-video')?.value || "").toLowerCase().trim();

    // 1. Backgrounds
    const bgList = document.getElementById('asset-bg-list');
    bgList.innerHTML = "";
    this.assets.bg.forEach(file => {
      if (bgQuery && !file.toLowerCase().includes(bgQuery)) return;

      const card = document.createElement('div');
      card.className = "asset-card";
      card.style.backgroundImage = `url('data/projects/${this.projectId || 'demo'}/assets/bg/${file}')`;
      card.innerHTML = `
        <div class="asset-card-overlay">
          <button class="btn-delete-asset" onclick="window.editor.deleteAsset('bg', '${file}', event)" title="Delete Background">&times;</button>
          <div class="asset-card-name">${file}</div>
        </div>
      `;
      bgList.appendChild(card);
    });

    // 2. Characters & expression lists
    const charList = document.getElementById('asset-char-list');
    charList.innerHTML = "";

    const projectChars = (this.project && this.project.assets && this.project.assets.characters) || [];
    projectChars.forEach(char => {
      if (charQuery && !char.name.toLowerCase().includes(charQuery)) return;

      const div = document.createElement('div');
      div.className = "char-asset-item";
      
      let spritesHtml = "";
      (char.sprites || []).forEach(sprite => {
        spritesHtml += `
          <div class="char-sprite-card" title="${sprite.name}">
            <img src="${sprite.path}" alt="${sprite.name}">
          </div>
        `;
      });

      div.innerHTML = `
        <div class="char-asset-header">
          <span class="asset-name" style="color:${char.color || '#fff'}"><span class="asset-type-badge">Character</span>${char.name}</span>
          <div style="display:flex; gap:6px;">
            <button class="scene-action-btn" onclick="window.editor.openCharacterModal('${char.id}')">Edit</button>
            <button class="scene-action-btn btn-danger-text" onclick="window.editor.deleteCharacter('${char.id}')">Delete</button>
          </div>
        </div>
        <div class="char-sprites-grid">
          ${spritesHtml}
        </div>
      `;
      charList.appendChild(div);
    });

    // 3. Audio BGM
    const musicList = document.getElementById('asset-music-list');
    musicList.innerHTML = "";
    this.assets.music.forEach(file => {
      if (musicQuery && !file.toLowerCase().includes(musicQuery)) return;

      const item = document.createElement('div');
      item.className = "audio-asset-item";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.innerHTML = `
        <span class="asset-name"><span class="asset-type-badge">Music</span>${file}</span>
        <button class="scene-action-btn btn-danger-text" style="font-weight:bold; font-size:1.1rem; padding: 0 6px;" onclick="window.editor.deleteAsset('music', '${file}', event)" title="Delete Music">&times;</button>
      `;
      musicList.appendChild(item);
    });

    // 4. Voice Clips / Sound
    const soundList = document.getElementById('asset-sound-list');
    if (soundList) {
      soundList.innerHTML = "";
      (this.assets.sound || []).forEach(file => {
        if (soundQuery && !file.toLowerCase().includes(soundQuery)) return;

        const item = document.createElement('div');
        item.className = "audio-asset-item";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.innerHTML = `
          <span class="asset-name"><span class="asset-type-badge">Voice</span>${file}</span>
          <button class="scene-action-btn btn-danger-text" style="font-weight:bold; font-size:1.1rem; padding: 0 6px;" onclick="window.editor.deleteAsset('sound', '${file}', event)" title="Delete Voice Clip">&times;</button>
        `;
        soundList.appendChild(item);
      });
    }

    // 5. Videos / Cutscenes
    const videoList = document.getElementById('asset-video-list');
    if (videoList) {
      videoList.innerHTML = "";
      (this.assets.video || []).forEach(file => {
        if (videoQuery && !file.toLowerCase().includes(videoQuery)) return;

        const item = document.createElement('div');
        item.className = "audio-asset-item";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.innerHTML = `
          <span class="asset-name"><span class="asset-type-badge">Video</span>${file}</span>
          <button class="scene-action-btn btn-danger-text" style="font-weight:bold; font-size:1.1rem; padding: 0 6px;" onclick="window.editor.deleteAsset('video', '${file}', event)" title="Delete Video">&times;</button>
        `;
        videoList.appendChild(item);
      });
    }
  }

  async deleteAsset(type, filename, event) {
    if (event) event.stopPropagation();
    const assetTypeName = type === 'bg' ? 'background' : type === 'music' ? 'music' : type === 'sound' ? 'voice clip' : 'video';
    if (!confirm(`Are you sure you want to delete this ${assetTypeName} file? This will physically delete the file from the project's folder.`)) return;

    try {
      await this.deleteAssetFile(type, filename);
      this.showToast("Deleted successfully!");
      this.selectedAssetKeys.delete(`${type}:${filename}`);
      await this.refreshAssets();
      this.saveProject();
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
  }

  async deleteAssetFile(type, filename) {
    const response = await fetch('/api/asset/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, filename, project: this.projectId || 'demo' })
    });
    const res = await response.json();
    if (!res.success) throw new Error(res.error);
    if (this.project && this.project.assets) {
      const id = filename.replace(/\.[^/.]+$/, "");
      const registryKey = type === 'bg' ? 'backgrounds' : type === 'music' ? 'music' : type === 'sound' ? 'sound' : type === 'video' ? 'video' : null;
      if (registryKey && this.project.assets[registryKey]) this.project.assets[registryKey] = this.project.assets[registryKey].filter(item => item.id !== id);
      if (this.project.assets.library && this.project.assets.library.items) delete this.project.assets.library.items[`${type}:${filename}`];
    }
  }

  async deleteSelectedAssets() {
    const keys = [...this.selectedAssetKeys];
    if (!keys.length || !confirm(`Delete ${keys.length} selected asset${keys.length === 1 ? '' : 's'}? Files will be removed from the project folder.`)) return;
    const failures = [];
    for (const key of keys) {
      const splitAt = key.indexOf(':');
      const type = key.slice(0, splitAt);
      const filename = key.slice(splitAt + 1);
      try { await this.deleteAssetFile(type, filename); }
      catch (error) { failures.push(`${filename}: ${error.message}`); }
    }
    this.selectedAssetKeys.clear();
    await this.refreshAssets();
    await this.saveProject();
    if (failures.length) alert(`Some assets could not be deleted:\n\n${failures.join('\n')}`);
    this.showToast(`${keys.length - failures.length} asset${keys.length - failures.length === 1 ? '' : 's'} deleted`);
  }

  deleteCharacter(charId) {
    if (!confirm("Are you sure you want to delete this character? All their expression sprites will be removed from the project config.")) return;
    if (this.project && this.project.assets && this.project.assets.characters) {
      this.project.assets.characters = this.project.assets.characters.filter(c => c.id !== charId);
    }
    this.saveProject();
    this.renderAssetsTab();
  }

  // Update backgrounds and music choice lists inside dropdown selectors
  populateAssetDropdowns() {
    const bgSelects = [
      document.getElementById('scene-bg-select'),
      document.getElementById('settings-title-bg'),
      document.getElementById('settings-credits-bg')
    ];

    const musicSelects = [
      document.getElementById('scene-music-select'),
      document.getElementById('settings-title-music'),
      document.getElementById('settings-credits-music')
    ];

    const soundSelects = [
      document.getElementById('settings-ui-click-sound'),
      document.getElementById('step-voice-select')
    ];

    // Populate BG dropdowns
    bgSelects.forEach(select => {
      if (!select) return;
      const currentVal = select.value;
      
      // Scene backgrounds also keep the built-in solid white option.
      const defaultLength = select.id === 'scene-bg-select' ? 2 : 1;
      while (select.options.length > defaultLength) select.remove(defaultLength);

      this.assets.bg.forEach(file => {
        // Create background ID
        const id = file.replace(/\.[^/.]+$/, "");
        
        // Add to project register if not exists
        if (this.project) {
          this.project.assets = this.project.assets || {};
          this.project.assets.backgrounds = this.project.assets.backgrounds || [];
          if (!this.project.assets.backgrounds.some(b => b.id === id)) {
            this.project.assets.backgrounds.push({
              id: id,
              name: id.replace(/_/g, " "),
              path: `data/projects/${this.projectId || 'demo'}/assets/bg/${file}`
            });
          }
        }

        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = file;
        select.appendChild(opt);
      });

      select.value = currentVal;
    });

    // Populate Music dropdowns
    musicSelects.forEach(select => {
      if (!select) return;
      const currentVal = select.value;

      // Keep default options
      const defaultLength = select.id === 'scene-music-select' ? 2 : 1;
      while (select.options.length > defaultLength) select.remove(defaultLength);

      this.assets.music.forEach(file => {
        const id = file.replace(/\.[^/.]+$/, "");

        // Add to project music register
        if (this.project) {
          this.project.assets = this.project.assets || {};
          this.project.assets.music = this.project.assets.music || [];
          if (!this.project.assets.music.some(m => m.id === id)) {
            this.project.assets.music.push({
              id: id,
              name: id.replace(/_/g, " "),
              path: `data/projects/${this.projectId || 'demo'}/assets/music/${file}`
            });
          }
        }

        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = file;
        select.appendChild(opt);
      });

      select.value = currentVal;
    });

    // Populate Sound selects
    soundSelects.forEach(select => {
      if (!select) return;
      const currentVal = select.value;

      // Keep default options
      const defaultLength = select.id === 'settings-ui-click-sound' ? 2 : 1;
      while (select.options.length > defaultLength) select.remove(defaultLength);

      if (this.assets.sound) {
        this.assets.sound.forEach(file => {
          const id = file.replace(/\.[^/.]+$/, "");
          const opt = document.createElement('option');
          opt.value = id;
          opt.innerText = file;
          select.appendChild(opt);
        });
      }

      select.value = currentVal;
    });

    // Register Sound assets
    if (this.assets.sound) {
      this.assets.sound.forEach(file => {
        const id = file.replace(/\.[^/.]+$/, "");
        if (this.project) {
          this.project.assets = this.project.assets || {};
          this.project.assets.sound = this.project.assets.sound || [];
          if (!this.project.assets.sound.some(s => s.id === id)) {
            this.project.assets.sound.push({
              id: id,
              name: id.replace(/_/g, " "),
              path: `data/projects/${this.projectId || 'demo'}/assets/sound/${file}`
            });
          }
        }
      });
    }

    // Register Video assets
    if (this.assets.video) {
      this.assets.video.forEach(file => {
        const id = file.replace(/\.[^/.]+$/, "");
        if (this.project) {
          this.project.assets = this.project.assets || {};
          this.project.assets.video = this.project.assets.video || [];
          if (!this.project.assets.video.some(v => v.id === id)) {
            this.project.assets.video.push({
              id: id,
              name: id.replace(/_/g, " "),
              path: `data/projects/${this.projectId || 'demo'}/assets/video/${file}`
            });
          }
        }
      });
    }

    // Populate Video dropdown
    const videoSelect = document.getElementById('scene-video-select');
    if (videoSelect) {
      const currentVal = videoSelect.value;
      while (videoSelect.options.length > 1) videoSelect.remove(1);
      (this.assets.video || []).forEach(file => {
        const id = file.replace(/\.[^/.]+$/, "");
        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = file;
        videoSelect.appendChild(opt);
      });
      videoSelect.value = currentVal;
    }
    this.convertAllAssetSelects();
  }

  // Trigger asset upload
  triggerAssetUpload(type) {
    this.uploadingAssetType = type;
    document.getElementById('asset-file-uploader').click();
  }

  // Convert uploaded file to Base64 and send to server API
  async handleAssetUpload(file) {
    if (!file || !this.uploadingAssetType) return;
    try {
      await this.uploadFileToServer(file, this.uploadingAssetType);
      await this.refreshAssets();
      this.registerUploadedUnlockable(file, this.uploadingAssetType);
      this.renderAssetsTab();
      await this.saveProject();
      this.showToast(`Uploaded ${file.name}`);
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
      this.updateSaveStatus('Save failed', true);
    } finally {
      const uploader = document.getElementById('asset-file-uploader');
      if (uploader) uploader.value = '';
    }
    return;

    if (!file) return;
    this.updateSaveStatus("Uploading asset...");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target.result;
      
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            type: this.uploadingAssetType,
            project: this.projectId || 'demo',
            data: base64Data
          })
        });

        const res = await response.json();
        if (!res.success) throw new Error(res.error);

        this.showToast("Uploaded successfully!");
        
        // Refresh editor asset directories
        await this.refreshAssets();

        // Check if this was uploaded for an unlockable asset
        if (this.uploadingUnlockableIndex !== undefined && this.uploadingUnlockableIndex !== null) {
          const index = this.uploadingUnlockableIndex;
          this.uploadingUnlockableIndex = undefined; // Reset
          
          const path = `data/projects/${this.projectId || 'demo'}/assets/${this.uploadingAssetType}/${file.name}`;
          this.project.unlockables[index].path = path;

          // Register in project assets if background or music
          const id = file.name.replace(/\.[^/.]+$/, "");
          if (this.uploadingAssetType === 'bg') {
            this.project.assets.backgrounds = this.project.assets.backgrounds || [];
            if (!this.project.assets.backgrounds.some(b => b.id === id)) {
              this.project.assets.backgrounds.push({
                id: id,
                name: id.replace(/_/g, " "),
                path: path
              });
            }
          } else if (this.uploadingAssetType === 'music') {
            this.project.assets.music = this.project.assets.music || [];
            if (!this.project.assets.music.some(m => m.id === id)) {
              this.project.assets.music.push({
                id: id,
                name: id.replace(/_/g, " "),
                path: path
              });
            }
          }

          this.renderUnlockablesTab();
        }

        this.saveProject();
      } catch (err) {
        alert("Upload failed: " + err.message);
        this.updateSaveStatus("Save failed", true);
      }
    };
    reader.readAsDataURL(file);
  }

  fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target.result);
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async uploadFileToServer(file, type) {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, type, project: this.projectId || 'demo', data: await this.fileAsDataUrl(file) })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Upload rejected by the server');
    return result;
  }

  registerUploadedUnlockable(file, type) {
    if (this.uploadingUnlockableIndex === undefined || this.uploadingUnlockableIndex === null) return;
    const index = this.uploadingUnlockableIndex;
    this.uploadingUnlockableIndex = undefined;
    const projectId = this.projectId || 'demo';
    const assetPath = `data/projects/${projectId}/assets/${type}/${file.name}`;
    if (this.project.unlockables && this.project.unlockables[index]) this.project.unlockables[index].path = assetPath;
    const id = file.name.replace(/\.[^/.]+$/, '');
    const registryKey = type === 'bg' ? 'backgrounds' : type === 'music' ? 'music' : type === 'sound' ? 'sound' : type === 'video' ? 'video' : null;
    if (registryKey) {
      this.project.assets[registryKey] = this.project.assets[registryKey] || [];
      if (!this.project.assets[registryKey].some(item => item.id === id)) this.project.assets[registryKey].push({ id, name: id.replace(/_/g, ' '), path: assetPath });
    }
    this.renderUnlockablesTab();
  }

  async handleBulkAssetUpload(files) {
    const type = document.getElementById('asset-bulk-upload-type')?.value || 'bg';
    const selected = Array.from(files || []);
    if (!selected.length) return;
    this.updateSaveStatus('Uploading assets…');
    const failures = [];
    for (const file of selected) {
      try { await this.uploadFileToServer(file, type); }
      catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    await this.refreshAssets();
    await this.saveProject();
    const uploader = document.getElementById('asset-bulk-uploader');
    if (uploader) uploader.value = '';
    if (failures.length) alert(`Some files were rejected:\n\n${failures.join('\n')}`);
    this.showToast(`${selected.length - failures.length} asset${selected.length - failures.length === 1 ? '' : 's'} uploaded`);
  }

  renderAssetSidebarOverview() {
    const panelByType = { bg: 'asset-panel-bg', char: 'asset-panel-char', music: 'asset-panel-music', sound: 'asset-panel-sound', video: 'asset-panel-video' };
    const emptyLabels = { bg: 'No backgrounds yet', char: 'No characters yet', music: 'No music yet', sound: 'No voice or sound yet', video: 'No videos yet' };
    Object.keys(panelByType).forEach(type => {
      const container = document.getElementById(`asset-sidebar-${type}`);
      if (!container) return;
      let items = [];
      if (type === 'char') {
        const configured = (this.project.assets.characters || []).map(character => ({
          name: character.name || character.id,
          detail: 'Character',
          image: (character.sprites || []).find(sprite => sprite.id === character.defaultExpression)?.path || (character.sprites || [])[0]?.path || ''
        }));
        const configuredFiles = new Set(configured.map(item => String(item.image || '').split('/').pop()).filter(Boolean));
        const looseSprites = this.getAssetRecords('char').filter(record => !configuredFiles.has(record.filename)).map(record => ({ name: record.filename, detail: 'Sprite file', image: this.assetUrl('char', record.filename) }));
        items = [...configured, ...looseSprites];
      } else {
        items = this.getAssetRecords(type).map(record => ({
          name: record.filename,
          detail: `${this.formatAssetBytes(record.metadata.size)} · ${record.metadata.usageCount || 0} uses`,
          image: type === 'bg' ? this.assetUrl(type, record.filename) : ''
        }));
      }
      container.innerHTML = '';
      items.slice(0, 4).forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `asset-sidebar-item${item.image ? ' has-preview' : ''}`;
        button.innerHTML = item.image
          ? `<img src="${this.escapeHtml(item.image)}" alt=""><span><strong title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</strong><small>${this.escapeHtml(item.detail)}</small></span>`
          : `<span class="asset-sidebar-kind" aria-hidden="true">${type === 'music' ? '♪' : type === 'sound' ? 'SFX' : '▶'}</span><span><strong title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</strong><small>${this.escapeHtml(item.detail)}</small></span>`;
        button.onclick = () => this.openAssetManagement(panelByType[type]);
        container.appendChild(button);
      });
      if (!items.length) container.innerHTML = `<div class="asset-sidebar-empty muted">${emptyLabels[type]}</div>`;
    });
    document.querySelectorAll('.asset-sidebar-view-all').forEach(button => {
      button.onclick = () => this.openAssetManagement(button.dataset.assetPanel);
    });
  }

  openAssetManagement(panelId = 'asset-panel-bg') {
    this.renderAssetsTab();
    document.getElementById('asset-management-modal')?.classList.remove('hidden');
    switchManagementTab('asset-management', panelId);
  }

  openSceneSettings() {
    if (!this.activeSceneId || !this.project.scenes[this.activeSceneId]) {
      this.showToast('Select a scene first');
      return;
    }
    const scene = this.project.scenes[this.activeSceneId];
    const title = document.getElementById('scene-settings-modal-title');
    if (title) title.textContent = `${scene.name || scene.id} Settings`;
    document.getElementById('scene-settings-modal')?.classList.remove('hidden');
    switchManagementTab('scene-settings-management', 'scene-settings-basics');
  }

  // Character manager modal
  openCharacterModal(charId = null) {
    const title = document.getElementById('char-modal-title');
    const nameInput = document.getElementById('char-name-input');
    const colorInput = document.getElementById('char-color-input');
    const list = document.getElementById('char-expressions-editor-list');
    
    list.innerHTML = "";
    this.editingCharacterId = charId;
    this.charPreviewPosition = 'center';

    if (charId) {
      title.innerText = "Edit Character";
      const char = this.project.assets.characters.find(c => c.id === charId);
      nameInput.value = char.name;
      colorInput.value = char.color || "#ffffff";
      document.getElementById('char-nonvisual-input').checked = !!char.nonvisual;
      
      const scaleSlider = document.getElementById('char-scale-slider');
      if (scaleSlider) {
        scaleSlider.value = Math.round((char.scale !== undefined ? char.scale : 1) * 100);
      }
      
      // Load expressions
      (char.sprites || []).forEach(sprite => {
        this.addExpressionRow(sprite.id, sprite.name, sprite.path);
      });
      this.refreshCharacterDefaultExpressionOptions(char.defaultExpression);
    } else {
      title.innerText = "Create Character";
      nameInput.value = "";
      colorInput.value = "#a5d6a7";
      document.getElementById('char-nonvisual-input').checked = false;
      
      const scaleSlider = document.getElementById('char-scale-slider');
      if (scaleSlider) {
        scaleSlider.value = 100;
      }
      
      // Add one default expression row
      this.addExpressionRow('default', 'Default', '');
      this.refreshCharacterDefaultExpressionOptions('default');
    }

    this.setCharPreviewPosition('center');
    document.getElementById('char-modal').classList.remove('hidden');
  }

  addExpressionRow(id = '', name = '', filePath = '') {
    const list = document.getElementById('char-expressions-editor-list');
    const row = document.createElement('div');
    row.className = "expr-row-edit";
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.alignItems = "center";
    
    // Build options for characters sprites on server folders (char assets)
    let spriteOptions = `<option value="">Select File...</option>`;
    this.assets.char.forEach(file => {
      const isSelected = filePath.endsWith(file) ? "selected" : "";
      spriteOptions += `<option value="${file}" ${isSelected}>${file}</option>`;
    });

    row.innerHTML = `
      <input type="text" class="input-text expr-key-input" placeholder="Key (e.g. happy)" value="${id}" style="width:90px; flex-shrink:0; min-width:90px;" ${id === 'default' ? 'disabled' : ''}>
      <input type="text" class="input-text expr-name-input" placeholder="Label" value="${name}" style="width:100px; flex-shrink:0; min-width:100px;">
      <select class="select-input expr-file-select" data-asset-type="char-sprite-file" style="flex-grow:1; min-width:160px;">
        ${spriteOptions}
      </select>
      <button class="btn-secondary" style="padding: 6px; flex-shrink:0;" onclick="window.triggerExpressionUpload(this)" title="Upload Sprite Art">&#128196;</button>
      <button class="btn-danger" style="padding: 6px; flex-shrink:0;" ${id === 'default' ? 'disabled' : ''}>&times;</button>
    `;

    row.querySelector('.expr-file-select').onchange = () => this.updateCharModalPreview();
    row.querySelector('.expr-key-input').oninput = () => { this.refreshCharacterDefaultExpressionOptions(); this.updateCharModalPreview(); };
    row.querySelector('.expr-name-input').oninput = () => this.updateCharModalPreview();
    if (id !== 'default') {
      row.querySelector('.btn-danger').onclick = () => {
        row.remove();
        this.refreshCharacterDefaultExpressionOptions();
        this.updateCharModalPreview();
      };
    }
    list.appendChild(row);
    this.convertAllAssetSelects();
    this.refreshCharacterDefaultExpressionOptions();
    this.updateCharModalPreview();
  }

  refreshCharacterDefaultExpressionOptions(selected = null) {
    const select = document.getElementById('char-default-expression-select');
    const list = document.getElementById('char-expressions-editor-list');
    if (!select || !list) return;
    const previous = selected !== null ? selected : select.value;
    const keys = Array.from(list.querySelectorAll('.expr-row-edit')).map(row => ({
      id: row.querySelector('.expr-key-input')?.value.trim(),
      name: row.querySelector('.expr-name-input')?.value.trim()
    })).filter(item => item.id);
    select.innerHTML = '<option value="">Use first expression</option>';
    keys.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name || item.id;
      select.appendChild(option);
    });
    select.value = keys.some(item => item.id === previous) ? previous : (keys[0]?.id || '');
  }

  saveCharacter() {
    const name = document.getElementById('char-name-input').value.trim();
    const color = document.getElementById('char-color-input').value;
    const isNonVisual = document.getElementById('char-nonvisual-input').checked;
    const scale = isNonVisual ? 1 : (parseFloat(document.getElementById('char-scale-slider').value) / 100);
    
    if (!name) {
      alert("Please enter a character name!");
      return;
    }

    const charId = this.editingCharacterId || `char_${Date.now()}`;
    const rows = document.getElementById('char-expressions-editor-list').querySelectorAll('.expr-row-edit');
    const sprites = [];

    rows.forEach(row => {
      const key = row.querySelector('.expr-key-input').value.trim();
      const label = row.querySelector('.expr-name-input').value.trim();
      const filename = row.querySelector('.expr-file-select').value;

      if (key && filename) {
        sprites.push({
          id: key,
          name: label || key,
          path: `data/projects/${this.projectId || 'demo'}/assets/char/${filename}`
        });
      }
    });

    this.project.assets = this.project.assets || {};
    this.project.assets.characters = this.project.assets.characters || [];

    if (this.editingCharacterId) {
      // Update existing
      const idx = this.project.assets.characters.findIndex(c => c.id === charId);
      if (idx !== -1) {
        this.project.assets.characters[idx] = { id: charId, name, color, nonvisual: isNonVisual, scale, sprites, defaultExpression };
      }
    } else {
      // Create new
      this.project.assets.characters.push({ id: charId, name, color, nonvisual: isNonVisual, scale, sprites, defaultExpression });
    }

    closeModal('char-modal');
    this.refreshAssets();
    this.saveProject(true);
  }

  onNonVisualToggle() {
    this.updateCharModalPreview();
  }

  setCharPreviewPosition(pos) {
    this.charPreviewPosition = pos;
    ['left', 'center', 'right'].forEach(p => {
      const btn = document.getElementById(`btn-char-preview-${p}`);
      if (btn) {
        if (p === pos) {
          btn.classList.add('btn-primary');
          btn.classList.remove('btn-secondary');
        } else {
          btn.classList.add('btn-secondary');
          btn.classList.remove('btn-primary');
        }
      }
    });
    this.updateCharModalPreview();
  }

  updateCharModalPreview() {
    const nameInput = document.getElementById('char-name-input');
    const colorInput = document.getElementById('char-color-input');
    const nonvisualInput = document.getElementById('char-nonvisual-input');
    const scaleSlider = document.getElementById('char-scale-slider');
    
    const name = nameInput ? nameInput.value.trim() : "Character";
    const color = colorInput ? colorInput.value : "#a5d6a7";
    const isNonVisual = nonvisualInput ? nonvisualInput.checked : false;
    const scaleVal = scaleSlider ? scaleSlider.value : 100;

    const speakerPreview = document.getElementById('char-preview-speaker');
    if (speakerPreview) {
      speakerPreview.innerText = name || "Character";
      speakerPreview.style.color = color;
    }

    const previewPanel = document.getElementById('char-modal-preview-panel');
    const exprSection = document.getElementById('char-expressions-section');
    if (isNonVisual) {
      if (previewPanel) previewPanel.style.opacity = '0.3';
      if (previewPanel) previewPanel.style.pointerEvents = 'none';
      if (exprSection) exprSection.style.display = 'none';
    } else {
      if (previewPanel) previewPanel.style.opacity = '1';
      if (previewPanel) previewPanel.style.pointerEvents = 'auto';
      if (exprSection) exprSection.style.display = 'block';
    }

    const previewSlots = {
      left: document.getElementById('char-modal-sprite-left'),
      center: document.getElementById('char-modal-sprite-center'),
      right: document.getElementById('char-modal-sprite-right')
    };

    // Find first file in expressions editor
    const firstRow = document.getElementById('char-expressions-editor-list').querySelector('.expr-row-edit');
    const fileSelect = firstRow ? firstRow.querySelector('.expr-file-select') : null;
    const filename = fileSelect ? fileSelect.value : "";

    // Clear and hide all preview slots first
    Object.keys(previewSlots).forEach(pos => {
      const slot = previewSlots[pos];
      if (slot) {
        const img = slot.querySelector('.mini-sprite-img');
        if (img) {
          img.src = "";
          img.classList.add('hidden');
          img.style.transform = "";
        }
      }
    });

    if (filename && !isNonVisual) {
      const activeSlot = previewSlots[this.charPreviewPosition || 'center'];
      if (activeSlot) {
        const img = activeSlot.querySelector('.mini-sprite-img');
        if (img) {
          img.src = `data/projects/${this.projectId || 'demo'}/assets/char/${filename}`;
          img.classList.remove('hidden');
          img.style.transform = `scale(${scaleVal / 100})`;
          img.style.transformOrigin = 'bottom center';
        }
      }
    }

    const scaleText = document.getElementById('char-scale-text');
    if (scaleText) {
      scaleText.innerText = `${scaleVal}%`;
    }

    // Set mockup background preview to generic dark color
    const bgPreview = document.getElementById('char-preview-bg');
    if (bgPreview) {
      bgPreview.style.background = "#121824";
      bgPreview.style.backgroundImage = "none";
    }
  }

  // Refresh scene lists in Left Sidebar
  refreshScenesTree() {
    const list = document.getElementById('sidebar-scenes-list');
    list.innerHTML = "";

    const searchInput = document.getElementById('scene-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

    this.project.sceneGroups = this.project.sceneGroups || [];
    this.project.ungroupedSceneIds = this.project.ungroupedSceneIds || [];
    const scenes = this.project.scenes || {};

    // Gather all scene IDs in groups
    const groupedIds = new Set();
    this.project.sceneGroups.forEach(g => {
      g.sceneIds = g.sceneIds || [];
      g.sceneIds.forEach(sid => groupedIds.add(sid));
    });

    // Sync ungrouped array (remove duplicates, dead links, or grouped scenes)
    this.project.ungroupedSceneIds = this.project.ungroupedSceneIds.filter(sid => {
      return scenes[sid] && !groupedIds.has(sid);
    });

    // Add newly created scenes to ungrouped list
    Object.keys(scenes).forEach(sid => {
      if (!groupedIds.has(sid) && !this.project.ungroupedSceneIds.includes(sid)) {
        this.project.ungroupedSceneIds.push(sid);
      }
    });

    // Helper to render scene item
    const createSceneItem = (id, inGroup = false, listLength = 0, indexInList = 0) => {
      const scene = scenes[id];
      if (!scene) return null;
      const sceneName = (scene.name || id).toLowerCase();

      if (query && !sceneName.includes(query) && !id.toLowerCase().includes(query)) {
        return null;
      }

      const item = document.createElement('div');
      item.className = `scene-item ${this.activeSceneId === id ? 'active' : ''}`;
      item.dataset.sceneId = id;
      item.onclick = (e) => {
        if (!e.target.classList.contains('scene-action-btn') && !e.target.closest('.scene-item-actions')) {
          this.selectScene(id);
        }
      };

      const isStart = id === this.project.startSceneId ? " (Start)" : "";
      
      // Move buttons conditions
      const canMoveUp = indexInList > 0;
      const canMoveDown = indexInList < listLength - 1;

      const sceneStatus = scene.status || 'draft';
      const sceneTags = Array.isArray(scene.tags) ? scene.tags : [];
      item.innerHTML = `
        <div class="scene-item-copy">
          <span class="scene-item-title" title="${this.escapeHtml(scene.name || id)}">${this.escapeHtml(scene.name || id)}${isStart}</span>
          <span class="scene-item-meta"><span class="scene-status-badge ${sceneStatus}">${this.escapeHtml(sceneStatus)}</span>${scene.bookmarked ? '<span class="scene-bookmark-mark" title="Bookmarked">★</span>' : ''}${sceneTags.length ? `<span>${this.escapeHtml(sceneTags.slice(0, 2).join(' · '))}</span>` : ''}</span>
        </div>
        <div class="scene-item-actions">
          <button class="scene-action-btn move-up" onclick="event.stopPropagation(); window.editor.moveScene('${id}', -1)" title="Move Up" ${canMoveUp ? '' : 'style="opacity:0.2; pointer-events:none;"'}>↑</button>
          <button class="scene-action-btn move-down" onclick="event.stopPropagation(); window.editor.moveScene('${id}', 1)" title="Move Down" ${canMoveDown ? '' : 'style="opacity:0.2; pointer-events:none;"'}>↓</button>
          <button class="scene-action-btn" onclick="event.stopPropagation(); window.editor.duplicateScene('${id}')" title="Duplicate Scene">＋</button>
          <button class="scene-action-btn delete" onclick="event.stopPropagation(); window.editor.deleteScene('${id}')" title="Delete Scene">×</button>
        </div>
      `;
      return item;
    };

    // 1. Render Groups
    this.project.sceneGroups.forEach((group, gIdx) => {
      const groupContainer = document.createElement('div');
      groupContainer.className = "scene-group-container";

      const isCollapsed = !!group.collapsed;
      const canGroupMoveUp = gIdx > 0;
      const canGroupMoveDown = gIdx < this.project.sceneGroups.length - 1;

      const header = document.createElement('div');
      header.className = "scene-group-header";
      header.innerHTML = `
        <div class="scene-group-title" onclick="window.editor.toggleGroup('${group.id}')">
          <span class="group-arrow">${isCollapsed ? '▶' : '▼'}</span>
          <span class="group-name-text" title="${group.name}">${group.name}</span>
        </div>
        <div class="group-actions">
          <button class="scene-action-btn move-up" onclick="event.stopPropagation(); window.editor.moveGroup('${group.id}', -1)" title="Move Group Up" ${canGroupMoveUp ? '' : 'style="opacity:0.2; pointer-events:none;"'}>↑</button>
          <button class="scene-action-btn move-down" onclick="event.stopPropagation(); window.editor.moveGroup('${group.id}', 1)" title="Move Group Down" ${canGroupMoveDown ? '' : 'style="opacity:0.2; pointer-events:none;"'}>↓</button>
          <button class="scene-action-btn" onclick="window.editor.renameGroup('${group.id}', event)" title="Rename Group">Edit</button>
          <button class="scene-action-btn" onclick="window.editor.deleteGroup('${group.id}', event)" title="Delete Group">×</button>
        </div>
      `;

      groupContainer.appendChild(header);

      const itemsList = document.createElement('div');
      itemsList.className = `scene-group-items ${isCollapsed ? 'collapsed' : ''}`;

      let hasVisibleItems = false;
      const validSceneIds = (group.sceneIds || []).filter(sid => scenes[sid]);
      
      validSceneIds.forEach((sid, idx) => {
        const item = createSceneItem(sid, true, validSceneIds.length, idx);
        if (item) {
          itemsList.appendChild(item);
          hasVisibleItems = true;
        }
      });

      if (!isCollapsed) {
        groupContainer.appendChild(itemsList);
      }

      // Filter search match logic
      if (query) {
        const matchesQuery = group.name.toLowerCase().includes(query) || hasVisibleItems;
        if (matchesQuery) {
          list.appendChild(groupContainer);
        }
      } else {
        list.appendChild(groupContainer);
      }
    });

    // 2. Render Ungrouped Scenes
    const ungroupedHeader = document.createElement('div');
    ungroupedHeader.className = "scenes-ungrouped-header";
    ungroupedHeader.innerText = "Ungrouped Scenes";
    let hasUngroupedHeadingAdded = false;

    this.project.ungroupedSceneIds.forEach((sid, idx) => {
      const item = createSceneItem(sid, false, this.project.ungroupedSceneIds.length, idx);
      if (item) {
        if (!hasUngroupedHeadingAdded && this.project.sceneGroups.length > 0) {
          list.appendChild(ungroupedHeader);
          hasUngroupedHeadingAdded = true;
        }
        list.appendChild(item);
      }
    });
    const managementModal = document.getElementById('scene-management-modal');
    if (managementModal && !managementModal.classList.contains('hidden')) this.renderSceneManagement();
  }

  openSceneManagement() {
    this.renderSceneManagement();
    document.getElementById('scene-management-modal')?.classList.remove('hidden');
  }

  getSceneGroupId(sceneId) {
    const group = (this.project.sceneGroups || []).find(item => (item.sceneIds || []).includes(sceneId));
    return group ? group.id : '';
  }

  refreshSceneManagementGroupOptions() {
    const groups = this.project.sceneGroups || [];
    const configurations = [
      ['scene-management-group-filter', '<option value="">All groups</option><option value="ungrouped">Ungrouped</option>'],
      ['scene-bulk-group', '<option value="">Move to group…</option><option value="ungrouped">No group</option>']
    ];
    configurations.forEach(([id, initial]) => {
      const select = document.getElementById(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = initial;
      groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        select.appendChild(option);
      });
      if ([...select.options].some(option => option.value === current)) select.value = current;
    });
  }

  renderSceneManagement() {
    if (!this.project) return;
    this.project.sceneGroups = this.project.sceneGroups || [];
    this.refreshSceneManagementGroupOptions();
    const list = document.getElementById('scene-management-list');
    if (!list) return;
    const query = (document.getElementById('scene-management-search')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('scene-management-status-filter')?.value || '';
    const groupFilter = document.getElementById('scene-management-group-filter')?.value || '';
    const scenes = Object.values(this.project.scenes || {}).filter(scene => {
      const tags = Array.isArray(scene.tags) ? scene.tags.join(' ') : '';
      const matchesQuery = !query || `${scene.name || ''} ${scene.id || ''} ${tags}`.toLowerCase().includes(query);
      const matchesStatus = !statusFilter || (scene.status || 'draft') === statusFilter;
      const groupId = this.getSceneGroupId(scene.id);
      const matchesGroup = !groupFilter || (groupFilter === 'ungrouped' ? !groupId : groupId === groupFilter);
      return matchesQuery && matchesStatus && matchesGroup;
    });
    const summary = document.getElementById('scene-management-summary');
    if (summary) summary.textContent = `${scenes.length} of ${Object.keys(this.project.scenes || {}).length} scenes shown`;
    list.innerHTML = '';
    scenes.forEach(scene => {
      const groupId = this.getSceneGroupId(scene.id);
      const groupName = this.project.sceneGroups.find(group => group.id === groupId)?.name || 'Ungrouped';
      const row = document.createElement('article');
      row.className = `scene-management-row${scene.id === this.activeSceneId ? ' is-active' : ''}${this.selectedSceneIds.has(scene.id) ? ' is-selected' : ''}`;
      row.dataset.sceneId = scene.id;
      row.innerHTML = `<label class="management-select"><input type="checkbox" aria-label="Select ${this.escapeHtml(scene.name || scene.id)}" ${this.selectedSceneIds.has(scene.id) ? 'checked' : ''}><span></span></label><div class="scene-management-copy"><div><strong>${this.escapeHtml(scene.name || scene.id)}</strong>${scene.id === this.project.startSceneId ? '<span class="scene-start-badge">Start</span>' : ''}${scene.bookmarked ? '<span class="scene-bookmark-mark">★</span>' : ''}</div><span class="muted">${this.escapeHtml(scene.id)} · ${this.escapeHtml(groupName)}</span></div><span class="scene-status-badge ${this.escapeHtml(scene.status || 'draft')}">${this.escapeHtml(scene.status || 'draft')}</span><div class="scene-management-stats"><span>${(scene.dialogue || []).length} lines</span><span>${(scene.choices || []).length} choices</span></div><div class="scene-management-actions"><button type="button" class="btn-secondary" data-action="open">Open</button><button type="button" class="btn-secondary" data-action="settings">Settings</button><button type="button" class="btn-secondary" data-action="duplicate">Duplicate</button><button type="button" class="btn-danger" data-action="delete" ${scene.id === this.project.startSceneId ? 'disabled title="Change the start scene before deleting"' : ''}>Delete</button></div>`;
      row.querySelector('input').onchange = event => this.setSceneSelected(scene.id, event.target.checked);
      row.querySelector('[data-action="open"]').onclick = () => { this.selectScene(scene.id); closeModal('scene-management-modal'); switchWorkspaceView('timeline-view'); };
      row.querySelector('[data-action="settings"]').onclick = () => { this.selectScene(scene.id); closeModal('scene-management-modal'); this.openSceneSettings(); };
      row.querySelector('[data-action="duplicate"]').onclick = () => this.duplicateScene(scene.id);
      row.querySelector('[data-action="delete"]').onclick = () => this.deleteScene(scene.id);
      list.appendChild(row);
    });
    if (!scenes.length) list.innerHTML = '<div class="management-empty-state"><strong>No scenes found</strong><span class="muted">Adjust the search or filters to see more scenes.</span></div>';
    this.renderSceneGroupManagement();
    this.updateSceneSelectionUI();
  }

  renderSceneGroupManagement() {
    const list = document.getElementById('scene-group-management-list');
    if (!list) return;
    list.innerHTML = '';
    (this.project.sceneGroups || []).forEach((group, index, groups) => {
      const row = document.createElement('article');
      row.className = 'scene-group-management-row';
      row.innerHTML = `<div><span class="group-folder">Group</span><strong>${this.escapeHtml(group.name)}</strong><span class="muted">${(group.sceneIds || []).filter(id => this.project.scenes[id]).length} scenes</span></div><div><button type="button" class="btn-secondary" data-action="up" ${index === 0 ? 'disabled' : ''}>Up</button><button type="button" class="btn-secondary" data-action="down" ${index === groups.length - 1 ? 'disabled' : ''}>Down</button><button type="button" class="btn-secondary" data-action="rename">Rename</button><button type="button" class="btn-danger" data-action="delete">Delete group</button></div>`;
      row.querySelector('[data-action="up"]').onclick = () => this.moveGroup(group.id, -1);
      row.querySelector('[data-action="down"]').onclick = () => this.moveGroup(group.id, 1);
      row.querySelector('[data-action="rename"]').onclick = event => this.renameGroup(group.id, event);
      row.querySelector('[data-action="delete"]').onclick = event => this.deleteGroup(group.id, event);
      list.appendChild(row);
    });
    const ungroupedCount = (this.project.ungroupedSceneIds || []).filter(id => this.project.scenes[id]).length;
    const ungrouped = document.createElement('article');
    ungrouped.className = 'scene-group-management-row is-system';
    ungrouped.innerHTML = `<div><span class="group-folder">System</span><strong>Ungrouped</strong><span class="muted">${ungroupedCount} scenes</span></div><span class="muted">Scenes not assigned to a group</span>`;
    list.appendChild(ungrouped);
  }

  setSceneSelected(sceneId, selected) {
    if (selected) this.selectedSceneIds.add(sceneId);
    else this.selectedSceneIds.delete(sceneId);
    this.updateSceneSelectionUI();
  }

  updateSceneSelectionUI() {
    const label = document.getElementById('scene-selection-count');
    if (label) label.textContent = `${this.selectedSceneIds.size} selected`;
    document.querySelectorAll('.scene-management-row').forEach(row => row.classList.toggle('is-selected', this.selectedSceneIds.has(row.dataset.sceneId)));
  }

  selectVisibleScenes() {
    document.querySelectorAll('#scene-management-list .scene-management-row').forEach(row => this.selectedSceneIds.add(row.dataset.sceneId));
    this.renderSceneManagement();
  }

  clearSceneSelection() {
    this.selectedSceneIds.clear();
    this.renderSceneManagement();
  }

  assignSceneToGroup(sceneId, groupId) {
    this.project.sceneGroups.forEach(group => { group.sceneIds = (group.sceneIds || []).filter(id => id !== sceneId); });
    this.project.ungroupedSceneIds = (this.project.ungroupedSceneIds || []).filter(id => id !== sceneId);
    const target = this.project.sceneGroups.find(group => group.id === groupId);
    if (target) target.sceneIds.push(sceneId);
    else this.project.ungroupedSceneIds.push(sceneId);
  }

  applyBulkSceneGroup() {
    const value = document.getElementById('scene-bulk-group')?.value;
    if (!value || !this.selectedSceneIds.size) return;
    this.selectedSceneIds.forEach(id => this.assignSceneToGroup(id, value === 'ungrouped' ? '' : value));
    this.refreshScenesTree();
    this.populateSceneGroupSelect();
    this.saveProject(true);
    this.showToast(`Moved ${this.selectedSceneIds.size} scenes`);
  }

  applyBulkSceneStatus() {
    const status = document.getElementById('scene-bulk-status')?.value;
    if (!status || !this.selectedSceneIds.size) return;
    this.selectedSceneIds.forEach(id => { if (this.project.scenes[id]) this.project.scenes[id].status = status; });
    this.refreshScenesTree();
    this.saveProject(true);
    this.showToast(`Updated ${this.selectedSceneIds.size} scenes`);
  }

  deleteSelectedScenes() {
    const protectedIds = [...this.selectedSceneIds].filter(id => id === this.project.startSceneId);
    const deletable = [...this.selectedSceneIds].filter(id => id !== this.project.startSceneId && this.project.scenes[id]);
    if (!deletable.length) {
      if (protectedIds.length) this.showToast('The start scene cannot be deleted');
      return;
    }
    if (!confirm(`Delete ${deletable.length} selected scene${deletable.length === 1 ? '' : 's'}? This cannot be undone after saving.`)) return;
    deletable.forEach(id => {
      this.project.sceneGroups.forEach(group => { group.sceneIds = (group.sceneIds || []).filter(sceneId => sceneId !== id); });
      this.project.ungroupedSceneIds = (this.project.ungroupedSceneIds || []).filter(sceneId => sceneId !== id);
      delete this.project.scenes[id];
      this.selectedSceneIds.delete(id);
    });
    if (!this.project.scenes[this.activeSceneId]) this.selectScene(Object.keys(this.project.scenes)[0] || null);
    else this.refreshScenesTree();
    this.refreshSettingsTab();
    this.saveProject(true);
    this.renderSceneManagement();
  }

  duplicateScene(sceneId) {
    const source = this.project.scenes[sceneId];
    if (!source) return;
    let copyId = `${sceneId}_copy`;
    let suffix = 2;
    while (this.project.scenes[copyId]) copyId = `${sceneId}_copy_${suffix++}`;
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = copyId;
    copy.name = `${source.name || sceneId} Copy`;
    this.project.scenes[copyId] = copy;
    const groupId = this.getSceneGroupId(sceneId);
    if (groupId) {
      const ids = this.project.sceneGroups.find(group => group.id === groupId).sceneIds;
      ids.splice(ids.indexOf(sceneId) + 1, 0, copyId);
    } else {
      const index = this.project.ungroupedSceneIds.indexOf(sceneId);
      this.project.ungroupedSceneIds.splice(index + 1, 0, copyId);
    }
    this.refreshScenesTree();
    this.refreshSettingsTab();
    this.saveProject(true);
    this.showToast('Scene duplicated');
  }

  // Scene CRUD
  addScene() {
    const name = prompt("Enter scene name:");
    if (!name) return;

    const id = "scene_" + name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + Math.floor(Math.random()*1000);
    
    this.project.scenes = this.project.scenes || {};
    this.project.scenes[id] = {
      id: id,
      name: name,
      background: "",
      music: "",
      dialogue: [
        {
          text: "Double-click to write your first line.",
          layout: { left: null, center: null, right: null },
          speaker: "narrator"
        }
      ],
      choices: []
    };

    // Set first scene as starting scene if none exist
    if (!this.project.startSceneId) {
      this.project.startSceneId = id;
    }

    this.refreshScenesTree();
    this.refreshSettingsTab();
    this.selectScene(id);
    this.saveProject(true);
  }

  deleteScene(sceneId) {
    if (sceneId === this.project.startSceneId) {
      alert("Cannot delete starting scene! Please change the initial start scene in settings first.");
      return;
    }

    if (confirm(`Are you sure you want to delete scene "${sceneId}"?`)) {
      // Remove from groups
      if (this.project.sceneGroups) {
        this.project.sceneGroups.forEach(g => {
          g.sceneIds = (g.sceneIds || []).filter(sid => sid !== sceneId);
        });
      }
      // Remove from ungrouped list
      if (this.project.ungroupedSceneIds) {
        this.project.ungroupedSceneIds = this.project.ungroupedSceneIds.filter(sid => sid !== sceneId);
      }

      delete this.project.scenes[sceneId];
      
      if (this.activeSceneId === sceneId) {
        const keys = Object.keys(this.project.scenes);
        this.selectScene(keys.length > 0 ? keys[0] : null);
      } else {
        this.refreshScenesTree();
        this.refreshSettingsTab();
      }
      this.saveProject(true);
    }
  }

  addSceneGroup() {
    const name = prompt("Enter scene group name:");
    if (!name || !name.trim()) return;

    this.project.sceneGroups = this.project.sceneGroups || [];
    const groupId = "group_" + Date.now();
    this.project.sceneGroups.push({
      id: groupId,
      name: name.trim(),
      sceneIds: [],
      collapsed: false
    });

    this.refreshScenesTree();
    this.populateSceneGroupSelect();
    this.saveProject(true);
  }

  toggleGroup(groupId) {
    const group = this.project.sceneGroups.find(g => g.id === groupId);
    if (group) {
      group.collapsed = !group.collapsed;
      this.refreshScenesTree();
      this.saveProject();
    }
  }

  renameGroup(groupId, event) {
    if (event) event.stopPropagation();
    const group = this.project.sceneGroups.find(g => g.id === groupId);
    if (group) {
      const newName = prompt("Rename group to:", group.name);
      if (newName && newName.trim()) {
        group.name = newName.trim();
        this.refreshScenesTree();
        this.populateSceneGroupSelect();
        this.saveProject(true);
      }
    }
  }

  deleteGroup(groupId, event) {
    if (event) event.stopPropagation();
    if (confirm("Are you sure you want to delete this group? The scenes in the group will NOT be deleted, they will just be ungrouped.")) {
      // Find the group to extract its scene IDs
      const group = this.project.sceneGroups.find(g => g.id === groupId);
      if (group && group.sceneIds) {
        // Append all scene IDs to ungrouped scene IDs list
        this.project.ungroupedSceneIds = this.project.ungroupedSceneIds || [];
        group.sceneIds.forEach(sid => {
          if (!this.project.ungroupedSceneIds.includes(sid)) {
            this.project.ungroupedSceneIds.push(sid);
          }
        });
      }
      this.project.sceneGroups = this.project.sceneGroups.filter(g => g.id !== groupId);
      this.refreshScenesTree();
      this.populateSceneGroupSelect();
      this.saveProject(true);
    }
  }

  changeSceneGroup(sceneId, groupId) {
    this.project.sceneGroups = this.project.sceneGroups || [];
    this.project.ungroupedSceneIds = this.project.ungroupedSceneIds || [];

    // Remove from existing groups
    this.project.sceneGroups.forEach(g => {
      g.sceneIds = (g.sceneIds || []).filter(sid => sid !== sceneId);
    });

    // Remove from ungrouped list
    this.project.ungroupedSceneIds = this.project.ungroupedSceneIds.filter(sid => sid !== sceneId);

    if (groupId) {
      const group = this.project.sceneGroups.find(g => g.id === groupId);
      if (group) {
        group.sceneIds = group.sceneIds || [];
        if (!group.sceneIds.includes(sceneId)) {
          group.sceneIds.push(sceneId);
        }
      }
    } else {
      if (!this.project.ungroupedSceneIds.includes(sceneId)) {
        this.project.ungroupedSceneIds.push(sceneId);
      }
    }

    this.refreshScenesTree();
    this.saveProject();
  }

  moveGroup(groupId, direction) {
    this.project.sceneGroups = this.project.sceneGroups || [];
    const idx = this.project.sceneGroups.findIndex(g => g.id === groupId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx >= 0 && targetIdx < this.project.sceneGroups.length) {
      const temp = this.project.sceneGroups[idx];
      this.project.sceneGroups[idx] = this.project.sceneGroups[targetIdx];
      this.project.sceneGroups[targetIdx] = temp;
      this.refreshScenesTree();
      this.saveProject();
    }
  }

  moveScene(sceneId, direction) {
    this.project.sceneGroups = this.project.sceneGroups || [];
    this.project.ungroupedSceneIds = this.project.ungroupedSceneIds || [];

    const group = this.project.sceneGroups.find(g => (g.sceneIds || []).includes(sceneId));
    if (group) {
      const idx = group.sceneIds.indexOf(sceneId);
      const targetIdx = idx + direction;
      if (targetIdx >= 0 && targetIdx < group.sceneIds.length) {
        const temp = group.sceneIds[idx];
        group.sceneIds[idx] = group.sceneIds[targetIdx];
        group.sceneIds[targetIdx] = temp;
        this.refreshScenesTree();
        this.saveProject();
      }
    } else {
      const idx = this.project.ungroupedSceneIds.indexOf(sceneId);
      const targetIdx = idx + direction;
      if (targetIdx >= 0 && targetIdx < this.project.ungroupedSceneIds.length) {
        const temp = this.project.ungroupedSceneIds[idx];
        this.project.ungroupedSceneIds[idx] = this.project.ungroupedSceneIds[targetIdx];
        this.project.ungroupedSceneIds[targetIdx] = temp;
        this.refreshScenesTree();
        this.saveProject();
      }
    }
  }

  populateSceneGroupSelect() {
    const select = document.getElementById('scene-group-select');
    if (!select) return;
    const currentVal = select.value;

    while (select.options.length > 1) select.remove(1);

    this.project.sceneGroups = this.project.sceneGroups || [];
    this.project.sceneGroups.forEach(group => {
      const opt = document.createElement('option');
      opt.value = group.id;
      opt.innerText = group.name;
      select.appendChild(opt);
    });

    select.value = currentVal;
  }

  // Select scene to edit
  selectScene(sceneId) {
    this.activeSceneId = sceneId;
    this.activeStepIndex = null;
    
    // Highlight sidebar
    this.refreshScenesTree();

    const emptyMsg = document.getElementById('no-scene-selected');
    const editor = document.getElementById('active-scene-editor');
    
    if (!sceneId || !this.project.scenes[sceneId]) {
      emptyMsg.classList.remove('hidden');
      editor.classList.add('hidden');
      this.renderPreview(null);
      return;
    }

    emptyMsg.classList.add('hidden');
    editor.classList.remove('hidden');

    const scene = this.project.scenes[sceneId];
    const contextName = document.getElementById('scene-context-name');
    if (contextName) contextName.textContent = scene.name || scene.id;
    const settingsTitle = document.getElementById('scene-settings-modal-title');
    if (settingsTitle) settingsTitle.textContent = `${scene.name || scene.id} Settings`;

    // Load metadata inputs
    document.getElementById('scene-id-input').value = scene.id;
    document.getElementById('scene-name-input').value = scene.name || "";
    this.populateSceneGroupSelect();
    const groupSelect = document.getElementById('scene-group-select');
    if (groupSelect) {
      const group = (this.project.sceneGroups || []).find(g => (g.sceneIds || []).includes(sceneId));
      groupSelect.value = group ? group.id : "";
      groupSelect.onchange = (e) => {
        this.changeSceneGroup(sceneId, e.target.value);
      };
    }
    document.getElementById('scene-bg-select').value = scene.background || "";
    document.getElementById('scene-music-select').value = scene.music || "";

    const endingBox = document.getElementById('scene-is-ending');
    endingBox.checked = !!scene.isEnding;
    
    const transitionSelect = document.getElementById('scene-transition-style');
    if (transitionSelect) {
      transitionSelect.value = scene.sceneTransition || (scene.fadeOutScene ? 'fade' : 'off');
    }
    
    const noDimBox = document.getElementById('scene-no-dim-characters');
    if (noDimBox) {
      noDimBox.checked = !!scene.noDimCharacters;
    }
    
    const endingGroup = document.getElementById('ending-name-group');
    if (scene.isEnding) {
      endingGroup.classList.remove('hidden');
      document.getElementById('scene-ending-name').value = scene.endingName || "";
      const sfxSelect = document.getElementById('scene-ending-sfx');
      if (sfxSelect) {
        while (sfxSelect.options.length > 2) sfxSelect.remove(2);
        (this.project.assets.sound || []).forEach(asset => {
          const opt = document.createElement('option');
          opt.value = asset.id;
          opt.innerText = asset.name || asset.id;
          sfxSelect.appendChild(opt);
        });
        sfxSelect.value = scene.endingSfx || "";
      }
    } else {
      endingGroup.classList.add('hidden');
    }

    const modeSelect = document.getElementById('scene-mode-select');
    if (modeSelect) {
      if (!scene.isCutscene) {
        modeSelect.value = 'normal';
      } else if (scene.cutsceneType === 'text') {
        modeSelect.value = 'text';
      } else if (scene.cutsceneType === 'autotext') {
        modeSelect.value = 'autotext';
      } else if (scene.cutsceneType === 'image') {
        modeSelect.value = 'image';
      } else {
        modeSelect.value = 'video';
      }
    }
    const videoGroup = document.getElementById('scene-video-group');
    if (videoGroup) {
      if (scene.isCutscene && (!scene.cutsceneType || scene.cutsceneType === 'video')) {
        videoGroup.classList.remove('hidden');
        document.getElementById('scene-video-select').value = scene.video || "";
      } else {
        videoGroup.classList.add('hidden');
      }
    }

    const hideMenuGroup = document.getElementById('scene-hide-menu-group');
    if (hideMenuGroup) {
      if (scene.isCutscene && scene.cutsceneType === 'image') {
        hideMenuGroup.classList.remove('hidden');
        document.getElementById('scene-hide-quick-menu').checked = !!scene.hideQuickMenu;
      } else {
        hideMenuGroup.classList.add('hidden');
      }
    }

    const isTextCutscene = scene.isCutscene && (scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext');
    const isImageCutscene = scene.isCutscene && scene.cutsceneType === 'image';
    const speakerGroup = document.getElementById('inspector-speaker-group');
    const slotsGroup = document.getElementById('inspector-slots-group');
    if (speakerGroup) {
      if (isTextCutscene || isImageCutscene) speakerGroup.classList.add('hidden');
      else speakerGroup.classList.remove('hidden');
    }
    if (slotsGroup) {
      if (isTextCutscene || isImageCutscene) slotsGroup.classList.add('hidden');
      else slotsGroup.classList.remove('hidden');
    }

    const textColorGroup = document.getElementById('scene-text-color-group');
    if (textColorGroup) {
      if (isTextCutscene) {
        textColorGroup.classList.remove('hidden');
        document.getElementById('scene-text-color').value = scene.textColor || "#ffffff";
      } else {
        textColorGroup.classList.add('hidden');
      }
    }

    const fontGroup = document.getElementById('scene-font-group');
    if (fontGroup) {
      if (!scene.isCutscene || scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext') {
        fontGroup.classList.remove('hidden');
        const fontSelect = document.getElementById('scene-font-select');
        const fontVal = scene.fontFamily || "Arial, Helvetica, sans-serif";
        fontSelect.value = fontVal;
        fontSelect.style.fontFamily = fontVal;
      } else {
        fontGroup.classList.add('hidden');
      }
    }

    const slideDownGroup = document.getElementById('scene-slide-down-group');
    if (slideDownGroup) {
      if (scene.isCutscene && scene.cutsceneType === 'autotext') {
        slideDownGroup.classList.remove('hidden');
        document.getElementById('scene-slide-down').checked = !!scene.slideDownAnimation;
      } else {
        slideDownGroup.classList.add('hidden');
      }
    }

    const charTransitionGroup = document.getElementById('scene-char-transition-group');
    if (charTransitionGroup) {
      if (!scene.isCutscene) {
        charTransitionGroup.classList.remove('hidden');
        document.getElementById('scene-char-transition').value = scene.characterTransition || 'fade';
      } else {
        charTransitionGroup.classList.add('hidden');
      }
    }

    const imgAutoProgressGroup = document.getElementById('scene-image-autoprogress-group');
    const imgAutoProgressDurationGroup = document.getElementById('scene-image-autoprogress-duration-group');
    if (imgAutoProgressGroup && imgAutoProgressDurationGroup) {
      if (scene.isCutscene && scene.cutsceneType === 'image') {
        imgAutoProgressGroup.classList.remove('hidden');
        imgAutoProgressDurationGroup.classList.remove('hidden');
        
        document.getElementById('scene-image-autoprogress').checked = !!scene.autoProgressImage;
        document.getElementById('scene-image-autoprogress-duration').value = scene.autoProgressDuration !== undefined ? scene.autoProgressDuration : 3;
      } else {
        imgAutoProgressGroup.classList.add('hidden');
        imgAutoProgressDurationGroup.classList.add('hidden');
      }
    }

    // Load linear next scene select options
    const nextSelect = document.getElementById('scene-next-select');
    while (nextSelect.options.length > 1) nextSelect.remove(1);
    
    Object.keys(this.project.scenes).forEach(id => {
      if (id === sceneId) return; // Can't loop into itself
      const opt = document.createElement('option');
      opt.value = id;
      opt.innerText = this.project.scenes[id].name || id;
      nextSelect.appendChild(opt);
    });
    nextSelect.value = scene.nextSceneId || "";

    // Set branching options radio checked
    const isKinetic = this.project.config.kineticMode;
    const branchingControls = document.getElementById('branching-controls-container');
    const kineticOverride = document.getElementById('kinetic-override-msg');
    
    if (isKinetic) {
      branchingControls.classList.add('hidden');
      kineticOverride.classList.remove('hidden');
    } else {
      branchingControls.classList.remove('hidden');
      kineticOverride.classList.add('hidden');
 
      if (scene.choices && scene.choices.length > 0) {
        document.getElementById('branch-mode-choices').checked = true;
        document.getElementById('panel-branch-linear').classList.add('hidden');
        document.getElementById('panel-branch-choices').classList.remove('hidden');
      } else {
        document.getElementById('branch-mode-linear').checked = true;
        document.getElementById('panel-branch-linear').classList.remove('hidden');
        document.getElementById('panel-branch-choices').classList.add('hidden');
      }
    }

    this.renderTimeline();
    this.renderChoicesBuilder();
    this.renderConditionalBranches();

    // Select first dialogue card by default
    if ((!scene.isCutscene || scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext') && scene.dialogue && scene.dialogue.length > 0) {
      this.selectDialogueStep(0);
    } else {
      this.activeStepIndex = null;
      this.renderPreview(null);
      // Hide step inspector form
      document.getElementById('inspector-empty-msg').classList.remove('hidden');
      document.getElementById('inspector-form').classList.add('hidden');
    }
  }

  // Dialogue steps timelines
  renderTimeline() {
    const list = document.getElementById('dialogue-cards-list');
    list.innerHTML = "";

    const scene = this.project.scenes[this.activeSceneId];
    const addDlgBtn = document.getElementById('btn-add-dialogue-step');

    if (scene.isCutscene && (scene.cutsceneType === 'video' || !scene.cutsceneType || scene.cutsceneType === 'image')) {
      if (addDlgBtn) addDlgBtn.classList.add('hidden');
      
      const placeholder = document.createElement('div');
      placeholder.style.textAlign = "center";
      placeholder.style.padding = "40px 20px";
      placeholder.style.color = "var(--text-muted)";
      placeholder.className = "glass-panel";
      if (scene.cutsceneType === 'image') {
        placeholder.innerHTML = `
          <span style="font-size: 2rem; display:block; margin-bottom: 12px;">🖼️</span>
          <strong>Image Cutscene Mode Active</strong>
          <p style="font-size:0.85rem; margin-top:8px; color:var(--text-dark);">Standard dialogue flow, speaker, and character layouts are inactive for this scene. Shows a background image which is progressed by clicking or keyboard keys.</p>
        `;
      } else {
        placeholder.innerHTML = `
          <span style="font-size: 2rem; display:block; margin-bottom: 12px;">🎥</span>
          <strong>Video Cutscene Mode Active</strong>
          <p style="font-size:0.85rem; margin-top:8px; color:var(--text-dark);">Standard dialogue flow, backgrounds, and character layouts are inactive for this scene.</p>
        `;
      }
      list.appendChild(placeholder);
      
      document.getElementById('active-step-inspector').classList.add('hidden');
      return;
    } else {
      if (addDlgBtn) addDlgBtn.classList.remove('hidden');
      document.getElementById('active-step-inspector').classList.remove('hidden');
    }

    const dialogues = scene.dialogue || [];

    dialogues.forEach((step, index) => {
      const card = document.createElement('div');
      card.className = `dialogue-card-editor glass-panel ${this.activeStepIndex === index ? 'active' : ''}`;
      card.onclick = (e) => {
        // Don't deselect if clicking inside textarea or selects
        if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && !e.target.closest('.custom-select-wrapper') && !e.target.classList.contains('card-action-btn')) {
          this.selectDialogueStep(index);
        }
      };

      // Speaker Select html builder
      let speakerSelectOptions = `<option value="narrator">Narrator</option>`;
      (this.project.assets.characters || []).forEach(char => {
        const isSel = step.speaker === char.id ? "selected" : "";
        speakerSelectOptions += `<option value="${char.id}" ${isSel}>${char.name}</option>`;
      });

      let durationRowHtml = "";
      if (scene.cutsceneType === 'autotext') {
        durationRowHtml = `
          <div class="card-duration-row" style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-muted); margin-top: 8px;">
            <span>Display duration:</span>
            <input type="number" min="0.5" step="0.5" class="select-input" style="width: 70px; padding: 4px 8px; height: auto;" value="${step.duration || 3}" oninput="window.editor.updateStepDuration(${index}, parseFloat(this.value) || 3)">
            <span>seconds</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="card-header-row">
          <div class="card-index-speaker">
            <span class="card-index">#${index + 1}</span>
            <select class="select-input card-speaker-select" data-asset-type="speaker" onchange="window.editor.updateStepSpeaker(${index}, this.value)">
              ${speakerSelectOptions}
            </select>
          </div>
          <div class="card-actions">
            <button class="card-action-btn" onclick="window.editor.moveStep(${index}, -1)" title="Move Up">↑</button>
            <button class="card-action-btn" onclick="window.editor.moveStep(${index}, 1)" title="Move Down">↓</button>
            <button class="card-action-btn" onclick="window.editor.duplicateStep(${index})" title="Duplicate Card">＋</button>
            <button class="card-action-btn" onclick="window.editor.deleteStep(${index})" title="Delete Card" style="color:var(--danger)">×</button>
          </div>
        </div>
        <textarea class="textarea-input" rows="2" placeholder="Write dialogue / narration here..." oninput="window.editor.updateStepText(${index}, this.value)" style="font-family: ${scene.fontFamily || 'Arial, Helvetica, sans-serif'}; font-weight: ${step.bold ? 'bold' : 'normal'}; font-style: ${step.italic ? 'italic' : 'normal'}; text-decoration: ${step.underline ? 'underline' : 'none'}; font-size: ${scene.fontFamily && scene.fontFamily.includes('Caveat') ? '1.3rem' : '0.9rem'};">${step.text || ""}</textarea>
        ${durationRowHtml}
      `;

      list.appendChild(card);
    });
  }

  // Dialogue Step Card selection
  selectDialogueStep(index) {
    this.activeStepIndex = index;
    this.renderTimeline();

    const scene = this.project.scenes[this.activeSceneId];
    const step = scene.dialogue[index];

    // Show inspector
    document.getElementById('inspector-empty-msg').classList.add('hidden');
    document.getElementById('inspector-form').classList.remove('hidden');

    // Populate Speaker in Right panel inspector
    const speakerSelect = document.getElementById('step-speaker-select');
    
    // Clear all characters except Narrator
    while (speakerSelect.options.length > 1) speakerSelect.remove(1);
    
    (this.project.assets.characters || []).forEach(char => {
      const opt = document.createElement('option');
      opt.value = char.id;
      opt.innerText = char.name;
      speakerSelect.appendChild(opt);
    });
    speakerSelect.value = step.speaker || "narrator";

    // Update Voice Clip Select in Inspector
    const voiceSelect = document.getElementById('step-voice-select');
    if (voiceSelect) {
      voiceSelect.value = step.voice || "";
    }

    // Populate Slots dropdowns in Inspector (Left, Center, Right slots)
    const positions = ['left', 'center', 'right'];
    
    positions.forEach(pos => {
      const charSelect = document.getElementById(`slot-${pos}-char`);
      const exprSelect = document.getElementById(`slot-${pos}-expression`);

      // Clear selections except empty
      while (charSelect.options.length > 1) charSelect.remove(1);
      
      (this.project.assets.characters || []).forEach(char => {
        const opt = document.createElement('option');
        opt.value = char.id;
        opt.innerText = char.name;
        charSelect.appendChild(opt);
      });

      // Bind Slot changes
      const currentSlotData = step.layout ? step.layout[pos] : null;
      
      if (currentSlotData && currentSlotData.characterId) {
        charSelect.value = currentSlotData.characterId;
        exprSelect.classList.remove('hidden');
        this.populateExpressionsDropdown(pos, currentSlotData.characterId, currentSlotData.spriteId);
      } else {
        charSelect.value = "";
        exprSelect.classList.add('hidden');
      }

      charSelect.onchange = (e) => {
        const charId = e.target.value;
        this.updateStepSlot(pos, charId);
      };
      
      exprSelect.onchange = (e) => {
        const exprId = e.target.value;
        this.updateStepSlotExpression(pos, exprId);
      };
    });

    // Populate formatting checkboxes
    const boldChk = document.getElementById('step-bold-checkbox');
    const italicChk = document.getElementById('step-italic-checkbox');
    const underlineChk = document.getElementById('step-underline-checkbox');
    if (boldChk && italicChk && underlineChk) {
      boldChk.checked = !!step.bold;
      italicChk.checked = !!step.italic;
      underlineChk.checked = !!step.underline;
    }

    // Render Preview
    this.renderPreview(step);
    this.convertAllAssetSelects();
  }

  // Populate Sprite expression select list based on Character ID
  populateExpressionsDropdown(pos, charId, activeExprId) {
    const exprSelect = document.getElementById(`slot-${pos}-expression`);
    while (exprSelect.options.length > 1) exprSelect.remove(1);

    const char = this.project.assets.characters.find(c => c.id === charId);
    if (!char) return;

    (char.sprites || []).forEach(sprite => {
      const opt = document.createElement('option');
      opt.value = sprite.id;
      opt.innerText = sprite.name;
      exprSelect.appendChild(opt);
    });

    exprSelect.value = activeExprId || char.defaultExpression || (char.sprites[0] && char.sprites[0].id) || "";
    this.syncCustomPicker(exprSelect);
  }

  updateStepDuration(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.dialogue[index].duration = val;
    this.triggerAutoSave();
  }

  // Update actions inside Timeline Step
  updateStepSpeaker(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.dialogue[index].speaker = val;
    this.triggerAutoSave();
    
    if (this.activeStepIndex === index) {
      document.getElementById('step-speaker-select').value = val;
      this.renderPreview(scene.dialogue[index]);
    }
  }

  updateStepText(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.dialogue[index].text = val;
    this.triggerAutoSave();
    
    if (this.activeStepIndex === index) {
      this.renderPreview(scene.dialogue[index]);
    }
  }

  updateStepSlot(pos, characterId) {
    const scene = this.project.scenes[this.activeSceneId];
    const step = scene.dialogue[this.activeStepIndex];
    step.layout = step.layout || { left: null, center: null, right: null };

    const exprSelect = document.getElementById(`slot-${pos}-expression`);

    if (characterId) {
      const char = this.project.assets.characters.find(c => c.id === characterId);
      const defaultSpriteId = char ? (char.defaultExpression || (char.sprites && char.sprites.length > 0 ? char.sprites[0].id : "")) : "";
      
      step.layout[pos] = {
        characterId: characterId,
        spriteId: defaultSpriteId
      };
      
      exprSelect.classList.remove('hidden');
      this.populateExpressionsDropdown(pos, characterId, defaultSpriteId);
      this.syncCustomPicker(exprSelect);
    } else {
      step.layout[pos] = null;
      exprSelect.classList.add('hidden');
      this.syncCustomPicker(exprSelect);
    }

    this.triggerAutoSave();
    this.renderPreview(step);
  }

  updateStepSlotExpression(pos, spriteId) {
    const scene = this.project.scenes[this.activeSceneId];
    const step = scene.dialogue[this.activeStepIndex];
    
    if (step.layout && step.layout[pos]) {
      step.layout[pos].spriteId = spriteId;
      this.triggerAutoSave();
      this.renderPreview(step);
    }
  }

  // Timeline list manipulations
  addDialogueStep() {
    const scene = this.project.scenes[this.activeSceneId];
    scene.dialogue = scene.dialogue || [];
    
    // Copy slot structure from last step if exists to make editing user-friendly!
    let layoutCopy = { left: null, center: null, right: null };
    let speakerCopy = "narrator";
    if (scene.dialogue.length > 0) {
      const last = scene.dialogue[scene.dialogue.length - 1];
      if (last.layout) layoutCopy = JSON.parse(JSON.stringify(last.layout));
      speakerCopy = last.speaker || "narrator";
    }

    if (scene.isCutscene && (scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext')) {
      speakerCopy = "narrator";
      layoutCopy = { left: null, center: null, right: null };
    }

    const newStep = {
      text: "",
      layout: layoutCopy,
      speaker: speakerCopy
    };
    if (scene.isCutscene && scene.cutsceneType === 'autotext') {
      newStep.duration = 3;
    }

    scene.dialogue.push(newStep);

    this.renderTimeline();
    this.selectDialogueStep(scene.dialogue.length - 1);
    this.triggerAutoSave();
  }

  duplicateStep(index) {
    const scene = this.project.scenes[this.activeSceneId];
    const step = JSON.parse(JSON.stringify(scene.dialogue[index]));
    
    scene.dialogue.splice(index + 1, 0, step);
    this.renderTimeline();
    this.selectDialogueStep(index + 1);
    this.triggerAutoSave();
  }

  deleteStep(index) {
    const scene = this.project.scenes[this.activeSceneId];
    if (scene.dialogue.length <= 1) {
      alert("A scene must contain at least one dialogue step!");
      return;
    }

    scene.dialogue.splice(index, 0); // Typo protection, let's splice correctly:
    scene.dialogue.splice(index, 1);

    const nextIndex = Math.min(index, scene.dialogue.length - 1);
    this.selectDialogueStep(nextIndex);
    this.triggerAutoSave();
  }

  moveStep(index, dir) {
    const scene = this.project.scenes[this.activeSceneId];
    const target = index + dir;
    if (target < 0 || target >= scene.dialogue.length) return;

    // Swap elements
    const temp = scene.dialogue[index];
    scene.dialogue[index] = scene.dialogue[target];
    scene.dialogue[target] = temp;

    this.renderTimeline();
    this.selectDialogueStep(target);
    this.triggerAutoSave();
  }

  applyPreviewTheme(stageElem) {
    if (!stageElem) return false;
    const isLightTheme = this.project && this.project.config && this.project.config.theme === 'light';
    stageElem.classList.toggle('novel-theme-light', isLightTheme);
    stageElem.classList.toggle('novel-theme-dark', !isLightTheme);
    return isLightTheme;
  }

  applyPreviewBackground(bgElem, scene, isLightTheme) {
    if (!bgElem) return;
    bgElem.style.backgroundColor = 'transparent';
    if (scene && scene.background === '__solid_white__') {
      bgElem.style.backgroundImage = 'none';
      bgElem.style.backgroundColor = '#ffffff';
      return;
    }

    let bgSrc = '';
    if (scene && scene.background) {
      const asset = (this.project.assets.backgrounds || []).find(background => background.id === scene.background);
      if (asset) bgSrc = asset.path;
    }
    bgElem.style.backgroundImage = bgSrc
      ? `url('${bgSrc}')`
      : isLightTheme
        ? 'linear-gradient(135deg, #ffffff, #e8edf4)'
        : 'linear-gradient(135deg, #1e293b, #0f172a)';
  }

  // Stage Preview drawing
  renderPreview(step) {
    const bgElem = document.getElementById('mini-bg-preview');
    const speakerElem = document.getElementById('mini-speaker-preview');
    const textElem = document.getElementById('mini-text-preview');
    
    const slots = {
      left: document.getElementById('mini-sprite-left'),
      center: document.getElementById('mini-sprite-center'),
      right: document.getElementById('mini-sprite-right')
    };

    const scene = this.activeSceneId ? this.project.scenes[this.activeSceneId] : null;
    const stageElem = bgElem ? bgElem.closest('.mini-stage-mockup') : null;
    const isLightTheme = this.applyPreviewTheme(stageElem);
    if (textElem) {
      if (scene && scene.fontFamily && scene.fontFamily.includes('Caveat')) {
        textElem.classList.add('font-caveat');
      } else {
        textElem.classList.remove('font-caveat');
      }
    }
    if (scene && scene.isCutscene) {
      if (scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext') {
        this.applyPreviewBackground(bgElem, scene, isLightTheme);
        
        speakerElem.innerText = scene.cutsceneType === 'autotext' ? "⏳ Auto Text Cutscene" : "📜 Fullscreen Text";
        speakerElem.style.color = "var(--accent)";
        textElem.innerText = step ? (step.text || "...") : "No active dialogue selected.";
        textElem.style.color = scene.textColor || "#ffffff";
        textElem.style.fontFamily = scene.fontFamily || "Arial, Helvetica, sans-serif";
        if (step) {
          textElem.style.fontWeight = step.bold ? 'bold' : 'normal';
          textElem.style.fontStyle = step.italic ? 'italic' : 'normal';
          textElem.style.textDecoration = step.underline ? 'underline' : 'none';
        } else {
          textElem.style.fontWeight = 'normal';
          textElem.style.fontStyle = 'normal';
          textElem.style.textDecoration = 'none';
        }
        Object.values(slots).forEach(slot => {
          slot.querySelector('.mini-sprite-img').classList.add('hidden');
          slot.classList.remove('speaking-dimmed');
        });
        return;
      } else if (scene.cutsceneType === 'image') {
        this.applyPreviewBackground(bgElem, scene, isLightTheme);
        
        speakerElem.innerText = "🖼️ Image Cutscene";
        speakerElem.style.color = "var(--accent)";
        textElem.innerText = "Shows background image only. Click or press keys to progress.";
        textElem.style.color = "";
        Object.values(slots).forEach(slot => {
          slot.querySelector('.mini-sprite-img').classList.add('hidden');
          slot.classList.remove('speaking-dimmed');
        });
        return;
      } else {
        bgElem.style.backgroundImage = "none";
        speakerElem.innerText = "🎥 Video Cutscene";
        speakerElem.style.color = "var(--accent)";
        textElem.innerText = scene.video ? `Playing video: ${scene.video}` : "No video file selected.";
        textElem.style.color = "";
        Object.values(slots).forEach(slot => {
          slot.querySelector('.mini-sprite-img').classList.add('hidden');
          slot.classList.remove('speaking-dimmed');
        });
        return;
      }
    }

    textElem.style.color = "";
    textElem.style.fontFamily = "";
    textElem.style.fontWeight = "normal";
    textElem.style.fontStyle = "normal";
    textElem.style.textDecoration = "none";

    if (!this.activeSceneId || !step) {
      this.applyPreviewBackground(bgElem, scene, isLightTheme);
      speakerElem.innerText = "Narrator";
      textElem.innerText = "No active dialogue selected.";
      Object.values(slots).forEach(slot => {
        slot.querySelector('.mini-sprite-img').classList.add('hidden');
        slot.classList.remove('speaking-dimmed');
      });
      return;
    }

    // 1. Draw Background
    this.applyPreviewBackground(bgElem, scene, isLightTheme);

    // 2. Set Text & Speaker
    let speakerName = "Narrator";
    let speakerColor = "var(--primary)";

    if (step.speaker === 'narrator') {
      speakerElem.innerText = "Narrator";
      speakerElem.style.color = isLightTheme ? '#475569' : '#94a3b8';
    } else {
      const char = this.project.assets.characters.find(c => c.id === step.speaker);
      if (char) {
        speakerName = char.name;
        speakerColor = char.color || "var(--primary)";
      } else {
        speakerName = step.speaker;
      }
      speakerElem.innerText = speakerName;
      speakerElem.style.color = speakerColor;
    }
    textElem.innerText = step.text || "...";
    textElem.style.fontFamily = scene.fontFamily || "Arial, Helvetica, sans-serif";
    textElem.style.fontWeight = step.bold ? 'bold' : 'normal';
    textElem.style.fontStyle = step.italic ? 'italic' : 'normal';
    textElem.style.textDecoration = step.underline ? 'underline' : 'none';

    // 3. Render Slots
    const layout = step.layout || { left: null, center: null, right: null };
    Object.keys(slots).forEach(pos => {
      const slot = slots[pos];
      const img = slot.querySelector('.mini-sprite-img');
      const data = layout[pos];

      if (data && data.characterId) {
        // Resolve sprite
        let spritePath = "";
        let isNonVisual = false;
        let scale = 1;
        const char = this.project.assets.characters.find(c => c.id === data.characterId);
        if (char) {
          isNonVisual = !!char.nonvisual;
          scale = char.scale !== undefined ? char.scale : 1;
          if (char.sprites) {
            const spriteId = data.spriteId || char.defaultExpression || (char.sprites[0] && char.sprites[0].id);
            const sprite = char.sprites.find(s => s.id === spriteId);
            if (sprite) spritePath = sprite.path;
          }
        }

        if (spritePath && !isNonVisual) {
          img.src = spritePath;
          img.classList.remove('hidden');
          img.style.transform = `scale(${scale})`;
          img.style.transformOrigin = 'bottom center';

          const scene = this.project.scenes[this.activeSceneId];
          const noDim = scene && scene.noDimCharacters;
          if (noDim || data.characterId === step.speaker) {
            slot.classList.remove('speaking-dimmed');
          } else {
            slot.classList.add('speaking-dimmed');
          }
        } else {
          img.classList.add('hidden');
          img.style.transform = '';
          slot.classList.remove('speaking-dimmed');
        }
      } else {
        img.classList.add('hidden');
        img.style.transform = '';
        slot.classList.remove('speaking-dimmed');
      }
    });
  }

  getVariableDefinitions() {
    const logic = window.VNFairyCore && window.VNFairyCore.logicModel;
    if (!logic) return [];
    this.project.config = this.project.config || {};
    this.project.config.variables = logic.normalizeVariableDefinitions(this.project.config);
    return this.project.config.variables;
  }

  ensureAssetLibrary() {
    this.project.assets = this.project.assets || {};
    this.project.assets.library = this.project.assets.library || { folders: [], items: {} };
    this.project.assets.library.folders = Array.isArray(this.project.assets.library.folders) ? this.project.assets.library.folders : [];
    this.project.assets.library.items = this.project.assets.library.items && typeof this.project.assets.library.items === 'object' ? this.project.assets.library.items : {};
    return this.project.assets.library;
  }

  getAssetFilenames(type) {
    return (this.assets[type] || []).map(item => typeof item === 'string' ? item : item.filename).filter(Boolean);
  }

  getAssetMeta(type, filename) {
    const metadata = this.assetMetadata[type] && this.assetMetadata[type][filename];
    if (metadata) return metadata;
    const project = this.project || {};
    return {
      filename,
      type,
      size: 0,
      usageCount: window.VNFairyCore && window.VNFairyCore.assetRegistry
        ? window.VNFairyCore.assetRegistry.findUsages(project, type, filename).length : 0,
      usages: window.VNFairyCore && window.VNFairyCore.assetRegistry
        ? window.VNFairyCore.assetRegistry.findUsages(project, type, filename) : []
    };
  }

  getAssetLibraryMeta(type, filename) {
    const library = this.ensureAssetLibrary();
    const key = window.VNFairyCore && window.VNFairyCore.assetRegistry
      ? window.VNFairyCore.assetRegistry.assetKey(type, filename) : `${type}:${filename}`;
    const current = library.items[key] || {};
    current.tags = Array.isArray(current.tags) ? current.tags : [];
    current.favorite = !!current.favorite;
    current.folderId = current.folderId || '';
    library.items[key] = current;
    return current;
  }

  getAssetRecords(type) {
    const records = this.getAssetFilenames(type).map(filename => ({
      filename,
      metadata: this.getAssetMeta(type, filename),
      library: this.getAssetLibraryMeta(type, filename)
    }));
    const sort = document.getElementById('asset-manager-sort')?.value || 'name';
    records.sort((a, b) => {
      if (sort === 'size') return (b.metadata.size || 0) - (a.metadata.size || 0);
      if (sort === 'usage') return (b.metadata.usageCount || 0) - (a.metadata.usageCount || 0);
      if (sort === 'type') return String(a.metadata.detectedType || '').localeCompare(String(b.metadata.detectedType || '')) || a.filename.localeCompare(b.filename);
      if (sort === 'recent') return String(b.metadata.modifiedAt || '').localeCompare(String(a.metadata.modifiedAt || ''));
      return a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' });
    });
    return records;
  }

  assetMatches(type, record, localQuery = '') {
    const globalQuery = (document.getElementById('asset-manager-search')?.value || '').toLowerCase().trim();
    const tagQuery = (document.getElementById('asset-manager-tag-filter')?.value || '').toLowerCase().trim();
    const folderId = document.getElementById('asset-manager-folder-filter')?.value || '';
    const favoritesOnly = !!document.getElementById('asset-manager-favorites-only')?.checked;
    const library = record.library;
    const haystack = [record.filename, type, record.metadata.detectedType, ...(library.tags || [])].join(' ').toLowerCase();
    if (globalQuery && !haystack.includes(globalQuery)) return false;
    if (localQuery && !haystack.includes(localQuery)) return false;
    if (tagQuery && !(library.tags || []).some(tag => String(tag).toLowerCase().includes(tagQuery))) return false;
    if (folderId && library.folderId !== folderId) return false;
    if (favoritesOnly && !library.favorite) return false;
    return true;
  }

  formatAssetBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  assetUrl(type, filename) {
    return `data/projects/${encodeURIComponent(this.projectId || 'demo')}/assets/${type}/${encodeURIComponent(filename)}`;
  }

  refreshAssetFolderFilter() {
    const select = document.getElementById('asset-manager-folder-filter');
    const folders = this.ensureAssetLibrary().folders;
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="">All folders</option>';
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        select.appendChild(option);
      });
      select.value = folders.some(folder => folder.id === current) ? current : '';
    }
    const bulkFolder = document.getElementById('asset-bulk-folder');
    if (bulkFolder) {
      const current = bulkFolder.value;
      bulkFolder.innerHTML = '<option value="">Move to folder…</option><option value="__none__">No folder</option>';
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        bulkFolder.appendChild(option);
      });
      bulkFolder.value = folders.some(folder => folder.id === current) || current === '__none__' ? current : '';
    }
  }

  setAssetSelected(assetKey, selected) {
    if (selected) this.selectedAssetKeys.add(assetKey);
    else this.selectedAssetKeys.delete(assetKey);
    this.updateAssetSelectionUI();
  }

  updateAssetSelectionUI() {
    const count = this.selectedAssetKeys.size;
    const label = document.getElementById('asset-selection-count');
    if (label) label.textContent = `${count} selected`;
    document.querySelectorAll('[data-asset-key]').forEach(element => {
      const checked = this.selectedAssetKeys.has(element.dataset.assetKey);
      element.classList.toggle('is-selected', checked);
      const checkbox = element.querySelector('.asset-select-control input');
      if (checkbox) checkbox.checked = checked;
    });
  }

  selectVisibleAssets() {
    document.querySelectorAll('.management-panel:not(.hidden) [data-asset-key]').forEach(element => this.selectedAssetKeys.add(element.dataset.assetKey));
    this.updateAssetSelectionUI();
  }

  clearAssetSelection() {
    this.selectedAssetKeys.clear();
    this.updateAssetSelectionUI();
  }

  applyBulkAssetFolder() {
    const value = document.getElementById('asset-bulk-folder')?.value;
    if (!value || !this.selectedAssetKeys.size) return;
    this.selectedAssetKeys.forEach(key => {
      const splitAt = key.indexOf(':');
      const meta = this.getAssetLibraryMeta(key.slice(0, splitAt), key.slice(splitAt + 1));
      meta.folderId = value === '__none__' ? '' : value;
    });
    this.renderAssetsTab();
    this.triggerAutoSave();
    this.showToast(`Updated ${this.selectedAssetKeys.size} assets`);
  }

  applyBulkAssetTags() {
    const input = document.getElementById('asset-bulk-tags');
    const tags = String(input?.value || '').split(',').map(tag => tag.trim()).filter(Boolean);
    if (!tags.length || !this.selectedAssetKeys.size) return;
    this.selectedAssetKeys.forEach(key => {
      const splitAt = key.indexOf(':');
      const meta = this.getAssetLibraryMeta(key.slice(0, splitAt), key.slice(splitAt + 1));
      meta.tags = [...new Set([...(meta.tags || []), ...tags])].slice(0, 30);
    });
    if (input) input.value = '';
    this.renderAssetsTab();
    this.triggerAutoSave();
    this.showToast(`Tagged ${this.selectedAssetKeys.size} assets`);
  }

  attachAssetControls(container, type, record) {
    const actions = container.querySelector('.asset-library-actions');
    const favorite = actions.querySelector('[data-asset-action="favorite"]');
    const usage = actions.querySelector('[data-asset-action="usage"]');
    const replace = actions.querySelector('[data-asset-action="replace"]');
    const remove = actions.querySelector('[data-asset-action="delete"]');
    favorite.onclick = () => this.updateAssetMetadata(type, record.filename, 'favorite', !record.library.favorite);
    usage.onclick = () => this.showAssetUsage(type, record.filename);
    replace.onclick = () => this.replaceAssetEverywhere(type, record.filename);
    if (remove) remove.onclick = event => this.deleteAsset(type, record.filename, event);
    const folder = container.querySelector('.asset-folder-select');
    if (folder) folder.onchange = event => this.updateAssetMetadata(type, record.filename, 'folderId', event.target.value);
    const tags = container.querySelector('.asset-tags-input');
    if (tags) tags.onchange = event => this.updateAssetMetadata(type, record.filename, 'tags', event.target.value);
  }

  renderAssetControls(type, record) {
    const folders = this.ensureAssetLibrary().folders;
    const folderOptions = `<option value="">No folder</option>${folders.map(folder => `<option value="${this.escapeHtml(folder.id)}" ${folder.id === record.library.folderId ? 'selected' : ''}>${this.escapeHtml(folder.name)}</option>`).join('')}`;
    return `<div class="asset-library-actions"><button type="button" data-asset-action="favorite" class="asset-favorite-btn" title="${record.library.favorite ? 'Remove from favourites' : 'Add to favourites'}">${record.library.favorite ? '★' : '☆'}</button><button type="button" data-asset-action="usage" class="scene-action-btn">Uses ${record.metadata.usageCount || 0}</button><button type="button" data-asset-action="replace" class="scene-action-btn">Replace everywhere</button><button type="button" data-asset-action="delete" class="scene-action-btn btn-danger-text" title="Delete asset">Delete</button></div><div class="asset-library-meta"><select class="asset-folder-select" aria-label="Asset folder">${folderOptions}</select><input type="text" class="input-text asset-tags-input" value="${this.escapeHtml((record.library.tags || []).join(', '))}" placeholder="tags" aria-label="Asset tags"></div>`;
  }

  renderImageAssetCard(type, record) {
    const card = document.createElement('div');
    card.className = `asset-card asset-library-card is-previewable${record.metadata.usageCount ? '' : ' is-unused'}`;
    const assetKey = `${type}:${record.filename}`;
    const assetPath = this.assetUrl(type, record.filename);
    card.dataset.assetKey = assetKey;
    card.innerHTML = `<label class="asset-select-control" title="Select asset"><input type="checkbox" aria-label="Select ${this.escapeHtml(record.filename)}" ${this.selectedAssetKeys.has(assetKey) ? 'checked' : ''}><span></span></label><img class="asset-thumbnail" loading="lazy" src="${this.escapeHtml(assetPath)}" alt="${this.escapeHtml(record.filename)}"><div class="asset-card-details"><span title="${this.escapeHtml(record.metadata.detectedType || 'Unknown type')}">${this.escapeHtml(record.filename)}</span><span class="muted">${this.formatAssetBytes(record.metadata.size)} · ${record.metadata.usageCount || 0} use${record.metadata.usageCount === 1 ? '' : 's'}</span></div>${this.renderAssetControls(type, record)}`;
    card.querySelector('.asset-select-control input').onchange = event => this.setAssetSelected(assetKey, event.target.checked);
    card.onclick = event => {
      if (event.target.closest('button, input, select, label, .asset-library-actions, .asset-library-meta')) return;
      this.previewImageAsset(assetPath, record.filename);
    };
    const image = card.querySelector('.asset-thumbnail');
    if (image) image.onload = () => this.generateImageThumbnail(image);
    this.attachAssetControls(card, type, record);
    return card;
  }

  previewImageAsset(path, label = 'Asset preview') {
    if (!path) return;
    const existing = document.getElementById('asset-image-preview-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'asset-image-preview-overlay';
    overlay.className = 'asset-image-preview-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `${label} preview`);

    const dialog = document.createElement('div');
    dialog.className = 'asset-image-preview-dialog';
    const image = document.createElement('img');
    image.className = 'asset-image-preview-image';
    image.src = path;
    image.alt = label;
    image.decoding = 'async';
    const caption = document.createElement('div');
    caption.className = 'asset-image-preview-caption';
    caption.textContent = label;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'asset-image-preview-close';
    closeButton.setAttribute('aria-label', 'Close image preview');
    closeButton.textContent = '×';
    dialog.append(image, caption, closeButton);
    overlay.appendChild(dialog);

    const closePreview = () => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') closePreview();
    };
    closeButton.onclick = closePreview;
    overlay.onclick = event => {
      if (event.target === overlay) closePreview();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
  }

  renderVideoAssetCard(record) {
    const card = document.createElement('div');
    card.className = `asset-card asset-library-card asset-video-card${record.metadata.usageCount ? '' : ' is-unused'}`;
    const assetKey = `video:${record.filename}`;
    const videoPath = this.assetUrl('video', record.filename);
    card.dataset.assetKey = assetKey;
    card.innerHTML = `<label class="asset-select-control" title="Select asset"><input type="checkbox" aria-label="Select ${this.escapeHtml(record.filename)}" ${this.selectedAssetKeys.has(assetKey) ? 'checked' : ''}><span></span></label><div class="asset-video-thumbnail-wrap"><video class="asset-video-thumbnail" muted playsinline preload="metadata" src="${this.escapeHtml(videoPath)}" aria-label="Preview of ${this.escapeHtml(record.filename)}"></video><span class="asset-video-placeholder" aria-hidden="true">▶</span></div><div class="asset-card-details"><span title="${this.escapeHtml(record.metadata.detectedType || 'Video')}">${this.escapeHtml(record.filename)}</span><span class="muted">${this.formatAssetBytes(record.metadata.size)} · ${record.metadata.usageCount || 0} use${record.metadata.usageCount === 1 ? '' : 's'}</span></div><div class="asset-video-actions"><button type="button" class="voice-btn-preview" data-asset-action="preview">▶ Preview</button></div>${this.renderAssetControls('video', record)}`;
    card.querySelector('.asset-select-control input').onchange = event => this.setAssetSelected(assetKey, event.target.checked);
    const video = card.querySelector('.asset-video-thumbnail');
    if (video) {
      video.onloadeddata = () => {
        video.currentTime = 0;
        card.classList.add('has-video-frame');
      };
      video.onerror = () => card.classList.add('video-load-failed');
    }
    const previewButton = card.querySelector('[data-asset-action="preview"]');
    if (previewButton) previewButton.onclick = () => this.previewUniversalVideo(record.filename, previewButton);
    this.attachAssetControls(card, 'video', record);
    return card;
  }

  generateImageThumbnail(image) {
    if (!image || image.dataset.thumbnailGenerated === 'true' || !image.naturalWidth) return;
    const canvas = document.createElement('canvas');
    const maxWidth = 320;
    const maxHeight = 160;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    try {
      image.src = canvas.toDataURL('image/webp', 0.78);
      image.dataset.thumbnailGenerated = 'true';
    } catch (error) {
      // Keep the source image when the browser refuses a canvas export.
    }
  }

  renderAudioAssetItem(type, record) {
    const item = document.createElement('div');
    item.className = `audio-asset-item asset-library-audio${record.metadata.usageCount ? '' : ' is-unused'}`;
    const assetKey = `${type}:${record.filename}`;
    item.dataset.assetKey = assetKey;
    const previewButton = type === 'music' || type === 'sound' ? '<button type="button" data-asset-action="preview" class="voice-btn-preview">▶ Preview</button>' : '';
    item.innerHTML = `<label class="asset-select-control asset-select-inline" title="Select asset"><input type="checkbox" aria-label="Select ${this.escapeHtml(record.filename)}" ${this.selectedAssetKeys.has(assetKey) ? 'checked' : ''}><span></span></label><div class="audio-asset-copy"><span class="asset-name"><span class="asset-type-badge">${type === 'music' ? 'Music' : type === 'sound' ? 'Voice' : 'Video'}</span>${this.escapeHtml(record.filename)}</span><span class="muted audio-asset-detail">${this.formatAssetBytes(record.metadata.size)} · ${record.metadata.usageCount || 0} use${record.metadata.usageCount === 1 ? '' : 's'}</span></div><div class="audio-asset-actions">${previewButton}<button type="button" data-asset-action="favorite" class="asset-favorite-btn" title="${record.library.favorite ? 'Remove from favourites' : 'Add to favourites'}">${record.library.favorite ? '★' : '☆'}</button><button type="button" data-asset-action="usage" class="scene-action-btn">Uses</button><button type="button" data-asset-action="replace" class="scene-action-btn">Replace everywhere</button><button type="button" data-asset-action="delete" class="scene-action-btn btn-danger-text">Delete</button></div>${this.renderAssetControls(type, record)}`;
    item.querySelector('.asset-select-control input').onchange = event => this.setAssetSelected(assetKey, event.target.checked);
    item.querySelector('.asset-library-actions').classList.add('hidden');
    this.attachAssetControls(item, type, record);
    item.querySelector('[data-asset-action="favorite"]').onclick = () => this.updateAssetMetadata(type, record.filename, 'favorite', !record.library.favorite);
    item.querySelector('[data-asset-action="usage"]').onclick = () => this.showAssetUsage(type, record.filename);
    item.querySelector('[data-asset-action="replace"]').onclick = () => this.replaceAssetEverywhere(type, record.filename);
    item.querySelector('[data-asset-action="delete"]').onclick = event => this.deleteAsset(type, record.filename, event);
    const preview = item.querySelector('[data-asset-action="preview"]');
    if (preview) preview.onclick = () => this.previewUniversalAsset(type, record.filename, preview);
    if (type !== 'video') this.prepareAudioMetadata(item, type, record.filename);
    return item;
  }

  prepareAudioMetadata(item, type, filename) {
    const detail = item.querySelector('.audio-asset-detail');
    if (!detail) return;
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = this.assetUrl(type, filename);
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (duration) detail.textContent = `${this.formatAssetBytes(this.getAssetMeta(type, filename).size)} · ${this.formatDuration(duration)} · ${this.getAssetMeta(type, filename).usageCount || 0} use${this.getAssetMeta(type, filename).usageCount === 1 ? '' : 's'}`;
    };
  }

  formatDuration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  renderAssetFileList(type, list, localQuery, renderer) {
    if (!list) return;
    list.innerHTML = '';
    this.getAssetRecords(type).filter(record => this.assetMatches(type, record, localQuery)).forEach(record => list.appendChild(renderer(record)));
    if (!list.children.length) list.innerHTML = '<div class="muted asset-empty-state">No matching assets.</div>';
  }

  updateAssetMetadata(type, filename, field, value) {
    const meta = this.getAssetLibraryMeta(type, filename);
    if (field === 'tags') meta.tags = String(value || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 30);
    else if (field === 'favorite') meta.favorite = !!value;
    else if (field === 'folderId') meta.folderId = String(value || '');
    this.renderAssetsTab();
    this.triggerAutoSave();
  }

  createAssetFolder() {
    const name = prompt('Folder name');
    if (name === null || !name.trim()) return;
    const library = this.ensureAssetLibrary();
    const baseId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `folder-${Date.now()}`;
    let id = baseId;
    let suffix = 2;
    while (library.folders.some(folder => folder.id === id)) id = `${baseId}-${suffix++}`;
    library.folders.push({ id, name: name.trim().slice(0, 80) });
    this.refreshAssetFolderFilter();
    this.renderAssetsTab();
    this.triggerAutoSave();
  }

  showAssetUsage(type, filename) {
    const metadata = this.getAssetMeta(type, filename);
    const usages = metadata.usages || [];
    let modal = document.getElementById('asset-usage-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'asset-usage-modal';
      modal.className = 'modal hidden';
      modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content glass-panel animate-scale asset-usage-modal-content"><div class="modal-header"><h2 id="asset-usage-title">Asset usage</h2><button type="button" class="modal-close">&times;</button></div><div class="modal-body"><div id="asset-usage-list"></div></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('.modal-backdrop').onclick = () => modal.classList.add('hidden');
      modal.querySelector('.modal-close').onclick = () => modal.classList.add('hidden');
    }
    modal.querySelector('#asset-usage-title').textContent = `${filename} · ${usages.length} use${usages.length === 1 ? '' : 's'}`;
    const list = modal.querySelector('#asset-usage-list');
    list.innerHTML = usages.length
      ? usages.map(usage => `<div class="asset-usage-row"><strong>${this.escapeHtml(usage.location || 'Project')}</strong><span class="muted">${this.escapeHtml(usage.value || '')}</span></div>`).join('')
      : '<div class="muted">This asset is not referenced by any scene, character, setting, or unlockable.</div>';
    modal.classList.remove('hidden');
  }

  assetIdFromFilename(filename) {
    const registry = window.VNFairyCore && window.VNFairyCore.assetRegistry;
    return registry ? registry.assetIdFromFilename(filename) : String(filename || '').replace(/\.[^/.]+$/, '');
  }

  openAssetReplacementModal(type, filename) {
    const candidates = this.getAssetFilenames(type).filter(candidate => candidate !== filename);
    if (!candidates.length) return;

    const pickerType = type === 'char' ? 'char-sprite-file' : type;
    const select = document.createElement('select');
    select.setAttribute('data-asset-type', pickerType);
    candidates.forEach(candidate => {
      const option = document.createElement('option');
      option.value = pickerType === 'char-sprite-file' ? candidate : this.assetIdFromFilename(candidate);
      option.textContent = candidate;
      select.appendChild(option);
    });

    this.activeAssetReplacement = { type, filename, pickerType };
    this.activeUniversalSelect = select;
    this.presentUniversalSelectModal(pickerType, `Replace “${filename}”`, false);
  }

  replaceAssetEverywhere(type, filename) {
    const candidates = this.getAssetFilenames(type).filter(candidate => candidate !== filename);
    if (!candidates.length) {
      this.showToast('Upload another asset in this category before replacing references.');
      return;
    }
    this.openAssetReplacementModal(type, filename);
  }

  replaceAssetReferences(type, filename, target) {
    if (!target || target === filename || !this.getAssetFilenames(type).includes(target)) return;
    const registry = window.VNFairyCore && window.VNFairyCore.assetRegistry;
    const oldPath = registry ? registry.assetPath(this.project.id, type, filename) : `data/projects/${this.project.id}/assets/${type}/${filename}`;
    const newPath = registry ? registry.assetPath(this.project.id, type, target) : `data/projects/${this.project.id}/assets/${type}/${target}`;
    const oldId = registry ? registry.assetIdFromFilename(filename) : filename.replace(/\.[^/.]+$/, '');
    const newId = registry ? registry.assetIdFromFilename(target) : target.replace(/\.[^/.]+$/, '');
    const idKeys = {
      bg: new Set(['background']), music: new Set(['music']), sound: new Set(['voice', 'endingSfx', 'uiClickSound']), video: new Set(['video']), char: new Set()
    }[type];
    let replacements = 0;
    const replaceValue = (value, key, ancestors) => {
      if (typeof value !== 'string') return value;
      if (value === oldPath || value.endsWith(`/assets/${type}/${filename}`)) { replacements += 1; return newPath; }
      if (idKeys && idKeys.has(key) && value === oldId) { replacements += 1; return newId; }
      if (key === 'path' && value === oldPath) { replacements += 1; return newPath; }
      return value;
    };
    const walk = (value, key = '', ancestors = []) => {
      if (Array.isArray(value)) return value.map((item, index) => walk(item, String(index), ancestors.concat(String(index))));
      if (!value || typeof value !== 'object') return replaceValue(value, key, ancestors);
      Object.keys(value).forEach(childKey => { value[childKey] = walk(value[childKey], childKey, ancestors.concat(key)); });
      return value;
    };
    walk(this.project);
    if (replacements) {
      this.populateAssetDropdowns();
      this.renderAssetsTab();
      this.triggerAutoSave();
      this.showToast(`Replaced ${replacements} reference${replacements === 1 ? '' : 's'} everywhere`);
    } else {
      this.showToast('No matching references found.');
    }
  }

  getVariableDefinition(name) {
    return this.getVariableDefinitions().find(definition => definition.name === name) || null;
  }

  variableOptionsHtml(selected = '', emptyLabel = '-- Select Variable --') {
    let html = `<option value="">${emptyLabel}</option>`;
    this.getVariableDefinitions().forEach(definition => {
      html += `<option value="${this.escapeHtml(definition.name)}" ${definition.name === selected ? 'selected' : ''}>${this.escapeHtml(definition.name)} (${definition.type})</option>`;
    });
    return html;
  }

  getChoiceActions(choice) {
    if (Array.isArray(choice.actions)) return choice.actions;
    if (choice.customVarName) {
      return [{
        type: choice.customVarOp === 'increase' ? 'increment' : choice.customVarOp === 'decrease' ? 'decrement' : 'set',
        variable: choice.customVarName,
        value: choice.customVarValue !== undefined ? choice.customVarValue : 1
      }];
    }
    return [];
  }

  actionOperators(definition) {
    if (!definition) return ['set'];
    if (definition.type === 'boolean') return ['set', 'toggle'];
    if (definition.type === 'text') return ['set'];
    return ['set', 'increment', 'decrement'];
  }

  actionValueEditor(action, definition, choiceIndex, actionIndex) {
    if (!definition || action.type === 'toggle') return '';
    const onInput = `oninput="window.editor.updateChoiceAction(${choiceIndex}, ${actionIndex}, 'value', this.value)"`;
    if (definition.type === 'boolean') {
      return `<select class="select-input branching-value branching-value-boolean" onchange="window.editor.updateChoiceAction(${choiceIndex}, ${actionIndex}, 'value', this.value)"><option value="true" ${action.value === true || action.value === 'true' ? 'selected' : ''}>True</option><option value="false" ${action.value === false || action.value === 'false' ? 'selected' : ''}>False</option></select>`;
    }
    if (definition.type === 'inventory') {
      return `<input type="text" class="input-text branching-value branching-item-name" placeholder="Item name" value="${this.escapeHtml(action.item || '')}" oninput="window.editor.updateChoiceAction(${choiceIndex}, ${actionIndex}, 'item', this.value)"><input type="number" min="0" step="1" class="input-text branching-value branching-count" placeholder="Count" value="${this.escapeHtml(action.value === undefined ? 1 : action.value)}" ${onInput}>`;
    }
    const inputType = definition.type === 'number' ? 'number' : 'text';
    const max = definition.type === 'text' ? `maxlength="${window.VNFairyCore.logicModel.MAX_TEXT_LENGTH}"` : '';
    return `<input type="${inputType}" class="input-text branching-value" placeholder="Value" value="${this.escapeHtml(action.value === undefined ? (definition.type === 'number' ? 1 : '') : action.value)}" ${max} ${onInput}>`;
  }

  renderChoiceAction(choiceIndex, actionIndex, action) {
    const definition = this.getVariableDefinition(action.variable);
    const operators = this.actionOperators(definition);
    let operatorOptions = '';
    operators.forEach(operator => {
      const labels = { set: 'Set to', increment: 'Increment by', decrement: 'Decrement by', toggle: 'Toggle' };
      operatorOptions += `<option value="${operator}" ${action.type === operator ? 'selected' : ''}>${labels[operator]}</option>`;
    });
    return `<div class="branching-rule-row"><select class="select-input branching-variable" aria-label="Action variable" onchange="window.editor.updateChoiceAction(${choiceIndex}, ${actionIndex}, 'variable', this.value)">${this.variableOptionsHtml(action.variable, '-- Select Variable --')}</select><select class="select-input branching-operator" aria-label="Action" onchange="window.editor.updateChoiceAction(${choiceIndex}, ${actionIndex}, 'type', this.value)">${operatorOptions}</select>${this.actionValueEditor(action, definition, choiceIndex, actionIndex)}<button class="btn-danger branching-delete-rule" aria-label="Delete action" onclick="window.editor.deleteChoiceAction(${choiceIndex}, ${actionIndex})">&times;</button></div>`;
  }

  renderChoiceCondition(choiceIndex, conditionIndex, condition) {
    const definition = this.getVariableDefinition(condition.variable) || { type: 'number' };
    const logic = window.VNFairyCore && window.VNFairyCore.logicModel;
    const operators = logic ? logic.operatorForType(definition.type) : ['==', '!=', '>', '<', '>=', '<='];
    const operatorOptions = operators.map(operator => `<option value="${operator}" ${condition.operator === operator ? 'selected' : ''}>${operator.replace('_', ' ')}</option>`).join('');
    let valueEditor;
    if (definition.type === 'boolean') {
      valueEditor = `<select class="select-input branching-value branching-value-boolean" onchange="window.editor.updateChoiceCondition(${choiceIndex}, ${conditionIndex}, 'value', this.value)"><option value="true" ${condition.value === true || condition.value === 'true' ? 'selected' : ''}>True</option><option value="false" ${condition.value === false || condition.value === 'false' ? 'selected' : ''}>False</option></select>`;
    } else if (definition.type === 'inventory') {
      valueEditor = `<input type="text" class="input-text branching-value branching-item-name" placeholder="Item" value="${this.escapeHtml(condition.item || '')}" oninput="window.editor.updateChoiceCondition(${choiceIndex}, ${conditionIndex}, 'item', this.value)"><input type="number" min="0" step="1" class="input-text branching-value branching-count" placeholder="Count" value="${this.escapeHtml(condition.value === undefined ? 1 : condition.value)}" oninput="window.editor.updateChoiceCondition(${choiceIndex}, ${conditionIndex}, 'value', this.value)">`;
    } else {
      const inputType = definition.type === 'number' ? 'number' : 'text';
      const max = definition.type === 'text' ? `maxlength="${window.VNFairyCore.logicModel.MAX_TEXT_LENGTH}"` : '';
      valueEditor = `<input type="${inputType}" class="input-text branching-value" placeholder="Value" value="${this.escapeHtml(condition.value === undefined ? 0 : condition.value)}" ${max} oninput="window.editor.updateChoiceCondition(${choiceIndex}, ${conditionIndex}, 'value', this.value)">`;
    }
    return `<div class="branching-rule-row"><select class="select-input branching-variable" aria-label="Requirement variable" onchange="window.editor.updateChoiceCondition(${choiceIndex}, ${conditionIndex}, 'variable', this.value)">${this.variableOptionsHtml(condition.variable)}</select><select class="select-input branching-operator" aria-label="Comparison" onchange="window.editor.updateChoiceCondition(${choiceIndex}, ${conditionIndex}, 'operator', this.value)">${operatorOptions}</select>${valueEditor}<button class="btn-danger branching-delete-rule" aria-label="Delete requirement" onclick="window.editor.deleteChoiceCondition(${choiceIndex}, ${conditionIndex})">&times;</button></div>`;
  }

  // Option Choices build
  renderChoicesBuilder() {
    const list = document.getElementById('choices-builder-list');
    if (!list) return;
    list.innerHTML = "";
    const scene = this.project.scenes[this.activeSceneId];
    const choices = scene.choices || [];

    choices.forEach((choice, index) => {
      const card = document.createElement('div');
      card.className = "choice-builder-card";
      let targetOptions = `<option value="">Select Destination Scene...</option>`;
      Object.keys(this.project.scenes).forEach(id => {
        targetOptions += `<option value="${this.escapeHtml(id)}" ${choice.target === id ? 'selected' : ''}>${this.escapeHtml(this.project.scenes[id].name || id)}</option>`;
      });
      const actions = this.getChoiceActions(choice);
      const actionHtml = actions.length
        ? actions.map((action, actionIndex) => this.renderChoiceAction(index, actionIndex, action)).join('')
        : `<div class="branching-empty-rule">No actions. This choice will only route to its destination.</div>`;
      const conditions = Array.isArray(choice.conditions) ? choice.conditions : [];
      const conditionHtml = conditions.length
        ? conditions.map((condition, conditionIndex) => this.renderChoiceCondition(index, conditionIndex, condition)).join('')
        : `<div class="branching-empty-rule">No requirements. This choice is always available.</div>`;
      const autoTrackName = choice.text ? choice.text.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') : 'OptionName';
      card.innerHTML = `
        <div class="choice-builder-heading">
          <span class="choice-number">Choice ${index + 1}</span>
          <button class="btn-danger choice-delete-button" aria-label="Delete choice ${index + 1}" onclick="window.editor.deleteChoice(${index})">&times;</button>
        </div>
        <div class="choice-route-grid">
          <label><span>Choice text</span><input type="text" class="input-text" placeholder="Button option text" value="${this.escapeHtml(choice.text || '')}" oninput="window.editor.updateChoiceText(${index}, this.value)"></label>
          <label><span>Destination scene</span><select class="select-input choice-target-select" data-asset-type="scene" onchange="window.editor.updateChoiceTarget(${index}, this.value)">${targetOptions}</select></label>
        </div>
        <section class="choice-rule-section">
          <div class="choice-rule-heading"><strong>Requirements</strong><span class="muted">Controls when this choice is available</span><button class="btn-secondary" onclick="window.editor.addChoiceCondition(${index})">+ Add requirement</button></div>
          <div class="choice-rule-list">${conditionHtml}</div>
        </section>
        <section class="choice-rule-section">
          <div class="choice-rule-heading"><strong>Actions</strong><span class="muted">Updates variables after selection</span><button class="btn-secondary" onclick="window.editor.addChoiceAction(${index})">+ Add action</button></div>
          <div class="choice-rule-list">${actionHtml}</div>
          <span class="choice-auto-track muted" title="Auto-tracks: choice_${this.escapeHtml(choice.id || autoTrackName)}">Automatically tracks this choice</span>
        </section>`;
      list.appendChild(card);
    });
    this.convertAllAssetSelects();
    this.convertAllAssetSelects();
  }

  addSceneChoice() {
    const scene = this.project.scenes[this.activeSceneId];
    scene.choices = scene.choices || [];
    scene.choices.push({
      id: "choice_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      text: "New Option",
      action: "jump",
      target: "",
      actions: [],
      conditions: []
    });
    this.renderChoicesBuilder();
    this.triggerAutoSave();
  }

  deleteChoice(index) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.choices.splice(index, 1);
    this.renderChoicesBuilder();
    this.triggerAutoSave();
  }

  updateChoiceText(index, text) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.choices[index].text = text;
    this.triggerAutoSave();
  }

  updateChoiceTarget(index, targetSceneId) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.choices[index].target = targetSceneId;
    this.triggerAutoSave();
  }

  updateChoiceVarName(index, varName) {
    const scene = this.project.scenes[this.activeSceneId];
    const choice = scene.choices[index];
    choice.actions = varName ? [{ type: 'increment', variable: varName, value: 1 }] : [];
    delete choice.customVarName;
    delete choice.customVarOp;
    delete choice.customVarValue;
    this.renderChoicesBuilder();
    this.triggerAutoSave();
  }

  updateChoiceVarOp(index, varOp) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.choices[index].customVarOp = varOp;
    this.triggerAutoSave();
  }

  updateChoiceVarValue(index, varValue) {
    const scene = this.project.scenes[this.activeSceneId];
    const parsed = Number(varValue);
    scene.choices[index].customVarValue = isNaN(parsed) ? 1 : parsed;
    this.triggerAutoSave();
  }

  addChoiceAction(choiceIndex) {
    const scene = this.project.scenes[this.activeSceneId];
    const choice = scene.choices[choiceIndex];
    choice.actions = this.getChoiceActions(choice).map(action => ({ ...action }));
    choice.actions.push({ type: 'set', variable: this.getVariableDefinitions()[0]?.name || '', value: 1 });
    delete choice.customVarName;
    delete choice.customVarOp;
    delete choice.customVarValue;
    this.renderChoicesBuilder();
    this.triggerAutoSave();
  }

  deleteChoiceAction(choiceIndex, actionIndex) {
    const choice = this.project.scenes[this.activeSceneId].choices[choiceIndex];
    choice.actions = this.getChoiceActions(choice).filter((_, index) => index !== actionIndex);
    delete choice.customVarName;
    delete choice.customVarOp;
    delete choice.customVarValue;
    this.renderChoicesBuilder();
    this.triggerAutoSave();
  }

  updateChoiceAction(choiceIndex, actionIndex, field, value) {
    const choice = this.project.scenes[this.activeSceneId].choices[choiceIndex];
    choice.actions = this.getChoiceActions(choice).map(action => ({ ...action }));
    const action = choice.actions[actionIndex];
    if (!action) return;
    if (field === 'type') action.type = value;
    else if (field === 'variable') {
      action.variable = value;
      const definition = this.getVariableDefinition(value);
      const allowed = this.actionOperators(definition);
      if (definition && !allowed.includes(action.type)) action.type = allowed[0];
      if (definition && definition.type === 'inventory') action.item = action.item || '';
    } else if (field === 'value') {
      const definition = this.getVariableDefinition(action.variable);
      action.value = definition && definition.type === 'number' ? (Number.isFinite(Number(value)) ? Number(value) : 1) : value;
    } else if (field === 'item') action.item = value;
    delete choice.customVarName;
    delete choice.customVarOp;
    delete choice.customVarValue;
    if (field === 'type' || field === 'variable') this.renderChoicesBuilder();
    this.triggerAutoSave();
  }

  addChoiceCondition(choiceIndex) {
    const choice = this.project.scenes[this.activeSceneId].choices[choiceIndex];
    choice.conditions = Array.isArray(choice.conditions) ? choice.conditions : [];
    choice.conditions.push({ type: 'variable', variable: this.getVariableDefinitions()[0]?.name || '', operator: '==', value: 0 });
    this.renderChoicesBuilder();
    this.triggerAutoSave();
  }

  deleteChoiceCondition(choiceIndex, conditionIndex) {
    const choice = this.project.scenes[this.activeSceneId].choices[choiceIndex];
    choice.conditions = (choice.conditions || []).filter((_, index) => index !== conditionIndex);
    this.renderChoicesBuilder();
    this.triggerAutoSave();
  }

  updateChoiceCondition(choiceIndex, conditionIndex, field, value) {
    const choice = this.project.scenes[this.activeSceneId].choices[choiceIndex];
    const condition = choice.conditions && choice.conditions[conditionIndex];
    if (!condition) return;
    const definition = this.getVariableDefinition(field === 'variable' ? value : condition.variable);
    if (field === 'value' && definition && definition.type === 'number') condition.value = Number.isFinite(Number(value)) ? Number(value) : 0;
    else if (field === 'value' && definition && definition.type === 'boolean') condition.value = value === true || value === 'true';
    else if (field === 'value') condition.value = String(value).slice(0, window.VNFairyCore.logicModel.MAX_TEXT_LENGTH);
    else if (field === 'item') condition.item = String(value).slice(0, 120);
    else condition[field] = value;
    if (field === 'variable') {
      const operators = window.VNFairyCore.logicModel.operatorForType(definition ? definition.type : 'number');
      if (!operators.includes(condition.operator)) condition.operator = operators[0];
      if (definition) {
        condition.value = definition.type === 'boolean' ? false : definition.type === 'number' || definition.type === 'inventory' ? 0 : '';
        if (definition.type !== 'inventory') delete condition.item;
      }
      this.renderChoicesBuilder();
    }
    this.triggerAutoSave();
  }

  // Render conditional branches list for active scene
  renderConditionalBranches() {
    const list = document.getElementById('scene-conditions-list');
    if (!list) return;
    list.innerHTML = "";

    const scene = this.project.scenes[this.activeSceneId];
    if (!scene) return;
    const branches = scene.conditionalBranches || [];
    const count = document.getElementById('conditional-jumps-count');
    if (count) count.textContent = String(branches.length);

    branches.forEach((branch, index) => {
      const card = document.createElement('div');
      card.className = "conditional-jump-card";

      // Condition type selector
      const condType = branch.type || 'choice'; // 'choice' or 'number'
      const selChoice = condType === 'choice' ? 'selected' : '';
      const selNumber = condType === 'number' || condType === 'variable' ? 'selected' : '';

      // Target scene options
      let targetOptions = `<option value="">End of Novel (Roll Credits)</option>`;
      Object.keys(this.project.scenes).forEach(id => {
        if (id === this.activeSceneId) return; // Can't branch to self
        const isSel = branch.target === id ? "selected" : "";
        targetOptions += `<option value="${id}" ${isSel}>${this.project.scenes[id].name || id}</option>`;
      });

      let conditionHtml = "";

      if (condType === 'choice') {
        // Gather all choices in all scenes
        let choiceOptions = `<option value="">-- Select Choice Option --</option>`;
        Object.keys(this.project.scenes).forEach(sceneId => {
          const sc = this.project.scenes[sceneId];
          if (sc.choices) {
            sc.choices.forEach(ch => {
              const isSel = branch.choiceId === ch.id ? "selected" : "";
              choiceOptions += `<option value="${ch.id}" ${isSel}>${sc.name || sceneId} > "${ch.text}"</option>`;
            });
          }
        });

        const isSelectedOp = branch.choiceState === 'selected' || !branch.choiceState ? 'selected' : '';
        const isNotSelectedOp = branch.choiceState === 'not_selected' ? 'selected' : '';

        conditionHtml = `
          <select class="select-input conditional-jump-variable" aria-label="Choice option" onchange="window.editor.updateConditionChoiceId(${index}, this.value)">
            ${choiceOptions}
          </select>
          <select class="select-input conditional-jump-operator" aria-label="Choice state" onchange="window.editor.updateConditionChoiceState(${index}, this.value)">
            <option value="selected" ${isSelectedOp}>was selected</option>
            <option value="not_selected" ${isNotSelectedOp}>was NOT selected</option>
          </select>
        `;
      } else {
        const definition = this.getVariableDefinition(branch.variable) || { type: 'number' };
        const logic = window.VNFairyCore && window.VNFairyCore.logicModel;
        const operators = logic ? logic.operatorForType(definition.type) : ['==', '!=', '>', '<', '>=', '<='];
        let opOptions = '';
        operators.forEach(operator => {
          opOptions += `<option value="${operator}" ${branch.operator === operator ? 'selected' : ''}>${operator.replace('_', ' ')}</option>`;
        });
        let valueEditor = '';
        if (definition.type === 'boolean') {
          valueEditor = `<select class="select-input branching-value branching-value-boolean" onchange="window.editor.updateConditionValue(${index}, this.value)"><option value="true" ${branch.value === true || branch.value === 'true' ? 'selected' : ''}>True</option><option value="false" ${branch.value === false || branch.value === 'false' ? 'selected' : ''}>False</option></select>`;
        } else if (definition.type === 'inventory') {
          valueEditor = `<input type="text" class="input-text branching-value branching-item-name" placeholder="Item name" value="${this.escapeHtml(branch.item || '')}" oninput="window.editor.updateConditionItem(${index}, this.value)"><input type="number" min="0" step="1" class="input-text branching-value branching-count" placeholder="Count" value="${this.escapeHtml(branch.value === undefined ? 1 : branch.value)}" oninput="window.editor.updateConditionValue(${index}, this.value)">`;
        } else {
          const inputType = definition.type === 'number' ? 'number' : 'text';
          const max = definition.type === 'text' ? `maxlength="${window.VNFairyCore.logicModel.MAX_TEXT_LENGTH}"` : '';
          valueEditor = `<input type="${inputType}" class="input-text branching-value" placeholder="Value" value="${this.escapeHtml(branch.value === undefined ? (definition.type === 'number' ? 0 : '') : branch.value)}" ${max} oninput="window.editor.updateConditionValue(${index}, this.value)">`;
        }
        conditionHtml = `<select class="select-input conditional-jump-variable" aria-label="Variable" onchange="window.editor.updateConditionVar(${index}, this.value)">${this.variableOptionsHtml(branch.variable)}</select><select class="select-input conditional-jump-operator" aria-label="Comparison" onchange="window.editor.updateConditionOp(${index}, this.value)">${opOptions}</select>${valueEditor}`;
      }

      card.innerHTML = `
        <div class="conditional-jump-heading"><strong>Jump ${index + 1}</strong><button class="btn-danger conditional-jump-delete" aria-label="Delete conditional jump ${index + 1}" onclick="window.editor.deleteCondition(${index})">&times;</button></div>
        <div class="conditional-jump-row conditional-jump-if-row">
          <span class="conditional-jump-label">If</span>
          <select class="select-input conditional-jump-type" aria-label="Requirement type" onchange="window.editor.updateConditionType(${index}, this.value)">
            <option value="choice" ${selChoice}>Choice selection</option>
            <option value="variable" ${selNumber}>Variable value</option>
          </select>
          <div class="conditional-jump-fields">
            ${conditionHtml}
          </div>
        </div>
        <div class="conditional-jump-row conditional-jump-target-row">
          <span class="conditional-jump-label">Then go to</span>
          <select class="select-input cond-target-select" data-asset-type="scene" onchange="window.editor.updateConditionTarget(${index}, this.value)">
            ${targetOptions}
          </select>
        </div>
      `;

      list.appendChild(card);
    });
    this.convertAllAssetSelects();
  }

  addSceneCondition() {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches = scene.conditionalBranches || [];
    scene.conditionalBranches.push({
      type: "choice",
      choiceId: "",
      choiceState: "selected",
      target: ""
    });
    this.renderConditionalBranches();
    this.triggerAutoSave();
  }

  deleteCondition(index) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches.splice(index, 1);
    this.renderConditionalBranches();
    this.triggerAutoSave();
  }

  updateConditionType(index, type) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches[index].type = type;
    if (type === 'choice') {
      scene.conditionalBranches[index].choiceId = "";
      scene.conditionalBranches[index].choiceState = "selected";
      delete scene.conditionalBranches[index].variable;
      delete scene.conditionalBranches[index].operator;
      delete scene.conditionalBranches[index].value;
    } else {
      scene.conditionalBranches[index].variable = "";
      scene.conditionalBranches[index].operator = "==";
      scene.conditionalBranches[index].value = 0;
      delete scene.conditionalBranches[index].choiceId;
      delete scene.conditionalBranches[index].choiceState;
    }
    this.renderConditionalBranches();
    this.triggerAutoSave();
  }

  updateConditionChoiceId(index, choiceId) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches[index].choiceId = choiceId;
    this.triggerAutoSave();
  }

  updateConditionChoiceState(index, state) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches[index].choiceState = state;
    this.triggerAutoSave();
  }

  updateConditionVar(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    const branch = scene.conditionalBranches[index];
    branch.variable = val;
    const definition = this.getVariableDefinition(val);
    if (definition) {
      const logic = window.VNFairyCore.logicModel;
      const operators = logic.operatorForType(definition.type);
      if (!operators.includes(branch.operator)) branch.operator = operators[0];
      branch.value = definition.type === 'boolean' ? false : definition.type === 'number' || definition.type === 'inventory' ? 0 : '';
      if (definition.type !== 'inventory') delete branch.item;
    }
    this.renderConditionalBranches();
    this.triggerAutoSave();
  }

  updateConditionOp(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches[index].operator = val;
    this.triggerAutoSave();
  }

  updateConditionValue(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    const branch = scene.conditionalBranches[index];
    const definition = this.getVariableDefinition(branch.variable);
    if ((definition && definition.type === 'number') || branch.type === 'number') {
      const parsed = Number(val);
      branch.value = isNaN(parsed) ? 0 : parsed;
    } else if (definition && definition.type === 'boolean') {
      branch.value = val === true || val === 'true';
    } else {
      branch.value = String(val).slice(0, window.VNFairyCore.logicModel.MAX_TEXT_LENGTH);
    }
    this.triggerAutoSave();
  }

  updateConditionItem(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches[index].item = String(val).slice(0, 120);
    this.triggerAutoSave();
  }

  updateConditionTarget(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches[index].target = val;
    this.triggerAutoSave();
  }

  // Render project-wide typed variable definitions in settings.
  renderTrackedNumbersList() {
    const list = document.getElementById('settings-tracked-numbers-list');
    if (!list) return;
    list.innerHTML = "";

    this.getVariableDefinitions().forEach((definition) => {
      const item = document.createElement('div');
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.gap = "8px";
      item.style.flexWrap = "wrap";
      item.style.background = "rgba(255,255,255,0.02)";
      item.style.border = "1px solid var(--border-color)";
      item.style.borderRadius = "var(--radius-sm)";
      item.style.padding = "6px 12px";

      const defaultText = definition.type === 'inventory'
        ? Object.entries(definition.default || {}).map(([name, count]) => `${name}:${count}`).join(', ')
        : String(definition.default);
      const typeOptions = ['number', 'boolean', 'text', 'inventory'].map(type => `<option value="${type}" ${definition.type === type ? 'selected' : ''}>${type}</option>`).join('');
      item.innerHTML = `<div style="min-width:130px; flex:1;"><strong style="color:var(--text-main); font-size:0.85rem;">${this.escapeHtml(definition.name)}</strong><div class="muted" style="font-size:0.7rem; margin-top:2px;">${this.escapeHtml(definition.description || 'No description')}</div></div><select class="select-input" title="Variable type" style="width:110px; font-size:0.75rem; padding:4px;" onchange="window.editor.updateProjectVariableType('${this.escapeHtml(definition.name)}', this.value)">${typeOptions}</select><input type="text" class="input-text" value="${this.escapeHtml(defaultText)}" title="Default value" placeholder="Default" style="width:150px; font-size:0.75rem; padding:4px 8px;" onchange="window.editor.updateProjectVariableDefault('${this.escapeHtml(definition.name)}', this.value)"><input type="text" class="input-text" value="${this.escapeHtml(definition.description)}" title="Description" placeholder="Description" style="width:190px; font-size:0.75rem; padding:4px 8px;" onchange="window.editor.updateProjectVariableDescription('${this.escapeHtml(definition.name)}', this.value)"><button class="btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="window.editor.deleteTrackedNumber('${this.escapeHtml(definition.name)}')">&times;</button>`;
      list.appendChild(item);
    });
  }

  addTrackedNumber() {
    const input = document.getElementById('settings-new-tracked-number');
    if (!input) return;
    const name = input.value.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    if (!name) {
      alert("Please enter a valid alphanumeric variable name.");
      return;
    }
    const definitions = this.getVariableDefinitions();
    if (definitions.some(definition => definition.name === name)) {
      alert("A project variable with this name already exists.");
      return;
    }
    const type = document.getElementById('settings-new-variable-type')?.value || 'number';
    const defaultInput = document.getElementById('settings-new-variable-default');
    const descriptionInput = document.getElementById('settings-new-variable-description');
    const defaultValue = this.parseProjectVariableDefault(type, defaultInput ? defaultInput.value : '');
    this.project.config.variables.push({ name, type, default: defaultValue, description: descriptionInput ? descriptionInput.value.trim() : '' });
    if (type === 'number') {
      this.project.config.trackedNumbers = this.project.config.trackedNumbers || [];
      if (!this.project.config.trackedNumbers.includes(name)) this.project.config.trackedNumbers.push(name);
    }
    input.value = "";
    if (defaultInput) defaultInput.value = "";
    if (descriptionInput) descriptionInput.value = "";
    this.renderTrackedNumbersList();
    this.renderChoicesBuilder();
    this.renderConditionalBranches();
    this.triggerAutoSave();
  }

  parseProjectVariableDefault(type, value) {
    if (type === 'boolean') return value.trim().toLowerCase() === 'true';
    if (type === 'number') return Number.isFinite(Number(value)) ? Number(value) : 0;
    if (type === 'inventory') {
      const inventory = {};
      String(value || '').split(',').forEach(part => {
        const [rawName, rawCount] = part.split(':');
        const item = String(rawName || '').trim().slice(0, 120);
        const count = Math.max(0, Math.floor(Number(rawCount === undefined ? 1 : rawCount) || 0));
        if (item && count > 0) inventory[item] = count;
      });
      return inventory;
    }
    return String(value || '').slice(0, window.VNFairyCore.logicModel.MAX_TEXT_LENGTH);
  }

  updateProjectVariableDefault(name, value) {
    const definition = this.getVariableDefinition(name);
    if (!definition) return;
    definition.default = this.parseProjectVariableDefault(definition.type, value);
    this.triggerAutoSave();
  }

  updateProjectVariableType(name, type) {
    const definition = this.getVariableDefinition(name);
    if (!definition || !window.VNFairyCore.logicModel.VARIABLE_TYPES.includes(type)) return;
    const previousDefault = definition.default;
    definition.type = type;
    definition.default = window.VNFairyCore.logicModel.normalizeDefinition({ ...definition, type, default: previousDefault }).default;
    this.project.config.trackedNumbers = this.project.config.trackedNumbers || [];
    if (type === 'number' && !this.project.config.trackedNumbers.includes(name)) this.project.config.trackedNumbers.push(name);
    if (type !== 'number') this.project.config.trackedNumbers = this.project.config.trackedNumbers.filter(existing => existing !== name);
    this.renderTrackedNumbersList();
    this.renderChoicesBuilder();
    this.renderConditionalBranches();
    this.triggerAutoSave();
  }

  updateProjectVariableDescription(name, value) {
    const definition = this.getVariableDefinition(name);
    if (!definition) return;
    definition.description = String(value || '').trim().slice(0, window.VNFairyCore.logicModel.MAX_DESCRIPTION_LENGTH);
    this.triggerAutoSave();
  }

  deleteTrackedNumber(name) {
    this.project.config.variables = this.getVariableDefinitions().filter(definition => definition.name !== name);
    this.project.config.trackedNumbers = (this.project.config.trackedNumbers || []).filter(n => n !== name);
    this.renderTrackedNumbersList();
    this.renderChoicesBuilder();
    this.renderConditionalBranches();
    this.triggerAutoSave();
  }

  // Settings view inputs binding
  refreshSettingsTab() {
    const startSelect = document.getElementById('settings-start-scene');
    while (startSelect.options.length > 0) startSelect.remove(0);

    const launchSelect = document.getElementById('settings-launch-behavior');
    while (launchSelect.options.length > 1) launchSelect.remove(1);

    Object.keys(this.project.scenes || {}).forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.innerText = this.project.scenes[id].name || id;
      startSelect.appendChild(opt);

      const optLaunch = document.createElement('option');
      optLaunch.value = id;
      optLaunch.innerText = this.project.scenes[id].name || id;
      launchSelect.appendChild(optLaunch);
    });

    startSelect.value = this.project.startSceneId || "";
    launchSelect.value = this.project.config.launchBehavior || "title";
    document.getElementById('settings-kinetic-mode').checked = !!this.project.config.kineticMode;
    document.getElementById('settings-debug-mode').checked = !!this.project.config.debugModeEnabled;
    document.getElementById('settings-text-speed').value = this.project.config.textSpeed || 40;
    document.getElementById('settings-ui-click-sound').value = this.project.config.uiClickSound || "default";
    document.getElementById('settings-ui-theme').value = this.project.config.theme || "dark";
    document.getElementById('settings-ui-accent').value = this.project.config.accentColor || "#6366f1";

    document.getElementById('settings-gallery-enabled').checked = !!this.project.config.galleryEnabled;
    document.getElementById('settings-gallery-chars-enabled').checked = !!this.project.config.galleryCharactersEnabled;
    document.getElementById('settings-gallery-bgs-enabled').checked = !!this.project.config.galleryBackgroundsEnabled;
    document.getElementById('settings-music-enabled').checked = !!this.project.config.musicEnabled;
    this.toggleUnlockablesToggles();

    const titleConfig = this.project.config.titleScreen || {};
    document.getElementById('settings-title-bg').value = titleConfig.background || "";
    document.getElementById('settings-title-music').value = titleConfig.music || "";
    document.getElementById('settings-title-color').value = titleConfig.titleColor || "#ffffff";
    document.getElementById('settings-title-layout').value = titleConfig.menuLayout || "left";
    const menuFontSize = Number.isFinite(Number(titleConfig.menuFontSize)) ? Math.min(2, Math.max(0.75, Number(titleConfig.menuFontSize))) : 1.1;
    document.getElementById('settings-menu-font-size').value = menuFontSize;
    document.getElementById('val-title-menu-font-size').innerText = menuFontSize + 'rem';
    document.getElementById('settings-hide-title-text').checked = !!titleConfig.hideTitleText;
    document.getElementById('settings-no-shading').checked = !!titleConfig.noShading;
    document.getElementById('settings-menu-btn-color').value = titleConfig.menuButtonColor || "#ffffff";
    document.getElementById('settings-menu-btn-border').value = titleConfig.menuButtonBorder || "#3d3d5c";
    document.getElementById('settings-menu-btn-bg-style').value = titleConfig.menuButtonBgStyle || "blur";
    document.getElementById('settings-menu-btn-bg-color').value = titleConfig.menuButtonBgColor || "#1a1a2e";
    const opacity = titleConfig.menuButtonBgOpacity !== undefined ? titleConfig.menuButtonBgOpacity : 25;
    document.getElementById('settings-menu-btn-bg-opacity').value = opacity;
    document.getElementById('val-menu-btn-bg-opacity').innerText = opacity + '%';
    this.onMenuBtnStyleChange();

    const creditsConfig = this.project.config.credits || {};
    document.getElementById('settings-credits-bg').value = creditsConfig.background || "";
    document.getElementById('settings-credits-music').value = creditsConfig.music || "";
    document.getElementById('settings-credits-text').value = creditsConfig.text || "";
    document.getElementById('settings-credits-no-shading').checked = !!creditsConfig.noShading;
    document.getElementById('settings-credits-no-dimming').checked = !!creditsConfig.noDimming;
    this.renderTrackedNumbersList();
    this.convertAllAssetSelects();
  }

  // Show/hide the bg color picker depending on the selected button background style
  onMenuBtnStyleChange() {
    const style = document.getElementById('settings-menu-btn-bg-style').value;
    const row = document.getElementById('menu-btn-bg-color-row');
      if (row) row.style.display = style === 'none' ? 'none' : 'block';
  }

  // Flowchart Generator
  renderFlowchart() {
    const wrapper = document.getElementById('flowchart-wrapper');
    const canvas = document.getElementById('flowchart-canvas');
    const svgEl = document.getElementById('flowchart-svg');
    if (!wrapper || !canvas || !svgEl || !this.project) return;

    if (this.flowchartCleanup) {
      this.flowchartCleanup();
      this.flowchartCleanup = null;
    }

    // Clear old content (keep SVG in place)
    Array.from(canvas.children).forEach(child => {
      if (child !== svgEl) canvas.removeChild(child);
    });
    svgEl.innerHTML = '';

    this.project.config = this.project.config || {};
    const scenes = this.project.scenes || {};
    const sceneIds = Object.keys(scenes);
    if (!sceneIds.length) return;

    // --- DAG Layout: BFS from start scene to assign column depths ---
    const NODE_W = 200, NODE_H_BASE = 110, GAP_X = 100, GAP_Y = 30, PAD = 60;
    const depth = {};
    const startId = this.project.startSceneId || sceneIds[0];
    const queue = [startId];
    depth[startId] = 0;
    // BFS
    while (queue.length) {
      const cur = queue.shift();
      const scene = scenes[cur];
      if (!scene) continue;
      let nexts = [];
      if (!scene.isEnding) {
        if (scene.nextSceneId) nexts.push(scene.nextSceneId);
        if (scene.choices) scene.choices.forEach(c => { if (c.target) nexts.push(c.target); });
        if (scene.conditionalBranches) scene.conditionalBranches.forEach(b => { if (b.target) nexts.push(b.target); });
      }
      nexts.forEach(nid => {
        if (!(nid in depth)) {
          depth[nid] = depth[cur] + 1;
          queue.push(nid);
        }
      });
    }

    // Keep track of which scenes are actually reachable from the start scene
    const reachableIds = new Set(Object.keys(depth));

    // Check if not all endings can be reached
    const endings = sceneIds.filter(id => scenes[id] && scenes[id].isEnding);
    const unreachableEndings = endings.filter(id => !reachableIds.has(id));
    
    const warnEl = document.getElementById('flowchart-warning');
    if (warnEl) {
      if (unreachableEndings.length > 0) {
        warnEl.classList.remove('hidden');
        document.getElementById('flowchart-warning-text').innerText = 
          `Warning: ${unreachableEndings.length} route ending${unreachableEndings.length > 1 ? 's' : ''} cannot be reached from the start scene!`;
      } else {
        warnEl.classList.add('hidden');
      }
    }

    // Assign depth=0 to any unreachable scenes so they still appear
    sceneIds.forEach(id => { if (!reachableIds.has(id)) depth[id] = 0; });

    // Group by depth column
    const cols = {};
    sceneIds.forEach(id => {
      const d = depth[id];
      if (!cols[d]) cols[d] = [];
      cols[d].push(id);
    });
    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);

    // Compute positions
    const pos = {}; // id -> {x, y, w, h}
    const savedPositions = this.project.config.flowchartPositions || {};
    let curX = PAD;
    colKeys.forEach(col => {
      const colNodes = cols[col];
      // Estimate height of each node
      let curY = PAD;
      colNodes.forEach(id => {
        const scene = scenes[id];
        const choiceCount = (scene.choices && scene.choices.length) ? scene.choices.length : 0;
        const conditionCount = (scene.conditionalBranches && scene.conditionalBranches.length) ? scene.conditionalBranches.length : 0;
        const h = NODE_H_BASE + (choiceCount + conditionCount) * 18;
        const saved = savedPositions[id];
        const hasSavedPosition = saved && Number.isFinite(Number(saved.x)) && Number.isFinite(Number(saved.y));
        pos[id] = {
          x: hasSavedPosition ? Math.max(20, Number(saved.x)) : curX,
          y: hasSavedPosition ? Math.max(20, Number(saved.y)) : curY,
          w: NODE_W,
          h
        };
        curY += h + GAP_Y;
      });
      curX += NODE_W + GAP_X;
    });

    // Create node elements at absolute positions
    const nodeEls = {};
    sceneIds.forEach(id => {
      const scene = scenes[id];
      const { x, y, w } = pos[id];
      const node = document.createElement('div');
      node.setAttribute('data-scene-id', id);
      let nodeClass = 'flowchart-node';
      if (id === this.project.startSceneId) nodeClass += ' start-node';
      if (scene.isEnding) {
        nodeClass += ' end-node';
        if (!reachableIds.has(id)) {
          nodeClass += ' unreachable-end-node';
        }
      }
      node.className = nodeClass;
      node.style.position = 'absolute';
      node.style.left = x + 'px';
      node.style.top = y + 'px';
      node.style.width = w + 'px';
      node.title = 'Drag to reposition · Click to edit this scene';
      node.onclick = (e) => {
        e.stopPropagation();
        if (node._suppressClick) {
          node._suppressClick = false;
          return;
        }
        switchWorkspaceView('timeline-view');
        this.selectScene(id);
      };

      let detailsHtml = `<div>Dialogues: ${scene.dialogue ? scene.dialogue.length : 0} lines</div>`;
      if (scene.isEnding) {
        detailsHtml += `<div style="color:var(--accent);font-weight:600;">🏆 Route Ending</div>`;
      }

      let connectionsHtml = '';
      const isKinetic = this.project.config.kineticMode;
      if (!scene.isEnding) {
        if (scene.conditionalBranches && scene.conditionalBranches.length > 0) {
          scene.conditionalBranches.forEach(b => {
            const targetName = b.target && scenes[b.target] ? scenes[b.target].name : (b.target || 'Credits');
            connectionsHtml += `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--accent);">⚡ If ${b.variable} ➡️ ${targetName}</div>`;
          });
        }
        
        if (isKinetic && scene.choices && scene.choices.length > 0) {
          const firstChoice = scene.choices[0];
          const targetName = firstChoice.target && scenes[firstChoice.target]
            ? scenes[firstChoice.target].name : (firstChoice.target || 'Credits');
          connectionsHtml += `<div>➡️ ${targetName} <span class="muted" style="font-size:0.75rem;">(Kinetic Auto-Choice #1)</span></div>`;
        } else if (isKinetic || !scene.choices || scene.choices.length === 0) {
          const nextName = scene.nextSceneId && scenes[scene.nextSceneId]
            ? scenes[scene.nextSceneId].name : (scene.nextSceneId || 'Credits');
          connectionsHtml += `<div>➡️ ${nextName}</div>`;
        } else {
          scene.choices.forEach(c => {
            const targetName = scenes[c.target] ? scenes[c.target].name : (c.target || 'Credits');
            connectionsHtml += `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">👉 "${c.text}"</div>`;
          });
        }
      }

      node.innerHTML = `
        <div class="flowchart-node-title">${scene.name || id}</div>
        <div class="flowchart-node-details">${detailsHtml}</div>
        ${connectionsHtml ? `<div class="flowchart-node-connections">${connectionsHtml}</div>` : ''}
      `;
      canvas.appendChild(node);
      pos[id].w = node.offsetWidth || pos[id].w;
      pos[id].h = node.offsetHeight || pos[id].h;
      nodeEls[id] = node;
    });

    // Build a single edge list for the routed connectors.
    const edges = [];
    sceneIds.forEach(sourceId => {
      const source = scenes[sourceId];
      if (!source || source.isEnding) return;
      if (source.nextSceneId) edges.push({ sourceId, targetId: source.nextSceneId });
      if (source.choices) {
        source.choices.forEach(choice => {
          if (choice.target) edges.push({ sourceId, targetId: choice.target });
        });
      }
      if (source.conditionalBranches) {
        source.conditionalBranches.forEach(branch => {
          if (branch.target) edges.push({ sourceId, targetId: branch.target });
        });
      }
    });
    const ROUTE_GAP = 24;
    const ROUTE_BEND_RADIUS = 9;
    const svgNS = 'http://www.w3.org/2000/svg';

    const isInside = (point, rect) => (
      point.x > rect.left + 0.5 && point.x < rect.right - 0.5 &&
      point.y > rect.top + 0.5 && point.y < rect.bottom - 0.5
    );

    const segmentClear = (a, b, obstacles) => {
      const horizontal = Math.abs(a.y - b.y) < 0.5;
      const vertical = Math.abs(a.x - b.x) < 0.5;
      if (!horizontal && !vertical) return false;

      for (const rect of obstacles) {
        if (horizontal && a.y > rect.top && a.y < rect.bottom) {
          const left = Math.min(a.x, b.x);
          const right = Math.max(a.x, b.x);
          if (right > rect.left && left < rect.right) return false;
        }
        if (vertical && a.x > rect.left && a.x < rect.right) {
          const top = Math.min(a.y, b.y);
          const bottom = Math.max(a.y, b.y);
          if (bottom > rect.top && top < rect.bottom) return false;
        }
      }
      return true;
    };

    const uniqueNumbers = values => Array.from(new Set(values.map(value => Number(value.toFixed(2)))));

    // Route across a visibility grid made from tile edges. The grid is small
    // because it only contains coordinates at the sides of existing tiles.
    const findOrthogonalRoute = (start, end, obstacles) => {
      const xs = uniqueNumbers([
        start.x,
        end.x,
        ...obstacles.flatMap(rect => [rect.left, rect.right])
      ]);
      const ys = uniqueNumbers([
        start.y,
        end.y,
        ...obstacles.flatMap(rect => [rect.top, rect.bottom])
      ]);
      const points = [];
      const pointIndex = new Map();

      xs.forEach(x => ys.forEach(y => {
        const point = { x, y };
        if (obstacles.some(rect => isInside(point, rect))) return;
        const key = `${x}|${y}`;
        pointIndex.set(key, points.length);
        points.push({ x, y });
      }));

      const startIndex = pointIndex.get(`${start.x}|${start.y}`);
      const endIndex = pointIndex.get(`${end.x}|${end.y}`);
      if (startIndex === undefined || endIndex === undefined) return null;

      const neighbours = points.map(() => []);
      const addNeighbourSegments = (groups, direction) => {
        groups.forEach(group => {
          group.sort((a, b) => direction === 0 ? a.x - b.x : a.y - b.y);
          for (let index = 1; index < group.length; index++) {
            const a = group[index - 1];
            const b = group[index];
            if (!segmentClear(a.point, b.point, obstacles)) continue;
            const distance = Math.abs(direction === 0 ? b.point.x - a.point.x : b.point.y - a.point.y);
            neighbours[a.index].push({ index: b.index, direction, distance });
            neighbours[b.index].push({ index: a.index, direction, distance });
          }
        });
      };

      const rows = new Map();
      const columns = new Map();
      points.forEach((point, index) => {
        const rowKey = point.y.toFixed(2);
        const columnKey = point.x.toFixed(2);
        if (!rows.has(rowKey)) rows.set(rowKey, []);
        if (!columns.has(columnKey)) columns.set(columnKey, []);
        rows.get(rowKey).push({ point, index });
        columns.get(columnKey).push({ point, index });
      });
      addNeighbourSegments(Array.from(rows.values()), 0);
      addNeighbourSegments(Array.from(columns.values()), 1);

      const heap = [];
      const pushHeap = item => {
        heap.push(item);
        let index = heap.length - 1;
        while (index > 0) {
          const parent = Math.floor((index - 1) / 2);
          if (heap[parent].priority <= item.priority) break;
          heap[index] = heap[parent];
          index = parent;
        }
        heap[index] = item;
      };
      const popHeap = () => {
        if (!heap.length) return null;
        const result = heap[0];
        const last = heap.pop();
        if (heap.length && last) {
          let index = 0;
          while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            let child = index;
            if (left < heap.length && heap[left].priority < heap[child].priority) child = left;
            if (right < heap.length && heap[right].priority < heap[child].priority) child = right;
            if (child === index) break;
            heap[index] = heap[child];
            index = child;
          }
          heap[index] = last;
        }
        return result;
      };

      const stateKey = (index, direction) => index * 3 + direction;
      const distance = new Map();
      const previous = new Map();
      const initialState = stateKey(startIndex, 2);
      distance.set(initialState, 0);
      pushHeap({ state: initialState, priority: 0 });
      let finalState = null;

      while (heap.length) {
        const current = popHeap();
        if (!current) break;
        const currentCost = distance.get(current.state);
        if (currentCost === undefined) continue;
        const currentIndex = Math.floor(current.state / 3);
        const currentDirection = current.state % 3;
        if (currentIndex === endIndex) {
          finalState = current.state;
          break;
        }

        for (const neighbour of neighbours[currentIndex]) {
          const nextState = stateKey(neighbour.index, neighbour.direction);
          const bendPenalty = currentDirection !== 2 && currentDirection !== neighbour.direction ? 70 : 0;
          const nextCost = currentCost + neighbour.distance + bendPenalty;
          if (nextCost >= (distance.get(nextState) ?? Infinity)) continue;
          distance.set(nextState, nextCost);
          previous.set(nextState, current.state);
          const nextPoint = points[neighbour.index];
          const heuristic = Math.abs(nextPoint.x - end.x) + Math.abs(nextPoint.y - end.y);
          pushHeap({ state: nextState, priority: nextCost + heuristic });
        }
      }

      if (finalState === null) return null;
      const route = [];
      let state = finalState;
      while (state !== undefined) {
        route.unshift(points[Math.floor(state / 3)]);
        state = previous.get(state);
      }
      return route;
    };

    const simplifyRoute = points => points.filter((point, index) => {
      if (index === 0 || index === points.length - 1) return true;
      const previousPoint = points[index - 1];
      const nextPoint = points[index + 1];
      const vertical = Math.abs(previousPoint.x - point.x) < 0.5 && Math.abs(point.x - nextPoint.x) < 0.5;
      const horizontal = Math.abs(previousPoint.y - point.y) < 0.5 && Math.abs(point.y - nextPoint.y) < 0.5;
      return !vertical && !horizontal;
    });

    const createRoundedPath = points => {
      if (points.length < 2) return '';
      let path = `M${points[0].x},${points[0].y}`;
      for (let index = 1; index < points.length; index++) {
        const current = points[index];
        const previousPoint = points[index - 1];
        const nextPoint = points[index + 1];
        const isTurn = !!nextPoint && (
          (Math.abs(previousPoint.x - current.x) > 0.5 && Math.abs(current.y - nextPoint.y) > 0.5) ||
          (Math.abs(previousPoint.y - current.y) > 0.5 && Math.abs(current.x - nextPoint.x) > 0.5)
        );
        if (!isTurn) {
          path += ` L${current.x},${current.y}`;
          continue;
        }

        const beforeDistance = Math.min(ROUTE_BEND_RADIUS, Math.abs(previousPoint.x - current.x) + Math.abs(previousPoint.y - current.y) / 2);
        const afterDistance = Math.min(ROUTE_BEND_RADIUS, Math.abs(nextPoint.x - current.x) + Math.abs(nextPoint.y - current.y) / 2);
        const before = {
          x: current.x + Math.sign(previousPoint.x - current.x) * (previousPoint.x !== current.x ? beforeDistance : 0),
          y: current.y + Math.sign(previousPoint.y - current.y) * (previousPoint.y !== current.y ? beforeDistance : 0)
        };
        const after = {
          x: current.x + Math.sign(nextPoint.x - current.x) * (nextPoint.x !== current.x ? afterDistance : 0),
          y: current.y + Math.sign(nextPoint.y - current.y) * (nextPoint.y !== current.y ? afterDistance : 0)
        };
        path += ` L${before.x},${before.y} Q${current.x},${current.y} ${after.x},${after.y}`;
      }
      return path;
    };

    const getFlowchartPorts = (sourcePosition, targetPosition) => {
      const sourceCenter = { x: sourcePosition.x + sourcePosition.w / 2, y: sourcePosition.y + sourcePosition.h / 2 };
      const targetCenter = { x: targetPosition.x + targetPosition.w / 2, y: targetPosition.y + targetPosition.h / 2 };
      const dx = targetCenter.x - sourceCenter.x;
      const dy = targetCenter.y - sourceCenter.y;
      const useHorizontal = Math.abs(dx) >= Math.abs(dy);

      if (useHorizontal) {
        const toRight = dx >= 0;
        const direction = toRight ? 1 : -1;
        const sourceAnchor = { x: toRight ? sourcePosition.x + sourcePosition.w : sourcePosition.x, y: sourceCenter.y };
        const targetAnchor = { x: toRight ? targetPosition.x : targetPosition.x + targetPosition.w, y: targetCenter.y };
        return {
          sourceAnchor,
          targetAnchor,
          start: { x: sourceAnchor.x + direction * ROUTE_GAP, y: sourceAnchor.y },
          end: { x: targetAnchor.x - direction * ROUTE_GAP, y: targetAnchor.y }
        };
      }

      const below = dy >= 0;
      const direction = below ? 1 : -1;
      const sourceAnchor = { x: sourceCenter.x, y: below ? sourcePosition.y + sourcePosition.h : sourcePosition.y };
      const targetAnchor = { x: targetCenter.x, y: below ? targetPosition.y : targetPosition.y + targetPosition.h };
      return {
        sourceAnchor,
        targetAnchor,
        start: { x: sourceAnchor.x, y: sourceAnchor.y + direction * ROUTE_GAP },
        end: { x: targetAnchor.x, y: targetAnchor.y - direction * ROUTE_GAP }
      };
    };

    const getObstacles = () => Object.values(pos).map(position => ({
      left: position.x - ROUTE_GAP,
      top: position.y - ROUTE_GAP,
      right: position.x + position.w + ROUTE_GAP,
      bottom: position.y + position.h + ROUTE_GAP
    }));

    const updateCanvasBounds = () => {
      const maxX = Math.max(wrapper.clientWidth, ...Object.values(pos).map(position => position.x + position.w + PAD));
      const maxY = Math.max(wrapper.clientHeight, ...Object.values(pos).map(position => position.y + position.h + PAD));
      canvas.style.width = `${maxX}px`;
      canvas.style.height = `${maxY}px`;
      svgEl.setAttribute('width', maxX);
      svgEl.setAttribute('height', maxY);
      svgEl.style.width = `${maxX}px`;
      svgEl.style.height = `${maxY}px`;
    };

    const drawConnections = () => {
      svgEl.innerHTML = '';
      const defs = document.createElementNS(svgNS, 'defs');
      const marker = document.createElementNS(svgNS, 'marker');
      marker.setAttribute('id', 'fc-arrow');
      marker.setAttribute('markerWidth', '8');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      const arrowPath = document.createElementNS(svgNS, 'path');
      arrowPath.setAttribute('d', 'M0,0 L8,3 L0,6 Z');
      arrowPath.setAttribute('fill', 'var(--accent)');
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
      svgEl.appendChild(defs);

      const obstacles = getObstacles();
      edges.forEach(edge => {
        const sourcePosition = pos[edge.sourceId];
        const targetPosition = pos[edge.targetId];
        if (!sourcePosition || !targetPosition) return;

        const ports = getFlowchartPorts(sourcePosition, targetPosition);
        const routed = findOrthogonalRoute(ports.start, ports.end, obstacles);
        const route = simplifyRoute([
          ports.sourceAnchor,
          ports.start,
          ...(routed || [ports.end]),
          ports.end,
          ports.targetAnchor
        ]);
        const pathEl = document.createElementNS(svgNS, 'path');
        pathEl.classList.add('flowchart-edge');
        pathEl.setAttribute('d', createRoundedPath(route));
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke', 'var(--accent)');
        pathEl.setAttribute('stroke-width', '2');
        pathEl.setAttribute('stroke-opacity', '0.7');
        pathEl.setAttribute('marker-end', 'url(#fc-arrow)');
        svgEl.appendChild(pathEl);
      });
    };

    updateCanvasBounds();
    drawConnections();

    // --- Zoom, pan, and tile dragging ---
    const newWrapper = wrapper.cloneNode(false);
    wrapper.parentNode.replaceChild(newWrapper, wrapper);
    newWrapper.appendChild(canvas);

    let scale = 1, offsetX = PAD / 2, offsetY = PAD / 2;
    const applyTransform = () => {
      canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    };
    applyTransform();

    Object.entries(nodeEls).forEach(([id, node]) => {
      let activePointerId = null;
      let pointerStart = null;
      let dragStart = null;
      let didDrag = false;

      node.addEventListener('mousedown', event => event.stopPropagation());
      node.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        activePointerId = event.pointerId;
        pointerStart = { x: event.clientX, y: event.clientY };
        dragStart = { x: pos[id].x, y: pos[id].y };
        didDrag = false;
        node.classList.add('dragging');
        if (node.setPointerCapture) node.setPointerCapture(event.pointerId);
      });

      node.addEventListener('pointermove', event => {
        if (event.pointerId !== activePointerId || !pointerStart) return;
        const movedX = event.clientX - pointerStart.x;
        const movedY = event.clientY - pointerStart.y;
        if (!didDrag && Math.hypot(movedX, movedY) < 3) return;
        didDrag = true;

        const rect = newWrapper.getBoundingClientRect();
        const pointerCanvasX = (event.clientX - rect.left - offsetX) / scale;
        const pointerCanvasY = (event.clientY - rect.top - offsetY) / scale;
        const startCanvasX = (pointerStart.x - rect.left - offsetX) / scale;
        const startCanvasY = (pointerStart.y - rect.top - offsetY) / scale;
        const grid = 8;
        pos[id].x = Math.max(20, Math.round((dragStart.x + pointerCanvasX - startCanvasX) / grid) * grid);
        pos[id].y = Math.max(20, Math.round((dragStart.y + pointerCanvasY - startCanvasY) / grid) * grid);
        node.style.left = `${pos[id].x}px`;
        node.style.top = `${pos[id].y}px`;
        updateCanvasBounds();
        drawConnections();
      });

      const finishDrag = event => {
        if (event.pointerId !== activePointerId) return;
        if (node.releasePointerCapture && node.hasPointerCapture && node.hasPointerCapture(event.pointerId)) {
          node.releasePointerCapture(event.pointerId);
        }
        node.classList.remove('dragging');
        if (didDrag) {
          savedPositions[id] = { x: pos[id].x, y: pos[id].y };
          this.project.config.flowchartPositions = savedPositions;
          this.triggerAutoSave();
          node._suppressClick = true;
        }
        activePointerId = null;
        pointerStart = null;
        dragStart = null;
      };

      node.addEventListener('pointerup', finishDrag);
      node.addEventListener('pointercancel', finishDrag);
    });

    newWrapper.addEventListener('wheel', event => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(0.2, scale * factor), 4);
      const rect = newWrapper.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
      offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);
      scale = newScale;
      applyTransform();
    }, { passive: false });

    let isPanning = false, startX = 0, startY = 0;
    const onMouseMove = event => {
      if (!isPanning) return;
      offsetX = event.clientX - startX;
      offsetY = event.clientY - startY;
      applyTransform();
    };
    const onMouseUp = () => {
      if (!isPanning) return;
      isPanning = false;
      newWrapper.style.cursor = 'grab';
    };

    newWrapper.addEventListener('mousedown', event => {
      if (event.button !== 0 || event.target.closest('.flowchart-node')) return;
      isPanning = true;
      startX = event.clientX - offsetX;
      startY = event.clientY - offsetY;
      newWrapper.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    this.flowchartCleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }


  // Playtest trigger
  async testPlay() {
    
    // Save project changes before playtest
    if (!await this.saveProject()) {
      alert('Preview was not opened because the project is not saved to disk.');
      return;
    }

    const url = `/index.html?project=${this.projectId || 'demo'}&playtest=true&_t=${Date.now()}`;
    window.open(url, '_blank');
  }

  // Package project into Zip file
  async packageGame() {
    this.playSynthSFX('ending');
    this.updateSaveStatus("Packaging project...");
    this.showToast("Compiling package... Please wait.", 60000);

    if (!await this.saveProject()) {
      this.showToast("Export stopped: save failed", 3000);
      return;
    }

    try {
      const checkResponse = await fetch(`/api/package/check?id=${encodeURIComponent(this.projectId || 'demo')}`);
      const check = await checkResponse.json();
      if (checkResponse.ok && check.success && check.warnings && check.warnings.length) {
        const singleWarnings = check.warnings.filter(item => item.reason === 'single-asset-size').map(item => `${item.type}/${item.filename} (${this.formatAssetBytes(item.size)})`);
        const totalWarning = check.warnings.some(item => item.reason === 'total-asset-size') ? `\nTotal uploaded media: ${this.formatAssetBytes(check.totalBytes)}` : '';
        const message = `Some assets are large and may make the packaged game slow to download or load.${totalWarning}${singleWarnings.length ? `\n\nLarge files:\n${singleWarnings.join('\n')}` : ''}\n\nPackage anyway?`;
        if (!confirm(message)) {
          this.updateSaveStatus('Saved to disk');
          this.showToast('Packaging cancelled');
          return;
        }
      }
      const response = await fetch(`/api/package?id=${this.projectId || 'demo'}`, { method: 'POST' });
      if (!response.ok) throw new Error("Packaging API failed");
      const res = await response.json();

      this.updateSaveStatus("Saved to disk");
      this.showToast("Game packaged! Starting download...", 4000);

      // Open download URL
      window.location.href = res.downloadUrl;
    } catch (e) {
      alert("Failed to package game. Running offline sandbox? Export is only supported in local server mode.");
      this.showToast("Packaging failed!", 3000);
    }
  }

  playSynthSFX(type) {
    if (type === 'click') return;
    // Simple Web Audio oscillator beep
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(type === 'click' ? 440 : 880, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  }

  showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.remove('hidden');
    
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => { toast.classList.add('hidden'); }, duration);
  }

  // Event bindings
  bindEvents() {
    // Top Bar bindings
    document.getElementById('btn-save-project').onclick = () => this.saveProject(true);
    document.getElementById('btn-undo').onclick = () => this.undo();
    document.getElementById('btn-redo').onclick = () => this.redo();
    document.getElementById('btn-restore-project').onclick = () => this.openRecoveryModal();
    document.getElementById('btn-export-source').onclick = () => this.exportSourceProject();
    document.getElementById('btn-test-play').onclick = () => this.testPlay();
    document.getElementById('btn-package-game').onclick = () => this.packageGame();

    const autoLayoutBtn = document.getElementById('btn-flowchart-auto-layout');
    if (autoLayoutBtn) {
      autoLayoutBtn.onclick = () => {
        delete this.project.config.flowchartPositions;
        this.renderFlowchart();
        this.triggerAutoSave();
      };
    }
    
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.onclick = () => this.toggleEditorTheme();
    }

    const paletteBtn = document.getElementById('btn-palette-picker');
    if (paletteBtn) {
      paletteBtn.onclick = (event) => {
        event.stopPropagation();
        this.togglePaletteMenu();
      };
    }

    document.querySelectorAll('.palette-option').forEach((option) => {
      option.onclick = () => {
        // The editor palette is intentionally separate from the novel player's
        // Interface Accent Color in Novel Settings.
        this.applyEditorPalette(option.dataset.palette, false);
        this.showToast(`Using ${option.dataset.palette} accent palette`);
        const menu = document.getElementById('palette-menu');
        const picker = document.getElementById('btn-palette-picker');
        if (menu) menu.classList.add('hidden');
        if (picker) picker.setAttribute('aria-expanded', 'false');
      };
    });

    document.addEventListener('click', (event) => {
      const picker = document.querySelector('.palette-picker');
      const menu = document.getElementById('palette-menu');
      const button = document.getElementById('btn-palette-picker');
      if (picker && menu && !picker.contains(event.target)) {
        menu.classList.add('hidden');
        if (button) button.setAttribute('aria-expanded', 'false');
      }
    });
    
    const guideBtn = document.getElementById('btn-open-guide');
    if (guideBtn) {
      guideBtn.onclick = () => this.openGuideModal();
    }

    const dashboardCreateBtn = document.getElementById('btn-dashboard-create');
    if (dashboardCreateBtn) {
      dashboardCreateBtn.onclick = () => this.openCreateProjectModal();
    }

    const dashboardImportBtn = document.getElementById('btn-dashboard-import');
    const projectImportInput = document.getElementById('project-import-input');
    if (dashboardImportBtn && projectImportInput) {
      dashboardImportBtn.onclick = () => projectImportInput.click();
      projectImportInput.onchange = () => {
        const file = projectImportInput.files && projectImportInput.files[0];
        if (file) this.importSourceProject(file);
        projectImportInput.value = '';
      };
    }

    document.addEventListener('keydown', (event) => {
      if (!this.project || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.redo();
        else this.undo();
      } else if (key === 'y') {
        event.preventDefault();
        this.redo();
      }
    });
    
    // Back to dashboard
    const backBtn = document.getElementById('btn-back-dashboard');
    if (backBtn) {
      backBtn.onclick = () => {
        this.playSynthSFX('click');
        window.location.href = "editor.html";
      };
    }

    // Project creation submit
    const submitCreateBtn = document.getElementById('btn-submit-create-project');
    if (submitCreateBtn) {
      submitCreateBtn.onclick = () => {
        this.playSynthSFX('click');
        const id = document.getElementById('project-create-id').value.trim();
        const title = document.getElementById('project-create-title').value.trim();
        const author = document.getElementById('project-create-author').value.trim();
        this.createNewProject(id, title, author);
      };
    }

    document.getElementById('project-title-input').oninput = (event) => {
      if (this.project) this.project.title = event.target.value;
      this.triggerAutoSave();
    };
    document.getElementById('project-author-input').oninput = (event) => {
      if (this.project) this.project.author = event.target.value;
      this.triggerAutoSave();
    };

    // Scene Meta inputs
    document.getElementById('scene-name-input').oninput = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].name = e.target.value;
        this.refreshScenesTree();
        this.triggerAutoSave();
      }
    };

    document.getElementById('scene-bg-select').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].background = e.target.value;
        this.triggerAutoSave();
        if (this.activeStepIndex !== null) {
          this.renderPreview(this.project.scenes[this.activeSceneId].dialogue[this.activeStepIndex]);
        }
      }
    };

    document.getElementById('scene-music-select').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].music = e.target.value;
        this.triggerAutoSave();
      }
    };

    // Endings checkboxes
    const endingBox = document.getElementById('scene-is-ending');
    endingBox.onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        const isEnding = e.target.checked;
        this.project.scenes[this.activeSceneId].isEnding = isEnding;
        const endingGroup = document.getElementById('ending-name-group');
        if (isEnding) {
          endingGroup.classList.remove('hidden');
          const input = document.getElementById('scene-ending-name');
          this.project.scenes[this.activeSceneId].endingName = input.value || "Standard Ending";
          
          const sfxSelect = document.getElementById('scene-ending-sfx');
          if (sfxSelect) {
            while (sfxSelect.options.length > 2) sfxSelect.remove(2);
            (this.project.assets.sound || []).forEach(asset => {
              const opt = document.createElement('option');
              opt.value = asset.id;
              opt.innerText = asset.name || asset.id;
              sfxSelect.appendChild(opt);
            });
            sfxSelect.value = this.project.scenes[this.activeSceneId].endingSfx || "";
          }
        } else {
          endingGroup.classList.add('hidden');
          delete this.project.scenes[this.activeSceneId].endingName;
          delete this.project.scenes[this.activeSceneId].endingSfx;
        }
        this.triggerAutoSave();
      }
    };

    const transitionStyleSelect = document.getElementById('scene-transition-style');
    if (transitionStyleSelect) {
      transitionStyleSelect.onchange = (e) => {
        if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
          const val = e.target.value;
          this.project.scenes[this.activeSceneId].sceneTransition = val;
          // Maintain legacy compatibility
          this.project.scenes[this.activeSceneId].fadeOutScene = (val === 'fade');
          this.triggerAutoSave();
        }
      };
    }

    const slideDownBoxElem = document.getElementById('scene-slide-down');
    if (slideDownBoxElem) {
      slideDownBoxElem.onchange = (e) => {
        if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
          this.project.scenes[this.activeSceneId].slideDownAnimation = e.target.checked;
          this.triggerAutoSave();
        }
      };
    }

    const charTransitionSelect = document.getElementById('scene-char-transition');
    if (charTransitionSelect) {
      charTransitionSelect.onchange = (e) => {
        if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
          this.project.scenes[this.activeSceneId].characterTransition = e.target.value;
          this.triggerAutoSave();
        }
      };
    }

    const imgAutoProgressBox = document.getElementById('scene-image-autoprogress');
    if (imgAutoProgressBox) {
      imgAutoProgressBox.onchange = (e) => {
        if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
          this.project.scenes[this.activeSceneId].autoProgressImage = e.target.checked;
          this.triggerAutoSave();
        }
      };
    }

    const imgAutoProgressDurationInput = document.getElementById('scene-image-autoprogress-duration');
    if (imgAutoProgressDurationInput) {
      imgAutoProgressDurationInput.oninput = (e) => {
        if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
          this.project.scenes[this.activeSceneId].autoProgressDuration = parseFloat(e.target.value) || 0;
          this.triggerAutoSave();
        }
      };
    }

    const noDimBoxElem = document.getElementById('scene-no-dim-characters');
    if (noDimBoxElem) {
      noDimBoxElem.onchange = (e) => {
        if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
          this.project.scenes[this.activeSceneId].noDimCharacters = e.target.checked;
          this.triggerAutoSave();
          const activeStep = this.project.scenes[this.activeSceneId].dialogue[this.activeStepIndex];
          if (activeStep) this.renderPreview(activeStep);
        }
      };
    }

    document.getElementById('scene-ending-name').oninput = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].endingName = e.target.value;
        this.triggerAutoSave();
      }
    };

    document.getElementById('scene-ending-sfx').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].endingSfx = e.target.value;
        this.triggerAutoSave();
      }
    };

    document.getElementById('scene-mode-select').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        const mode = e.target.value;
        const scene = this.project.scenes[this.activeSceneId];
        
        if (mode === 'normal') {
          scene.isCutscene = false;
          delete scene.cutsceneType;
          delete scene.video;
        } else if (mode === 'video') {
          scene.isCutscene = true;
          scene.cutsceneType = 'video';
          const select = document.getElementById('scene-video-select');
          scene.video = select.value || "";
        } else if (mode === 'text' || mode === 'autotext') {
          scene.isCutscene = true;
          scene.cutsceneType = mode;
          delete scene.video;
          
          // Convert existing dialogues to narrator-only and clear sprites layout
          if (scene.dialogue) {
            scene.dialogue.forEach(step => {
              step.speaker = 'narrator';
              step.layout = { left: null, center: null, right: null };
              if (mode === 'autotext' && step.duration === undefined) {
                step.duration = 3;
              }
            });
          }
        } else if (mode === 'image') {
          scene.isCutscene = true;
          scene.cutsceneType = 'image';
          delete scene.video;
        }
        
        this.triggerAutoSave();
        this.selectScene(this.activeSceneId);
      }
    };

    document.getElementById('scene-video-select').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].video = e.target.value;
        this.triggerAutoSave();
        this.renderPreview(null);
      }
    };

    document.getElementById('scene-text-color').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].textColor = e.target.value;
        this.triggerAutoSave();
        const scene = this.project.scenes[this.activeSceneId];
        const step = (scene.dialogue && this.activeStepIndex !== null) ? scene.dialogue[this.activeStepIndex] : null;
        this.renderPreview(step);
      }
    };

    document.getElementById('scene-font-select').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        const fontVal = e.target.value;
        this.project.scenes[this.activeSceneId].fontFamily = fontVal;
        e.target.style.fontFamily = fontVal;
        this.triggerAutoSave();
        const scene = this.project.scenes[this.activeSceneId];
        const step = (scene.dialogue && this.activeStepIndex !== null) ? scene.dialogue[this.activeStepIndex] : null;
        this.renderPreview(step);
        this.renderTimeline();
      }
    };

    document.getElementById('scene-next-select').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].nextSceneId = e.target.value;
        this.triggerAutoSave();
      }
    };

    document.getElementById('scene-hide-quick-menu').onchange = (e) => {
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].hideQuickMenu = e.target.checked;
        this.triggerAutoSave();
      }
    };

    // Branching Mode Radio inputs
    document.getElementById('branch-mode-linear').onchange = () => {
      document.getElementById('panel-branch-linear').classList.remove('hidden');
      document.getElementById('panel-branch-choices').classList.add('hidden');
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        this.project.scenes[this.activeSceneId].choices = [];
        this.triggerAutoSave();
      }
    };

    document.getElementById('branch-mode-choices').onchange = () => {
      document.getElementById('panel-branch-linear').classList.add('hidden');
      document.getElementById('panel-branch-choices').classList.remove('hidden');
      if (this.activeSceneId && this.project.scenes[this.activeSceneId]) {
        const choices = this.project.scenes[this.activeSceneId].choices || [];
        if (choices.length === 0) {
          this.addSceneChoice();
        } else {
          this.renderChoicesBuilder();
        }
      }
    };

    // Dialogue Buttons
    document.getElementById('btn-add-dialogue-step').onclick = () => this.addDialogueStep();
    document.getElementById('btn-add-scene-choice').onclick = () => this.addSceneChoice();
    document.getElementById('btn-add-scene-condition').onclick = () => this.addSceneCondition();
    document.getElementById('btn-add-scene').onclick = () => this.addScene();
    document.getElementById('btn-add-scene-group').onclick = () => this.addSceneGroup();
    document.getElementById('btn-open-asset-management').onclick = () => this.openAssetManagement();
    document.getElementById('btn-open-scene-management-sidebar').onclick = () => this.openSceneManagement();
    document.getElementById('btn-open-scene-management').onclick = () => this.openSceneManagement();
    document.getElementById('btn-open-scene-settings').onclick = () => this.openSceneSettings();
    document.getElementById('btn-duplicate-scene').onclick = () => this.activeSceneId && this.duplicateScene(this.activeSceneId);
    
    // Character button
    document.getElementById('btn-add-character').onclick = () => this.openCharacterModal();
    document.getElementById('btn-save-character').onclick = () => this.saveCharacter();
    document.getElementById('btn-add-char-sprite').onclick = () => {
      this.addExpressionRow('', '', '');
    };
    
    // Character Modal live preview bindings
    document.getElementById('char-name-input').oninput = () => this.updateCharModalPreview();
    document.getElementById('char-color-input').oninput = () => this.updateCharModalPreview();
    document.getElementById('char-scale-slider').oninput = () => this.updateCharModalPreview();

    // Asset File Uploader change
    document.getElementById('asset-file-uploader').onchange = (e) => {
      const file = e.target.files[0];
      this.handleAssetUpload(file);
    };

    const bulkUploader = document.getElementById('asset-bulk-uploader');
    if (bulkUploader) bulkUploader.onchange = event => this.handleBulkAssetUpload(event.target.files);
    const bulkUploadButton = document.getElementById('btn-bulk-asset-upload');
    if (bulkUploadButton && bulkUploader) bulkUploadButton.onclick = () => bulkUploader.click();
    const newFolderButton = document.getElementById('btn-new-asset-folder');
    if (newFolderButton) newFolderButton.onclick = () => this.createAssetFolder();
    document.getElementById('btn-select-visible-assets').onclick = () => this.selectVisibleAssets();
    document.getElementById('btn-clear-asset-selection').onclick = () => this.clearAssetSelection();
    document.getElementById('btn-apply-asset-folder').onclick = () => this.applyBulkAssetFolder();
    document.getElementById('btn-apply-asset-tags').onclick = () => this.applyBulkAssetTags();
    document.getElementById('btn-delete-selected-assets').onclick = () => this.deleteSelectedAssets();

    document.getElementById('scene-management-search').oninput = () => this.renderSceneManagement();
    document.getElementById('scene-management-status-filter').onchange = () => this.renderSceneManagement();
    document.getElementById('scene-management-group-filter').onchange = () => this.renderSceneManagement();
    document.getElementById('btn-select-visible-scenes').onclick = () => this.selectVisibleScenes();
    document.getElementById('btn-clear-scene-selection').onclick = () => this.clearSceneSelection();
    document.getElementById('btn-apply-scene-group').onclick = () => this.applyBulkSceneGroup();
    document.getElementById('btn-apply-scene-status').onclick = () => this.applyBulkSceneStatus();
    document.getElementById('btn-delete-selected-scenes').onclick = () => this.deleteSelectedScenes();
    document.getElementById('btn-manage-add-scene').onclick = () => this.addScene();
    document.getElementById('btn-manage-add-group').onclick = () => this.addSceneGroup();



    // Scene Search Input
    const sceneSearch = document.getElementById('scene-search-input');
    if (sceneSearch) {
      sceneSearch.oninput = () => {
        this.refreshScenesTree();
      };
    }

    // Asset Search Inputs
    const assetSearches = [
      'search-asset-bg',
      'search-asset-char',
      'search-asset-music',
      'search-asset-sound',
      'search-asset-video'
    ];
    assetSearches.forEach(id => {
      const elem = document.getElementById(id);
      if (elem) {
        elem.oninput = () => {
          this.renderAssetsTab();
        };
      }
    });
    ['asset-manager-search', 'asset-manager-tag-filter', 'asset-manager-folder-filter', 'asset-manager-favorites-only', 'asset-manager-sort'].forEach(id => {
      const elem = document.getElementById(id);
      if (!elem) return;
      elem.oninput = () => this.renderAssetsTab();
      elem.onchange = () => this.renderAssetsTab();
    });

    // Inspector Speaker Select
    document.getElementById('step-speaker-select').onchange = (e) => {
      if (this.activeSceneId && this.activeStepIndex !== null) {
        this.updateStepSpeaker(this.activeStepIndex, e.target.value);
      }
    };

    // Inspector Voice Select
    const stepVoiceSelect = document.getElementById('step-voice-select');
    if (stepVoiceSelect) {
      stepVoiceSelect.onchange = (e) => {
        if (this.activeStepIndex !== null) {
          const scene = this.project.scenes[this.activeSceneId];
          const val = e.target.value;
          if (val) {
            scene.dialogue[this.activeStepIndex].voice = val;
          } else {
            delete scene.dialogue[this.activeStepIndex].voice;
          }
          this.triggerAutoSave();
          this.selectDialogueStep(this.activeStepIndex);
        }
      };
    }

    // Inspector Text Formatting Checkboxes
    const boldChk = document.getElementById('step-bold-checkbox');
    const italicChk = document.getElementById('step-italic-checkbox');
    const underlineChk = document.getElementById('step-underline-checkbox');
    
    if (boldChk && italicChk && underlineChk) {
      const handleStylingChange = () => {
        if (this.activeSceneId && this.activeStepIndex !== null) {
          const scene = this.project.scenes[this.activeSceneId];
          const step = scene.dialogue[this.activeStepIndex];
          step.bold = boldChk.checked;
          step.italic = italicChk.checked;
          step.underline = underlineChk.checked;
          this.triggerAutoSave();
          this.renderPreview(step);
          this.renderTimeline();
        }
      };
      
      boldChk.onchange = handleStylingChange;
      italicChk.onchange = handleStylingChange;
      underlineChk.onchange = handleStylingChange;
    }

    // Settings elements input change trigger save
    const settingsInputs = [
      'settings-kinetic-mode',
      'settings-text-speed',
      'settings-start-scene',
      'settings-launch-behavior',
      'settings-ui-click-sound',
      'settings-ui-theme',
      'settings-ui-accent',
      'settings-title-bg',
      'settings-title-music',
      'settings-title-color',
      'settings-title-layout',
      'settings-menu-font-size',
      'settings-hide-title-text',
      'settings-no-shading',
      'settings-menu-btn-color',
      'settings-menu-btn-border',
      'settings-menu-btn-bg-style',
      'settings-menu-btn-bg-color',
      'settings-menu-btn-bg-opacity',
      'settings-credits-bg',
      'settings-credits-music',
      'settings-credits-text',
      'settings-credits-no-shading',
      'settings-credits-no-dimming',
      'settings-gallery-enabled',
      'settings-gallery-chars-enabled',
      'settings-gallery-bgs-enabled',
      'settings-music-enabled',
      'settings-debug-mode'
    ];
    settingsInputs.forEach(id => {
      const elem = document.getElementById(id);
      if (!elem) return;
      elem.onchange = () => {
        if (id === 'settings-gallery-enabled') {
          this.toggleUnlockablesToggles();
        }
        this.saveProject(true);
        if (id === 'settings-ui-theme' && this.activeSceneId) {
          const scene = this.project.scenes[this.activeSceneId];
          const step = scene && scene.dialogue && this.activeStepIndex !== null ? scene.dialogue[this.activeStepIndex] : null;
          this.renderPreview(step);
        }
        if (id === 'settings-kinetic-mode') {
          // Refresh active scene layout because branching display gets modified
          if (this.activeSceneId) this.selectScene(this.activeSceneId);
        }
      };
      if ((elem.tagName === 'INPUT' && elem.type === 'number') || elem.tagName === 'TEXTAREA') {
        elem.oninput = () => {
          if (id === 'settings-text-speed') this.project.config.textSpeed = parseInt(elem.value) || 40;
          if (id === 'settings-credits-text') {
            this.project.config.credits = this.project.config.credits || {};
            this.project.config.credits.text = elem.value;
          }
          this.triggerAutoSave();
        };
      }
    });
  }

  escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  }

  exportSourceProject(projectId = this.projectId) {
    if (!projectId) return;
    window.location.href = `/api/project/export?id=${encodeURIComponent(projectId)}`;
  }

  async openRecoveryModal() {
    if (!this.projectId) return;
    const modal = document.getElementById('project-recovery-modal');
    const list = document.getElementById('project-recovery-list');
    modal.classList.remove('hidden');
    list.innerHTML = '<div class="recovery-empty">Loading previous versions…</div>';
    try {
      const response = await fetch(`/api/project/recovery?id=${encodeURIComponent(this.projectId)}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not load recovery versions');
      if (window.VNFairyEditorViews) {
        window.VNFairyEditorViews.renderRecoveryList(list, result.snapshots, snapshotId => this.restoreProjectSnapshot(snapshotId));
      }
    } catch (err) {
      list.innerHTML = `<div class="recovery-empty error">${this.escapeHtml(err.message)}</div>`;
    }
  }

  async restoreProjectSnapshot(snapshotId) {
    if (!confirm('Restore this previous version? Your current version will remain available in recovery.')) return;
    this.updateSaveStatus('Saving…');
    try {
      const response = await fetch(`/api/project/restore?id=${encodeURIComponent(this.projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Restore failed');
      document.getElementById('project-recovery-modal').classList.add('hidden');
      await this.refreshAssets();
      this.finishProjectLoad(result.project, 'Saved to disk');
      localStorage.removeItem(this.localRecoveryKey());
      this.showToast('Previous version restored');
    } catch (err) {
      this.updateSaveStatus('Save failed', true);
      alert(`Restore failed: ${err.message}`);
    }
  }

  async importSourceProject(file) {
    if (!file.name.toLowerCase().endsWith('.vnfairy')) {
      alert('Choose a .vnfairy source project. Playable game ZIP files cannot be imported here.');
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const response = await fetch('/api/project/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: btoa(binary) })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Import failed');
      this.showToast(`Imported ${result.title}`);
      await this.loadProjectsList();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  }

  async renameProject(id, currentTitle) {
    const title = prompt('Rename story', currentTitle);
    if (title === null || !title.trim() || title.trim() === currentTitle) return;
    await this.runDashboardAction(`/api/project/rename?id=${encodeURIComponent(id)}`, { title: title.trim() }, 'Story renamed');
  }

  async duplicateProject(id, currentTitle) {
    const title = prompt('Title for the duplicate', `${currentTitle} Copy`);
    if (title === null || !title.trim()) return;
    await this.runDashboardAction(`/api/project/duplicate?id=${encodeURIComponent(id)}`, { title: title.trim() }, 'Story duplicated');
  }

  async setProjectArchived(id, archived) {
    const verb = archived ? 'Archive' : 'Restore';
    if (!confirm(`${verb} this story?`)) return;
    await this.runDashboardAction(`/api/project/archive?id=${encodeURIComponent(id)}`, { archived }, archived ? 'Story archived' : 'Story restored');
  }

  async runDashboardAction(url, payload, successMessage) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Project action failed');
      this.showToast(successMessage);
      await this.loadProjectsList();
    } catch (err) {
      alert(`${successMessage} failed: ${err.message}`);
    }
  }

  openCreateProjectModal() {
    document.getElementById('project-create-id').value = "";
    document.getElementById('project-create-title').value = "";
    document.getElementById('project-create-author').value = "";
    document.getElementById('project-create-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('project-create-title')?.focus(), 0);
  }

  // Fetch and display all projects on the server
  async loadProjectsList() {
    const listGrid = document.getElementById('projects-list-grid');
    if (!listGrid) return;
    listGrid.innerHTML = "";

    try {
      const response = await fetch('/api/projects?includeArchived=1');
      if (!response.ok) throw new Error("Failed to load projects list");
      const projects = await response.json();

      const renderSection = (sectionProjects, label) => {
        if (!sectionProjects.length) return;
        const heading = document.createElement('h2');
        heading.className = 'project-section-heading';
        heading.textContent = label;
        listGrid.appendChild(heading);
        sectionProjects.forEach((proj, index) => {
        const card = document.createElement('div');
        card.className = `project-card glass-panel${proj.archived ? ' is-archived' : ''}`;
        
        card.innerHTML = `
          <div class="project-card-header">
            <span class="project-card-icon">${proj.archived ? 'Archived' : `Story ${String(index + 1).padStart(2, '0')}`}</span>
            <div class="project-card-title">${this.escapeHtml(proj.title)}</div>
            <div class="project-card-author">by ${this.escapeHtml(proj.author)}</div>
          </div>
          <div class="project-card-actions">
            <a href="editor.html?project=${proj.id}" class="btn-primary">Open editor</a>
            <a href="index.html?project=${proj.id}" target="_blank" class="btn-secondary">Preview</a>
          </div>
          <div class="project-card-secondary-actions">
            <button type="button" data-action="rename">Rename</button>
            <button type="button" data-action="duplicate">Duplicate</button>
            ${proj.id !== 'demo' ? `<button type="button" data-action="archive">${proj.archived ? 'Unarchive' : 'Archive'}</button>` : ''}
            <button type="button" data-action="export">Export source</button>
          </div>
        `;

        card.querySelector('[data-action="rename"]').onclick = () => this.renameProject(proj.id, proj.title);
        card.querySelector('[data-action="duplicate"]').onclick = () => this.duplicateProject(proj.id, proj.title);
        const archiveButton = card.querySelector('[data-action="archive"]');
        if (archiveButton) archiveButton.onclick = () => this.setProjectArchived(proj.id, !proj.archived);
        card.querySelector('[data-action="export"]').onclick = () => this.exportSourceProject(proj.id);

        // Add delete button only if it's not the default demo project
        if (proj.id !== 'demo') {
          const delBtn = document.createElement('button');
          delBtn.className = "btn-delete-project";
          delBtn.innerHTML = "×";
          delBtn.title = "Delete Project";
          delBtn.setAttribute('aria-label', `Delete ${proj.title}`);
          delBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete the project "${proj.title}"? This cannot be undone.`)) {
              this.deleteProject(proj.id);
            }
          };
          card.appendChild(delBtn);
        }

        listGrid.appendChild(card);
        });
      };

      renderSection(projects.filter(project => !project.archived), 'Active stories');
      renderSection(projects.filter(project => project.archived), 'Archived stories');
    } catch (e) {
      console.warn("Could not load projects from server.", e);
    }

    // Always add the "Create New Project" card at the end
    const createCard = document.createElement('button');
    createCard.className = "create-card";
    createCard.type = "button";
    createCard.onclick = () => this.openCreateProjectModal();
    createCard.innerHTML = `
      <div class="create-card-icon">+</div>
      <strong>New story</strong>
      <small>Start a blank visual novel project</small>
    `;
    listGrid.appendChild(createCard);
  }

  // Create a new project file on the server
  async createNewProject(id, title, author) {
    if (!id || !title) {
      alert("Project ID and Title are required.");
      return;
    }
    
    try {
      const response = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title, author })
      });
      const res = await response.json();
      if (!res.success) throw new Error(res.error);

      // Close modal and redirect to editor with new project ID
      document.getElementById('project-create-modal').classList.add('hidden');
      window.location.href = `editor.html?project=${res.id}`;
    } catch (e) {
      alert("Failed to create project: " + e.message);
    }
  }

  // Delete project from server
  async deleteProject(id) {
    try {
      const response = await fetch(`/api/project/delete?id=${id}`, {
        method: 'POST'
      });
      const res = await response.json();
      if (!res.success) throw new Error(res.error);
      
      this.showToast("Project deleted!");
      await this.loadProjectsList();
    } catch (e) {
      alert("Failed to delete project: " + e.message);
    }
  }

  // --- Universal Searchable Asset Selection Modal Engine ---

  convertAllAssetSelects() {
    const selects = document.querySelectorAll('select[data-asset-type]');
    selects.forEach(select => {
      this.convertSelect(select);
    });
  }

  convertSelect(select) {
    if (!select) return;
    const assetType = select.getAttribute('data-asset-type');
    
    // Check if already converted
    let wrapper = select.nextElementSibling;
    if (!wrapper || !wrapper.classList.contains('custom-select-wrapper')) {
      // Hide original select
      select.style.display = 'none';
      
      // Create wrapper
      wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper';
      select.classList.forEach(cls => {
        if (cls !== 'select-input') {
          wrapper.classList.add(cls);
        }
      });
      wrapper.style.display = 'inline-block';
      wrapper.style.width = select.style.width || '100%';
      if (select.style.flexGrow) wrapper.style.flexGrow = select.style.flexGrow;
      if (select.style.flexShrink) wrapper.style.flexShrink = select.style.flexShrink;
      if (select.style.flexBasis) wrapper.style.flexBasis = select.style.flexBasis;
      if (select.style.minWidth) wrapper.style.minWidth = select.style.minWidth;
      if (select.style.minHeight) wrapper.style.minHeight = select.style.minHeight;
      
      // Insert wrapper as sibling after select
      select.parentNode.insertBefore(wrapper, select.nextSibling);
      
      // Define getter/setter for value to sync with custom UI
      const originalValueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      const self = this;
      Object.defineProperty(select, 'value', {
        get() {
          return originalValueDescriptor.get.call(this);
        },
        set(newValue) {
          originalValueDescriptor.set.call(this, newValue);
          self.syncCustomPicker(this);
        },
        configurable: true
      });
    }
    
    this.syncCustomPicker(select);
  }

  syncCustomPicker(select) {
    const wrapper = select.nextElementSibling;
    if (!wrapper || !wrapper.classList.contains('custom-select-wrapper')) return;
    
    if (select.classList.contains('hidden')) {
      wrapper.classList.add('hidden');
      wrapper.style.display = 'none';
      return;
    } else {
      wrapper.classList.remove('hidden');
      wrapper.style.display = 'inline-block';
    }
    
    const val = select.value;
    const selectedOpt = select.options[select.selectedIndex] || select.options[0];
    const label = selectedOpt ? selectedOpt.text : (val || "Select...");
    const assetType = select.getAttribute('data-asset-type');
    
    // Check if optional (has empty value option)
    const hasEmptyOption = Array.from(select.options).some(opt => opt.value === "");
    const showClear = hasEmptyOption && val !== "";
    
    const thumbHtml = this.getAssetThumbHtml(assetType, val, select);
    
    wrapper.innerHTML = `
      <div class="custom-select-btn" title="${label}">
        ${thumbHtml}
        <span class="select-label-text">${label}</span>
        ${showClear ? `<button type="button" class="select-clear-btn" title="Clear">&times;</button>` : ''}
        <span class="select-arrow-icon">▼</span>
      </div>
    `;
    
    const btn = wrapper.querySelector('.custom-select-btn');
    btn.onclick = (e) => {
      if (e.target.classList.contains('select-clear-btn')) {
        e.stopPropagation();
        select.value = "";
        select.dispatchEvent(new Event('change'));
        return;
      }
      this.openUniversalSelectModal(select);
    };
  }

  getAssetThumbHtml(assetType, value, select) {
    if (!value) {
      return `<div class="select-preview-thumb muted">—</div>`;
    }
    
    const projectId = this.projectId || 'demo';
    
    if (value.startsWith('data/')) {
      if (value.includes('/bg/') || value.includes('/char/')) {
        return `<div class="select-preview-thumb" style="background-image: url('${value}');"></div>`;
      } else if (value.includes('/music/')) {
        return `<div class="select-preview-thumb">M</div>`;
      } else if (value.includes('/sound/')) {
        return `<div class="select-preview-thumb">S</div>`;
      }
    }
    
    if (assetType === 'bg') {
      if (value === '__solid_white__') {
        return `<div class="select-preview-thumb solid-white-preview" title="Solid white background"></div>`;
      }
      const file = (this.assets.bg || []).find(f => f.replace(/\.[^/.]+$/, "") === value);
      if (file) {
        const path = `data/projects/${projectId}/assets/bg/${file}`;
        return `<div class="select-preview-thumb" style="background-image: url('${path}');"></div>`;
      }
    } else if (assetType === 'music') {
      return `<div class="select-preview-thumb">M</div>`;
    } else if (assetType === 'sound') {
      return `<div class="select-preview-thumb">S</div>`;
    } else if (assetType === 'video') {
      return `<div class="select-preview-thumb">V</div>`;
    } else if (assetType === 'char' || assetType === 'speaker') {
      if (assetType === 'speaker' && value === 'narrator') {
        return `<div class="select-preview-thumb speaker-narrator-thumb">N</div>`;
      }
      const char = (this.project.assets.characters || []).find(c => c.id === value);
      if (char && char.sprites && char.sprites.length > 0) {
        return `<div class="select-preview-thumb" style="background-image: url('${char.sprites[0].path}'); background-size: contain; background-repeat: no-repeat;"></div>`;
      }
      return `<div class="select-preview-thumb">C</div>`;
    } else if (assetType === 'expression') {
      const pos = select.getAttribute('data-slot-pos');
      const charSelect = document.getElementById(`slot-${pos}-char`);
      const charId = charSelect ? charSelect.value : "";
      const char = (this.project.assets.characters || []).find(c => c.id === charId);
      if (char && char.sprites) {
        const sprite = char.sprites.find(s => s.id === value);
        if (sprite) {
          return `<div class="select-preview-thumb" style="background-image: url('${sprite.path}'); background-size: contain; background-repeat: no-repeat;"></div>`;
        }
      }
    } else if (assetType === 'char-sprite-file') {
      const path = `data/projects/${projectId}/assets/char/${value}`;
      return `<div class="select-preview-thumb" style="background-image: url('${path}'); background-size: contain; background-repeat: no-repeat;"></div>`;
    } else if (assetType === 'scene') {
      const scene = this.project.scenes[value];
      if (scene && scene.background) {
        const bgFile = (this.assets.bg || []).find(f => f.replace(/\.[^/.]+$/, "") === scene.background);
        if (bgFile) {
          const path = `data/projects/${projectId}/assets/bg/${bgFile}`;
          return `<div class="select-preview-thumb" style="background-image: url('${path}');"></div>`;
        }
      }
      return `<div class="select-preview-thumb">SC</div>`;
    }
    
    return `<div class="select-preview-thumb">F</div>`;
  }

  openUniversalSelectModal(select) {
    this.activeAssetReplacement = null;
    this.activeUniversalSelect = select;
    const assetType = select.getAttribute('data-asset-type');
    const titleText = this.universalSelectTitle(assetType);
    this.presentUniversalSelectModal(assetType, titleText, true);
  }

  universalSelectTitle(assetType) {
    if (assetType === 'bg') return 'Select Background';
    if (assetType === 'music') return 'Select Music BGM';
    if (assetType === 'sound') return 'Select Sound / Voice Clip';
    if (assetType === 'video') return 'Select Video Cutscene';
    if (assetType === 'char') return 'Select Character';
    if (assetType === 'speaker') return 'Select Speaker';
    if (assetType === 'expression') return 'Select Character Expression';
    if (assetType === 'char-sprite-file') return 'Select Sprite Image File';
    if (assetType === 'scene') return 'Select Destination Scene';
    if (assetType === 'ending') return 'Select Ending Trigger';
    return 'Select Option';
  }

  presentUniversalSelectModal(assetType, titleText, allowUpload = true) {
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      const previousButton = this.previewAudioElement.btn;
      if (previousButton) previousButton.innerText = '▶ Preview';
      this.previewAudioElement = null;
    }
    
    const modal = document.getElementById('universal-select-modal');
    modal.classList.remove('hidden');
    
    const title = document.getElementById('universal-modal-title');
    title.innerText = titleText;

    const description = document.getElementById('universal-modal-description');
    if (description) {
      const replacement = this.activeAssetReplacement;
      description.textContent = replacement
        ? `Choose a replacement for “${replacement.filename}”. References will be updated after you select an asset.`
        : '';
      description.classList.toggle('hidden', !replacement);
    }
    
    const searchInput = document.getElementById('universal-search-input');
    searchInput.placeholder = assetType === 'speaker' ? 'Search speakers...' : `Search ${titleText.toLowerCase()}...`;
    searchInput.value = "";
    
    const uploadBtn = document.getElementById('universal-upload-btn');
    const uploadTypes = {
      'bg': 'bg',
      'music': 'music',
      'sound': 'sound',
      'video': 'video',
      'char-sprite-file': 'char'
    };
    if (allowUpload && uploadTypes[assetType]) {
      uploadBtn.style.display = 'block';
      uploadBtn.onclick = () => {
        this.triggerAssetUpload(uploadTypes[assetType]);
      };
    } else {
      uploadBtn.style.display = 'none';
    }
    
    searchInput.oninput = (e) => {
      this.renderUniversalSelectModalList(e.target.value);
    };
    
    this.renderUniversalSelectModalList();
  }

  renderUniversalSelectModalList(filter = "") {
    const select = this.activeUniversalSelect;
    if (!select) return;
    const assetType = select.getAttribute('data-asset-type');
    const currentVal = select.value;
    const isReplacementMode = !!this.activeAssetReplacement;
    
    const list = document.getElementById('universal-modal-list');
    list.innerHTML = "";
    
    const options = Array.from(select.options).filter(option => assetType !== 'speaker' || option.value);
    const filteredOptions = options.filter(opt => 
      opt.text.toLowerCase().includes(filter.toLowerCase()) || 
      opt.value.toLowerCase().includes(filter.toLowerCase())
    );
    
    if (filteredOptions.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = "muted";
      emptyMsg.style.textAlign = "center";
      emptyMsg.style.padding = "20px";
      emptyMsg.innerText = "No matching items found.";
      list.appendChild(emptyMsg);
      return;
    }
    
    const modalContent = document.querySelector('#universal-select-modal .modal-content');
    if (['bg', 'char', 'speaker', 'expression', 'char-sprite-file', 'scene'].includes(assetType)) {
      modalContent.style.maxWidth = '750px';
      list.style.display = 'grid';
      list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
      list.style.gap = '12px';
    } else {
      modalContent.style.maxWidth = '500px';
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '8px';
    }
    
    filteredOptions.forEach(opt => {
      const val = opt.value;
      const label = opt.text;
      const isCurrent = currentVal === val;
      
      const card = document.createElement('div');
      card.className = `universal-item-card ${isCurrent ? 'active-item' : ''}`;
      
      let previewHtml = "";
      let actionsHtml = "";
      const projectId = this.projectId || 'demo';
      
      if (assetType === 'bg') {
        if (val === '__solid_white__') {
          previewHtml = `<div class="universal-card-preview-image solid-white-preview" aria-label="Solid white background"></div>`;
        } else {
        const file = (this.assets.bg || []).find(f => f.replace(/\.[^/.]+$/, "") === val);
        if (file) {
          const path = `data/projects/${projectId}/assets/bg/${file}`;
          previewHtml = `<div class="universal-card-preview-image" style="background-image: url('${path}');"></div>`;
        } else {
          previewHtml = `<div class="universal-card-preview-image empty-preview">🚫</div>`;
        }
        }
      } else if (assetType === 'char' || assetType === 'speaker') {
        if (assetType === 'speaker' && val === 'narrator') {
          previewHtml = `<div class="universal-card-preview-image empty-preview speaker-narrator-preview">N</div>`;
        } else {
        const char = (this.project.assets.characters || []).find(c => c.id === val);
        if (char && char.sprites && char.sprites.length > 0) {
          previewHtml = `<div class="universal-card-preview-image char-preview" style="background-image: url('${char.sprites[0].path}'); background-size: contain;"></div>`;
        } else {
          previewHtml = `<div class="universal-card-preview-image empty-preview">👤</div>`;
        }
        }
      } else if (assetType === 'expression') {
        const pos = select.getAttribute('data-slot-pos');
        const charSelect = document.getElementById(`slot-${pos}-char`);
        const charId = charSelect ? charSelect.value : "";
        const char = (this.project.assets.characters || []).find(c => c.id === charId);
        if (char && char.sprites) {
          const sprite = char.sprites.find(s => s.id === val);
          if (sprite) {
            previewHtml = `<div class="universal-card-preview-image char-preview" style="background-image: url('${sprite.path}'); background-size: contain;"></div>`;
          } else {
            previewHtml = `<div class="universal-card-preview-image empty-preview">👤</div>`;
          }
        }
      } else if (assetType === 'char-sprite-file') {
        const path = `data/projects/${projectId}/assets/char/${val}`;
        previewHtml = `<div class="universal-card-preview-image char-preview" style="background-image: url('${path}'); background-size: contain;"></div>`;
      } else if (assetType === 'scene') {
        const scene = this.project.scenes[val];
        if (scene && scene.background) {
          const bgFile = (this.assets.bg || []).find(f => f.replace(/\.[^/.]+$/, "") === scene.background);
          if (bgFile) {
            const path = `data/projects/${projectId}/assets/bg/${bgFile}`;
            previewHtml = `<div class="universal-card-preview-image" style="background-image: url('${path}');"></div>`;
          } else {
            previewHtml = `<div class="universal-card-preview-image empty-preview">🎬</div>`;
          }
        } else {
          previewHtml = `<div class="universal-card-preview-image empty-preview">🎬</div>`;
        }
      } else if (assetType === 'music' || assetType === 'sound') {
        if (val.startsWith('data/')) {
          actionsHtml += `<button type="button" class="voice-btn-preview" onclick="window.editor.previewUniversalAssetByPath('${val}', this)">▶ Preview</button>`;
        } else {
          const folder = assetType === 'music' ? 'music' : 'sound';
          const assetsList = assetType === 'music' ? this.assets.music : this.assets.sound;
          const file = (assetsList || []).find(f => f.replace(/\.[^/.]+$/, "") === val);
          if (file) {
            actionsHtml += `<button type="button" class="voice-btn-preview" onclick="window.editor.previewUniversalAsset('${folder}', '${file}', this)">▶ Preview</button>`;
          }
        }
      } else if (assetType === 'video') {
        const file = (this.assets.video || []).find(f => f.replace(/\.[^/.]+$/, "") === val);
        if (file) {
          actionsHtml += `<button type="button" class="voice-btn-preview" onclick="window.editor.previewUniversalVideo('${file}', this)">▶ Preview</button>`;
        }
      }
      
      if (['bg', 'char', 'speaker', 'expression', 'char-sprite-file', 'scene'].includes(assetType)) {
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';
        card.style.padding = '8px';
        card.style.textAlign = 'center';
        
        card.innerHTML = `
          ${previewHtml}
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
            <div class="universal-item-title" title="${label}">${label}</div>
            <button type="button" class="voice-btn-select" style="width: 100%; margin-top: 4px;" onclick="window.editor.selectUniversalItem('${val}')">
              ${isCurrent ? 'Selected' : isReplacementMode ? 'Replace with this' : 'Select'}
            </button>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="voice-info" style="max-width: 70%;">
            <span class="voice-name" title="${label}">${label}</span>
          </div>
          <div class="voice-actions">
            ${actionsHtml}
            <button type="button" class="voice-btn-select" onclick="window.editor.selectUniversalItem('${val}')">
              ${isCurrent ? 'Selected' : isReplacementMode ? 'Replace with this' : 'Select'}
            </button>
          </div>
        `;
      }
      
      list.appendChild(card);
    });
  }

  previewUniversalAsset(folder, filename, btnElem) {
    const videoPreview = document.getElementById('universal-video-preview-overlay');
    if (videoPreview) {
      if (videoPreview.previewButton) videoPreview.previewButton.innerText = "▶ Preview";
      videoPreview.remove();
    }
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      const prevBtn = this.previewAudioElement.btn;
      if (prevBtn) prevBtn.innerText = "▶ Preview";

      if (this.previewAudioElement.filename === filename) {
        this.previewAudioElement = null;
        return;
      }
    }

    const path = this.assetUrl(folder, filename);
    const audio = new Audio(path);
    audio.filename = filename;
    audio.btn = btnElem;
    this.previewAudioElement = audio;

    btnElem.innerText = "⏹ Stop";
    audio.play().catch(err => {
      console.warn(`Failed to preview audio in ${folder}: ` + path, err);
      btnElem.innerText = "▶ Preview";
      this.previewAudioElement = null;
    });

    audio.onended = () => {
      btnElem.innerText = "▶ Preview";
      if (this.previewAudioElement === audio) {
        this.previewAudioElement = null;
      }
    };
  }

  previewUniversalAssetByPath(path, btnElem) {
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      const prevBtn = this.previewAudioElement.btn;
      if (prevBtn) prevBtn.innerText = "▶ Preview";

      if (this.previewAudioElement.filename === path) {
        this.previewAudioElement = null;
        return;
      }
    }

    const audio = new Audio(path);
    audio.filename = path;
    audio.btn = btnElem;
    this.previewAudioElement = audio;

    btnElem.innerText = "⏹ Stop";
    audio.play().catch(err => {
      console.warn(`Failed to preview audio by path: ` + path, err);
      btnElem.innerText = "▶ Preview";
      this.previewAudioElement = null;
    });

    audio.onended = () => {
      btnElem.innerText = "▶ Preview";
      if (this.previewAudioElement === audio) {
        this.previewAudioElement = null;
      }
    };
  }

  previewUniversalVideo(filename, btnElem) {
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      const previousButton = this.previewAudioElement.btn;
      if (previousButton) previousButton.innerText = "▶ Preview";
      this.previewAudioElement = null;
    }
    const existing = document.getElementById('universal-video-preview-overlay');
    if (existing) {
      existing.remove();
      if (btnElem.innerText === "⏹ Stop") {
        btnElem.innerText = "▶ Preview";
        return;
      }
    }

    const allVideoBtns = document.querySelectorAll('.voice-btn-preview');
    allVideoBtns.forEach(btn => {
      if (btn.innerText === "⏹ Stop") btn.innerText = "▶ Preview";
    });

    const path = this.assetUrl('video', filename);
    
    const overlay = document.createElement('div');
    overlay.id = 'universal-video-preview-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
    overlay.style.zIndex = '2000';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '15px';
    
    overlay.innerHTML = `
      <div style="position:relative; width:80%; max-width:700px; aspect-ratio:16/9; background:#000; border-radius:12px; overflow:hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <video src="${path}" controls autoplay style="width:100%; height:100%; object-fit:contain;"></video>
        <button type="button" class="asset-video-preview-close" aria-label="Close video preview">&times;</button>
      </div>
      <div style="color:white; font-weight:600;">${filename}</div>
    `;
    
    document.body.appendChild(overlay);
    btnElem.innerText = "⏹ Stop";
    overlay.previewButton = btnElem;

    const closePreview = () => {
      if (overlay.previewButton) overlay.previewButton.innerText = "▶ Preview";
      const video = overlay.querySelector('video');
      if (video) video.pause();
      overlay.remove();
    };
    overlay.querySelector('.asset-video-preview-close').onclick = closePreview;
    
    overlay.querySelector('video').onended = () => {
      closePreview();
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        closePreview();
      }
    };
  }

  selectUniversalItem(val) {
    const select = this.activeUniversalSelect;
    if (!select) return;

    const replacement = this.activeAssetReplacement;
    
    this.playSynthSFX('click');
    
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      this.previewAudioElement = null;
    }
    
    const videoPreview = document.getElementById('universal-video-preview-overlay');
    if (videoPreview) {
      if (videoPreview.previewButton) videoPreview.previewButton.innerText = '▶ Preview';
      videoPreview.remove();
    }

    if (replacement) {
      const target = this.getAssetFilenames(replacement.type).find(candidate => {
        const candidateValue = replacement.pickerType === 'char-sprite-file'
          ? candidate
          : this.assetIdFromFilename(candidate);
        return candidateValue === val;
      });
      if (!target || target === replacement.filename) return;
      this.activeAssetReplacement = null;
      this.activeUniversalSelect = null;
      document.getElementById('universal-select-modal').classList.add('hidden');
      this.replaceAssetReferences(replacement.type, replacement.filename, target);
      return;
    }
    
    select.value = val;
    select.dispatchEvent(new Event('change'));
    this.activeUniversalSelect = null;
    
    document.getElementById('universal-select-modal').classList.add('hidden');
  }

  toggleUnlockablesToggles() {
    const galleryEnabled = document.getElementById('settings-gallery-enabled').checked;
    const charsContainer = document.getElementById('lbl-gallery-chars');
    const bgsContainer = document.getElementById('lbl-gallery-bgs');
    if (galleryEnabled) {
      charsContainer.style.display = 'flex';
      bgsContainer.style.display = 'flex';
    } else {
      charsContainer.style.display = 'none';
      bgsContainer.style.display = 'none';
    }
  }

  renderUnlockablesTab() {
    this.project.unlockables = this.project.unlockables || [];
    const list = document.getElementById('unlockable-assets-list');
    if (!list) return;
    list.innerHTML = "";

    if (this.project.unlockables.length === 0) {
      list.innerHTML = `<p class="muted" style="text-align:center; padding: 20px;">No unlockable assets registered. Click "Add Unlockable Asset" to create one.</p>`;
      return;
    }

    this.project.unlockables.forEach((asset, index) => {
      const row = document.createElement('div');
      row.className = "unlockable-asset-row glass-panel";
      row.style.cssText = "display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color);";

      // 1. Name input
      const nameInput = `<div class="input-group" style="flex: 1; min-width: 150px; margin: 0;">
        <label style="font-size: 0.8rem; color: var(--text-muted);">Asset Name</label>
        <input type="text" class="input-text" value="${asset.name || ""}" placeholder="e.g. Morning Shadows" oninput="window.editor.updateUnlockableField(${index}, 'name', this.value)">
      </div>`;

      // 2. Type select
      const typeSelect = `<div class="input-group" style="width: 130px; margin: 0;">
        <label style="font-size: 0.8rem; color: var(--text-muted);">Type</label>
        <select class="select-input" onchange="window.editor.updateUnlockableType(${index}, this.value)">
          <option value="character" ${asset.type === 'character' ? 'selected' : ''}>Character Art</option>
          <option value="background" ${asset.type === 'background' ? 'selected' : ''}>Background</option>
          <option value="music" ${asset.type === 'music' ? 'selected' : ''}>Music BGM</option>
        </select>
      </div>`;

      // 3. File select
      let files = [];
      const prefix = `data/projects/${this.projectId || 'demo'}/assets/`;
      if (asset.type === 'character') {
        const rawFiles = this.assets.char || [];
        rawFiles.forEach(file => {
          files.push({ name: file, path: prefix + 'char/' + file });
        });
      } else if (asset.type === 'background') {
        const rawFiles = this.assets.bg || [];
        rawFiles.forEach(file => {
          files.push({ name: file, path: prefix + 'bg/' + file });
        });
      } else if (asset.type === 'music') {
        const rawFiles = this.assets.music || [];
        rawFiles.forEach(file => {
          files.push({ name: file, path: prefix + 'music/' + file });
        });
      }

      let fileOptions = `<option value="">Select File...</option>`;
      files.forEach(f => {
        const isSel = asset.path === f.path ? "selected" : "";
        fileOptions += `<option value="${f.path}" ${isSel}>${f.name}</option>`;
      });

      const fileSelect = `<div class="input-group" style="flex: 1; min-width: 180px; margin: 0;">
        <label style="font-size: 0.8rem; color: var(--text-muted);">Associated File</label>
        <div style="display:flex; gap:6px;">
          <select class="select-input unlockable-file-select" data-asset-type="${asset.type === 'character' ? 'char' : asset.type === 'background' ? 'bg' : 'music'}" onchange="window.editor.updateUnlockableField(${index}, 'path', this.value)" style="flex-grow:1;">
            ${fileOptions}
          </select>
          <button class="btn-secondary" style="padding: 6px 10px; display:inline-flex; align-items:center; justify-content:center;" onclick="window.editor.triggerUnlockableUpload(${index})" title="Upload New File">📁</button>
        </div>
      </div>`;

      // 4. Unlock Condition Type
      const unlockTypeSelect = `<div class="input-group" style="width: 140px; margin: 0;">
        <label style="font-size: 0.8rem; color: var(--text-muted);">Unlock Condition</label>
        <select class="select-input" onchange="window.editor.updateUnlockableConditionType(${index}, this.value)">
          <option value="scene" ${asset.unlockType === 'scene' ? 'selected' : ''}>Reach Scene</option>
          <option value="ending" ${asset.unlockType === 'ending' ? 'selected' : ''}>Reach Ending</option>
        </select>
      </div>`;

      // 5. Unlock Condition Value select
      let condValueOptions = "";
      if (asset.unlockType === 'scene') {
        condValueOptions += `<option value="">Select Scene...</option>`;
        Object.keys(this.project.scenes || {}).forEach(id => {
          const name = this.project.scenes[id].name || id;
          const isSel = asset.unlockCondition === id ? "selected" : "";
          condValueOptions += `<option value="${id}" ${isSel}>🎬 ${name}</option>`;
        });
      } else {
        condValueOptions += `<option value="">Select Ending...</option>`;
        const endings = new Set();
        Object.keys(this.project.scenes || {}).forEach(id => {
          const scene = this.project.scenes[id];
          if (scene.isEnding && scene.endingName) {
            endings.add(scene.endingName);
          }
        });
        endings.forEach(endName => {
          const isSel = asset.unlockCondition === endName ? "selected" : "";
          condValueOptions += `<option value="${endName}" ${isSel}>🏆 ${endName}</option>`;
        });
      }

      const condValueSelect = `<div class="input-group" style="flex: 1; min-width: 150px; margin: 0;">
        <label style="font-size: 0.8rem; color: var(--text-muted);">Unlock Trigger</label>
        <select class="select-input unlockable-condition-select" data-asset-type="${asset.unlockType === 'scene' ? 'scene' : 'ending'}" onchange="window.editor.updateUnlockableField(${index}, 'unlockCondition', this.value)">
          ${condValueOptions}
        </select>
      </div>`;

      // 6. Delete button
      const deleteBtn = `<button class="btn-danger" style="padding: 10px; margin-top: 14px;" onclick="window.editor.deleteUnlockableAsset(${index})">🗑️</button>`;

      row.innerHTML = nameInput + typeSelect + fileSelect + unlockTypeSelect + condValueSelect + deleteBtn;
      list.appendChild(row);
    });
    this.convertAllAssetSelects();
  }

  addUnlockableAsset() {
    this.project.unlockables = this.project.unlockables || [];
    this.project.unlockables.push({
      id: "unlockable_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name: "New Unlockable",
      type: "character",
      path: "",
      unlockType: "scene",
      unlockCondition: ""
    });
    this.renderUnlockablesTab();
    this.triggerAutoSave();
  }

  updateUnlockableField(index, field, value) {
    this.project.unlockables[index][field] = value;
    this.triggerAutoSave();
  }

  updateUnlockableType(index, type) {
    this.project.unlockables[index].type = type;
    this.project.unlockables[index].path = "";
    this.renderUnlockablesTab();
    this.triggerAutoSave();
  }

  updateUnlockableConditionType(index, unlockType) {
    this.project.unlockables[index].unlockType = unlockType;
    this.project.unlockables[index].unlockCondition = "";
    this.renderUnlockablesTab();
    this.triggerAutoSave();
  }

  deleteUnlockableAsset(index) {
    if (confirm("Are you sure you want to delete this unlockable asset?")) {
      this.project.unlockables.splice(index, 1);
      this.renderUnlockablesTab();
      this.triggerAutoSave();
    }
  }

  triggerUnlockableUpload(index) {
    const asset = this.project.unlockables[index];
    let serverType = 'char';
    if (asset.type === 'background') serverType = 'bg';
    else if (asset.type === 'music') serverType = 'music';
    
    this.uploadingAssetType = serverType;
    this.uploadingUnlockableIndex = index;
    document.getElementById('asset-file-uploader').click();
  }
}

// Sidebar Tabs switcher
function switchSidebarTab(tabId) {
  const tabs = ['scenes-tab', 'assets-tab'];
  tabs.forEach(id => {
    const content = document.getElementById(id);
    const btn = document.querySelector(`.sidebar-tabs button[onclick="switchSidebarTab('${id}')"]`);
    if (id === tabId) {
      content.classList.remove('hidden');
      btn.classList.add('active');
    } else {
      content.classList.add('hidden');
      btn.classList.remove('active');
    }
  });
}

function switchManagementTab(scopeId, panelId) {
  const scope = document.getElementById(scopeId);
  if (!scope) return;
  scope.querySelectorAll('.management-tab').forEach(button => {
    const active = button.dataset.managementTarget === panelId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  scope.querySelectorAll('.management-tab[data-management-target]').forEach(button => {
    const panel = document.getElementById(button.dataset.managementTarget);
    if (panel) panel.classList.toggle('hidden', button.dataset.managementTarget !== panelId);
  });
  if (scopeId === 'asset-management' && window.editor) window.editor.updateAssetSelectionUI();
}

// Workspace Tabs switcher
function switchWorkspaceView(viewId) {
  const views = ['timeline-view', 'flowchart-view', 'unlockables-view', 'settings-view'];
  views.forEach(id => {
    const view = document.getElementById(id);
    const btn = document.querySelector(`.center-tabs button[onclick="switchWorkspaceView('${id}')"]`);
    if (id === viewId) {
      view.classList.remove('hidden');
      if (btn) btn.classList.add('active');
    } else {
      view.classList.add('hidden');
      if (btn) btn.classList.remove('active');
    }
  });

  if (viewId === 'flowchart-view') {
    window.editor.renderFlowchart();
  } else if (viewId === 'unlockables-view') {
    window.editor.renderUnlockablesTab();
  }
}

// Close Test play iframe modal
function closeTestPlay() {
  if (window.editor) window.editor.playSynthSFX('click');
  document.getElementById('playtest-iframe').src = "";
  document.getElementById('test-play-modal').classList.add('hidden');
}

// Global modal closer
function closeModal(id) {
  if (id === 'universal-select-modal' && window.editor) {
    window.editor.activeUniversalSelect = null;
    window.editor.activeAssetReplacement = null;
  }
  if (window.VNFairyModalControls) {
    window.VNFairyModalControls.close(id);
    return;
  }
  if (window.editor) window.editor.playSynthSFX('click');
  document.getElementById(id).classList.add('hidden');
}

// Global trigger for asset uploading
function triggerAssetUpload(type) {
  if (window.editor) window.editor.triggerAssetUpload(type);
}

// Global expression sprite upload handler inside character modal
function triggerExpressionUpload(btn) {
  const fileInput = document.getElementById('asset-file-uploader');
  
  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (window.editor) {
      window.editor.updateSaveStatus("Uploading character art...");
      try {
          await window.editor.uploadFileToServer(file, 'char');
          
          window.editor.showToast("Sprite uploaded successfully!");
          await window.editor.refreshAssets();
          
          // Re-populate dropdown inside this row and select the uploaded file
          const select = btn.parentElement.querySelector('.expr-file-select');
          let spriteOptions = `<option value="">Select File...</option>`;
          window.editor.assets.char.forEach(f => {
            const isSelected = f === file.name ? "selected" : "";
            spriteOptions += `<option value="${f}" ${isSelected}>${f}</option>`;
          });
          select.innerHTML = spriteOptions;
          window.editor.convertSelect(select);
      } catch (err) {
          alert("Upload failed: " + err.message);
      } finally {
          window.editor.updateSaveStatus("Saved to disk");
      }
    }
    fileInput.value = ""; // Reset uploader input
  };
  
  fileInput.click();
}

// Global flowchart map renderer
function renderFlowchart() {
  if (window.editor) window.editor.renderFlowchart();
}

// Collapsible Scene Configuration toggle helper
function toggleSceneMeta() {
  if (window.editor) window.editor.openSceneSettings();
}

// Initialize editor on load
window.onload = () => {
  window.editor = new VNFairyEditor();
  window.editor.init();
};
