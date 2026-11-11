/* Storage boundary shared by the Designer and Player. The Node API remains the default when available. */
(function (root) {
  const core = root.VNFairyCore;
  const registry = core.assetRegistry;
  const base = new URL('.', location.href);
  const setting = 'vnfairy-workspace:' + base.pathname;
  const safeId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id) && !['constructor', 'prototype'].includes(id);
  const safeScene = id => /^[A-Za-z0-9_-]+$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[-_]+/, '').slice(0, 72);
  const json = value => JSON.stringify(value, null, 2);
  const mime = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
    mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg'
  };
  const missing = error => error.name === 'NotFoundError' || error.name === 'TypeMismatchError';
  let dbPromise, initialization, folder, serverAvailable = false, mode = 'server', queue = Promise.resolve();
  const media = new Map();

  function database() {
    return dbPromise ||= new Promise((resolve, reject) => {
      const request = indexedDB.open(setting, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbOperation(method, ...args) {
    const db = await database();
    const tx = db.transaction('files', ['put', 'delete'].includes(method) ? 'readwrite' : 'readonly');
    return new Promise((resolve, reject) => {
      const request = tx.objectStore('files')[method](...args);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || request.error);
    });
  }

  const files = {
    async dir(parts, create = false) {
      let dir = folder.handle;
      for (const name of parts) dir = await dir.getDirectoryHandle(name, { create });
      return dir;
    },
    async get(path) {
      if (mode !== 'folder') return dbOperation('get', path);
      const parts = path.split('/');
      const name = parts.pop();
      try {
        return await (await (await this.dir(parts)).getFileHandle(name)).getFile();
      } catch (error) {
        if (!missing(error)) throw error;
      }
    },
    async put(path, value) {
      const blob = typeof value === 'string' ? new Blob([value], { type: 'application/json' }) : value;
      if (mode !== 'folder') return dbOperation('put', blob, path);
      const parts = path.split('/');
      const name = parts.pop();
      const dir = await this.dir(parts, true);
      const writer = await (await dir.getFileHandle(name, { create: true })).createWritable();
      try {
        await writer.write(blob);
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => {});
        throw error;
      }
    },
    async list(path = '', kind = 'file') {
      if (mode === 'folder') {
        try {
          const names = [];
          for await (const [name, handle] of (await this.dir(path ? path.split('/') : [])).entries()) {
            if (handle.kind === kind) names.push(name);
          }
          return names.sort();
        } catch (error) {
          if (missing(error)) return [];
          throw error;
        }
      }
      const prefix = path ? path + '/' : '';
      const keys = await dbOperation('getAllKeys', IDBKeyRange.bound(prefix, prefix + '\uffff'));
      const names = new Set();
      for (const key of keys) {
        if (!key.startsWith(prefix) || key.startsWith('@')) continue;
        const relative = key.slice(prefix.length);
        if (kind === 'file' && !relative.includes('/')) names.add(relative);
        if (kind === 'directory' && relative.includes('/')) names.add(relative.split('/')[0]);
      }
      return [...names].sort();
    },
    async remove(path, recursive = false) {
      if (mode !== 'folder') {
        if (!recursive) return dbOperation('delete', path);
        const prefix = path + '/';
        return dbOperation('delete', IDBKeyRange.bound(prefix, prefix + '\uffff'));
      }
      const parts = path.split('/');
      const name = parts.pop();
      try {
        await (await this.dir(parts)).removeEntry(name, { recursive });
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
  };

  async function readJson(path) {
    const blob = await files.get(path);
    return blob && JSON.parse(await blob.text());
  }

  function validate(project, id, writing = false) {
    if (!project || project.id !== id || !project.scenes || Array.isArray(project.scenes) ||
        typeof project.scenes !== 'object' || !Object.keys(project.scenes).every(safeScene)) throw new Error('Invalid project data');
    const data = writing ? core.migrations.stampProjectForWrite(project) : core.migrations.migrateProject(project);
    return core.validator.assertProject(data, { expectedId: id });
  }

  async function loadProject(id) {
    const project = await readJson(id + '/project.json');
    if (!project) throw new Error('Project not found');
    for (const [sceneId, scene] of Object.entries(project.scenes || {})) {
      if (!safeScene(sceneId)) throw new Error('Invalid scene ID');
      // Split project metadata contains only the scene's label and ID.
      if (scene && Object.keys(scene).every(key => ['id', 'name', 'title'].includes(key))) {
        project.scenes[sceneId] = await readJson(id + '/scenes/' + sceneId + '.json') || scene;
      }
    }
    return validate(project, id);
  }

  async function writeProject(id, data) {
    const project = validate(data, id, true);
    // A single committed file keeps browser saves consistent if a write is interrupted.
    await files.put(id + '/project.json', json(project));
    return project;
  }

  async function assetFiles(id) {
    const result = new Map();
    for (const type of registry.ASSET_TYPES) {
      const dir = id + '/assets/' + type;
      for (const name of await files.list(dir)) {
        if (!validAsset(type, name)) continue;
        const file = await files.get(dir + '/' + name);
        if (file) result.set(type + '/' + name, file);
      }
    }
    return result;
  }

  function validAsset(type, name) {
    return registry.isAssetType(type) && registry.isSafeFilename(name) && registry.ALLOWED_EXTENSIONS[type].includes(registry.extensionOf(name));
  }

  function resolveMedia(path) {
    if (!path || typeof path !== 'string' || mode === 'server') return path;
    const match = /^(?:\.\/|\/)?data\/projects\/([a-z0-9_-]+)\/assets\/([^/]+)\/([^/]+)$/.exec(path);
    if (!match) return path;
    const key = match.slice(1).join('/');
    if (media.has(key)) return media.get(key).url;
    try { return media.get(decodeURIComponent(key))?.url || path; } catch { return path; }
  }

  function prepareMedia(id, assets) {
    const current = new Set();
    for (const [path, file] of assets) {
      const [type, name] = path.split('/');
      const key = id + '/' + path;
      current.add(key);
      const signature = [file.size, file.lastModified, file.type].join(':');
      const previous = media.get(key);
      if (previous?.signature === signature) continue;
      if (previous) URL.revokeObjectURL(previous.url);
      const extension = registry.extensionOf(name).slice(1);
      const contentType = type === 'video' && extension === 'ogg' ? 'video/ogg' : mime[extension];
      media.set(key, { signature, url: URL.createObjectURL(file.slice(0, file.size, contentType)) });
    }
    for (const [key, entry] of media) {
      if (key.startsWith(id + '/') && !current.has(key)) {
        URL.revokeObjectURL(entry.url);
        media.delete(key);
      }
    }
  }

  async function upload(id, type, file) {
    if (!safeId(id) || !validAsset(type, file.name)) throw new Error('Invalid asset name or file type');
    if (!file.size || file.size > registry.MAX_UPLOAD_BYTES[type]) throw new Error('Asset is empty or exceeds its size limit');
    if (!await files.get(id + '/project.json')) throw new Error('Project not found');
    const path = id + '/assets/' + type + '/' + file.name;
    await files.put(path, file);
    const key = id + '/' + type + '/' + file.name;
    if (media.has(key)) URL.revokeObjectURL(media.get(key).url);
    media.delete(key);
    return { success: true, path: 'data/projects/' + path };
  }

  async function uniqueId(preferred) {
    const baseId = safeId(slug(preferred)) ? slug(preferred) : 'imported-project';
    const existing = new Set((await files.list('', 'directory')).map(name => name.toLowerCase()));
    let id = baseId;
    for (let i = 2; existing.has(id); i++) id = baseId + '-' + i;
    return id;
  }

  function withId(project, id) {
    const prefix = 'data/projects/' + project.id + '/assets/';
    const rewrite = value => {
      if (typeof value === 'string') return value.startsWith(prefix) ? 'data/projects/' + id + '/assets/' + value.slice(prefix.length) : value;
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
      return value;
    };
    return { ...rewrite(project), id };
  }

  function splitProject(entries, prefix, project) {
    const scenes = {};
    for (const [id, scene] of Object.entries(project.scenes)) {
      entries.set(prefix + 'scenes/' + id + '.json', json(scene));
      scenes[id] = { id, name: scene.name, title: scene.title };
    }
    const metadata = json({ ...project, scenes });
    entries.set(prefix + 'project.json', metadata);
    return metadata;
  }

  async function importSource(file) {
    const entries = await root.VNFairyZip.read(file, name => {
      if (name === 'manifest.json' || name === 'project/project.json') return true;
      const parts = name.split('/');
      if (parts[0] !== 'project') return false;
      if (parts.length === 3 && parts[1] === 'scenes' && parts[2].endsWith('.json')) return safeScene(parts[2].slice(0, -5));
      return parts.length === 4 && parts[1] === 'assets' && validAsset(parts[2], parts[3]);
    });
    const parse = async name => {
      if (!entries.has(name)) throw new Error('Missing ' + name);
      return JSON.parse(await entries.get(name).text());
    };
    const manifest = await parse('manifest.json');
    if (manifest.format !== 'vnfairy-source' || manifest.version !== 1 || !safeId(manifest.projectId)) throw new Error('Unsupported VNFairy source format');
    const project = await parse('project/project.json');
    for (const sceneId of Object.keys(project.scenes || {})) {
      if (!safeScene(sceneId)) throw new Error('Invalid scene ID');
      project.scenes[sceneId] = await parse('project/scenes/' + sceneId + '.json');
    }
    const id = await uniqueId(manifest.projectId);
    const data = validate(withId(validate(project, manifest.projectId), id), id);
    const assets = [...entries].filter(([path]) => path.startsWith('project/assets/')).map(([path, blob]) => [path.slice(15), blob]);
    await copyProject(data, assets);
    return { id, title: data.title };
  }

  async function copyProject(project, assets) {
    try {
      for (const [path, blob] of assets) await files.put(project.id + '/assets/' + path, blob);
      await writeProject(project.id, project);
    } catch (error) {
      await files.remove(project.id, true).catch(() => {});
      throw error;
    }
  }

  async function download(id, playable = false) {
    if (!safeId(id)) throw new Error('Invalid project ID');
    const project = await loadProject(id);
    const assets = await assetFiles(id);
    const entries = new Map();
    const prefix = playable ? 'data/projects/' + id + '/' : 'project/';
    const metadata = splitProject(entries, prefix, project);
    if (playable) {
      const runtime = await fetch(new URL('index.html', base));
      if (!runtime.ok) throw new Error('Could not load the Player');
      const html = await runtime.text();
      entries.set('index.html', html);
      // Use the Player's local script and stylesheet references so packages follow runtime changes.
      const paths = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="((?:js|shared|css)\/[^"?]+)(?:\?[^"]*)?"/g)].map(match => match[1]);
      await Promise.all([...new Set([...paths, 'OFL.txt'])].map(async path => {
        const response = await fetch(new URL(path, base));
        if (!response.ok) throw new Error('Could not package ' + path);
        entries.set(path, await response.blob());
      }));
      entries.set('data/project.json', metadata);
      entries.set('data/project.js', 'window.vnFairyProject = ' + metadata + ';');
      for (const [sceneId, scene] of Object.entries(project.scenes)) {
        entries.set(prefix + 'scenes/' + sceneId + '.js',
          'window.vnFairyScenes = window.vnFairyScenes || {};\nwindow.vnFairyScenes[' + json(sceneId) + '] = ' + json(scene) + ';');
      }
    } else {
      entries.set('manifest.json', json({ format: 'vnfairy-source', version: 1, projectId: id, exportedAt: new Date().toISOString() }));
    }
    for (const [path, blob] of assets) entries.set(prefix + 'assets/' + path, blob);
    const url = URL.createObjectURL(await root.VNFairyZip.write(entries));
    const link = document.createElement('a');
    link.href = url;
    link.download = id + (playable ? '_game.zip' : '.vnfairy');
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function localRequest(url, options) {
    const route = url.pathname;
    const params = url.searchParams;
    const data = options.body ? JSON.parse(options.body) : {};
    const id = params.get('id') || params.get('project') || data.project || 'demo';
    if (!safeId(id)) throw new Error('Invalid project ID');
    if (route === '/api/projects') {
      const projects = [];
      for (const id of (await files.list('', 'directory')).filter(safeId)) {
        let project;
        try { project = await readJson(id + '/project.json'); } catch (error) {
          if (error instanceof SyntaxError) continue;
          throw error;
        }
        if (project && (!project.archivedAt || params.get('includeArchived') === '1')) {
          projects.push({ id, title: project.title || id, author: project.author || 'Unknown', archived: Boolean(project.archivedAt) });
        }
      }
      return projects;
    }
    if (route === '/api/assets') {
      const assets = await assetFiles(id);
      prepareMedia(id, assets);
      const result = Object.fromEntries(registry.ASSET_TYPES.map(type => [type, []]));
      result.metadata = {};
      for (const [path, blob] of assets) {
        const [type, name] = path.split('/');
        result[type].push(name);
        result.metadata[type] ||= {};
        result.metadata[type][name] = { size: blob.size, modifiedAt: blob.lastModified ? new Date(blob.lastModified).toISOString() : null, detectedType: blob.type };
      }
      return result;
    }
    if (route === '/api/project/create') {
      const id = slug(data.id);
      if (!safeId(id)) throw new Error('Project ID must contain letters or numbers');
      if ((await files.list('', 'directory')).some(name => name.toLowerCase() === id)) throw new Error('Project directory already exists');
      const project = await writeProject(id, {
        ...core.projectSchema.createProjectMetadata({ ...data, id }),
        config: { textSpeed: 40 }, startSceneId: 'scene_1',
        scenes: { scene_1: { id: 'scene_1', name: 'Introduction', dialogue: [{ speaker: 'narrator', text: 'Start writing your visual novel dialogue here.' }], choices: [] } }
      });
      return { success: true, id, project };
    }
    if (route === '/api/project') {
      if (options.method !== 'POST') return loadProject(id);
      if (!await files.get(id + '/project.json')) throw new Error('Project not found');
      return { success: true, project: await writeProject(id, data) };
    }
    if (route === '/api/asset/delete') {
      if (!validAsset(data.type, data.filename)) throw new Error('Invalid asset path');
      await files.remove(id + '/assets/' + data.type + '/' + data.filename);
      return { success: true };
    }
    const project = await loadProject(id);
    if (route === '/api/project/delete') await files.remove(id, true);
    else if (route === '/api/project/rename') await writeProject(id, { ...project, title: data.title });
    else if (route === '/api/project/archive') await writeProject(id, { ...project, archivedAt: data.archived ? new Date().toISOString() : null });
    else if (route === '/api/project/duplicate') {
      const newId = await uniqueId(data.title);
      await copyProject({ ...withId(project, newId), title: data.title, archivedAt: null }, await assetFiles(id));
      return { success: true, id: newId };
    } else throw new Error('This action requires server mode');
    return { success: true };
  }

  function exclusive(action) {
    const run = () => navigator.locks ? navigator.locks.request(setting + ':' + (folder?.id || 'browser'), action) : action();
    const next = queue.then(run);
    queue = next.catch(() => {});
    return next;
  }

  function init() {
    return initialization ||= (async () => {
      try {
        const response = await fetch(new URL('api/projects', base), { cache: 'no-store' });
        serverAvailable = response.ok && /application\/json/i.test(response.headers.get('Content-Type') || '') && Array.isArray(await response.json());
      } catch { /* Static hosting has no API. */ }
      const preference = localStorage.getItem(setting);
      if (serverAvailable && preference !== 'browser' && preference !== 'folder') return;
      mode = 'browser';
      if (preference === 'folder' && typeof root.showDirectoryPicker === 'function') {
        folder = await dbOperation('get', '@folder');
        if (folder) mode = 'folder';
      }
    })();
  }

  async function request(path, options = {}) {
    await init();
    if (mode === 'server') return fetch(new URL(path.replace(/^\//, ''), base), options);
    try {
      const action = () => localRequest(new URL(path, base), options);
      const result = await (options.method === 'POST' ? exclusive(action) : action());
      return { ok: true, json: async () => result };
    } catch (error) {
      return { ok: false, json: async () => ({ error: error.message }) };
    }
  }

  async function bindControls(container) {
    if (!container) return;
    await init();
    const status = document.createElement('p');
    status.className = 'muted';
    status.textContent = mode === 'server' ? 'Storage: Node server' : mode === 'folder'
      ? 'Storage: ' + folder.handle.name : 'Storage: this browser. Export .vnfairy files to back up or move your stories.';
    const controls = document.createElement('div');
    controls.className = 'workspace-storage-actions';
    container.replaceChildren(status, controls);
    const button = (label, action) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'btn-secondary';
      element.textContent = label;
      element.onclick = async () => {
        try { await action(); }
        catch (error) { if (error.name !== 'AbortError') alert(error.message); }
      };
      controls.append(element);
    };
    const switchTo = value => {
      localStorage.setItem(setting, value);
      location.href = location.pathname;
    };
    if (typeof root.showDirectoryPicker === 'function') {
      if (mode === 'folder' && await folder.handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        status.textContent += ' (access needed)';
        button('Reconnect folder', async () => {
          if (await folder.handle.requestPermission({ mode: 'readwrite' }) === 'granted') location.reload();
        });
      }
      button(mode === 'folder' ? 'Change folder' : 'Choose folder', async () => {
        const handle = await root.showDirectoryPicker({ mode: 'readwrite', id: 'vnfairy-projects' });
        const remembered = await dbOperation('get', '@folder');
        const id = remembered && await handle.isSameEntry(remembered.handle) ? remembered.id : crypto.randomUUID();
        await dbOperation('put', { handle, id }, '@folder');
        switchTo('folder');
      });
    }
    if (mode !== 'browser') button('Use browser storage', () => switchTo('browser'));
    if (serverAvailable && mode !== 'server') button('Use Node server', () => switchTo('server'));
  }

  root.VNFairyWorkspace = {
    init, request, bindControls, resolveMedia,
    get mode() { return mode; },
    get recoveryScope() { return mode === 'folder' ? folder.id : mode; },
    loadMedia: async id => { if (mode !== 'server' && safeId(id)) prepareMedia(id, await assetFiles(id)); },
    upload: (id, type, file) => exclusive(() => upload(id, type, file)),
    importSource: file => exclusive(() => importSource(file)),
    download
  };
})(window);
