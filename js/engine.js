/**
 * VNFairy - Core Player Engine
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 * 
 * VNFairy Special Exception:
 * As a special exception, the copyright holders of this software grant
 * permission to distribute packaged Visual Novel (VN) projects run by
 * unmodified VNFairy player runtime files, without the packaged VN content
 * itself being subject to the GPL. See LICENSE.txt in the root directory for details.
 */

const playerWorkspace = window.VNFairyWorkspace;

class VNFairyEngine {
  constructor() {
    this.version = (window.VNFairyCore && window.VNFairyCore.versioning.DEFAULT_ENGINE_VERSION) || "2.0.0";
    this.project = null;
    this.currentSceneId = null;
    this.dialogueIndex = 0;
    this.history = [];
    this.autoPlayActive = false;
    this.skipActive = false;
    this.skipForce = false; // true while Ctrl is held: skip ignores read status
    this.variables = {};

    // Rollback snapshots (one per displayed line) and read-line tracking
    this.rollbackStack = [];
    this.inlineBranch = null; // set while playing a choice's inline dialogue
    this.seenLines = null; // lazily loaded Set of line keys
    this.seenSaveTimer = null;
    this.lastWheelRollback = 0;

    // Audio Context for fallback synthesizers
    this.audioCtx = null;
    this.synthInterval = null;
    this.activeAudioElement = null;
    this.musicVolume = 0.7;
    this.sfxVolume = 0.7;

    // Typewriter timer
    this.typewriterTimer = null;
    this.isTyping = false;
    this.fullTextToType = "";
    
    // Options
    this.textSpeed = 40; // ms per char (lower = faster)
    this.textSize = 'medium'; // 'small' | 'medium' | 'large'
    this.skipSpeed = 'medium'; // 'slow' | 'medium' | 'fast'
    this.skipUnread = false; // false = skip stops at text the player hasn't read

    this.unlockedEndings = [];
    this.isBeforeTitle = false;

    this.bindEvents();

    document.addEventListener('fullscreenchange', () => {
      this.updateFullScreenUI();
    });

    // Auto-unlock blocked audio elements on first user gesture
    document.addEventListener('click', () => {
      if (this.activeAudioElement && this.activeAudioElement.paused) {
        this.activeAudioElement.play().catch(() => {});
      }
    });
  }

  // Initialize and load project JSON
  async init() {
    const loader = document.getElementById('loader');
    
    // Check if project data is pre-loaded via packaged script
    if (window.vnFairyProject) {
      console.log("Loading pre-loaded packaged project data.");
      this.loadProject(window.vnFairyProject);
      return;
    }
    
    // Check search parameters for project ID
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project') || urlParams.get('id');

    // If running offline (file://) or explicitly loaded via file upload, fallback
    if (window.location.protocol === 'file:') {
      console.warn("Running offline via file:// protocol. Prompting local project upload.");
      loader.classList.add('hidden');
      document.getElementById('fallback-loader').classList.remove('hidden');
      return;
    }

    try {
      await playerWorkspace.init();
      await playerWorkspace.bindControls(document.getElementById('player-workspace-storage'));
      // With no project selected, show the active workspace.
      if (!projectId) {
        const response = await playerWorkspace.request(`/api/projects?_t=${Date.now()}`);
        const projects = await response.json();
        if (!response.ok) throw new Error(projects.error || 'Could not load projects list');
        
        loader.classList.add('hidden');
        this.showProjectsSelectionScreen(projects);
        return;
      }

      // Fetch the specific project
      const response = await playerWorkspace.request(`/api/project?id=${encodeURIComponent(projectId)}&_t=${Date.now()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Project load failed');
      await playerWorkspace.loadMedia(projectId);
      if (playerWorkspace.mode !== 'server') this.workspaceScope = location.pathname.replace(/[^/]*$/, '') + playerWorkspace.recoveryScope;
      this.loadProject(data);
    } catch (err) {
      console.warn("Could not load workspace.", err);
      loader.classList.add('hidden');
      this.showProjectsSelectionScreen([]);
      const error = document.getElementById('player-workspace-error');
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }

  // Display beautiful selection screen of visual novels
  showProjectsSelectionScreen(projects) {
    const portal = document.getElementById('projects-portal');
    const list = document.getElementById('portal-projects-list');
    if (window.VNFairyPlayerViews) {
      window.VNFairyPlayerViews.renderProjectSelection(list, projects);
      portal.classList.remove('hidden');
      return;
    }
    list.innerHTML = "";
    
    if (projects.length === 0) {
      list.innerHTML = `
        <div class="muted" style="text-align:center; padding: 20px 0; font-size: 0.95rem;">
          No visual novels found in this workspace.<br>
          Open the <a href="editor.html" style="color:var(--primary); font-weight:600; text-decoration:none;">Designer</a> to create your first story!
        </div>
      `;
    } else {
      projects.forEach(proj => {
        const item = document.createElement('div');
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); border: 1px solid var(--border-color); padding: 16px 20px; border-radius: var(--radius-md); transition: border-color 0.2s, background 0.2s;";
        item.className = "portal-item";
        
        item.innerHTML = `
          <div>
            <div style="font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; color: var(--text-main);">${proj.title}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">by ${proj.author}</div>
          </div>
          <button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="window.location.search = '?project=${proj.id}'">Play Game</button>
        `;
        list.appendChild(item);
      });
    }
    
    portal.classList.remove('hidden');
  }

  isNewerVersion(projVer, currVer) {
    return window.VNFairyCore && window.VNFairyCore.versioning
      ? window.VNFairyCore.versioning.isNewerVersion(projVer, currVer)
      : false;
  }

  showVersionError(projVer, currVer) {
    if (window.VNFairyDom) {
      window.VNFairyDom.showCompatibilityError({
        hiddenIds: ['loader', 'projects-portal', 'fallback-loader'],
        gameLabel: 'game',
        artifactVersion: projVer,
        currentVersion: currVer,
        backHref: ''
      });
      return;
    }
    // Hide loader and portal selection
    document.getElementById('loader').classList.add('hidden');
    const portal = document.getElementById('projects-portal');
    if (portal) portal.classList.add('hidden');
    
    // Create fullscreen version error view
    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:#0f172a; color:#e2e8f0; font-family:var(--font-sans); padding:20px; box-sizing:border-box; z-index:99999;";
    overlay.innerHTML = `
      <div class="glass-panel" style="max-width:500px; padding:30px; text-align:center; border:1px solid rgba(239,68,68,0.2); border-radius:12px; background:rgba(30,41,59,0.7); box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <div style="font-size:3.5rem; margin-bottom:15px; color:#ef4444;">⚠️</div>
        <h2 style="margin:0 0 12px 0; font-size:1.5rem; font-family:var(--font-display); font-weight:700;">Version Incompatibility</h2>
        <p style="margin:0 0 20px 0; font-size:0.95rem; color:#94a3b8; line-height:1.6;">
          This game was created in a newer version of VNFairy (<strong style="color:#ef4444;">v${projVer}</strong>).
          <br>Your player version of VNFairy is <strong style="color:#38bdf8;">v${currVer}</strong>.
        </p>
        <p style="margin:0 0 24px 0; font-size:0.85rem; color:#64748b; line-height:1.5; font-style:italic;">
          Please update VNFairy to the latest version to play this game.
        </p>
        <button class="btn-secondary" onclick="window.location.search=''" style="padding:10px 20px; font-size:0.9rem;">Back to Selection</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // Load project data directly (either from server fetch or drop zone file)
  loadProject(projectData) {
    if (projectData.vnFairyVersion && this.isNewerVersion(projectData.vnFairyVersion, this.version)) {
      this.showVersionError(projectData.vnFairyVersion, this.version);
      return;
    }
    
    try {
      this.project = window.VNFairyCore && window.VNFairyCore.migrations
        ? window.VNFairyCore.migrations.migrateProject(projectData, { engineVersion: this.version })
        : projectData;
    } catch (error) {
      if (error.code === 'FUTURE_PROJECT_SCHEMA') {
        this.showVersionError(projectData && (projectData.engineVersion || projectData.vnFairyVersion || projectData.schemaVersion), this.version);
        return;
      }
      throw error;
    }
    this.seenLines = null;
    this.rollbackStack = [];
    if (!this.project.id) this.project.id = this.legacyProjectId(this.project);
    this.unlockedEndings = this.readProjectStorage('endings', []);
    this.unlockedAssets = this.readProjectStorage('unlocked_assets', []);
    
    document.getElementById('game-title').innerText = this.project.title || "My Visual Novel";
    document.getElementById('game-author').innerText = `by ${this.project.author || "Unknown"}`;
    document.title = this.project.title || "VNFairy Player";

    // Set Text Speed Slider default from project config
    if (this.project.config && this.project.config.textSpeed) {
      this.textSpeed = this.project.config.textSpeed;
    }

    // Load and apply persisted player settings (overrides project defaults)
    this.loadSettings();

    // Hide loader, show game container
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('fallback-loader').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');

    // Apply UI theme and accent color configurations
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      if (this.project.config && this.project.config.theme === 'light') {
        gameContainer.classList.add('light-theme');
      } else {
        gameContainer.classList.remove('light-theme');
      }

      if (this.project.config && this.project.config.accentColor) {
        const hex = this.project.config.accentColor;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        gameContainer.style.setProperty('--primary', hex);
        gameContainer.style.setProperty('--primary-glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
        gameContainer.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${hex}, ${hex}cc)`);
      } else {
        gameContainer.style.removeProperty('--primary');
        gameContainer.style.removeProperty('--primary-glow');
        gameContainer.style.removeProperty('--gradient-primary');
      }
    }

    const startOverlay = document.getElementById('start-click-overlay');

    const launchAction = () => {
      const launchBehavior = this.project.config && this.project.config.launchBehavior;
      if (launchBehavior && launchBehavior !== 'title' && this.project.scenes && this.project.scenes[launchBehavior]) {
        this.isBeforeTitle = true;
        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('stage-screen').classList.remove('hidden');
        this.loadScene(launchBehavior);
      } else {
        this.isBeforeTitle = false;
        this.showTitleScreen();
      }
    };

    if (startOverlay) {
      startOverlay.classList.remove('hidden');
      startOverlay.onclick = () => {
        this.initAudio();
        startOverlay.classList.add('fade-out-start');
        setTimeout(() => {
          startOverlay.classList.add('hidden');
          startOverlay.classList.remove('fade-out-start');
          launchAction();
        }, 300);
      };
    } else {
      launchAction();
    }
    this.initDebugMenu();
  }

  legacyProjectId(project) {
    const source = `${project.title || ''}|${project.author || ''}|${project.startSceneId || ''}`;
    let hash = 5381;
    for (let i = 0; i < source.length; i++) hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
    return `legacy-${(hash >>> 0).toString(36)}`;
  }

  projectStorageKey(namespace) {
    const projectId = (this.project && this.project.id) || 'default';
    const prefix = this.workspaceScope ? `${this.workspaceScope}:` : '';
    return `${prefix}vnfairy_${namespace}_${projectId}`;
  }

  readProjectStorage(namespace, fallback) {
    const key = this.projectStorageKey(namespace);
    let raw = localStorage.getItem(key);
    if (raw === null && !this.workspaceScope && this.project && this.project.title) {
      const legacyKey = `vnfairy_${namespace}_${this.project.title}`;
      raw = localStorage.getItem(legacyKey);
      if (raw !== null) localStorage.setItem(key, raw);
    }
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`Ignoring invalid local ${namespace} data.`, err);
      return fallback;
    }
  }

  writeProjectStorage(namespace, value) {
    localStorage.setItem(this.projectStorageKey(namespace), JSON.stringify(value));
  }

  getPlayerSaves() {
    const stored = this.readProjectStorage('saves', {});
    const saves = {};
    Object.entries(stored && typeof stored === 'object' ? stored : {}).forEach(([slot, value]) => {
      try {
        saves[slot] = window.VNFairyCore && window.VNFairyCore.saveGameSerializer
          ? window.VNFairyCore.saveGameSerializer.deserialize(value, {
            projectId: this.project && this.project.id,
            projectSchemaVersion: this.project && this.project.schemaVersion,
            engineVersion: this.version
          })
          : value;
      } catch (error) {
        console.warn(`Ignoring invalid save slot ${slot}.`, error);
      }
    });
    return saves;
  }

  setPlayerSaves(saves) {
    this.writeProjectStorage('saves', saves);
  }

  // Initialize Audio Context on user interaction
  initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Play synthesised retro sound effect
  playSynthSFX(type) {
    if (type === 'click') {
      const clickSoundConfig = this.project && this.project.config && this.project.config.uiClickSound;
      if (clickSoundConfig === 'none') {
        return; // Muted
      }
      if (clickSoundConfig && clickSoundConfig !== 'default') {
        // Resolve custom sound asset
        let fileSrc = "";
        if (this.project.assets && this.project.assets.sound) {
          const asset = this.project.assets.sound.find(s => s.id === clickSoundConfig);
          if (asset) fileSrc = asset.path;
        }
        if (fileSrc) {
          const sfx = new Audio(playerWorkspace.resolveMedia(fileSrc));
          sfx.volume = this.sfxVolume;
          sfx.play().catch(err => {
            console.warn("Failed to play custom click SFX: " + fileSrc, err);
          });
          return;
        }
      }
    }

    this.initAudio();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    const now = this.audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.sfxVolume * 0.15, now + 0.02);

    if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      gain.gain.setValueAtTime(this.sfxVolume * 0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'ending') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(261.63, now); // C4
      osc.frequency.setValueAtTime(329.63, now + 0.1); // E4
      osc.frequency.setValueAtTime(392.00, now + 0.2); // G4
      osc.frequency.setValueAtTime(523.25, now + 0.3); // C5
      gain.gain.setValueAtTime(this.sfxVolume * 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
    }
  }

  // Play media music
  playMusic(musicPathOrId) {
    if (this.currentMusicPathOrId === musicPathOrId) {
      // Already playing this BGM, carry it over without restarting (or resume if paused)
      if (this.activeAudioElement && this.activeAudioElement.paused && musicPathOrId !== 'stop') {
        this.activeAudioElement.play().catch(err => {});
      }
      return;
    }
    
    // Stop active audio tag
    if (this.activeAudioElement) {
      this.activeAudioElement.pause();
      this.activeAudioElement = null;
    }

    this.currentMusicPathOrId = musicPathOrId;

    if (musicPathOrId === 'stop' || !musicPathOrId) {
      return; // Ensure silence
    }

    // Attempt to resolve asset ID to path
    let fileSrc = musicPathOrId;
    if (this.project.assets && this.project.assets.music) {
      const asset = this.project.assets.music.find(m => m.id === musicPathOrId);
      if (asset) fileSrc = asset.path;
    }

    // Play html5 audio element
    const audio = new Audio(playerWorkspace.resolveMedia(fileSrc));
    audio.loop = true;
    audio.volume = this.musicVolume;
    this.activeAudioElement = audio;

    audio.play().catch(err => {
      console.warn("BGM playback delayed or blocked: " + fileSrc, err);
    });
  }

  // Fade out current BGM smoothly
  fadeOutMusic(durationMs = 300) {
    const audio = this.activeAudioElement;
    if (!audio || audio.paused) {
      return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    return new Promise((resolve) => {
      const startVolume = audio.volume;
      const startTime = performance.now();

      const fade = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        
        audio.volume = startVolume * (1 - progress);

        if (progress < 1) {
          requestAnimationFrame(fade);
        } else {
          audio.pause();
          audio.volume = startVolume; // reset for next play
          resolve();
        }
      };

      requestAnimationFrame(fade);
    });
  }

  // Smooth transition with full-screen fade to black and optional music fade-out
  async transitionWithFade(action, fadeOutMusic = false, durationMs = 300) {
    const fadeOverlay = document.getElementById('fade-overlay');
    if (!fadeOverlay) {
      action();
      return;
    }

    this.isFadingText = true; // Suspend clicking during transition
    fadeOverlay.classList.remove('hidden');
    // Force reflow
    fadeOverlay.offsetHeight;
    fadeOverlay.classList.add('visible');

    if (fadeOutMusic) {
      await this.fadeOutMusic(durationMs);
    } else {
      await new Promise(resolve => setTimeout(resolve, durationMs));
    }

    // Perform action (e.g. switch scenes / screens)
    action();

    // Fade back in
    fadeOverlay.classList.remove('visible');
    
    setTimeout(() => {
      fadeOverlay.classList.add('hidden');
      this.isFadingText = false;
    }, durationMs);
  }

  // Transition with a crossfade effect between scene backgrounds
  async transitionWithCrossfade(action) {
    const stageBg = document.getElementById('stage-bg');
    const bgTrans = document.getElementById('stage-bg-trans');
    
    const oldBgUrl = stageBg ? stageBg.style.backgroundImage : '';
    
    if (bgTrans && oldBgUrl) {
      this.isFadingText = true;
      bgTrans.style.transition = 'none';
      bgTrans.style.backgroundImage = oldBgUrl;
      bgTrans.style.opacity = '1';
      
      // Force reflow
      bgTrans.offsetHeight;
      
      await action();
      
      bgTrans.style.transition = 'opacity 800ms ease-in-out';
      bgTrans.style.opacity = '0';
      
      await new Promise(resolve => setTimeout(resolve, 800));
      bgTrans.style.backgroundImage = 'none';
      this.isFadingText = false;
    } else {
      await action();
    }
  }

  // Find active BGM for a given scene by tracing the path from the starting scene
  findActiveBGMForScene(targetSceneId) {
    const startSceneId = this.project.startSceneId;
    if (!startSceneId) return null;

    // Use BFS to find the shortest path from startSceneId to targetSceneId in the scenes graph
    const queue = [[startSceneId]];
    const visited = new Set([startSceneId]);
    let path = null;

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const lastSceneId = currentPath[currentPath.length - 1];

      if (lastSceneId === targetSceneId) {
        path = currentPath;
        break;
      }

      const scene = this.project.scenes[lastSceneId];
      if (!scene) continue;

      const nextScenes = [];
      if (scene.nextSceneId) {
        nextScenes.push(scene.nextSceneId);
      }
      if (scene.choices) {
        scene.choices.forEach(choice => {
          if (choice.action === 'jump' && choice.target) {
            nextScenes.push(choice.target);
          }
        });
      }

      for (const nextId of nextScenes) {
        if (!visited.has(nextId) && this.project.scenes[nextId]) {
          visited.add(nextId);
          queue.push([...currentPath, nextId]);
        }
      }
    }

    if (!path) {
      // Fallback: use target scene's own music
      const targetScene = this.project.scenes[targetSceneId];
      return targetScene ? targetScene.music : null;
    }

    // Trace forward along the path to find the most recent non-empty music setting
    let activeBGM = "";
    for (const sceneId of path) {
      const scene = this.project.scenes[sceneId];
      if (scene && scene.music !== undefined && scene.music !== "") {
        activeBGM = scene.music;
      }
    }

    return activeBGM;
  }

  // Set music volume
  setMusicVolume(val) {
    this.musicVolume = val;
    if (this.activeAudioElement) {
      this.activeAudioElement.volume = this.musicVolume;
    }
  }

  // Play media voice clip
  playVoice(voicePathOrId) {
    if (this.activeVoiceElement) {
      this.activeVoiceElement.pause();
      this.activeVoiceElement = null;
    }

    if (!voicePathOrId) {
      return;
    }

    // Attempt to resolve asset ID to path
    let fileSrc = voicePathOrId;
    if (this.project.assets && this.project.assets.sound) {
      const asset = this.project.assets.sound.find(s => s.id === voicePathOrId);
      if (asset) fileSrc = asset.path;
    }

    // Play html5 audio element
    const audio = new Audio(playerWorkspace.resolveMedia(fileSrc));
    audio.loop = false;
    audio.volume = this.sfxVolume;
    this.activeVoiceElement = audio;

    audio.play().catch(err => {
      console.warn("Voice playback delayed or blocked: " + fileSrc, err);
    });
  }

  // Set SFX volume
  setSFXVolume(val) {
    this.sfxVolume = val;
    if (this.activeVoiceElement) {
      this.activeVoiceElement.volume = this.sfxVolume;
    }
  }

  // Title Screen controls
  showTitleScreen() {
    this.initAudio();
    this.playVoice(null);
    this.stopVideoCutscene();
    this.autoPlayActive = false;
    this.skipActive = false;
    this.currentSceneId = null;
    this.rollbackStack = [];

    document.getElementById('stage-screen').classList.add('hidden');
    document.getElementById('credits-screen').classList.add('hidden');
    
    const galleryScreen = document.getElementById('gallery-screen');
    const musicScreen = document.getElementById('music-screen');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (musicScreen) musicScreen.classList.add('hidden');

    const saveLoadScreen = document.getElementById('save-load-screen');
    const optionsScreen = document.getElementById('options-screen');
    const achievementsScreen = document.getElementById('achievements-screen');
    if (saveLoadScreen) saveLoadScreen.classList.add('hidden');
    if (optionsScreen) optionsScreen.classList.add('hidden');
    if (achievementsScreen) achievementsScreen.classList.add('hidden');
    
    const confirmModal = document.getElementById('confirm-modal');
    if (confirmModal) confirmModal.classList.add('hidden');

    document.getElementById('title-screen').classList.remove('hidden');
 
    const config = this.project.config || {};
    const titleConfig = config.titleScreen || {};
    
    const galleryEnabled = !!config.galleryEnabled;
    const musicEnabled = !!config.musicEnabled;

    const btnGalleryNew = document.getElementById('btn-open-gallery-new');
    const btnMusic = document.getElementById('btn-open-music');
    const btnGalleryOld = document.getElementById('btn-open-gallery'); // Achievements

    if (galleryEnabled) {
      if (btnGalleryNew) btnGalleryNew.classList.remove('hidden');
    } else {
      if (btnGalleryNew) btnGalleryNew.classList.add('hidden');
    }
    if (btnGalleryOld) btnGalleryOld.classList.remove('hidden');

    if (musicEnabled) {
      if (btnMusic) btnMusic.classList.remove('hidden');
    } else {
      if (btnMusic) btnMusic.classList.add('hidden');
    }

    // Apply title background
    const bgElem = document.getElementById('title-bg');
    if (titleConfig.background) {
      // resolve asset background
      let src = titleConfig.background;
      if (this.project.assets && this.project.assets.backgrounds) {
        const asset = this.project.assets.backgrounds.find(b => b.id === titleConfig.background);
        if (asset) src = asset.path;
      }
      bgElem.style.backgroundImage = `url('${playerWorkspace.resolveMedia(src)}')`;
      bgElem.style.filter = "none";
    } else {
      bgElem.style.backgroundImage = "none";
      bgElem.style.filter = "none";
    }

    // Set colors
    if (titleConfig.titleColor) {
      document.getElementById('game-title').style.backgroundImage = 'none';
      document.getElementById('game-title').style.color = titleConfig.titleColor;
      document.getElementById('game-title').style.webkitTextFillColor = 'initial';
    }

    // Play title music
    this.playMusic(titleConfig.music);

    // Hide/show title text (allow logo-in-bg mode)
    const titleEl = document.getElementById('game-title');
    const authorEl = document.getElementById('game-author');
    if (titleConfig.hideTitleText) {
      titleEl.style.display = 'none';
      authorEl.style.display = 'none';
    } else {
      titleEl.style.display = '';
      authorEl.style.display = '';
    }

    // Apply menu layout
    const menu = document.getElementById('title-menu');
    const titleContainer = document.getElementById('title-screen');
    menu.className = 'title-menu';
    titleContainer.className = 'title-screen-container';
    titleContainer.style.removeProperty('--title-bar-bg');
    titleContainer.style.removeProperty('--title-bar-backdrop');
    const layout = titleConfig.menuLayout || 'left';
    const configuredMenuFontSize = Number(titleConfig.menuFontSize);
    if (Number.isFinite(configuredMenuFontSize)) {
      const menuFontSize = Math.min(2, Math.max(0.75, configuredMenuFontSize));
      titleContainer.style.setProperty('--title-menu-font-size', `${menuFontSize}rem`);
    } else {
      titleContainer.style.removeProperty('--title-menu-font-size');
    }
    if (layout === 'center') {
      titleContainer.classList.add('title-layout-center');
    } else if (layout === 'right') {
      titleContainer.classList.add('title-layout-right');
    } else if (layout === 'bottom') {
      titleContainer.classList.add('title-layout-bottom');
      menu.classList.add('title-menu-bottom');
    } else if (layout === 'bottom-bar') {
      titleContainer.classList.add('title-layout-bottom-bar');
      menu.classList.add('title-menu-bottom-bar');
      
      const opacityVal = titleConfig.menuButtonBgOpacity !== undefined ? (titleConfig.menuButtonBgOpacity / 100) : 0.25;
      const bgStyle = titleConfig.menuButtonBgStyle || 'blur';
      
      let barBg = `rgba(255, 255, 255, ${opacityVal})`; // Default fallback
      if (titleConfig.menuButtonBgColor) {
        const hex = titleConfig.menuButtonBgColor;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        barBg = `rgba(${r}, ${g}, ${b}, ${opacityVal})`;
      }
      
      if (bgStyle === 'solid') {
        titleContainer.style.setProperty('--title-bar-bg', barBg);
        titleContainer.style.setProperty('--title-bar-backdrop', 'none');
      } else if (bgStyle === 'none') {
        titleContainer.style.setProperty('--title-bar-bg', 'transparent');
        titleContainer.style.setProperty('--title-bar-backdrop', 'none');
      } else {
        titleContainer.style.setProperty('--title-bar-bg', barBg);
        titleContainer.style.setProperty('--title-bar-backdrop', 'blur(12px)');
      }
    }

    // Apply overlay shading toggle
    if (titleConfig.noShading) {
      titleContainer.classList.add('title-no-overlay');
    }

    // Apply menu button text colour
    if (titleConfig.menuButtonColor) {
      titleContainer.style.setProperty('--title-btn-color', titleConfig.menuButtonColor);
    } else {
      titleContainer.style.removeProperty('--title-btn-color');
    }

    // Apply menu button outline/border colour
    if (titleConfig.menuButtonBorder) {
      titleContainer.style.setProperty('--title-btn-border', titleConfig.menuButtonBorder);
    } else {
      titleContainer.style.removeProperty('--title-btn-border');
    }

    // Apply menu button background style
    const bgStyle = titleConfig.menuButtonBgStyle || 'blur';
    if (bgStyle === 'solid' && titleConfig.menuButtonBgColor) {
      // Solid color, no blur
      titleContainer.style.setProperty('--title-btn-bg', titleConfig.menuButtonBgColor);
      titleContainer.style.setProperty('--title-btn-backdrop', 'none');
    } else if (bgStyle === 'none') {
      // Fully transparent, no blur
      titleContainer.style.setProperty('--title-btn-bg', 'transparent');
      titleContainer.style.setProperty('--title-btn-backdrop', 'none');
    } else {
      // Default: glassmorphism blur
      if (titleConfig.menuButtonBgColor) {
        // Apply translucency to the custom color for glassmorphism
        const hex = titleConfig.menuButtonBgColor;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const opacityVal = titleConfig.menuButtonBgOpacity !== undefined ? (titleConfig.menuButtonBgOpacity / 100) : 0.25;
        titleContainer.style.setProperty('--title-btn-bg', `rgba(${r}, ${g}, ${b}, ${opacityVal})`);
      } else {
        titleContainer.style.removeProperty('--title-btn-bg');
      }
      titleContainer.style.removeProperty('--title-btn-backdrop');
    }
  }

  // Start new game
  startGame() {
    this.playSynthSFX('click');
    this.transitionWithFade(async () => {
      document.getElementById('title-screen').classList.add('hidden');
      document.getElementById('stage-screen').classList.remove('hidden');
      
      this.variables = {};
      const logic = window.VNFairyCore && window.VNFairyCore.logicModel;
      this.variables = logic
        ? logic.createRuntimeVariables(this.project.config || {})
        : {};
      this.history = [];
      this.rollbackStack = [];
      this.isBeforeTitle = false;
      this.currentSceneId = null; // Clear previous scene to avoid double fade out
      await this.loadScene(this.project.startSceneId);
    }, true); // Fade out title music
  }

  // Load a Scene with optional fade/crossfade transition based on configuration
  async loadScene(sceneId) {
    const oldScene = this.project.scenes && this.project.scenes[this.currentSceneId];
    const transition = oldScene ? (oldScene.sceneTransition || (oldScene.fadeOutScene ? 'fade' : 'off')) : 'off';

    if (oldScene && transition === 'fade') {
      if (this._isTransitioning) return;
      this._isTransitioning = true;
      
      await this.transitionWithFade(async () => {
        this._isTransitioning = false;
        await this.executeLoadScene(sceneId);
      }, true); // Fade out BGM too
      return;
    } else if (oldScene && transition === 'next') {
      if (this._isTransitioning) return;
      this._isTransitioning = true;
      
      await this.transitionWithCrossfade(async () => {
        this._isTransitioning = false;
        await this.executeLoadScene(sceneId);
      });
      return;
    }

    await this.executeLoadScene(sceneId);
  }

  async ensureSceneLoaded(sceneId) {
    // If the scene data is already fully loaded in memory, return immediately
    if (this.project && this.project.scenes && this.project.scenes[sceneId] && Array.isArray(this.project.scenes[sceneId].dialogue)) {
      return;
    }

    const projectId = this.project.id || 'demo';

    // If running under file:// protocol, load the scene as a JS script tag to bypass CORS
    if (window.location.protocol === 'file:') {
      const fetchPath = `data/projects/${projectId}/scenes/${sceneId}.js`;
      await this.loadSceneScript(sceneId, fetchPath);
      return;
    }

    // Otherwise, we are running on a server, so we can fetch the .json file directly
    const fetchPath = `data/projects/${projectId}/scenes/${sceneId}.json`;
    try {
      const response = await fetch(`${fetchPath}?_t=${Date.now()}`);
      if (!response.ok) throw new Error('Fetch failed');
      const sceneData = await response.json();
      this.project.scenes = this.project.scenes || {};
      this.project.scenes[sceneId] = sceneData;
    } catch (err) {
      console.warn(`JSON fetch failed for ${sceneId}, trying JS fallback...`, err);
      const fallbackPath = `data/projects/${projectId}/scenes/${sceneId}.js`;
      await this.loadSceneScript(sceneId, fallbackPath);
    }
  }

  loadSceneScript(sceneId, src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        script.remove();
        if (window.vnFairyScenes && window.vnFairyScenes[sceneId]) {
          this.project.scenes = this.project.scenes || {};
          this.project.scenes[sceneId] = window.vnFairyScenes[sceneId];
          delete window.vnFairyScenes[sceneId]; // Clean up registry memory
          resolve();
        } else {
          reject(new Error(`Scene ${sceneId} not found in window.vnFairyScenes`));
        }
      };
      script.onerror = (err) => {
        script.remove();
        reject(err);
      };
      document.head.appendChild(script);
    });
  }

  async executeLoadScene(sceneId) {
    this.initAudio();
    this.stopVideoCutscene();
    
    this.checkAssetUnlock('scene', sceneId);
    
    try {
      await this.ensureSceneLoaded(sceneId);
    } catch (err) {
      console.error(`Failed to load scene data for ${sceneId}:`, err);
    }
    
    if (!this.project.scenes || !this.project.scenes[sceneId] || !Array.isArray(this.project.scenes[sceneId].dialogue)) {
      console.error(`Scene ${sceneId} not found or incomplete! Redirecting to title.`);
      this.showTitleScreen();
      return;
    }

    const scene = this.project.scenes[sceneId];
    this.currentSceneId = sceneId;
    this.dialogueIndex = 0;
    this.inlineBranch = null;
    this.history = [];

    // Load music (if defined, otherwise continue playing / resume current music)
    if (this.isDebugJump) {
      this.isDebugJump = false;
      const activeBGM = this.findActiveBGMForScene(sceneId);
      if (activeBGM) {
        this.playMusic(activeBGM);
      } else {
        this.playMusic('stop');
      }
    } else if (scene.music !== undefined && scene.music !== "") {
      this.playMusic(scene.music);
    } else {
      if (this.activeAudioElement && this.activeAudioElement.paused && this.currentMusicPathOrId !== 'stop') {
        this.activeAudioElement.play().catch(err => {});
      }
    }

    // Check if video cutscene
    if (scene.isCutscene && scene.video) {
      if (this.activeAudioElement) {
        this.activeAudioElement.pause();
      }

      // Hide HUD container and dialogue box during videos
      const hudContainer = document.getElementById('hud-container');
      if (hudContainer) {
        hudContainer.classList.add('hidden');
      }
      const dialogueBox = document.getElementById('dialogue-box');
      if (dialogueBox) {
        dialogueBox.classList.add('hidden');
      }

      const videoContainer = document.getElementById('stage-video-container');
      const videoEl = document.getElementById('stage-video');
      
      if (videoContainer && videoEl) {
        videoContainer.classList.remove('hidden');
        
        let videoSrc = scene.video;
        if (this.project.assets && this.project.assets.video) {
          const asset = this.project.assets.video.find(v => v.id === scene.video);
          if (asset) videoSrc = asset.path;
        }
        
        videoEl.src = playerWorkspace.resolveMedia(videoSrc);
        videoEl.volume = this.sfxVolume;
        
        videoEl.play().catch(err => {
          console.warn("Video playback blocked/failed: " + videoSrc, err);
          this.skipCutscene();
        });

        const skipBtn = document.getElementById('video-skip-btn');
        if (skipBtn) {
          skipBtn.onclick = (e) => {
            e.stopPropagation();
            this.skipCutscene();
          };
        }

        videoEl.onended = () => {
          this.skipCutscene();
        };
        
        return;
      }
    }

    // Load background
    let bgSrc = "";
    const useSolidWhiteBackground = scene.background === '__solid_white__';
    if (scene.background && !useSolidWhiteBackground) {
      if (this.project.assets && this.project.assets.backgrounds) {
        const asset = this.project.assets.backgrounds.find(b => b.id === scene.background);
        if (asset) bgSrc = asset.path;
      }
    }
    
    const stageBg = document.getElementById('stage-bg');
    stageBg.style.backgroundColor = useSolidWhiteBackground ? '#ffffff' : 'transparent';
    if (useSolidWhiteBackground) {
      stageBg.style.backgroundImage = 'none';
    } else if (bgSrc) {
      stageBg.style.backgroundImage = `url('${playerWorkspace.resolveMedia(bgSrc)}')`;
    } else {
      const isLightTheme = this.project.config && this.project.config.theme === 'light';
      stageBg.style.backgroundImage = isLightTheme
        ? 'linear-gradient(135deg, #ffffff, #e8edf4)'
        : 'linear-gradient(135deg, #1e293b, #0f172a)';
    }

    // Toggle fullscreen text and standard dialogue HUD layers
    const isCutsceneText = scene.isCutscene && (scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext');
    const isCutsceneImage = scene.isCutscene && scene.cutsceneType === 'image';
    const textContainer = document.getElementById('stage-fullscreen-text-container');
    const hudContainer = document.getElementById('hud-container');
    const dialogueBox = document.getElementById('dialogue-box');
    const charStage = document.getElementById('character-stage');

    if (charStage) {
      charStage.classList.remove('transition-slide', 'transition-off');
      const transition = scene.characterTransition || 'fade';
      if (transition === 'slide') {
        charStage.classList.add('transition-slide');
      } else if (transition === 'off') {
        charStage.classList.add('transition-off');
      }
    }

    if (textContainer) {
      if (isCutsceneText || isCutsceneImage) {
        textContainer.classList.remove('hidden');
        const contentEl = document.getElementById('fullscreen-text-content');
        if (contentEl) {
          contentEl.innerText = "";
          contentEl.classList.remove('visible');
        }
      } else {
        textContainer.classList.add('hidden');
      }
    }

    if (hudContainer) {
      hudContainer.classList.remove('hidden');
    }

    const quickMenu = document.querySelector('.quick-menu');
    if (quickMenu) {
      if (isCutsceneImage && scene.hideQuickMenu) {
        quickMenu.classList.add('hidden');
      } else {
        quickMenu.classList.remove('hidden');
      }
    }

    if (dialogueBox) {
      if (isCutsceneText || isCutsceneImage) {
        dialogueBox.classList.add('hidden');
      } else {
        dialogueBox.classList.remove('hidden');
      }
    }

    if (charStage) {
      if (isCutsceneText || isCutsceneImage) {
        charStage.classList.add('hidden');
      } else {
        charStage.classList.remove('hidden');
      }
    }

    this.playStep();
  }

  // Skip the currently active video cutscene
  skipCutscene() {
    this.stopVideoCutscene();
    
    // Resume background music or load next scene
    const scene = this.project.scenes[this.currentSceneId];
    if (scene && scene.nextSceneId) {
      this.loadScene(scene.nextSceneId);
    } else {
      if (this.isBeforeTitle) {
        this.isBeforeTitle = false;
        this.showTitleScreen();
      } else {
        this.showCreditsRoll();
      }
    }
  }

  // Stop video playback and hide cutscene overlay
  stopVideoCutscene() {
    const videoContainer = document.getElementById('stage-video-container');
    const videoEl = document.getElementById('stage-video');
    const skipBtn = document.getElementById('video-skip-btn');
    if (videoEl) {
      videoEl.pause();
      videoEl.src = "";
      videoEl.onended = null;
    }
    if (skipBtn) {
      skipBtn.onclick = null;
    }
    if (videoContainer) {
      videoContainer.classList.add('hidden');
      videoContainer.onclick = null;
    }
  }

  // Show a dialogue line
  playStep() {
    this.isTyping = false;
    if (this.typewriterTimer) clearTimeout(this.typewriterTimer);

    // Ensure the HUD text box container is visible when advancing/playing a new step
    const hud = document.getElementById('hud-container');
    if (hud && hud.classList.contains('hidden')) {
      hud.classList.remove('hidden');
    }

    const scene = this.project.scenes[this.currentSceneId];

    // Check if fullscreen image cutscene
    if (scene.isCutscene && scene.cutsceneType === 'image') {
      if (this.dialogueIndex >= 1) {
        this.handleSceneEnd(scene);
        return;
      }
      this.recordRollbackPoint();
      this.checkSkipUnread(this.markLineSeen(null));
      const textContainer = document.getElementById('stage-fullscreen-text-container');
      const contentEl = document.getElementById('fullscreen-text-content');
      const dialogueBox = document.getElementById('dialogue-box');
      const charStage = document.getElementById('character-stage');
      
      if (textContainer) textContainer.classList.remove('hidden');
      if (contentEl) {
        contentEl.innerText = "";
        contentEl.classList.remove('visible');
      }
      if (hud) hud.classList.remove('hidden');
      if (dialogueBox) dialogueBox.classList.add('hidden');
      if (charStage) charStage.classList.add('hidden');

      // Schedule auto/skip progress for image cutscene
      if (this.skipActive) {
        let delay = 150;
        if (this.skipSpeed === 'slow') delay = 300;
        else if (this.skipSpeed === 'fast') delay = 50;
        this.typewriterTimer = setTimeout(() => { this.nextStep(); }, delay);
      } else if (scene.autoProgressImage) {
        const duration = parseFloat(scene.autoProgressDuration) || 3;
        this.typewriterTimer = setTimeout(() => { this.nextStep(); }, duration * 1000);
      } else if (this.autoPlayActive) {
        this.typewriterTimer = setTimeout(() => { this.nextStep(); }, 2000);
      }
      return;
    }

    const dialogues = scene.dialogue || [];

    if (this.dialogueIndex >= dialogues.length) {
      // Scene text exhausted. Check branching or kinetic next scene
      if (scene.isCutscene && (scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext')) {
        const contentEl = document.getElementById('fullscreen-text-content');
        if (contentEl && contentEl.classList.contains('visible')) {
          this.isFadingText = true;
          contentEl.classList.remove('visible');
          setTimeout(() => {
            this.isFadingText = false;
            this.handleSceneEnd(scene);
          }, 350);
          return;
        }
      }
      this.handleSceneEnd(scene);
      return;
    }

    const step = dialogues[this.dialogueIndex];
    this.recordRollbackPoint();
    this.checkSkipUnread(this.markLineSeen(step));

    // Check if fullscreen text cutscene
    if (scene.isCutscene && (scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext')) {
      const contentEl = document.getElementById('fullscreen-text-content');
      const hud = document.getElementById('hud-container');
      const dialogueBox = document.getElementById('dialogue-box');
      if (hud) hud.classList.remove('hidden');
      if (dialogueBox) dialogueBox.classList.add('hidden');

      if (contentEl) {
        this.isFadingText = true;
        contentEl.classList.remove('visible');
        contentEl.classList.remove('animate-slide-down');
        contentEl.style.transform = ''; // Reset position

        const text = step.text || "";
        const useSlideDown = scene.cutsceneType === 'autotext' && scene.slideDownAnimation;

        const startNewStep = () => {
          contentEl.innerText = text;
          contentEl.style.color = scene.textColor || "#ffffff";
          contentEl.style.fontFamily = scene.fontFamily || "Arial, Helvetica, sans-serif";
          
          const isCaveat = scene.fontFamily && scene.fontFamily.includes('Caveat');
          if (isCaveat) {
            contentEl.classList.add('font-caveat');
          } else {
            contentEl.classList.remove('font-caveat');
          }
          contentEl.style.fontWeight = step.bold ? 'bold' : 'normal';
          contentEl.style.fontStyle = step.italic ? 'italic' : 'normal';
          contentEl.style.textDecoration = step.underline ? 'underline' : 'none';
          
          if (useSlideDown) {
            const duration = parseFloat(step.duration) || 3;
            contentEl.style.animationDuration = duration + 's';
            // Force reflow to restart CSS animation
            void contentEl.offsetWidth;
            contentEl.classList.add('animate-slide-down');
          } else {
            contentEl.classList.add('visible');
          }

          // Play voice clip if any
          if (step.voice) {
            this.playVoice(step.voice);
          } else {
            this.playVoice(null);
          }

          // Save to history
          this.history.push({
            speaker: "Narrator",
            text: text,
            type: 'narrator'
          });

          this.isFadingText = false;

          // If auto text mode, schedule next step automatically
          if (scene.cutsceneType === 'autotext') {
            const duration = parseFloat(step.duration) || 3;
            this.typewriterTimer = setTimeout(() => {
              this.nextStep();
            }, duration * 1000);
          }
        };

        if (this.dialogueIndex === 0 || !useSlideDown) {
          // If first step or not using slide down, use standard 350ms delay for smooth transition
          setTimeout(startNewStep, 350);
        } else {
          // If using slide down and not first step, start immediately since the previous step finished fading out
          startNewStep();
        }
        
        return;
      }
    }

    // Show name
    const speakerNameElem = document.getElementById('speaker-name');
    const speakerContainer = document.getElementById('speaker-container');
    const dialogueBox = document.getElementById('dialogue-box');
    
    let speakerName = "";
    let speakerColor = "var(--primary)";

    if (step.speaker === 'narrator') {
      speakerContainer.classList.add('hidden');
      if (dialogueBox) dialogueBox.classList.remove('has-speaker');
    } else {
      speakerContainer.classList.remove('hidden');
      if (dialogueBox) dialogueBox.classList.add('has-speaker');
      if (this.project.assets && this.project.assets.characters) {
        const char = this.project.assets.characters.find(c => c.id === step.speaker);
        if (char) {
          speakerName = char.name;
          speakerColor = char.color || "var(--primary)";
        }
      }
      if (!speakerName) speakerName = step.speaker;
      
      speakerNameElem.innerText = speakerName;
      speakerNameElem.style.color = speakerColor;
    }

    // Render characters layout
    this.renderCharacters(step.layout, step.speaker);

    // Play dialogue step voice clip
    if (step.voice) {
      this.playVoice(step.voice);
    } else {
      this.playVoice(null);
    }

    // Set dialogue text font and formatting styles
    const textElem = document.getElementById('dialogue-text');
    if (textElem) {
      textElem.style.fontFamily = scene.fontFamily || "Arial, Helvetica, sans-serif";
      
      const isCaveat = scene.fontFamily && scene.fontFamily.includes('Caveat');
      if (isCaveat) {
        textElem.classList.add('font-caveat');
      } else {
        textElem.classList.remove('font-caveat');
      }
      
      textElem.style.fontWeight = step.bold ? 'bold' : 'normal';
      textElem.style.fontStyle = step.italic ? 'italic' : 'normal';
      textElem.style.textDecoration = step.underline ? 'underline' : 'none';
    }

    // Type text
    this.fullTextToType = step.text || "";
    this.typeText(this.fullTextToType);

    // Save to history
    this.history.push({
      speaker: speakerName || "Narrator",
      text: this.fullTextToType,
      type: step.speaker === 'narrator' ? 'narrator' : 'character'
    });
  }

  // Typewriter effect
  typeText(text) {
    const textElem = document.getElementById('dialogue-text');
    const arrowElem = document.getElementById('dialogue-arrow');
    
    textElem.innerText = "";
    arrowElem.classList.remove('visible');
    
    // Check if speed is Instant (and we're not skipping or skip speed is fast)
    if (this.textSpeed === 0 && !this.skipActive) {
      this.isTyping = true; // Temporary flag to finish typing correctly
      this.finishTyping();
      return;
    }

    if (this.skipActive && this.skipSpeed === 'fast') {
      this.isTyping = true;
      this.finishTyping();
      return;
    }

    this.isTyping = true;
    let charIndex = 0;

    const typeChar = () => {
      if (charIndex < text.length) {
        textElem.innerText += text[charIndex];
        charIndex++;
        // If skip is active, speed up typewriter based on skip speed
        const speed = this.skipActive ? (this.skipSpeed === 'slow' ? 6 : 2) : this.textSpeed;
        this.typewriterTimer = setTimeout(typeChar, speed);
      } else {
        this.finishTyping();
      }
    };

    typeChar();
  }

  finishTyping() {
    this.isTyping = false;
    const textElem = document.getElementById('dialogue-text');
    textElem.innerText = this.fullTextToType; // Show entire string
    
    const arrowElem = document.getElementById('dialogue-arrow');
    arrowElem.classList.add('visible');

    // Handle skip/auto progression
    if (this.skipActive) {
      let delay = 150;
      if (this.skipSpeed === 'slow') delay = 300;
      else if (this.skipSpeed === 'fast') delay = 50;
      this.typewriterTimer = setTimeout(() => { this.nextStep(); }, delay);
    } else if (this.autoPlayActive) {
      // Auto advance after reading pause
      const readDelay = Math.max(1500, this.fullTextToType.length * 50);
      this.typewriterTimer = setTimeout(() => { this.nextStep(); }, readDelay);
    }
  }

  // Draw character sprites on stage
  renderCharacters(layout, activeSpeakerId) {
    const slots = {
      left: document.getElementById('char-left'),
      center: document.getElementById('char-center'),
      right: document.getElementById('char-right')
    };

    // If no layout is defined, keep existing or hide all
    if (!layout) {
      Object.values(slots).forEach(slot => {
        slot.classList.remove('active-slot');
      });
      return;
    }

    Object.keys(slots).forEach(pos => {
      const slot = slots[pos];
      const data = layout[pos];

      if (data && data.characterId) {
        // Resolve sprite file path
        let spritePath = "";
        let isNonVisual = false;
        let scale = 1;
        if (this.project.assets && this.project.assets.characters) {
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
        }

        if (spritePath && !isNonVisual) {
          const img = slot.querySelector('.char-sprite');
          img.src = playerWorkspace.resolveMedia(spritePath);
          img.style.transform = `scale(${scale})`;
          img.style.transformOrigin = 'bottom center';

          const isEntering = !slot.classList.contains('active-slot');

          // Highlight the active speaking character
          const currentScene = this.project.scenes && this.project.scenes[this.currentSceneId];
          const noDim = currentScene && currentScene.noDimCharacters;
          const transition = currentScene && currentScene.characterTransition || 'fade';
          const isFadeMode = (transition === 'fade');

          if (isEntering && isFadeMode) {
            slot.classList.add('entering');
          }

          if (noDim || data.characterId === activeSpeakerId) {
            slot.classList.add('speaking');
            slot.classList.remove('speaking-dimmed');
          } else {
            slot.classList.add('speaking-dimmed');
            slot.classList.remove('speaking');
          }

          if (isEntering) {
            void slot.offsetWidth; // Snap initial transform instantly before starting transition
          }

          slot.classList.add('active-slot');

          if (isEntering && isFadeMode) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                slot.classList.remove('entering');
              });
            });
          }
        } else {
          slot.classList.remove('active-slot');
        }
      } else {
        slot.classList.remove('active-slot');
      }
    });
  }

  // Navigate to next dialogue index or branch
  nextStep() {
    this.initAudio();
    if (this.isFadingText) return;
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    if (this.isTyping) {
      this.finishTyping();
      return;
    }

    this.dialogueIndex++;
    this.playStep();
  }

  // Snapshot the line about to be shown so the player can roll back to it
  recordRollbackPoint() {
    const scene = this.project.scenes[this.currentSceneId];
    const stack = this.rollbackStack;
    const top = stack[stack.length - 1];
    const point = {
      currentSceneId: this.currentSceneId,
      dialogueIndex: this.dialogueIndex,
      dialogue: scene.dialogue,
      inlineBranch: this.inlineBranch,
      isBeforeTitle: this.isBeforeTitle,
      variables: JSON.parse(JSON.stringify(this.variables || {})),
      history: this.history,
      historyLength: this.history.length
    };
    // Re-playing the same line (e.g. after a load or rollback) replaces its snapshot
    if (top && top.currentSceneId === point.currentSceneId && top.dialogueIndex === point.dialogueIndex && top.dialogue === point.dialogue) {
      stack[stack.length - 1] = point;
    } else {
      stack.push(point);
      if (stack.length > 200) stack.shift();
    }
  }

  // Step back to the previously displayed line
  rollback() {
    if (this.isFadingText || this._isTransitioning) return;
    const stack = this.rollbackStack;
    const scene = this.project.scenes[this.currentSceneId];
    const top = stack[stack.length - 1];
    // The top snapshot is the line on screen, unless we've moved past it (e.g. to a choice menu)
    if (top && scene && top.currentSceneId === this.currentSceneId && top.dialogueIndex === this.dialogueIndex && top.dialogue === scene.dialogue) {
      stack.pop();
    }
    const point = stack.pop();
    if (!point) {
      if (top) stack.push(top);
      this.showToast("Can't roll back any further.");
      return;
    }

    if (this.typewriterTimer) clearTimeout(this.typewriterTimer);
    this.typewriterTimer = null;
    this.isTyping = false;
    this.autoPlayActive = false;
    this.skipActive = false;
    this.updateQuickMenuState();
    document.getElementById('choices-overlay').classList.add('hidden');

    point.history.length = point.historyLength;
    const state = {
      currentSceneId: point.currentSceneId,
      dialogueIndex: point.dialogueIndex,
      dialogue: point.dialogue,
      inlineBranch: point.inlineBranch,
      isBeforeTitle: point.isBeforeTitle,
      variables: point.variables,
      history: point.history
    };

    if (point.currentSceneId === this.currentSceneId) {
      // Same scene: swap state in place without a screen fade
      this.dialogueIndex = state.dialogueIndex;
      this.project.scenes[this.currentSceneId].dialogue = state.dialogue;
      this.inlineBranch = state.inlineBranch;
      this.isBeforeTitle = state.isBeforeTitle;
      this.variables = state.variables;
      this.history = state.history;
      this.updateDebugVariablesList();
      this.playStep();
    } else {
      this.restoreGameState(state);
    }
  }

  // Read-line tracking, used to stop skipping at unread text
  lineKey(step) {
    if (step && typeof step.id === 'string' && step.id) return `${this.currentSceneId}:${step.id}`;
    return `${this.currentSceneId}:${this.inlineBranch || 'main'}:${this.dialogueIndex}`;
  }

  getSeenLines() {
    if (!this.seenLines) {
      const stored = this.readProjectStorage('seen', []);
      this.seenLines = new Set(Array.isArray(stored) ? stored : []);
    }
    return this.seenLines;
  }

  // Mark the current line as read; returns whether it had been read before
  markLineSeen(step) {
    const seen = this.getSeenLines();
    const key = this.lineKey(step);
    if (seen.has(key)) return true;
    seen.add(key);
    if (!this.seenSaveTimer) {
      this.seenSaveTimer = setTimeout(() => {
        this.seenSaveTimer = null;
        try {
          this.writeProjectStorage('seen', [...this.getSeenLines()]);
        } catch (err) {
          console.warn('Could not store read-line progress.', err);
        }
      }, 1000);
    }
    return false;
  }

  checkSkipUnread(wasSeen) {
    if (wasSeen || !this.skipActive || this.skipForce || this.skipUnread) return;
    this.skipActive = false;
    this.updateQuickMenuState();
    this.showToast("Skip stopped at unread text.");
  }

  // Handle scene text depletion (branch or next scene)
  handleSceneEnd(scene) {
    // Ending scenes show their dialogue before the completion screen.
    if (scene.isEnding) {
      this.handleEnding(scene);
      return;
    }

    // Check conditional advancements/branches first!
    if (scene.conditionalBranches && scene.conditionalBranches.length > 0) {
      for (const branch of scene.conditionalBranches) {
        if (this.evaluateCondition(branch)) {
          const logic = window.VNFairyCore && window.VNFairyCore.logicModel;
          if (logic) logic.applyActions(branch.actions, this.variables, this.project.config || {});
          const target = window.VNFairyCore && window.VNFairyCore.sceneModel
            ? window.VNFairyCore.sceneModel.choiceTarget(branch)
            : branch.target;
          if (target) {
            this.loadScene(target);
            return;
          }
        }
      }
    }

    // Check if Kinetic Mode (no choices)
    const isKinetic = this.project.config && this.project.config.kineticMode;

    if (isKinetic && scene.choices && scene.choices.length > 0) {
      // Auto-choose the first option without showing the overlay or playing SFX
      const logic = window.VNFairyCore && window.VNFairyCore.sceneModel;
      const choiceIndex = scene.choices.findIndex(choice => !logic || logic.evaluateConditions(choice.conditions, this.variables, this.project.config || {}));
      if (choiceIndex < 0) {
        this.showChoices(scene.choices);
        return;
      }
      const choice = scene.choices[choiceIndex];
      this.trackChoice(this.currentSceneId, choiceIndex, choice);
      
      if (choice.action === 'jump') {
        this.loadScene(choice.target);
      } else if (choice.action === 'text') {
        scene.dialogue = choice.dialogues || [{ text: "Nothing happens.", speaker: "narrator" }];
        this.inlineBranch = `choice${choiceIndex}`;
        this.dialogueIndex = 0;
        this.playStep();
      }
      return;
    }

    if (isKinetic || !scene.choices || scene.choices.length === 0) {
      // Jump directly to next scene if specified
      if (scene.nextSceneId) {
        this.loadScene(scene.nextSceneId);
      } else {
        const transition = scene.sceneTransition || (scene.fadeOutScene ? 'fade' : 'off');
        if (this.isBeforeTitle) {
          if (transition === 'fade' || transition === 'next') {
            this.transitionWithFade(() => {
              this.isBeforeTitle = false;
              this.showTitleScreen();
            }, true);
          } else {
            this.isBeforeTitle = false;
            this.showTitleScreen();
          }
        } else {
          // End of scenes, play standard credits
          if (transition === 'fade' || transition === 'next') {
            this.transitionWithFade(() => {
              this.showCreditsRoll();
            }, true);
          } else {
            this.showCreditsRoll();
          }
        }
      }
    } else {
      // Option branching
      this.showChoices(scene.choices);
    }
  }

  // Evaluate variable condition
  evaluateCondition(branch) {
    return window.VNFairyCore && window.VNFairyCore.sceneModel
      ? window.VNFairyCore.sceneModel.evaluateCondition(branch, this.variables, this.project.config || {})
      : false;
  }

  // Save selected choice or auto-choice to variables
  trackChoice(sceneId, index, choice) {
    // 1. Auto-save tracking variables:
    // Format: choice_<choiceId> = true
    if (choice.id) {
      this.variables['choice_' + choice.id] = true;
    }
    
    // Legacy tracking for safety/compatibility
    const sanitizedText = choice.text ? choice.text.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') : '';
    if (sanitizedText) {
      this.variables['choice_' + sanitizedText] = true;
    }
    this.variables['choice_' + sceneId + '_' + index] = true;

    // 2. Apply the declarative actions from the visual builder.
    const logic = window.VNFairyCore && window.VNFairyCore.logicModel;
    if (logic && Array.isArray(choice.actions)) {
      logic.applyActions(choice.actions, this.variables, this.project.config || {});
    }

    // 3. Keep the original single-number adjustment format working for old projects.
    if (!Array.isArray(choice.actions) && choice.customVarName) {
      const op = choice.customVarOp === 'increase' || !choice.customVarOp ? 'increment'
        : choice.customVarOp === 'decrease' ? 'decrement'
          : choice.customVarOp || 'set';
      if (logic) {
        logic.applyAction({
          type: op,
          variable: choice.customVarName,
          value: choice.customVarValue !== undefined ? choice.customVarValue : 1
        }, this.variables, this.project.config || {});
      }
    }

    this.updateDebugVariablesList();
  }

  // Render variables in the debug menu
  updateDebugVariablesList() {
    const list = document.getElementById('playtest-debug-variables-list');
    if (!list) return;
    list.innerHTML = "";

    const varNames = Object.keys(this.variables);
    if (varNames.length === 0) {
      list.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">No variables tracked yet</span>`;
      return;
    }

    varNames.forEach(name => {
      const row = document.createElement('div');
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
      row.style.padding = "2px 0";

      const nameSpan = document.createElement('span');
      nameSpan.style.color = "var(--accent, #6366f1)";
      nameSpan.innerText = name;

      const valSpan = document.createElement('span');
      valSpan.style.color = "var(--text-main)";
      valSpan.innerText = String(this.variables[name]);

      row.appendChild(nameSpan);
      row.appendChild(valSpan);
      list.appendChild(row);
    });
  }

  // Display option branching overlay
  showChoices(choices) {
    this.autoPlayActive = false;
    this.skipActive = false;
    this.updateQuickMenuState();

    const overlay = document.getElementById('choices-overlay');
    const container = document.getElementById('choices-container');
    container.innerHTML = "";

    const scene = this.project.scenes[this.currentSceneId];
    const font = scene ? (scene.fontFamily || "Arial, Helvetica, sans-serif") : "Arial, Helvetica, sans-serif";

    const definitions = this.project.config || {};
    choices.forEach((choice, index) => {
      const btn = document.createElement('button');
      btn.className = "btn-choice";
      btn.innerText = choice.text;
      btn.style.fontFamily = font;
      const available = !(window.VNFairyCore && window.VNFairyCore.sceneModel)
        || window.VNFairyCore.sceneModel.evaluateConditions(choice.conditions, this.variables, definitions);
      btn.disabled = !available;
      if (!available) {
        btn.classList.add('choice-locked');
        btn.title = choice.lockedText || 'This choice is not available yet.';
      }
      
      btn.onclick = () => {
        if (!available) return;
        this.playSynthSFX('click');
        overlay.classList.add('hidden');
        
        this.trackChoice(this.currentSceneId, index, choice);
        
        if (choice.action === 'jump') {
          this.loadScene(choice.target);
        } else if (choice.action === 'text') {
          // Show custom inline text branches
          // To keep it simple, we load a dynamic scene containing this text, or inline inject it.
          // Let's implement inline dialogues injection by dynamically editing dialogues array of active scene!
          // This is incredibly powerful and satisfies different text branches.
          const scene = this.project.scenes[this.currentSceneId];
          scene.dialogue = choice.dialogues || [{ text: "Nothing happens.", speaker: "narrator" }];
          this.inlineBranch = `choice${index}`;
          this.dialogueIndex = 0;
          this.playStep();
        }
      };
      
      container.appendChild(btn);
    });

    overlay.classList.remove('hidden');
  }

  // Handle ending scene
  handleEnding(scene) {
    if (scene.endingSfx) {
      if (scene.endingSfx === 'synth_ending') {
        this.playSynthSFX('ending');
      } else {
        // Resolve custom sound asset
        let fileSrc = "";
        if (this.project.assets && this.project.assets.sound) {
          const asset = this.project.assets.sound.find(s => s.id === scene.endingSfx);
          if (asset) fileSrc = asset.path;
        }
        if (fileSrc) {
          const sfx = new Audio(playerWorkspace.resolveMedia(fileSrc));
          sfx.volume = this.sfxVolume;
          sfx.play().catch(err => {
            console.warn("Failed to play custom ending SFX: " + fileSrc, err);
          });
        }
      }
    }
    
    // Track unlocked ending
    const endingName = scene.endingName || "Standard Ending";
    if (!this.unlockedEndings.includes(endingName)) {
      this.unlockedEndings.push(endingName);
      this.writeProjectStorage('endings', this.unlockedEndings);
    }

    this.checkAssetUnlock('ending', endingName);

    // Display Ending dialogue
    const textElem = document.getElementById('dialogue-text');
    const speakerContainer = document.getElementById('speaker-container');
    const dialogueBox = document.getElementById('dialogue-box');
    
    if (speakerContainer) speakerContainer.classList.add('hidden');
    if (dialogueBox) dialogueBox.classList.remove('has-speaker');
    textElem.innerHTML = `<span style="font-size: 1.4rem; font-weight: 700; color: var(--accent); display:block; margin-bottom: 10px;">${endingName}</span>` +
                          `Congratulations on completing this route!`;

    // Clear characters
    this.renderCharacters(null);

    // Clicking next on ending screen goes to credits
    const originalOnClick = dialogueBox ? dialogueBox.onclick : null;
    if (dialogueBox) {
      dialogueBox.onclick = () => {
        dialogueBox.onclick = originalOnClick;
        this.showCreditsRoll();
      };
    }
  }

  // Roll credits
  showCreditsRoll() {
    this.autoPlayActive = false;
    this.skipActive = false;
    this.updateQuickMenuState();
    
    // Hide game screens and show credits screen
    document.getElementById('stage-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.add('hidden');
    
    const screen = document.getElementById('credits-screen');
    const roll = document.getElementById('credits-roll');
    screen.classList.remove('hidden');

    const creditsConfig = (this.project.config && this.project.config.credits) || {};
    
    // Credits overlay shading handling
    const overlay = screen.querySelector('.credits-overlay');
    if (overlay) {
      overlay.style.display = creditsConfig.noShading ? 'none' : 'block';
    }
    
    // Background handling
    const bgContainer = document.getElementById('credits-bg');
    if (creditsConfig.background) {
      let bgSrc = "";
      if (this.project.assets && this.project.assets.backgrounds) {
        const asset = this.project.assets.backgrounds.find(b => b.id === creditsConfig.background);
        if (asset) bgSrc = asset.path;
      }
      bgContainer.style.backgroundImage = bgSrc ? `url('${playerWorkspace.resolveMedia(bgSrc)}')` : "none";
      bgContainer.style.opacity = creditsConfig.noDimming ? "1.0" : "0.4";
    } else {
      bgContainer.style.backgroundImage = "none";
      bgContainer.style.opacity = "1.0";
    }

    // Play credits music
    if (creditsConfig.music) {
      this.playMusic(creditsConfig.music);
    } else {
      this.playMusic('stop');
    }

    // Build rolling credit elements
    roll.innerHTML = `
      <h2 class="credits-title-roll">${this.project.title || "VNFairy Novel"}</h2>
      <div class="credits-section-roll">
        <h3>Story & Configuration</h3>
        <p>${this.project.author || "Unknown Author"}</p>
      </div>
    `;

    if (creditsConfig.text) {
      roll.innerHTML += `
        <div class="credits-section-roll">
          <h3>Cast & Crew</h3>
          <p>${creditsConfig.text.replace(/\n/g, '<br>')}</p>
        </div>
      `;
    }

    // Restart keyframes animation
    roll.style.animation = 'none';
    roll.offsetHeight; /* trigger reflow */
    roll.style.animation = '';
    
    // Set up auto return to title screen on animation completion
    if (this._onCreditsEnd) {
      roll.removeEventListener('animationend', this._onCreditsEnd);
    }
    this._onCreditsEnd = () => {
      this.showTitleScreen();
    };
    roll.addEventListener('animationend', this._onCreditsEnd);
  }

  // Save/Load Mechanics
  getSavePreviewCharacters() {
    const slots = [
      ['left', document.getElementById('char-left')],
      ['center', document.getElementById('char-center')],
      ['right', document.getElementById('char-right')]
    ];
    return slots.reduce((characters, [position, slot]) => {
      if (!slot || !slot.classList.contains('active-slot')) return characters;
      const image = slot.querySelector('.char-sprite');
      const path = image && image.getAttribute('src');
      if (!path) return characters;
      const scaleMatch = String(image.style.transform || '').match(/scale\(\s*([\d.]+)\s*\)/i);
      const scale = scaleMatch ? Number(scaleMatch[1]) : 1;
      characters.push({
        position,
        path,
        scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        dimmed: slot.classList.contains('speaking-dimmed')
      });
      return characters;
    }, []);
  }

  getGameState() {
    let bgSrc = "";
    let dialogueText = "";
    let sceneName = "Unknown Scene";
    
    if (this.currentSceneId && this.project.scenes) {
      const scene = this.project.scenes[this.currentSceneId];
      if (scene) {
        sceneName = scene.name || this.currentSceneId;
        if (scene.background && this.project.assets && this.project.assets.backgrounds) {
          const asset = this.project.assets.backgrounds.find(b => b.id === scene.background);
          if (asset) bgSrc = asset.path;
        }
        if (scene.dialogue && scene.dialogue[this.dialogueIndex]) {
          dialogueText = scene.dialogue[this.dialogueIndex].text || "";
        }
      }
    }

    return {
      currentSceneId: this.currentSceneId,
      dialogueIndex: this.dialogueIndex,
      variables: this.variables,
      history: this.history,
      timestamp: Date.now(),
      preview: {
        bg: bgSrc,
        text: dialogueText.substring(0, 60) + (dialogueText.length > 60 ? "..." : ""),
        sceneName: sceneName,
        characters: this.getSavePreviewCharacters()
      }
    };
  }

  loadGameState(state) {
    const save = window.VNFairyCore && window.VNFairyCore.saveGameSerializer
      ? window.VNFairyCore.saveGameSerializer.deserialize(state, {
        projectId: this.project && this.project.id,
        projectSchemaVersion: this.project && this.project.schemaVersion,
        engineVersion: this.version
      })
      : { state };
    this.rollbackStack = [];
    this.restoreGameState(save.state);
  }

  // Rebuild the stage from a state object (a loaded save or a rollback point)
  restoreGameState(state) {
    this.transitionWithFade(async () => {
      this.stopVideoCutscene();
      this.currentSceneId = state.currentSceneId;
      this.dialogueIndex = state.dialogueIndex;
      this.inlineBranch = state.inlineBranch || null;
      this.isBeforeTitle = !!state.isBeforeTitle;
      const logic = window.VNFairyCore && window.VNFairyCore.logicModel;
      this.variables = logic
        ? logic.createRuntimeVariables(this.project.config || {}, state.variables || {})
        : (state.variables || {});
      this.history = state.history || [];
      this.updateDebugVariablesList();

      // Ensure UI elements transition from Title to Stage screen
      document.getElementById('title-screen').classList.add('hidden');
      document.getElementById('credits-screen').classList.add('hidden');
      document.getElementById('stage-screen').classList.remove('hidden');
      document.getElementById('choices-overlay').classList.add('hidden');

      this.autoPlayActive = false;
      this.skipActive = false;
      this.updateQuickMenuState();

      try {
        await this.ensureSceneLoaded(this.currentSceneId);
      } catch (err) {
        console.error(`Failed to load scene data for ${this.currentSceneId} on state load:`, err);
      }

      // Reload scene components
      const scene = this.project.scenes[this.currentSceneId];
      if (Array.isArray(state.dialogue)) scene.dialogue = state.dialogue;

      // Background
      let bgSrc = "";
      const useSolidWhiteBackground = scene.background === '__solid_white__';
      if (scene.background && !useSolidWhiteBackground && this.project.assets && this.project.assets.backgrounds) {
        const asset = this.project.assets.backgrounds.find(b => b.id === scene.background);
        if (asset) bgSrc = asset.path;
      }
      const stageBg = document.getElementById('stage-bg');
      stageBg.style.backgroundColor = useSolidWhiteBackground ? '#ffffff' : 'transparent';
      const isLightTheme = this.project.config && this.project.config.theme === 'light';
      const defaultBackground = isLightTheme
        ? 'linear-gradient(135deg, #ffffff, #e8edf4)'
        : 'linear-gradient(135deg, #1e293b, #0f172a)';
      stageBg.style.backgroundImage = useSolidWhiteBackground ? 'none' : (bgSrc ? `url('${playerWorkspace.resolveMedia(bgSrc)}')` : defaultBackground);

      // Play music (backtrace if the current scene has "Continue BGM" / no bgm defined)
      const activeBGM = this.findActiveBGMForScene(this.currentSceneId);
      if (activeBGM) {
        this.playMusic(activeBGM);
      } else {
        this.playMusic('stop');
      }

      // Set up scene layer visibility depending on scene mode (mirrors loadScene behaviour)
      const isCutsceneText = scene.isCutscene && (scene.cutsceneType === 'text' || scene.cutsceneType === 'autotext');
      const isCutsceneImage = scene.isCutscene && scene.cutsceneType === 'image';
      const textContainer = document.getElementById('stage-fullscreen-text-container');
      const hudContainer = document.getElementById('hud-container');
      const dialogueBox = document.getElementById('dialogue-box');
      const charStage = document.getElementById('character-stage');

      if (charStage) {
        charStage.classList.remove('transition-slide', 'transition-off');
        const transition = scene.characterTransition || 'fade';
        if (transition === 'slide') {
          charStage.classList.add('transition-slide');
        } else if (transition === 'off') {
          charStage.classList.add('transition-off');
        }
      }

      if (textContainer) {
        if (isCutsceneText || isCutsceneImage) {
          textContainer.classList.remove('hidden');
          // Reset content so the step will fade it in
          const contentEl = document.getElementById('fullscreen-text-content');
          if (contentEl) {
            contentEl.innerText = "";
            contentEl.classList.remove('visible');
          }
        } else {
          textContainer.classList.add('hidden');
        }
      }

      if (hudContainer) hudContainer.classList.remove('hidden');

      const quickMenu = document.querySelector('.quick-menu');
      if (quickMenu) {
        if (isCutsceneImage && scene.hideQuickMenu) {
          quickMenu.classList.add('hidden');
        } else {
          quickMenu.classList.remove('hidden');
        }
      }

      if (dialogueBox) {
        if (isCutsceneText || isCutsceneImage) dialogueBox.classList.add('hidden');
        else dialogueBox.classList.remove('hidden');
      }

      if (charStage) {
        if (isCutsceneText || isCutsceneImage) charStage.classList.add('hidden');
        else charStage.classList.remove('hidden');
      }

      // Play dialogue step
      this.playStep();
    }, true);
  }

  saveGameSlot(slotIndex) {
    const saves = this.getPlayerSaves();
    saves[slotIndex] = window.VNFairyCore && window.VNFairyCore.saveGameSerializer
      ? window.VNFairyCore.saveGameSerializer.serialize(this.getGameState(), {
        projectId: this.project && this.project.id,
        projectSchemaVersion: this.project && this.project.schemaVersion,
        engineVersion: this.version
      })
      : this.getGameState();
    this.setPlayerSaves(saves);
    
    this.showToast("Progress Saved!");
    this.renderSaveGrid();
  }

  loadGameSlot(slotIndex) {
    const saves = this.getPlayerSaves();
    const state = saves[slotIndex];
    if (state) {
      this.playSynthSFX('click');
      const saveLoadScreen = document.getElementById('save-load-screen');
      if (saveLoadScreen) saveLoadScreen.classList.add('hidden');
      this.loadGameState(state);
    }
  }

  // Quick save & load (slot 0)
  quickSave() {
    this.saveGameSlot(0);
  }

  quickLoad() {
    const saves = this.getPlayerSaves();
    if (saves[0]) {
      this.loadGameSlot(0);
    } else {
      this.showToast("No quicksave found!");
    }
  }

  // Event handlers
  bindEvents() {
    // Title menu actions
    document.getElementById('btn-new-game').onclick = () => this.startGame();
    document.getElementById('btn-open-load').onclick = () => this.openSaveLoadModal('load');
    document.getElementById('btn-open-gallery').onclick = () => this.openGalleryModal();
    document.getElementById('btn-open-options').onclick = () => this.openOptionsModal();

    const btnOpenGalleryNew = document.getElementById('btn-open-gallery-new');
    if (btnOpenGalleryNew) {
      btnOpenGalleryNew.onclick = () => this.openGalleryScreen();
    }
    const btnOpenMusic = document.getElementById('btn-open-music');
    if (btnOpenMusic) {
      btnOpenMusic.onclick = () => this.openMusicScreen();
    }

    const btnSaveLoadClose = document.getElementById('btn-save-load-close');
    if (btnSaveLoadClose) {
      btnSaveLoadClose.onclick = () => this.closeSaveLoadScreen();
    }
    const btnOptionsDefaults = document.getElementById('btn-options-defaults');
    if (btnOptionsDefaults) {
      btnOptionsDefaults.onclick = () => this.setDefaults();
    }
    const btnOptionsClose = document.getElementById('btn-options-close');
    if (btnOptionsClose) {
      btnOptionsClose.onclick = () => this.closeOptionsScreen();
    }
    const btnAchievementsClose = document.getElementById('btn-achievements-close');
    if (btnAchievementsClose) {
      btnAchievementsClose.onclick = () => this.closeAchievementsScreen();
    }

    const btnScreenWin = document.getElementById('btn-screen-window');
    if (btnScreenWin) {
      btnScreenWin.onclick = () => {
        this.playSynthSFX('click');
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      };
    }
    const btnScreenFS = document.getElementById('btn-screen-fullscreen');
    if (btnScreenFS) {
      btnScreenFS.onclick = () => {
        this.playSynthSFX('click');
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      };
    }

    document.getElementById('btn-skip-credits').onclick = () => {
      this.playSynthSFX('click');
      this.showTitleScreen();
    };

    // Dialogue click progression
    document.getElementById('dialogue-box').onclick = () => {
      if (this.currentSceneId && this.project.scenes[this.currentSceneId]?.cutsceneType === 'autotext') return;
      this.nextStep();
    };
    const textContainer = document.getElementById('stage-fullscreen-text-container');
    if (textContainer) {
      textContainer.onclick = () => {
        if (this.currentSceneId && this.project.scenes[this.currentSceneId]?.cutsceneType === 'autotext') return;
        this.nextStep();
      };
    }

    // Quick Menu items
    document.getElementById('btn-quick-back').onclick = () => this.rollback();
    document.getElementById('btn-quick-history').onclick = () => this.openHistoryModal();
    document.getElementById('btn-quick-auto').onclick = () => this.toggleAutoPlay();
    document.getElementById('btn-quick-skip').onclick = () => this.toggleSkip();
    document.getElementById('btn-quick-save').onclick = () => this.openSaveLoadModal('save');
    document.getElementById('btn-quick-load').onclick = () => this.openSaveLoadModal('load');
    document.getElementById('btn-quick-qsave').onclick = () => this.quickSave();
    document.getElementById('btn-quick-qload').onclick = () => this.quickLoad();
    document.getElementById('btn-quick-options').onclick = () => this.openOptionsModal();
    document.getElementById('btn-quick-title').onclick = async () => {
      this.playSynthSFX('click');
      const confirmed = await this.showConfirmModal("Return to Title screen? Unsaved progress will be lost.");
      if (confirmed) {
        this.isBeforeTitle = false;
        this.showTitleScreen();
      }
    };

    // Options configuration
    // Options configuration
    const speedSlider = document.getElementById('slider-text-speed');
    speedSlider.oninput = (e) => {
      const val = parseInt(e.target.value);
      if (val === 100) {
        this.textSpeed = 0;
      } else {
        this.textSpeed = 100 - val;
      }
      this.updateTextSpeedLabel();
      this.saveSettings();
    };

    const musicVolSlider = document.getElementById('slider-music-vol');
    musicVolSlider.oninput = (e) => {
      const vol = parseFloat(e.target.value) / 100;
      this.setMusicVolume(vol);
      document.getElementById('val-music-vol').innerText = `${e.target.value}%`;
      this.saveSettings();
    };

    const sfxVolSlider = document.getElementById('slider-sfx-vol');
    sfxVolSlider.oninput = (e) => {
      this.setSFXVolume(parseFloat(e.target.value) / 100);
      document.getElementById('val-sfx-vol').innerText = `${e.target.value}%`;
      this.saveSettings();
    };

    // Text size radio buttons
    ['small', 'medium', 'large'].forEach(size => {
      const radio = document.getElementById(`text-size-${size}`);
      if (radio) {
        radio.onchange = () => {
          this.applyTextSize(size);
          this.saveSettings();
        };
      }
    });

    // Skip speed radio buttons
    ['slow', 'medium', 'fast'].forEach(speed => {
      const radio = document.getElementById(`skip-speed-${speed}`);
      if (radio) {
        radio.onchange = () => {
          this.skipSpeed = speed;
          this.saveSettings();
        };
      }
    });

    // Skip mode radio buttons (read text only / all text)
    ['read', 'all'].forEach(mode => {
      const radio = document.getElementById(`skip-mode-${mode}`);
      if (radio) {
        radio.onchange = () => {
          this.skipUnread = mode === 'all';
          this.saveSettings();
        };
      }
    });

    // Standalone fallback drop zone
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('project-file-input');
    document.getElementById('btn-open-project-file')?.addEventListener('click', () => {
      document.getElementById('projects-portal').classList.add('hidden');
      document.getElementById('fallback-loader').classList.remove('hidden');
    });

    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    };
    dropZone.ondragleave = () => {
      dropZone.classList.remove('dragover');
    };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      this.handleLocalFile(file);
    };
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      this.handleLocalFile(file);
    };

    document.getElementById('btn-run-demo').onclick = () => {
      // Load fallback demo project directly from client memory
      this.loadDemoFallback();
    };

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      // Ignore key events if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Check Gallery screen active keys
      const galleryScreen = document.getElementById('gallery-screen');
      if (galleryScreen && !galleryScreen.classList.contains('hidden')) {
        if (e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          this.openMusicScreen(true);
          return;
        }
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          this.playSynthSFX('click');
          galleryScreen.classList.add('hidden');
          this.showTitleScreen();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prevBtn = document.getElementById('btn-gallery-prev');
          if (prevBtn) prevBtn.click();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const nextBtn = document.getElementById('btn-gallery-next');
          if (nextBtn) nextBtn.click();
          return;
        }
      }

      // Check Music screen active keys
      const musicScreen = document.getElementById('music-screen');
      if (musicScreen && !musicScreen.classList.contains('hidden')) {
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          this.playSynthSFX('click');
          musicScreen.classList.add('hidden');
          if (this.cameFromGallery) {
            galleryScreen.classList.remove('hidden');
            this.renderGalleryGrid();
          } else {
            this.showTitleScreen();
          }
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prevBtn = document.getElementById('btn-music-prev');
          if (prevBtn) prevBtn.click();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const nextBtn = document.getElementById('btn-music-next');
          if (nextBtn) nextBtn.click();
          return;
        }
      }

      // Check Save/Load screen active keys
      const saveLoadScreen = document.getElementById('save-load-screen');
      if (saveLoadScreen && !saveLoadScreen.classList.contains('hidden')) {
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          this.closeSaveLoadScreen();
          return;
        }
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          const delBtn = document.getElementById('btn-save-delete');
          if (delBtn && !delBtn.disabled) {
            delBtn.click();
          }
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prevBtn = document.getElementById('btn-save-prev');
          if (prevBtn) prevBtn.click();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const nextBtn = document.getElementById('btn-save-next');
          if (nextBtn) nextBtn.click();
          return;
        }
      }

      // Check Options screen active keys
      const optionsScreen = document.getElementById('options-screen');
      if (optionsScreen && !optionsScreen.classList.contains('hidden')) {
        if (e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          this.setDefaults();
          return;
        }
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          this.closeOptionsScreen();
          return;
        }
      }

      // Check Achievements screen active keys
      const achievementsScreen = document.getElementById('achievements-screen');
      if (achievementsScreen && !achievementsScreen.classList.contains('hidden')) {
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          this.closeAchievementsScreen();
          return;
        }
      }

      if (e.key === 'ArrowLeft' && this.isGameplayActive(true)) {
        e.preventDefault();
        this.rollback();
        return;
      }

      if (!this.isGameplayActive()) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (this.currentSceneId && this.project.scenes[this.currentSceneId]?.cutsceneType === 'autotext') break;
          const hud = document.getElementById('hud-container');
          if (hud && hud.classList.contains('hidden')) {
            hud.classList.remove('hidden');
          } else {
            this.nextStep();
          }
          break;

        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          this.openHistoryModal();
          break;

        case 'Control':
          if (this.currentSceneId && this.project.scenes[this.currentSceneId]?.cutsceneType === 'autotext') break;
          // Control keydown skip
          if (!this.skipActive) {
            this.skipActive = true;
            this.skipForce = true;
            this.autoPlayActive = false;
            this.updateQuickMenuState();
            
            const hudCtrl = document.getElementById('hud-container');
            if (hudCtrl && hudCtrl.classList.contains('hidden')) {
              hudCtrl.classList.remove('hidden');
            }
            
            this.nextStep();
          }
          break;

        case 'a':
        case 'A':
          e.preventDefault();
          this.toggleAutoPlay();
          break;

        case 'h':
        case 'H':
          e.preventDefault();
          const hudH = document.getElementById('hud-container');
          if (hudH) {
            hudH.classList.toggle('hidden');
          }
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Control') {
        this.skipForce = false;
        if (this.skipActive) {
          this.skipActive = false;
          this.updateQuickMenuState();
        }
      }
    });

    // Mouse wheel up rolls back (throttled so trackpads don't fire a burst)
    document.getElementById('stage-screen').addEventListener('wheel', (e) => {
      if (e.deltaY >= 0 || !this.isGameplayActive(true)) return;
      const now = Date.now();
      if (now - this.lastWheelRollback < 250) return;
      this.lastWheelRollback = now;
      this.rollback();
    }, { passive: true });
  }

  // allowChoices: treat an open choice menu as gameplay (used by rollback)
  isGameplayActive(allowChoices = false) {
    const stageScreen = document.getElementById('stage-screen');
    if (!stageScreen || stageScreen.classList.contains('hidden')) return false;

    const activeModal = document.querySelector('.modal:not(.hidden)');
    if (activeModal) return false;

    const saveLoadScreen = document.getElementById('save-load-screen');
    const optionsScreen = document.getElementById('options-screen');
    const achievementsScreen = document.getElementById('achievements-screen');
    const galleryScreen = document.getElementById('gallery-screen');
    const musicScreen = document.getElementById('music-screen');

    if (saveLoadScreen && !saveLoadScreen.classList.contains('hidden')) return false;
    if (optionsScreen && !optionsScreen.classList.contains('hidden')) return false;
    if (achievementsScreen && !achievementsScreen.classList.contains('hidden')) return false;
    if (galleryScreen && !galleryScreen.classList.contains('hidden')) return false;
    if (musicScreen && !musicScreen.classList.contains('hidden')) return false;

    const choiceOverlay = document.getElementById('choices-overlay');
    if (!allowChoices && choiceOverlay && !choiceOverlay.classList.contains('hidden')) return false;

    // Suspend general gameplay inputs if a video cutscene is currently playing
    const videoContainer = document.getElementById('stage-video-container');
    if (videoContainer && !videoContainer.classList.contains('hidden')) return false;

    return true;
  }

  handleLocalFile(file) {
    if (!file || file.type !== "application/json" && !file.name.endsWith('.json')) {
      alert("Please upload a valid project.json file!");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        this.loadProject(data);
      } catch (err) {
        alert("Failed to parse JSON file!");
      }
    };
    reader.readAsText(file);
  }

  // Load a demo directly in memory if server is offline
  loadDemoFallback() {
    const demo = {
      title: "Local Demo Tale",
      author: "VNFairy Builder",
      config: {
        kineticMode: false,
        textSpeed: 40,
        titleScreen: { background: "", music: "" },
        credits: { background: "", music: "", text: "Local Sandbox Mode" }
      },
      assets: { backgrounds: [], characters: [], music: [], sound: [], video: [] },
      startSceneId: "intro",
      scenes: {
        intro: {
          id: "intro",
          name: "Intro scene",
          background: "",
          dialogue: [
            { text: "Welcome to the offline playground! The VNFairy Engine is operational.", speaker: "narrator" },
            { text: "You can load custom visual novel project files or create them using the editor.", speaker: "narrator" }
          ],
          choices: [
            { text: "Proceed to Ending route", action: "jump", target: "route_end" }
          ]
        },
        route_end: {
          id: "route_end",
          name: "The End",
          isEnding: true,
          endingName: "Ending Alpha: Playful Beginning"
        }
      }
    };
    this.loadProject(demo);
  }

  // Modals management
  openSaveLoadModal(mode) {
    this.playSynthSFX('click');
    this.saveLoadMode = mode;
    this.savePage = 1;
    this.selectedSaveSlot = null;
    this.hoveredSaveSlot = null;

    const stageScreen = document.getElementById('stage-screen');
    if (stageScreen && !stageScreen.classList.contains('hidden')) {
      this.saveLoadCameFrom = 'game';
    } else {
      this.saveLoadCameFrom = 'title';
    }

    document.getElementById('title-screen').classList.add('hidden');
    if (stageScreen) stageScreen.classList.add('hidden');

    document.getElementById('save-load-title').innerText = mode === 'save' ? 'SAVE GAME' : 'LOAD GAME';
    document.getElementById('save-load-screen').classList.remove('hidden');
    this.renderSaveGrid();
    this.setupSaveEvents();
  }

  closeSaveLoadScreen() {
    this.playSynthSFX('click');
    document.getElementById('save-load-screen').classList.add('hidden');
    if (this.saveLoadCameFrom === 'game') {
      document.getElementById('stage-screen').classList.remove('hidden');
    } else {
      this.showTitleScreen();
    }
  }

  openOptionsModal() {
    this.playSynthSFX('click');

    const stageScreen = document.getElementById('stage-screen');
    if (stageScreen && !stageScreen.classList.contains('hidden')) {
      this.optionsCameFrom = 'game';
    } else {
      this.optionsCameFrom = 'title';
    }

    document.getElementById('title-screen').classList.add('hidden');
    if (stageScreen) stageScreen.classList.add('hidden');

    document.getElementById('options-screen').classList.remove('hidden');
    
    // Update Options fields from current settings
    const speedVal = this.textSpeed === 0 ? 100 : 100 - this.textSpeed;
    document.getElementById('slider-text-speed').value = speedVal;
    this.updateSliderValueDisplay('text-speed', speedVal);
    
    document.getElementById('slider-music-vol').value = Math.round(this.musicVolume * 100);
    this.updateSliderValueDisplay('music-vol', Math.round(this.musicVolume * 100));
    
    document.getElementById('slider-sfx-vol').value = Math.round(this.sfxVolume * 100);
    this.updateSliderValueDisplay('sfx-vol', Math.round(this.sfxVolume * 100));

    const radio = document.querySelector(`input[name="text-size"][value="${this.textSize}"]`);
    if (radio) radio.checked = true;

    const skipRadio = document.querySelector(`input[name="skip-speed"][value="${this.skipSpeed}"]`);
    if (skipRadio) skipRadio.checked = true;

    this.updateFullScreenUI();
  }

  closeOptionsScreen() {
    this.playSynthSFX('click');
    document.getElementById('options-screen').classList.add('hidden');
    if (this.optionsCameFrom === 'game') {
      document.getElementById('stage-screen').classList.remove('hidden');
    } else {
      this.showTitleScreen();
    }
  }

  updateSliderValueDisplay(type, val) {
    const label = document.getElementById(`val-${type}`);
    if (!label) return;
    if (type === 'text-speed') {
      if (val === 100) label.innerText = "Instant";
      else if (val >= 85) label.innerText = "Fast";
      else if (val >= 55) label.innerText = "Normal";
      else label.innerText = "Slow";
    } else {
      label.innerText = `${val}%`;
    }
  }

  updateFullScreenUI() {
    const btnWin = document.getElementById('btn-screen-window');
    const btnFS = document.getElementById('btn-screen-fullscreen');
    if (!btnWin || !btnFS) return;
    if (document.fullscreenElement) {
      btnWin.classList.remove('active');
      btnFS.classList.add('active');
    } else {
      btnWin.classList.add('active');
      btnFS.classList.remove('active');
    }
  }

  setDefaults() {
    this.playSynthSFX('click');
    this.textSpeed = 40;
    this.musicVolume = 0.7;
    this.sfxVolume = 0.7;
    this.textSize = 'medium';
    this.skipSpeed = 'medium';
    this.skipUnread = false;

    this.saveSettings();

    // Apply settings
    this.applyTextSize(this.textSize);
    this.setMusicVolume(this.musicVolume);
    this.setSFXVolume(this.sfxVolume);

    // Update UI elements
    const speedVal = 100 - this.textSpeed;
    document.getElementById('slider-text-speed').value = speedVal;
    this.updateSliderValueDisplay('text-speed', speedVal);
    
    document.getElementById('slider-music-vol').value = 70;
    this.updateSliderValueDisplay('music-vol', 70);
    
    document.getElementById('slider-sfx-vol').value = 70;
    this.updateSliderValueDisplay('sfx-vol', 70);

    const radio = document.getElementById('text-size-medium');
    if (radio) radio.checked = true;

    const skipRadioInput = document.getElementById('skip-speed-medium');
    if (skipRadioInput) skipRadioInput.checked = true;

    const skipModeInput = document.getElementById('skip-mode-read');
    if (skipModeInput) skipModeInput.checked = true;

    this.showToast("Settings reset to default.");
  }

  openHistoryModal() {
    this.playSynthSFX('click');
    document.getElementById('history-modal').classList.remove('hidden');
    
    const list = document.getElementById('history-list');
    list.innerHTML = "";

    if (this.history.length === 0) {
      list.innerHTML = `<p style="text-align:center; color:var(--text-muted);">No dialogue history yet.</p>`;
      return;
    }

    this.history.forEach(entry => {
      const item = document.createElement('div');
      item.className = `history-entry ${entry.type}`;
      item.innerHTML = `
        <div class="history-speaker">${entry.speaker}</div>
        <div class="history-text">${entry.text}</div>
      `;
      list.appendChild(item);
    });
    
    // Auto scroll to bottom
    const body = document.getElementById('history-body');
    setTimeout(() => { body.scrollTop = body.scrollHeight; }, 50);
  }

  openGalleryModal() {
    this.playSynthSFX('click');
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('achievements-screen').classList.remove('hidden');

    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = "";

    // Hardcode some expected project endings (or read them dynamically if registered in project)
    // For local convenience, read whatever has been unlocked
    if (this.unlockedEndings.length === 0) {
      grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding: 20px;">No endings unlocked yet. Complete routes in the novel to unlock endings!</p>`;
      return;
    }

    this.unlockedEndings.forEach((ending, idx) => {
      const card = document.createElement('div');
      card.className = "gallery-card unlocked";
      card.innerHTML = `
        <div class="gallery-icon">🏆</div>
        <div class="gallery-name">${ending}</div>
        <div class="gallery-status">Unlocked</div>
      `;
      grid.appendChild(card);
    });
  }

  closeAchievementsScreen() {
    this.playSynthSFX('click');
    document.getElementById('achievements-screen').classList.add('hidden');
    this.showTitleScreen();
  }

  showConfirmModal(message) {
    if (window.VNFairyModalControls) {
      return window.VNFairyModalControls.confirm(message, () => this.playSynthSFX('click'));
    }
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const messageEl = document.getElementById('confirm-modal-message');
      const btnYes = document.getElementById('btn-confirm-yes');
      const btnNo = document.getElementById('btn-confirm-no');
      
      if (!modal || !messageEl || !btnYes || !btnNo) {
        resolve(confirm(message));
        return;
      }

      messageEl.innerText = message;
      modal.classList.remove('hidden');

      btnYes.onclick = () => {
        this.playSynthSFX('click');
        modal.classList.add('hidden');
        resolve(true);
      };

      btnNo.onclick = () => {
        this.playSynthSFX('click');
        modal.classList.add('hidden');
        resolve(false);
      };
    });
  }

  setupSaveEvents() {
    const prevBtn = document.getElementById('btn-save-prev');
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.savePage > 1) {
          this.playSynthSFX('click');
          this.savePage--;
          this.renderSaveGrid();
        }
      };
    }

    const nextBtn = document.getElementById('btn-save-next');
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.savePage < 2) {
          this.playSynthSFX('click');
          this.savePage++;
          this.renderSaveGrid();
        }
      };
    }

    const deleteBtn = document.getElementById('btn-save-delete');
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        const activeSlot = this.hoveredSaveSlot !== null ? this.hoveredSaveSlot : this.selectedSaveSlot;
        if (activeSlot !== null) {
          const saves = this.getPlayerSaves();
          if (saves[activeSlot]) {
            this.playSynthSFX('click');
            const confirmDelete = await this.showConfirmModal(`Delete Save Slot ${activeSlot}?`);
            if (confirmDelete) {
              delete saves[activeSlot];
              this.setPlayerSaves(saves);
              
              if (this.selectedSaveSlot === activeSlot) this.selectedSaveSlot = null;
              if (this.hoveredSaveSlot === activeSlot) this.hoveredSaveSlot = null;
              this.renderSaveGrid();
              this.showToast("Save file deleted.");
            }
          }
        }
      };
    }
  }

  updateDeleteButtonState(saves) {
    const deleteBtn = document.getElementById('btn-save-delete');
    if (!deleteBtn) return;
    
    const activeSlot = this.hoveredSaveSlot !== null ? this.hoveredSaveSlot : this.selectedSaveSlot;
    if (activeSlot !== null && saves[activeSlot]) {
      deleteBtn.disabled = false;
      deleteBtn.style.opacity = "1";
      deleteBtn.style.cursor = "pointer";
    } else {
      deleteBtn.disabled = true;
      deleteBtn.style.opacity = "0.3";
      deleteBtn.style.cursor = "not-allowed";
    }
  }

  renderSaveGrid() {
    const grid = document.getElementById('save-display-grid');
    if (!grid) return;
    grid.innerHTML = "";

    const saves = this.getPlayerSaves();
    const itemsPerPage = 12;
    const startIndex = (this.savePage - 1) * itemsPerPage;

    this.updateSaveDetails(null);
    this.updateDeleteButtonState(saves);

    for (let i = 1; i <= itemsPerPage; i++) {
      const slotIndex = startIndex + i;
      const slot = saves[slotIndex];
      const card = document.createElement('div');
      card.className = "save-slot-card";

      card.innerHTML = `<div class="save-slot-index">Slot ${slotIndex}</div>`;

      if (slot) {
        card.classList.add('has-save');
        const preview = slot.preview || {};
        const previewCharacters = Array.isArray(preview.characters) ? preview.characters : [];
        if (preview.bg) {
          card.style.backgroundImage = `url('${playerWorkspace.resolveMedia(preview.bg)}')`;
        } else if (!previewCharacters.length) {
          card.innerHTML += `<div class="save-slot-empty-label">SAVED</div>`;
        }
        if (previewCharacters.length) {
          const characterLayer = document.createElement('div');
          characterLayer.className = 'save-slot-character-preview';
          previewCharacters.forEach(character => {
            if (!character || !['left', 'center', 'right'].includes(character.position) || !character.path) return;
            const characterSlot = document.createElement('div');
            characterSlot.className = `save-slot-character-slot ${character.position}${character.dimmed ? ' is-dimmed' : ''}`;
            const image = document.createElement('img');
            image.className = 'save-slot-character';
            image.src = playerWorkspace.resolveMedia(character.path);
            image.alt = '';
            const scale = Number(character.scale);
            image.style.transform = `scale(${Number.isFinite(scale) && scale > 0 ? scale : 1})`;
            characterSlot.appendChild(image);
            characterLayer.appendChild(characterSlot);
          });
          if (characterLayer.childElementCount) card.appendChild(characterLayer);
        }

        // Top-right delete cross button
        const deleteIcon = document.createElement('button');
        deleteIcon.className = "save-slot-card-delete-btn";
        deleteIcon.innerHTML = "&times;";
        deleteIcon.title = "Delete Save File";
        deleteIcon.onclick = async (e) => {
          e.stopPropagation(); // Avoid triggering card loading/overwriting click
          this.playSynthSFX('click');
          
          const confirmDelete = await this.showConfirmModal(`Delete Save Slot ${slotIndex}?`);
          if (confirmDelete) {
            const savesCopy = this.getPlayerSaves();
            delete savesCopy[slotIndex];
            this.setPlayerSaves(savesCopy);
            
            if (this.selectedSaveSlot === slotIndex) this.selectedSaveSlot = null;
            if (this.hoveredSaveSlot === slotIndex) this.hoveredSaveSlot = null;
            this.renderSaveGrid();
            this.showToast("Save file deleted.");
          }
        };
        card.appendChild(deleteIcon);

        card.onmouseenter = () => {
          this.hoveredSaveSlot = slotIndex;
          this.updateSaveDetails(slotIndex, slot);
          this.updateDeleteButtonState(saves);
        };
        card.onmouseleave = () => {
          this.hoveredSaveSlot = null;
          if (this.selectedSaveSlot !== null) {
            const selSlot = saves[this.selectedSaveSlot];
            this.updateSaveDetails(this.selectedSaveSlot, selSlot);
          } else {
            this.updateSaveDetails(null);
          }
          this.updateDeleteButtonState(saves);
        };

        card.onclick = async () => {
          this.playSynthSFX('click');
          this.selectedSaveSlot = slotIndex;
          this.updateSaveDetails(slotIndex, slot);
          this.updateDeleteButtonState(saves);

          document.querySelectorAll('.save-slot-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');

          if (this.saveLoadMode === 'load') {
            const confirmLoad = await this.showConfirmModal(`Load Save Slot ${slotIndex}?`);
            if (confirmLoad) {
              this.loadGameSlot(slotIndex);
            }
          } else {
            const confirmSave = await this.showConfirmModal(`Overwrite Save Slot ${slotIndex}?`);
            if (confirmSave) {
              this.saveGameSlot(slotIndex);
            }
          }
        };
      } else {
        card.innerHTML += `<div class="save-slot-empty-label">Empty Slot</div>`;
        
        card.onmouseenter = () => {
          this.hoveredSaveSlot = slotIndex;
          this.updateSaveDetails(slotIndex, null);
          this.updateDeleteButtonState(saves);
        };
        card.onmouseleave = () => {
          this.hoveredSaveSlot = null;
          if (this.selectedSaveSlot !== null) {
            const selSlot = saves[this.selectedSaveSlot];
            this.updateSaveDetails(this.selectedSaveSlot, selSlot);
          } else {
            this.updateSaveDetails(null);
          }
          this.updateDeleteButtonState(saves);
        };

        card.onclick = async () => {
          this.playSynthSFX('click');
          this.selectedSaveSlot = slotIndex;
          this.updateSaveDetails(slotIndex, null);
          this.updateDeleteButtonState(saves);

          document.querySelectorAll('.save-slot-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');

          if (this.saveLoadMode === 'save') {
            const confirmSave = await this.showConfirmModal(`Save progress to Slot ${slotIndex}?`);
            if (confirmSave) {
              this.saveGameSlot(slotIndex);
            }
          } else {
            this.showToast("Slot is empty!");
          }
        };
      }

      grid.appendChild(card);
    }

    const indicator = document.getElementById('save-page-indicator');
    if (indicator) indicator.innerText = `${this.savePage} / 2`;
    
    const prevBtn = document.getElementById('btn-save-prev');
    if (prevBtn) prevBtn.style.opacity = this.savePage === 1 ? "0.3" : "1";
    const nextBtn = document.getElementById('btn-save-next');
    if (nextBtn) nextBtn.style.opacity = this.savePage === 2 ? "0.3" : "1";
  }

  updateSaveDetails(slotIndex, slot = null) {
    const panel = document.getElementById('save-details-panel');
    if (!panel) return;

    if (slotIndex === null) {
      panel.innerHTML = `<div class="save-details-empty">Hover over a save slot to view details</div>`;
      return;
    }

    if (!slot) {
      panel.innerHTML = `
        <div class="save-details-content">
          <div class="save-details-main">
            <div class="save-details-slot-title">Save Slot ${slotIndex}</div>
            <div class="save-details-text" style="color: var(--text-muted); font-style: italic;">No save data stored in this slot.</div>
          </div>
          <div class="save-details-side">
            <div class="save-details-scene">&mdash;</div>
            <div class="save-details-date">&mdash;</div>
          </div>
        </div>
      `;
      return;
    }

    let sceneName = "Unknown Scene";
    if (slot.preview && slot.preview.sceneName) {
      sceneName = slot.preview.sceneName;
    } else if (this.project.scenes && this.project.scenes[slot.currentSceneId]) {
      sceneName = this.project.scenes[slot.currentSceneId].name || slot.currentSceneId;
    }

    const dateStr = new Date(slot.timestamp).toLocaleString();
    let textStr = "";
    if (slot.preview && slot.preview.text) {
      textStr = `"${slot.preview.text}"`;
    }

    panel.innerHTML = `
      <div class="save-details-content">
        <div class="save-details-main">
          <div class="save-details-slot-title">Save Slot ${slotIndex}</div>
          <div class="save-details-text">${textStr}</div>
        </div>
        <div class="save-details-side">
          <div class="save-details-scene">${sceneName}</div>
          <div class="save-details-date">${dateStr}</div>
        </div>
      </div>
    `;
  }

  // Skip / Auto logic
  toggleAutoPlay() {
    this.autoPlayActive = !this.autoPlayActive;
    this.skipActive = false;
    this.updateQuickMenuState();
    this.playSynthSFX('click');

    if (this.autoPlayActive && !this.isTyping) {
      this.nextStep();
    }
  }

  toggleSkip() {
    this.skipActive = !this.skipActive;
    this.skipForce = false;
    this.autoPlayActive = false;
    this.updateQuickMenuState();
    this.playSynthSFX('click');

    if (this.skipActive && !this.isTyping) {
      this.nextStep();
    }
  }

  updateQuickMenuState() {
    const btnAuto = document.getElementById('btn-quick-auto');
    const btnSkip = document.getElementById('btn-quick-skip');

    if (this.autoPlayActive) btnAuto.classList.add('active');
    else btnAuto.classList.remove('active');

    if (this.skipActive) btnSkip.classList.add('active');
    else btnSkip.classList.remove('active');
  }

  updateTextSpeedLabel() {
    const speedVal = document.getElementById('val-text-speed');
    if (!speedVal) return;
    if (this.textSpeed === 0) speedVal.innerText = "Instant";
    else if (this.textSpeed <= 15) speedVal.innerText = "Fast";
    else if (this.textSpeed <= 45) speedVal.innerText = "Normal";
    else speedVal.innerText = "Slow";
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 2000);
  }

  // Settings persistence
  settingsKey() {
    return this.projectStorageKey('settings');
  }

  saveSettings() {
    const settings = {
      textSpeed: this.textSpeed,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      textSize: this.textSize,
      skipSpeed: this.skipSpeed,
      skipUnread: this.skipUnread
    };
    localStorage.setItem(this.settingsKey(), JSON.stringify(settings));
  }

  loadSettings() {
    let raw = localStorage.getItem(this.settingsKey());
    if (!raw && !this.workspaceScope && this.project && this.project.title) {
      raw = localStorage.getItem(`vnfairy_settings_${this.project.title}`);
      if (raw) localStorage.setItem(this.settingsKey(), raw);
    }
    if (!raw) {
      // No saved settings yet – just sync the sliders to current defaults
      this.syncSettingsUI();
      return;
    }
    const s = JSON.parse(raw);
    if (s.textSpeed !== undefined) this.textSpeed = s.textSpeed;
    if (s.musicVolume !== undefined) {
      this.musicVolume = s.musicVolume;
      this.setMusicVolume(this.musicVolume);
    }
    if (s.sfxVolume !== undefined) {
      this.sfxVolume = s.sfxVolume;
      this.setSFXVolume(this.sfxVolume);
    }
    if (s.textSize) this.textSize = s.textSize;
    if (s.skipSpeed) this.skipSpeed = s.skipSpeed;
    if (s.skipUnread !== undefined) this.skipUnread = !!s.skipUnread;
    this.syncSettingsUI();
  }

  syncSettingsUI() {
    const speedSlider = document.getElementById('slider-text-speed');
    if (speedSlider) {
      speedSlider.value = this.textSpeed === 0 ? 100 : 100 - this.textSpeed;
      this.updateTextSpeedLabel();
    }
    const musicSlider = document.getElementById('slider-music-vol');
    const valMusic = document.getElementById('val-music-vol');
    if (musicSlider) {
      musicSlider.value = Math.round(this.musicVolume * 100);
      if (valMusic) valMusic.innerText = `${musicSlider.value}%`;
    }
    const sfxSlider = document.getElementById('slider-sfx-vol');
    const valSfx = document.getElementById('val-sfx-vol');
    if (sfxSlider) {
      sfxSlider.value = Math.round(this.sfxVolume * 100);
      if (valSfx) valSfx.innerText = `${sfxSlider.value}%`;
    }
    this.applyTextSize(this.textSize);
    const radio = document.getElementById(`text-size-${this.textSize}`);
    if (radio) radio.checked = true;

    const radioSkip = document.getElementById(`skip-speed-${this.skipSpeed}`);
    if (radioSkip) radioSkip.checked = true;

    const radioSkipMode = document.getElementById(this.skipUnread ? 'skip-mode-all' : 'skip-mode-read');
    if (radioSkipMode) radioSkipMode.checked = true;
  }

  applyTextSize(size) {
    this.textSize = size;
    const dialogueBox = document.getElementById('dialogue-box');
    if (dialogueBox) {
      dialogueBox.classList.remove('text-size-small', 'text-size-medium', 'text-size-large');
      dialogueBox.classList.add(`text-size-${size}`);
    }
  }

  checkAssetUnlock(triggerType, triggerValue) {
    if (!this.project || !this.project.unlockables) return;
    
    let newlyUnlocked = false;
    this.project.unlockables.forEach(asset => {
      if (asset.unlockType === triggerType && asset.unlockCondition === triggerValue) {
        if (!this.unlockedAssets.includes(asset.id)) {
          this.unlockedAssets.push(asset.id);
          newlyUnlocked = true;
        }
      }
    });

    if (newlyUnlocked) {
      this.writeProjectStorage('unlocked_assets', this.unlockedAssets);
    }
  }

  openGalleryScreen() {
    this.playSynthSFX('click');
    this.galleryPage = 1;
    
    const config = this.project.config || {};
    const charsEnabled = config.galleryCharactersEnabled !== false;
    const bgsEnabled = config.galleryBackgroundsEnabled !== false;
    
    const tabsContainer = document.getElementById('gallery-tabs-container');
    const btnChars = document.getElementById('btn-gallery-chars');
    const btnBgs = document.getElementById('btn-gallery-bgs');

    if (charsEnabled && bgsEnabled) {
      if (tabsContainer) tabsContainer.style.display = 'flex';
      this.galleryTab = 'character';
      if (btnChars) btnChars.classList.add('active');
      if (btnBgs) btnBgs.classList.remove('active');
    } else {
      if (tabsContainer) tabsContainer.style.display = 'none';
      this.galleryTab = charsEnabled ? 'character' : 'background';
    }

    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('gallery-screen').classList.remove('hidden');

    this.renderGalleryGrid();
    this.setupGalleryEvents();
  }

  setupGalleryEvents() {
    const btnChars = document.getElementById('btn-gallery-chars');
    const btnBgs = document.getElementById('btn-gallery-bgs');
    
    if (btnChars) {
      btnChars.onclick = () => {
        if (this.galleryTab === 'character') return;
        this.playSynthSFX('click');
        this.galleryTab = 'character';
        btnChars.classList.add('active');
        if (btnBgs) btnBgs.classList.remove('active');
        this.galleryPage = 1;
        this.renderGalleryGrid();
      };
    }
    
    if (btnBgs) {
      btnBgs.onclick = () => {
        if (this.galleryTab === 'background') return;
        this.playSynthSFX('click');
        this.galleryTab = 'background';
        btnBgs.classList.add('active');
        if (btnChars) btnChars.classList.remove('active');
        this.galleryPage = 1;
        this.renderGalleryGrid();
      };
    }

    const prevBtn = document.getElementById('btn-gallery-prev');
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.galleryPage > 1) {
          this.playSynthSFX('click');
          this.galleryPage--;
          this.renderGalleryGrid();
        }
      };
    }

    const nextBtn = document.getElementById('btn-gallery-next');
    if (nextBtn) {
      nextBtn.onclick = () => {
        const assets = (this.project.unlockables || []).filter(a => a.type === this.galleryTab);
        const totalPages = Math.ceil(assets.length / 12) || 1;
        if (this.galleryPage < totalPages) {
          this.playSynthSFX('click');
          this.galleryPage++;
          this.renderGalleryGrid();
        }
      };
    }

    const selectMusicBtn = document.getElementById('btn-gallery-select-music');
    if (selectMusicBtn) {
      selectMusicBtn.onclick = () => {
        this.openMusicScreen(true);
      };
    }

    const backBtn = document.getElementById('btn-gallery-back');
    if (backBtn) {
      backBtn.onclick = () => {
        this.playSynthSFX('click');
        document.getElementById('gallery-screen').classList.add('hidden');
        this.showTitleScreen();
      };
    }
  }

  renderGalleryGrid() {
    const grid = document.getElementById('gallery-display-grid');
    if (!grid) return;
    grid.innerHTML = "";

    const assets = (this.project.unlockables || []).filter(a => a.type === this.galleryTab);
    const totalItems = assets.length;
    const itemsPerPage = 12;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    
    if (this.galleryPage > totalPages) this.galleryPage = totalPages;
    if (this.galleryPage < 1) this.galleryPage = 1;

    const config = this.project.config || {};
    const charsEnabled = config.galleryCharactersEnabled !== false;
    const bgsEnabled = config.galleryBackgroundsEnabled !== false;

    const galleryAssets = (this.project.unlockables || []).filter(a => {
      if (a.type === 'character' && charsEnabled) return true;
      if (a.type === 'background' && bgsEnabled) return true;
      return false;
    });
    const unlockedCount = galleryAssets.filter(a => this.unlockedAssets.includes(a.id)).length;
    const completionRate = galleryAssets.length > 0 ? Math.round((unlockedCount / galleryAssets.length) * 100) : 0;
    
    const rateEl = document.getElementById('gallery-completion-rate');
    if (rateEl) rateEl.innerText = `${completionRate} %`;

    const startIndex = (this.galleryPage - 1) * itemsPerPage;
    const pageItems = assets.slice(startIndex, startIndex + itemsPerPage);

    for (let i = 0; i < 12; i++) {
      const card = document.createElement('div');
      card.className = "gallery-card-item";

      if (i < pageItems.length) {
        const asset = pageItems[i];
        const isUnlocked = this.unlockedAssets.includes(asset.id);

        if (isUnlocked) {
          card.classList.add('unlocked');
          card.style.backgroundImage = `url('${playerWorkspace.resolveMedia(asset.path)}')`;
          card.innerHTML = `<div class="gallery-card-name">${asset.name}</div>`;
          card.onclick = () => this.previewGalleryAsset(asset.path);
        } else {
          card.classList.add('locked');
          card.innerHTML = `<div class="gallery-card-lock">?</div>`;
        }
      } else {
        card.classList.add('blank');
      }
      grid.appendChild(card);
    }

    const indicator = document.getElementById('gallery-page-indicator');
    if (indicator) indicator.innerText = `${this.galleryPage} / ${totalPages}`;
    
    const prevBtn = document.getElementById('btn-gallery-prev');
    if (prevBtn) prevBtn.style.opacity = this.galleryPage === 1 ? "0.3" : "1";
    
    const nextBtn = document.getElementById('btn-gallery-next');
    if (nextBtn) nextBtn.style.opacity = this.galleryPage === totalPages ? "0.3" : "1";
  }

  previewGalleryAsset(path) {
    this.playSynthSFX('click');
    const overlay = document.getElementById('gallery-preview-overlay');
    const img = document.getElementById('gallery-preview-img');
    if (!overlay || !img) return;
    img.src = playerWorkspace.resolveMedia(path);
    overlay.classList.remove('hidden');

    const closeBtn = document.getElementById('btn-gallery-preview-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.playSynthSFX('click');
        overlay.classList.add('hidden');
        img.src = "";
      };
    }
    overlay.onclick = () => {
      this.playSynthSFX('click');
      overlay.classList.add('hidden');
      img.src = "";
    };
  }

  openMusicScreen(cameFromGallery = false) {
    this.playSynthSFX('click');
    this.musicPage = 1;
    this.cameFromGallery = cameFromGallery;

    document.getElementById('title-screen').classList.add('hidden');
    const galleryScreen = document.getElementById('gallery-screen');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    document.getElementById('music-screen').classList.remove('hidden');

    this.renderMusicGrid();
    this.setupMusicEvents();
  }

  setupMusicEvents() {
    const prevBtn = document.getElementById('btn-music-prev');
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.musicPage > 1) {
          this.playSynthSFX('click');
          this.musicPage--;
          this.renderMusicGrid();
        }
      };
    }

    const nextBtn = document.getElementById('btn-music-next');
    if (nextBtn) {
      nextBtn.onclick = () => {
        const assets = (this.project.unlockables || []).filter(a => a.type === 'music');
        const totalPages = Math.ceil(assets.length / 12) || 1;
        if (this.musicPage < totalPages) {
          this.playSynthSFX('click');
          this.musicPage++;
          this.renderMusicGrid();
        }
      };
    }

    const closeBtn = document.getElementById('btn-music-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.playSynthSFX('click');
        document.getElementById('music-screen').classList.add('hidden');
        if (this.cameFromGallery) {
          const galleryScreen = document.getElementById('gallery-screen');
          if (galleryScreen) galleryScreen.classList.remove('hidden');
          this.renderGalleryGrid();
        } else {
          this.showTitleScreen();
        }
      };
    }
  }

  renderMusicGrid() {
    const grid = document.getElementById('music-display-grid');
    if (!grid) return;
    grid.innerHTML = "";

    const assets = (this.project.unlockables || []).filter(a => a.type === 'music');
    const totalItems = assets.length;
    const itemsPerPage = 12;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (this.musicPage > totalPages) this.musicPage = totalPages;
    if (this.musicPage < 1) this.musicPage = 1;

    const musicAssets = (this.project.unlockables || []).filter(a => a.type === 'music');
    const unlockedCount = musicAssets.filter(a => this.unlockedAssets.includes(a.id)).length;
    const completionRate = musicAssets.length > 0 ? Math.round((unlockedCount / musicAssets.length) * 100) : 0;
    
    const rateEl = document.getElementById('music-completion-rate');
    if (rateEl) rateEl.innerText = `${completionRate} %`;

    const startIndex = (this.musicPage - 1) * itemsPerPage;
    const pageItems = assets.slice(startIndex, startIndex + itemsPerPage);

    for (let i = 0; i < 12; i++) {
      const button = document.createElement('button');
      button.className = "music-track-btn";

      if (i < pageItems.length) {
        const asset = pageItems[i];
        const isUnlocked = this.unlockedAssets.includes(asset.id);

        if (isUnlocked) {
          button.classList.add('unlocked');
          const isPlaying = this.activeAudioElement && !this.activeAudioElement.paused && this.currentMusicPathOrId === asset.path;
          
          button.innerHTML = `
            <span class="music-note-icon">${isPlaying ? '🎵' : ''}</span>
            <span class="music-track-name">${asset.name}</span>
          `;
          if (isPlaying) button.classList.add('playing');

          button.onclick = () => {
            this.playSynthSFX('click');
            if (isPlaying) {
              this.activeAudioElement.pause();
              this.renderMusicGrid();
            } else {
              this.playMusic(asset.path);
              this.renderMusicGrid();
            }
          };
        } else {
          button.classList.add('locked');
          button.innerHTML = `
            <span class="music-note-icon"></span>
            <span class="music-track-name">???</span>
          `;
        }
      } else {
        button.classList.add('blank');
        button.disabled = true;
      }
      grid.appendChild(button);
    }

    const indicator = document.getElementById('music-page-indicator');
    if (indicator) indicator.innerText = `${this.musicPage} / ${totalPages}`;

    const prevBtn = document.getElementById('btn-music-prev');
    if (prevBtn) prevBtn.style.opacity = this.musicPage === 1 ? "0.3" : "1";

    const nextBtn = document.getElementById('btn-music-next');
    if (nextBtn) nextBtn.style.opacity = this.musicPage === totalPages ? "0.3" : "1";
  }

  initDebugMenu() {
    const urlParams = new URLSearchParams(window.location.search);
    const isPlaytest = urlParams.get('playtest') === 'true';
    const isDebugEnabled = this.project.config && this.project.config.debugModeEnabled;

    const debugContainer = document.getElementById('playtest-debug-container');
    if (!debugContainer) return;

    if (isPlaytest && isDebugEnabled) {
      debugContainer.classList.remove('hidden');
    } else {
      debugContainer.classList.add('hidden');
      return;
    }

    const debugBtn = document.getElementById('playtest-debug-btn');
    const debugPanel = document.getElementById('playtest-debug-panel');
    const debugClose = document.getElementById('playtest-debug-close');
    const debugUnlockBtn = document.getElementById('playtest-debug-unlock-btn');
    const debugSearch = document.getElementById('playtest-debug-search');

    debugBtn.onclick = (e) => {
      e.stopPropagation();
      this.playSynthSFX('click');
      debugPanel.classList.toggle('hidden');
      if (!debugPanel.classList.contains('hidden')) {
        this.renderDebugScenesList("");
        this.updateDebugVariablesList();
        debugSearch.value = "";
        debugSearch.focus();
      }
    };

    debugClose.onclick = (e) => {
      e.stopPropagation();
      this.playSynthSFX('click');
      debugPanel.classList.add('hidden');
    };

    debugUnlockBtn.onclick = (e) => {
      e.stopPropagation();
      this.unlockAllUnlockables();
    };

    debugSearch.oninput = (e) => {
      this.renderDebugScenesList(e.target.value);
    };

    // Stop keyboard propagation on inputs to prevent dialog progression
    const stopInputs = [debugSearch];
    stopInputs.forEach(input => {
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('keypress', (e) => e.stopPropagation());
      input.addEventListener('keyup', (e) => e.stopPropagation());
    });
  }

  renderDebugScenesList(query) {
    const list = document.getElementById('playtest-debug-scenes-list');
    if (!list) return;
    list.innerHTML = "";

    const scenes = this.project.scenes || {};
    const queryLower = query.toLowerCase().trim();

    Object.keys(scenes).forEach(id => {
      const scene = scenes[id];
      const sceneName = scene.name || id;

      if (queryLower && !sceneName.toLowerCase().includes(queryLower) && !id.toLowerCase().includes(queryLower)) {
        return;
      }

      const btn = document.createElement('button');
      btn.style.width = '100%';
      btn.style.textAlign = 'left';
      btn.style.background = 'rgba(128, 128, 128, 0.08)';
      btn.style.border = '1px solid var(--border-color)';
      btn.style.borderRadius = 'var(--radius-sm)';
      btn.style.color = 'var(--text-main)';
      btn.style.padding = '6px 8px';
      btn.style.fontSize = '0.75rem';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'background 0.2s';
      btn.innerText = `🎬 ${sceneName}`;

      btn.onmouseover = () => {
        btn.style.background = 'rgba(128, 128, 128, 0.16)';
      };
      btn.onmouseout = () => {
        btn.style.background = 'rgba(128, 128, 128, 0.08)';
      };

      btn.onclick = (e) => {
        e.stopPropagation();
        this.playSynthSFX('click');
        document.getElementById('playtest-debug-panel').classList.add('hidden');
        
        // Hide screens and load scene
        document.getElementById('title-screen').classList.add('hidden');
        const galleryScreen = document.getElementById('gallery-screen');
        if (galleryScreen) galleryScreen.classList.add('hidden');
        document.getElementById('music-screen').classList.add('hidden');
        document.getElementById('stage-screen').classList.remove('hidden');
        
        this.isDebugJump = true;
        this.loadScene(id);
      };

      list.appendChild(btn);
    });
  }

  unlockAllUnlockables() {
    this.playSynthSFX('click');
    
    // Unlock all assets
    const assetsList = this.project.unlockables || [];
    this.unlockedAssets = assetsList.map(a => a.id);
    this.writeProjectStorage('unlocked_assets', this.unlockedAssets);

    // Unlock all endings
    const endingsList = [];
    if (this.project.scenes) {
      Object.keys(this.project.scenes).forEach(sid => {
        const sc = this.project.scenes[sid];
        if (sc.isEnding && sc.endingName) {
          endingsList.push(sc.endingName);
        }
      });
    }
    this.unlockedEndings = endingsList;
    this.writeProjectStorage('endings', this.unlockedEndings);

    alert("Debug: All gallery assets and endings have been unlocked!");
  }
}

// Global modal closer
function closeModal(id) {
  if (window.VNFairyModalControls) {
    window.VNFairyModalControls.close(id);
    return;
  }
  if (window.engine) window.engine.playSynthSFX('click');
  document.getElementById(id).classList.add('hidden');
}

// Initialize on load
window.onload = () => {
  window.engine = new VNFairyEngine();
  window.engine.init();
};
