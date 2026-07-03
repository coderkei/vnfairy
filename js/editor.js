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
    this.version = "1.0.0";
    this.project = null;
    this.assets = { bg: [], char: [], music: [], sound: [] };
    
    this.activeSceneId = null;
    this.activeStepIndex = null;
    this.uploadingAssetType = null;
    this.editingCharacterId = null;

    this.saveTimeout = null;

    this.loadEditorTheme();
    this.bindEvents();
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
      btn.innerText = theme === 'light' ? '☀️' : '🌙';
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
    if (!projVer) return false;
    const pParts = projVer.split('.').map(Number);
    const cParts = currVer.split('.').map(Number);
    for (let i = 0; i < Math.max(pParts.length, cParts.length); i++) {
      const p = pParts[i] || 0;
      const c = cParts[i] || 0;
      if (p > c) return true;
      if (p < c) return false;
    }
    return false;
  }

  showVersionError(projVer, currVer) {
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
      
      this.project = data;
      this.project.config = this.project.config || {};
      
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
      this.refreshSettingsTab();
      this.renderAssetsTab();

      // Select start scene or first scene as default
      if (this.project.startSceneId && this.project.scenes[this.project.startSceneId]) {
        this.selectScene(this.project.startSceneId);
      } else {
        const sceneIds = Object.keys(this.project.scenes || {});
        if (sceneIds.length > 0) this.selectScene(sceneIds[0]);
      }

    } catch (err) {
      console.error("Editor init failed. running in standalone browser mode.", err);
      // Initialize a default offline fallback sandbox project
      this.loadOfflineSandbox();
    }
  }

  loadOfflineSandbox() {
    this.project = {
      title: "Offline Story Sandbox",
      author: "Game Designer",
      config: {
        kineticMode: false,
        textSpeed: 40,
        titleScreen: { background: "", music: "", titleColor: "#ffffff", subtitleColor: "#a5d6a7" },
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
    this.loadProjectMeta();
    this.refreshScenesTree();
    this.refreshSettingsTab();
    this.selectScene("scene_start");
    this.updateSaveStatus("Sandbox Offline Mode (Saves in LocalStorage)", true);
  }

  // Project auto-save mechanism
  async saveProject(showNotification = false) {
    this.updateSaveStatus("Saving changes...");
    
    // Sync project metadata from inputs
    this.project.vnFairyVersion = this.version;
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
      if (!response.ok) throw new Error("Save API error");
      this.updateSaveStatus("All changes saved");
      if (showNotification) this.showToast("Project saved!");
    } catch (err) {
      console.warn("Could not save to disk, saving to local storage instead.", err);
      localStorage.setItem('vnfairy_sandbox_project', JSON.stringify(this.project));
      this.updateSaveStatus("Saved to Browser (Offline)", true);
    }
  }

  // Set timeout to delay save after keystrokes (debouncing)
  triggerAutoSave() {
    this.updateSaveStatus("Unsaved changes...");
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => { this.saveProject(); }, 1500);
  }

  updateSaveStatus(statusText, warning = false) {
    const statusElem = document.getElementById('save-status');
    statusElem.innerText = statusText;
    statusElem.style.color = warning ? "var(--warning)" : "var(--text-muted)";
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
      
      this.renderAssetsTab();
      this.populateAssetDropdowns();

      // If universal select modal is active, refresh its list too
      const modal = document.getElementById('universal-select-modal');
      if (modal && !modal.classList.contains('hidden')) {
        const searchInput = document.getElementById('universal-search-input');
        const filter = searchInput ? searchInput.value : "";
        this.renderUniversalSelectModalList(filter);
      }
    } catch (e) {
      console.warn("Could not fetch server assets. Asset upload disabled offline.");
    }
  }

  // Render lists in the Sidebar Assets tab
  renderAssetsTab() {
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
          <span style="color:${char.color || '#fff'}">👤 ${char.name}</span>
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
        <span>🎵 ${file}</span>
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
          <span>🗣️ ${file}</span>
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
          <span>🎥 ${file}</span>
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
      const response = await fetch('/api/asset/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type,
          filename: filename,
          project: this.projectId || 'demo'
        })
      });
      const res = await response.json();
      if (!res.success) throw new Error(res.error);

      this.showToast("Deleted successfully!");

      // Update local asset configuration registry
      if (this.project && this.project.assets) {
        const id = filename.replace(/\.[^/.]+$/, "");
        if (type === 'bg' && this.project.assets.backgrounds) {
          this.project.assets.backgrounds = this.project.assets.backgrounds.filter(b => b.id !== id);
        } else if (type === 'music' && this.project.assets.music) {
          this.project.assets.music = this.project.assets.music.filter(m => m.id !== id);
        } else if (type === 'sound' && this.project.assets.sound) {
          this.project.assets.sound = this.project.assets.sound.filter(s => s.id !== id);
        } else if (type === 'video' && this.project.assets.video) {
          this.project.assets.video = this.project.assets.video.filter(v => v.id !== id);
        }
      }

      await this.refreshAssets();
      this.saveProject();
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
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
      
      // Clear all except first option
      while (select.options.length > 1) select.remove(1);

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
        this.updateSaveStatus("All changes saved");
      }
    };
    reader.readAsDataURL(file);
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
    row.querySelector('.expr-key-input').oninput = () => this.updateCharModalPreview();
    row.querySelector('.expr-name-input').oninput = () => this.updateCharModalPreview();
    if (id !== 'default') {
      row.querySelector('.btn-danger').onclick = () => {
        row.remove();
        this.updateCharModalPreview();
      };
    }
    list.appendChild(row);
    this.convertAllAssetSelects();
    this.updateCharModalPreview();
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
        this.project.assets.characters[idx] = { id: charId, name, color, nonvisual: isNonVisual, scale, sprites };
      }
    } else {
      // Create new
      this.project.assets.characters.push({ id: charId, name, color, nonvisual: isNonVisual, scale, sprites });
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
      item.onclick = (e) => {
        if (!e.target.classList.contains('scene-action-btn') && !e.target.closest('.scene-item-actions')) {
          this.selectScene(id);
        }
      };

      const isStart = id === this.project.startSceneId ? " (Start)" : "";
      
      // Move buttons conditions
      const canMoveUp = indexInList > 0;
      const canMoveDown = indexInList < listLength - 1;

      item.innerHTML = `
        <span class="scene-item-title" title="${scene.name || id}">🎬 ${scene.name || id}${isStart}</span>
        <div class="scene-item-actions">
          <button class="scene-action-btn move-up" onclick="event.stopPropagation(); window.editor.moveScene('${id}', -1)" title="Move Up" ${canMoveUp ? '' : 'style="opacity:0.2; pointer-events:none;"'}>↑</button>
          <button class="scene-action-btn move-down" onclick="event.stopPropagation(); window.editor.moveScene('${id}', 1)" title="Move Down" ${canMoveDown ? '' : 'style="opacity:0.2; pointer-events:none;"'}>↓</button>
          <button class="scene-action-btn delete" onclick="event.stopPropagation(); window.editor.deleteScene('${id}')" title="Delete Scene">🗑️</button>
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
          <span class="group-folder">📁</span>
          <span class="group-name-text" title="${group.name}">${group.name}</span>
        </div>
        <div class="group-actions">
          <button class="scene-action-btn move-up" onclick="event.stopPropagation(); window.editor.moveGroup('${group.id}', -1)" title="Move Group Up" ${canGroupMoveUp ? '' : 'style="opacity:0.2; pointer-events:none;"'}>↑</button>
          <button class="scene-action-btn move-down" onclick="event.stopPropagation(); window.editor.moveGroup('${group.id}', 1)" title="Move Group Down" ${canGroupMoveDown ? '' : 'style="opacity:0.2; pointer-events:none;"'}>↓</button>
          <button class="scene-action-btn" onclick="window.editor.renameGroup('${group.id}', event)" title="Rename Group">✏️</button>
          <button class="scene-action-btn" onclick="window.editor.deleteGroup('${group.id}', event)" title="Delete Group">🗑️</button>
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
        if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && !e.target.classList.contains('card-action-btn')) {
          this.selectDialogueStep(index);
        }
      };

      // Speaker Select html builder
      let speakerSelectOptions = `<option value="narrator">Narrator</option>`;
      (this.project.assets.characters || []).forEach(char => {
        const isSel = step.speaker === char.id ? "selected" : "";
        speakerSelectOptions += `<option value="${char.id}" ${isSel}>👤 ${char.name}</option>`;
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
            <select class="select-input card-speaker-select" onchange="window.editor.updateStepSpeaker(${index}, this.value)">
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

    exprSelect.value = activeExprId || "";
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
      const defaultSpriteId = (char && char.sprites && char.sprites.length > 0) ? char.sprites[0].id : "";
      
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
    if (textElem) {
      if (scene && scene.fontFamily && scene.fontFamily.includes('Caveat')) {
        textElem.classList.add('font-caveat');
      } else {
        textElem.classList.remove('font-caveat');
      }
    }
    if (scene && scene.isCutscene) {
      if (scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext') {
        // Draw Background
        let bgSrc = "";
        if (scene.background) {
          const asset = this.project.assets.backgrounds.find(b => b.id === scene.background);
          if (asset) bgSrc = asset.path;
        }
        bgElem.style.backgroundImage = bgSrc ? `url('${bgSrc}')` : "linear-gradient(135deg, #1e293b, #0f172a)";
        
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
        // Draw Background
        let bgSrc = "";
        if (scene.background) {
          const asset = this.project.assets.backgrounds.find(b => b.id === scene.background);
          if (asset) bgSrc = asset.path;
        }
        bgElem.style.backgroundImage = bgSrc ? `url('${bgSrc}')` : "linear-gradient(135deg, #1e293b, #0f172a)";
        
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
      bgElem.style.backgroundImage = "none";
      speakerElem.innerText = "Narrator";
      textElem.innerText = "No active dialogue selected.";
      Object.values(slots).forEach(slot => {
        slot.querySelector('.mini-sprite-img').classList.add('hidden');
        slot.classList.remove('speaking-dimmed');
      });
      return;
    }

    // 1. Draw Background
    let bgSrc = "";
    if (scene.background) {
      const asset = this.project.assets.backgrounds.find(b => b.id === scene.background);
      if (asset) bgSrc = asset.path;
    }
    bgElem.style.backgroundImage = bgSrc ? `url('${bgSrc}')` : "linear-gradient(135deg, #1e293b, #0f172a)";

    // 2. Set Text & Speaker
    let speakerName = "Narrator";
    let speakerColor = "var(--primary)";

    if (step.speaker === 'narrator') {
      speakerElem.innerText = "Narrator";
      speakerElem.style.color = "var(--text-muted)";
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

      if (data && data.characterId && data.spriteId) {
        // Resolve sprite
        let spritePath = "";
        let isNonVisual = false;
        let scale = 1;
        const char = this.project.assets.characters.find(c => c.id === data.characterId);
        if (char) {
          isNonVisual = !!char.nonvisual;
          scale = char.scale !== undefined ? char.scale : 1;
          if (char.sprites) {
            const sprite = char.sprites.find(s => s.id === data.spriteId);
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

  // Option Choices build
  renderChoicesBuilder() {
    const list = document.getElementById('choices-builder-list');
    list.innerHTML = "";

    const scene = this.project.scenes[this.activeSceneId];
    const choices = scene.choices || [];

    choices.forEach((choice, index) => {
      const card = document.createElement('div');
      card.className = "choice-builder-card";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.gap = "8px";
      card.style.padding = "10px";
      card.style.border = "1px solid var(--border-color)";
      card.style.borderRadius = "var(--radius-sm)";
      card.style.background = "rgba(255, 255, 255, 0.01)";
      
      // Target options dropdown
      let targetOptions = `<option value="">Select Destination Scene...</option>`;
      Object.keys(this.project.scenes).forEach(id => {
        const isSel = choice.target === id ? "selected" : "";
        targetOptions += `<option value="${id}" ${isSel}>🎬 ${this.project.scenes[id].name || id}</option>`;
      });

      // Tracked numbers options dropdown
      let varOptions = `<option value="">-- No variable adjustment --</option>`;
      const trackedNumbers = (this.project.config && this.project.config.trackedNumbers) || [];
      trackedNumbers.forEach(name => {
        const isSel = choice.customVarName === name ? "selected" : "";
        varOptions += `<option value="${name}" ${isSel}>📊 ${name}</option>`;
      });

      // Op options
      const opSelIncrease = choice.customVarOp === 'increase' || !choice.customVarOp ? 'selected' : '';
      const opSelDecrease = choice.customVarOp === 'decrease' ? 'selected' : '';
      const opSelSet = choice.customVarOp === 'set' ? 'selected' : '';

      const autoTrackName = choice.text ? choice.text.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') : 'OptionName';

      card.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
          <span class="muted" style="font-weight:600; font-size:0.8rem; white-space: nowrap;">Choice #${index + 1}</span>
          <input type="text" class="input-text" placeholder="Button Option Text (e.g. Yes!)" value="${choice.text || ""}" style="width:180px;" oninput="window.editor.updateChoiceText(${index}, this.value)">
          <select class="select-input choice-target-select" data-asset-type="scene" onchange="window.editor.updateChoiceTarget(${index}, this.value)" style="flex-grow:1;">
            ${targetOptions}
          </select>
          <button class="btn-danger" style="padding: 6px 10px;" onclick="window.editor.deleteChoice(${index})">&times;</button>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; width: 100%; padding-left: 56px; flex-wrap: wrap;">
          <span class="muted" style="font-size:0.75rem; white-space: nowrap;">Variable:</span>
          <select class="select-input" onchange="window.editor.updateChoiceVarName(${index}, this.value)" style="width:140px; font-size:0.75rem; padding: 4px;">
            ${varOptions}
          </select>
          
          ${choice.customVarName ? `
            <select class="select-input" onchange="window.editor.updateChoiceVarOp(${index}, this.value)" style="width:110px; font-size:0.75rem; padding: 4px;">
              <option value="increase" ${opSelIncrease}>Increase by</option>
              <option value="decrease" ${opSelDecrease}>Decrease by</option>
              <option value="set" ${opSelSet}>Set to</option>
            </select>
            <input type="number" class="input-text" placeholder="value" value="${choice.customVarValue !== undefined ? choice.customVarValue : "1"}" style="width:60px; font-size:0.75rem; padding: 4px 8px;" oninput="window.editor.updateChoiceVarValue(${index}, this.value)">
          ` : ''}
          <span class="muted" style="font-size:0.7rem; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;" title="Auto-tracks: choice_${choice.id}">Auto-tracks choice: choice_${autoTrackName}</span>
        </div>
      `;

      list.appendChild(card);
    });
    this.convertAllAssetSelects();
  }

  addSceneChoice() {
    const scene = this.project.scenes[this.activeSceneId];
    scene.choices = scene.choices || [];
    scene.choices.push({
      id: "choice_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      text: "New Option",
      action: "jump",
      target: ""
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
    scene.choices[index].customVarName = varName;
    if (!scene.choices[index].customVarOp) {
      scene.choices[index].customVarOp = "increase";
    }
    if (scene.choices[index].customVarValue === undefined) {
      scene.choices[index].customVarValue = 1;
    }
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

  // Render conditional branches list for active scene
  renderConditionalBranches() {
    const list = document.getElementById('scene-conditions-list');
    if (!list) return;
    list.innerHTML = "";

    const scene = this.project.scenes[this.activeSceneId];
    if (!scene) return;
    const branches = scene.conditionalBranches || [];

    branches.forEach((branch, index) => {
      const card = document.createElement('div');
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.gap = "8px";
      card.style.background = "rgba(255,255,255,0.02)";
      card.style.padding = "10px";
      card.style.borderRadius = "var(--radius-sm)";
      card.style.border = "1px solid var(--border-color)";
      card.style.width = "100%";
      card.style.boxSizing = "border-box";

      // Condition type selector
      const condType = branch.type || 'choice'; // 'choice' or 'number'
      const selChoice = condType === 'choice' ? 'selected' : '';
      const selNumber = condType === 'number' ? 'selected' : '';

      // Target scene options
      let targetOptions = `<option value="">End of Novel (Roll Credits)</option>`;
      Object.keys(this.project.scenes).forEach(id => {
        if (id === this.activeSceneId) return; // Can't branch to self
        const isSel = branch.target === id ? "selected" : "";
        targetOptions += `<option value="${id}" ${isSel}>🎬 ${this.project.scenes[id].name || id}</option>`;
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
              choiceOptions += `<option value="${ch.id}" ${isSel}>🎬 ${sc.name || sceneId} > "${ch.text}"</option>`;
            });
          }
        });

        const isSelectedOp = branch.choiceState === 'selected' || !branch.choiceState ? 'selected' : '';
        const isNotSelectedOp = branch.choiceState === 'not_selected' ? 'selected' : '';

        conditionHtml = `
          <span class="muted" style="font-size:0.75rem; font-weight:600; white-space:nowrap;">Choice Option:</span>
          <select class="select-input" onchange="window.editor.updateConditionChoiceId(${index}, this.value)" style="flex-grow:1; font-size:0.8rem; padding: 4px; max-width: 250px;">
            ${choiceOptions}
          </select>
          <select class="select-input" onchange="window.editor.updateConditionChoiceState(${index}, this.value)" style="width:120px; font-size:0.8rem; padding: 4px;">
            <option value="selected" ${isSelectedOp}>was selected</option>
            <option value="not_selected" ${isNotSelectedOp}>was NOT selected</option>
          </select>
        `;
      } else {
        // Tracked numbers options
        let numberVarOptions = `<option value="">-- Select Variable --</option>`;
        const trackedNumbers = (this.project.config && this.project.config.trackedNumbers) || [];
        trackedNumbers.forEach(name => {
          const isSel = branch.variable === name ? "selected" : "";
          numberVarOptions += `<option value="${name}" ${isSel}>📊 ${name}</option>`;
        });

        const ops = ['==', '!=', '>', '<', '>=', '<='];
        let opOptions = "";
        ops.forEach(op => {
          const isSel = branch.operator === op ? "selected" : "";
          opOptions += `<option value="${op}" ${isSel}>${op}</option>`;
        });

        conditionHtml = `
          <span class="muted" style="font-size:0.75rem; font-weight:600; white-space:nowrap;">Variable:</span>
          <select class="select-input" onchange="window.editor.updateConditionVar(${index}, this.value)" style="width:130px; font-size:0.8rem; padding: 4px;">
            ${numberVarOptions}
          </select>
          <select class="select-input" onchange="window.editor.updateConditionOp(${index}, this.value)" style="width:70px; font-size:0.8rem; padding: 4px;">
            ${opOptions}
          </select>
          <input type="number" class="input-text" placeholder="value" value="${branch.value !== undefined ? branch.value : "0"}" style="width:70px; font-size:0.8rem; padding: 4px 8px;" oninput="window.editor.updateConditionValue(${index}, this.value)">
        `;
      }

      card.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: center; width: 100%; flex-wrap: wrap;">
          <span class="muted" style="font-size:0.75rem; font-weight:600;">IF</span>
          <select class="select-input" onchange="window.editor.updateConditionType(${index}, this.value)" style="width:140px; font-size:0.8rem; padding: 4px;">
            <option value="choice" ${selChoice}>👉 Choice Selection</option>
            <option value="number" ${selNumber}>📊 Tracked Number</option>
          </select>
          <div style="display:flex; align-items:center; gap:8px; flex-grow:1; flex-wrap: wrap;">
            ${conditionHtml}
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; width: 100%; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px;">
          <span class="muted" style="font-size:0.75rem; font-weight:600;">THEN GO TO</span>
          <select class="select-input cond-target-select" data-asset-type="scene" onchange="window.editor.updateConditionTarget(${index}, this.value)" style="flex-grow:1; font-size:0.8rem; padding: 4px;">
            ${targetOptions}
          </select>
          <button class="btn-danger" style="padding: 4px 8px; font-size:0.8rem;" onclick="window.editor.deleteCondition(${index})">&times;</button>
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
    scene.conditionalBranches[index].variable = val;
    this.triggerAutoSave();
  }

  updateConditionOp(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches[index].operator = val;
    this.triggerAutoSave();
  }

  updateConditionValue(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    const parsed = Number(val);
    scene.conditionalBranches[index].value = isNaN(parsed) ? 0 : parsed;
    this.triggerAutoSave();
  }

  updateConditionTarget(index, val) {
    const scene = this.project.scenes[this.activeSceneId];
    scene.conditionalBranches[index].target = val;
    this.triggerAutoSave();
  }

  // Render tracked numbers list in settings tab
  renderTrackedNumbersList() {
    const list = document.getElementById('settings-tracked-numbers-list');
    if (!list) return;
    list.innerHTML = "";

    this.project.config.trackedNumbers = this.project.config.trackedNumbers || [];
    this.project.config.trackedNumbers.forEach((name) => {
      const item = document.createElement('div');
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.background = "rgba(255,255,255,0.02)";
      item.style.border = "1px solid var(--border-color)";
      item.style.borderRadius = "var(--radius-sm)";
      item.style.padding = "6px 12px";

      item.innerHTML = `
        <span style="font-weight:600; color:var(--text-main); font-size:0.85rem;">📊 ${name}</span>
        <button class="btn-danger" style="padding: 4px 8px; font-size:0.8rem;" onclick="window.editor.deleteTrackedNumber('${name}')">&times;</button>
      `;
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
    this.project.config.trackedNumbers = this.project.config.trackedNumbers || [];
    if (this.project.config.trackedNumbers.includes(name)) {
      alert("A tracked variable with this name already exists.");
      return;
    }
    this.project.config.trackedNumbers.push(name);
    input.value = "";
    this.renderTrackedNumbersList();
    this.triggerAutoSave();
  }

  deleteTrackedNumber(name) {
    this.project.config.trackedNumbers = this.project.config.trackedNumbers || [];
    this.project.config.trackedNumbers = this.project.config.trackedNumbers.filter(n => n !== name);
    this.renderTrackedNumbersList();
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

    // Clear old content (keep SVG in place)
    Array.from(canvas.children).forEach(child => {
      if (child !== svgEl) canvas.removeChild(child);
    });
    svgEl.innerHTML = '';

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
        pos[id] = { x: curX, y: curY, w: NODE_W, h };
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
      node.onclick = (e) => {
        e.stopPropagation();
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
      nodeEls[id] = node;
    });

    // Draw SVG arrows using canvas-relative coordinates (pos already in canvas space)
    const svgNS = 'http://www.w3.org/2000/svg';
    // Arrow marker
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

    // Size the SVG to cover all content
    const totalW = curX + PAD;
    let totalH = PAD;
    Object.values(pos).forEach(p => { totalH = Math.max(totalH, p.y + p.h + PAD); });
    svgEl.setAttribute('width', totalW);
    svgEl.setAttribute('height', totalH);
    svgEl.style.width = totalW + 'px';
    svgEl.style.height = totalH + 'px';

    // Draw connections as bezier curves
    sceneIds.forEach(sourceId => {
      const source = scenes[sourceId];
      const sp = pos[sourceId];
      if (!sp) return;
      let targets = [];
      if (!source.isEnding) {
        if (source.nextSceneId) targets.push({ id: source.nextSceneId, label: '' });
        if (source.choices) source.choices.forEach(c => { if (c.target) targets.push({ id: c.target, label: c.text }); });
        if (source.conditionalBranches) source.conditionalBranches.forEach(b => { if (b.target) targets.push({ id: b.target, label: `If ${b.variable}` }); });
      }
      targets.forEach(({ id: targetId, label }) => {
        const tp = pos[targetId];
        if (!tp) return;
        // Connect right-middle of source to left-middle of target
        const x1 = sp.x + sp.w;
        const y1 = sp.y + sp.h / 2;
        const x2 = tp.x;
        const y2 = tp.y + tp.h / 2;
        const cx = (x1 + x2) / 2;
        const pathEl = document.createElementNS(svgNS, 'path');
        pathEl.setAttribute('d', `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke', 'var(--accent)');
        pathEl.setAttribute('stroke-width', '2');
        pathEl.setAttribute('stroke-opacity', '0.7');
        pathEl.setAttribute('marker-end', 'url(#fc-arrow)');
        svgEl.appendChild(pathEl);
      });
    });

    // --- Zoom & Pan (transform canvas only — SVG is inside canvas so moves with it) ---
    // Remove old listeners by cloning the wrapper
    const newWrapper = wrapper.cloneNode(false);
    wrapper.parentNode.replaceChild(newWrapper, wrapper);
    newWrapper.appendChild(canvas);

    let scale = 1, offsetX = PAD / 2, offsetY = PAD / 2;
    function applyTransform() {
      canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }
    applyTransform();

    newWrapper.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(0.2, scale * factor), 4);
      const rect = newWrapper.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      offsetX = mx - (mx - offsetX) * (newScale / scale);
      offsetY = my - (my - offsetY) * (newScale / scale);
      scale = newScale;
      applyTransform();
    }, { passive: false });

    let isPanning = false, startX = 0, startY = 0;
    newWrapper.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      isPanning = true;
      startX = e.clientX - offsetX;
      startY = e.clientY - offsetY;
      newWrapper.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!isPanning) return;
      offsetX = e.clientX - startX;
      offsetY = e.clientY - startY;
      applyTransform();
    });
    window.addEventListener('mouseup', () => {
      if (!isPanning) return;
      isPanning = false;
      newWrapper.style.cursor = 'grab';
    });
  }


  // Playtest trigger
  async testPlay() {
    
    // Save project changes before playtest
    await this.saveProject();

    const url = `/index.html?project=${this.projectId || 'demo'}&playtest=true&_t=${Date.now()}`;
    window.open(url, '_blank');
  }

  // Package project into Zip file
  async packageGame() {
    this.playSynthSFX('ending');
    this.updateSaveStatus("Packaging project...");
    this.showToast("Compiling package... Please wait.", 60000);

    await this.saveProject();

    try {
      const response = await fetch(`/api/package?id=${this.projectId || 'demo'}`, { method: 'POST' });
      if (!response.ok) throw new Error("Packaging API failed");
      const res = await response.json();

      this.updateSaveStatus("All changes saved");
      this.showToast("Game packaged! Starting download...", 4000);

      // Open download URL
      window.location.href = res.downloadUrl;
    } catch (e) {
      alert("Failed to package game. Running offline sandbox? Export is only supported in local server mode.");
      this.updateSaveStatus("Saves in LocalStorage", true);
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
    document.getElementById('btn-test-play').onclick = () => this.testPlay();
    document.getElementById('btn-package-game').onclick = () => this.packageGame();
    
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.onclick = () => this.toggleEditorTheme();
    }
    
    const guideBtn = document.getElementById('btn-open-guide');
    if (guideBtn) {
      guideBtn.onclick = () => this.openGuideModal();
    }
    
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

    document.getElementById('project-title-input').oninput = () => this.triggerAutoSave();
    document.getElementById('project-author-input').oninput = () => this.triggerAutoSave();

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
        if (id === 'settings-kinetic-mode') {
          // Refresh active scene layout because branching display gets modified
          if (this.activeSceneId) this.selectScene(this.activeSceneId);
        }
      };
      if ((elem.tagName === 'INPUT' && elem.type === 'number') || elem.tagName === 'TEXTAREA') {
        elem.oninput = () => this.triggerAutoSave();
      }
    });
  }

  // Fetch and display all projects on the server
  async loadProjectsList() {
    const listGrid = document.getElementById('projects-list-grid');
    if (!listGrid) return;
    listGrid.innerHTML = "";

    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error("Failed to load projects list");
      const projects = await response.json();

      projects.forEach(proj => {
        const card = document.createElement('div');
        card.className = "project-card glass-panel";
        
        card.innerHTML = `
          <div class="project-card-header">
            <span class="project-card-icon">📖</span>
            <div class="project-card-title">${proj.title}</div>
            <div class="project-card-author">by ${proj.author}</div>
          </div>
          <div class="project-card-actions">
            <a href="editor.html?project=${proj.id}" class="btn-primary">Edit Story</a>
            <a href="index.html?project=${proj.id}" target="_blank" class="btn-secondary">Play Game</a>
          </div>
        `;

        // Add delete button only if it's not the default demo project
        if (proj.id !== 'demo') {
          const delBtn = document.createElement('button');
          delBtn.className = "btn-delete-project";
          delBtn.innerHTML = "×";
          delBtn.title = "Delete Project";
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
    } catch (e) {
      console.warn("Could not load projects from server.", e);
    }

    // Always add the "Create New Project" card at the end
    const createCard = document.createElement('div');
    createCard.className = "create-card";
    createCard.onclick = () => {
      document.getElementById('project-create-id').value = "";
      document.getElementById('project-create-title').value = "";
      document.getElementById('project-create-author').value = "";
      document.getElementById('project-create-modal').classList.remove('hidden');
    };
    createCard.innerHTML = `
      <div class="create-card-icon">➕</div>
      <span>Create New Story</span>
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
      return `<div class="select-preview-thumb muted">❌</div>`;
    }
    
    const projectId = this.projectId || 'demo';
    
    if (value.startsWith('data/')) {
      if (value.includes('/bg/') || value.includes('/char/')) {
        return `<div class="select-preview-thumb" style="background-image: url('${value}');"></div>`;
      } else if (value.includes('/music/')) {
        return `<div class="select-preview-thumb">🎵</div>`;
      } else if (value.includes('/sound/')) {
        return `<div class="select-preview-thumb">🔊</div>`;
      }
    }
    
    if (assetType === 'bg') {
      const file = (this.assets.bg || []).find(f => f.replace(/\.[^/.]+$/, "") === value);
      if (file) {
        const path = `data/projects/${projectId}/assets/bg/${file}`;
        return `<div class="select-preview-thumb" style="background-image: url('${path}');"></div>`;
      }
    } else if (assetType === 'music') {
      return `<div class="select-preview-thumb">🎵</div>`;
    } else if (assetType === 'sound') {
      return `<div class="select-preview-thumb">🔊</div>`;
    } else if (assetType === 'video') {
      return `<div class="select-preview-thumb">🎥</div>`;
    } else if (assetType === 'char') {
      const char = (this.project.assets.characters || []).find(c => c.id === value);
      if (char && char.sprites && char.sprites.length > 0) {
        return `<div class="select-preview-thumb" style="background-image: url('${char.sprites[0].path}'); background-size: contain; background-repeat: no-repeat;"></div>`;
      }
      return `<div class="select-preview-thumb">👤</div>`;
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
      return `<div class="select-preview-thumb">🎬</div>`;
    }
    
    return `<div class="select-preview-thumb">📄</div>`;
  }

  openUniversalSelectModal(select) {
    this.activeUniversalSelect = select;
    const assetType = select.getAttribute('data-asset-type');
    
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      this.previewAudioElement = null;
    }
    
    const modal = document.getElementById('universal-select-modal');
    modal.classList.remove('hidden');
    
    const title = document.getElementById('universal-modal-title');
    let titleText = "Select Option";
    if (assetType === 'bg') titleText = "Select Background";
    else if (assetType === 'music') titleText = "Select Music BGM";
    else if (assetType === 'sound') titleText = "Select Sound / Voice Clip";
    else if (assetType === 'video') titleText = "Select Video Cutscene";
    else if (assetType === 'char') titleText = "Select Character";
    else if (assetType === 'expression') titleText = "Select Character Expression";
    else if (assetType === 'char-sprite-file') titleText = "Select Sprite Image File";
    else if (assetType === 'scene') titleText = "Select Destination Scene";
    else if (assetType === 'ending') titleText = "Select Ending Trigger";
    title.innerText = titleText;
    
    const searchInput = document.getElementById('universal-search-input');
    searchInput.placeholder = `Search ${titleText.toLowerCase()}...`;
    searchInput.value = "";
    
    const uploadBtn = document.getElementById('universal-upload-btn');
    const uploadTypes = {
      'bg': 'bg',
      'music': 'music',
      'sound': 'sound',
      'video': 'video',
      'char-sprite-file': 'char'
    };
    if (uploadTypes[assetType]) {
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
    
    const list = document.getElementById('universal-modal-list');
    list.innerHTML = "";
    
    const options = Array.from(select.options);
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
    if (['bg', 'char', 'expression', 'char-sprite-file', 'scene'].includes(assetType)) {
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
        const file = (this.assets.bg || []).find(f => f.replace(/\.[^/.]+$/, "") === val);
        if (file) {
          const path = `data/projects/${projectId}/assets/bg/${file}`;
          previewHtml = `<div class="universal-card-preview-image" style="background-image: url('${path}');"></div>`;
        } else {
          previewHtml = `<div class="universal-card-preview-image empty-preview">🚫</div>`;
        }
      } else if (assetType === 'char') {
        const char = (this.project.assets.characters || []).find(c => c.id === val);
        if (char && char.sprites && char.sprites.length > 0) {
          previewHtml = `<div class="universal-card-preview-image char-preview" style="background-image: url('${char.sprites[0].path}'); background-size: contain;"></div>`;
        } else {
          previewHtml = `<div class="universal-card-preview-image empty-preview">👤</div>`;
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
      
      if (['bg', 'char', 'expression', 'char-sprite-file', 'scene'].includes(assetType)) {
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';
        card.style.padding = '8px';
        card.style.textAlign = 'center';
        
        card.innerHTML = `
          ${previewHtml}
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
            <div class="universal-item-title" title="${label}">${label}</div>
            <button type="button" class="voice-btn-select" style="width: 100%; margin-top: 4px;" onclick="window.editor.selectUniversalItem('${val}')">
              ${isCurrent ? 'Selected' : 'Select'}
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
              ${isCurrent ? 'Selected' : 'Select'}
            </button>
          </div>
        `;
      }
      
      list.appendChild(card);
    });
  }

  previewUniversalAsset(folder, filename, btnElem) {
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      const prevBtn = this.previewAudioElement.btn;
      if (prevBtn) prevBtn.innerText = "▶ Preview";

      if (this.previewAudioElement.filename === filename) {
        this.previewAudioElement = null;
        return;
      }
    }

    const path = `data/projects/${this.projectId || 'demo'}/assets/${folder}/${filename}`;
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

    const path = `data/projects/${this.projectId || 'demo'}/assets/video/${filename}`;
    
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
        <button style="position:absolute; top:15px; right:15px; background:rgba(0,0,0,0.5); border:none; color:white; font-size:1.5rem; width:40px; height:40px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; hover:background:rgba(0,0,0,0.8);" onclick="this.closest('#universal-video-preview-overlay').remove()">&times;</button>
      </div>
      <div style="color:white; font-weight:600;">${filename}</div>
    `;
    
    document.body.appendChild(overlay);
    btnElem.innerText = "⏹ Stop";
    
    overlay.querySelector('video').onended = () => {
      btnElem.innerText = "▶ Preview";
      overlay.remove();
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        btnElem.innerText = "▶ Preview";
        overlay.remove();
      }
    };
  }

  selectUniversalItem(val) {
    const select = this.activeUniversalSelect;
    if (!select) return;
    
    this.playSynthSFX('click');
    
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      this.previewAudioElement = null;
    }
    
    const videoPreview = document.getElementById('universal-video-preview-overlay');
    if (videoPreview) videoPreview.remove();
    
    select.value = val;
    select.dispatchEvent(new Event('change'));
    
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
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target.result;
        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              type: 'char',
              project: window.editor.projectId || 'demo',
              data: base64Data
            })
          });
          
          const res = await response.json();
          if (!res.success) throw new Error(res.error);
          
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
          window.editor.updateSaveStatus("All changes saved");
        }
      };
      reader.readAsDataURL(file);
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
  const grid = document.getElementById('scene-meta-grid');
  const status = document.getElementById('scene-meta-toggle-status');
  const arrow = document.getElementById('scene-meta-toggle-arrow');
  if (grid) {
    const isHidden = grid.classList.toggle('hidden');
    if (status) status.innerText = isHidden ? "(collapsed)" : "(expanded)";
    if (arrow) arrow.innerText = isHidden ? "▼" : "▲";
  }
}

// Initialize editor on load
window.onload = () => {
  window.editor = new VNFairyEditor();
  window.editor.init();
};
