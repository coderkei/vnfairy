const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AdmZip = require('adm-zip');
const core = require('../shared');
const zip = require('../js/project-zip');
const source = fs.readFileSync(path.join(__dirname, '../js/project-workspace.js'), 'utf8');

function memoryDatabase(records) {
  const inRange = (key, { lower, upper }) => lower <= key && key <= upper;
  const db = {
    transaction() {
      const tx = {};
      const run = action => {
        const request = {};
        queueMicrotask(() => {
          request.result = action();
          tx.oncomplete();
        });
        return request;
      };
      tx.objectStore = () => ({
        get: key => run(() => records.get(key)),
        put: (value, key) => run(() => records.set(key, value)),
        getAllKeys: range => run(() => [...records.keys()].filter(key => inRange(key, range))),
        delete: query => run(() => {
          if (typeof query === 'string') records.delete(query);
          else for (const key of records.keys()) if (inRange(key, query)) records.delete(key);
        })
      });
      return tx;
    }
  };
  return {
    open() {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess());
      return request;
    }
  };
}

function memoryFolder(name) {
  const entries = new Map();
  function entry(key, kind, create, make) {
    if (!entries.has(key) && create) entries.set(key, make());
    if (entries.get(key)?.kind !== kind) throw new DOMException('Missing ' + key, 'NotFoundError');
    return entries.get(key);
  }
  return {
    kind: 'directory', name,
    entries: async function* () { yield* entries; },
    getDirectoryHandle: async (key, { create } = {}) => entry(key, 'directory', create, () => memoryFolder(key)),
    getFileHandle: async (key, { create } = {}) => entry(key, 'file', create, () => {
      let file;
      return {
        kind: 'file',
        getFile: async () => file,
        createWritable: async () => {
          let pending;
          return { write: async value => { pending = value; }, close: async () => { file = pending; } };
        }
      };
    }),
    removeEntry: async key => entries.delete(key)
  };
}

function openWorkspace({ records = new Map(), preference, folder, server = false } = {}) {
  const requests = [], downloads = new Map();
  let lastDownload;
  const window = { VNFairyCore: core, VNFairyZip: zip };
  if (folder) {
    records.set('@folder', { handle: folder, id: 'folder-fixture' });
    window.showDirectoryPicker = () => { throw new Error('Unexpected picker call'); };
  }
  vm.runInNewContext(source, {
    window, Blob, navigator: {},
    location: { href: 'https://example.test/VNFairy/editor.html' },
    URL: class extends URL {
      static createObjectURL(blob) {
        const url = 'blob:' + (downloads.size + 1);
        downloads.set(url, blob);
        return url;
      }
      static revokeObjectURL(url) { downloads.delete(url); }
    },
    localStorage: { getItem: () => preference },
    indexedDB: memoryDatabase(records),
    IDBKeyRange: { bound: (lower, upper) => ({ lower, upper }) },
    fetch: async (url, options) => {
      requests.push([url.pathname, options?.method || 'GET']);
      if (server) return Response.json(url.pathname.endsWith('/projects') ? [] : { success: true });
      if (url.pathname.includes('/api/')) return new Response('Not found', { status: 404 });
      return new Response(fs.readFileSync(path.join(__dirname, '..', url.pathname.slice('/VNFairy/'.length))));
    },
    document: {
      body: { append() {} },
      createElement: () => ({ click() { lastDownload = [this.download, downloads.get(this.href)]; }, remove() {} })
    },
    setTimeout: () => {}
  });
  return { workspace: window.VNFairyWorkspace, requests, download: () => lastDownload };
}

async function call(workspace, route, data) {
  const response = await workspace.request('/api/' + route, data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) });
  const result = await response.json();
  assert.equal(response.ok, true, result.error);
  return result;
}

test('a static subpath supports browser projects, media, source transfer and playable exports', async () => {
  const records = new Map();
  const first = openWorkspace({ records });
  const { workspace } = first;
  const { project } = await call(workspace, 'project/create', { id: 'sample', title: 'A Sample' });
  assert.equal(workspace.mode, 'browser');
  const assetPath = 'data/projects/sample/assets/bg/room light.png';
  project.assets.backgrounds.push({ id: 'room', path: assetPath });
  project.scenes.scene_1.background = 'room';
  await workspace.upload('sample', 'bg', new File(['fixture'], 'room light.png'));
  await call(workspace, 'project?id=sample', project);

  // A new page has no in-memory state from the editor.
  const player = openWorkspace({ records }).workspace;
  assert.equal((await call(player, 'projects'))[0].title, 'A Sample');
  const loaded = await call(player, 'project?id=sample');
  assert.equal(loaded.scenes.scene_1.background, 'room');
  await player.loadMedia('sample');
  assert.match(player.resolveMedia(assetPath.replace(' ', '%20')), /^blob:/);
  assert.equal(loaded.assets.backgrounds[0].path, assetPath);

  await workspace.download('sample');
  const [filename, archive] = first.download();
  assert.equal(filename, 'sample.vnfairy');
  const serverZip = new AdmZip(Buffer.from(await archive.arrayBuffer()));
  assert.equal(JSON.parse(serverZip.readAsText('manifest.json')).format, 'vnfairy-source');
  assert.equal(JSON.parse(serverZip.readAsText('project/scenes/scene_1.json')).background, 'room');
  assert.equal(serverZip.readAsText('project/assets/bg/room light.png'), 'fixture');

  // Use the Node ZIP writer to exercise compressed entries on browser import.
  const compressed = new AdmZip();
  for (const entry of serverZip.getEntries()) compressed.addFile(entry.entryName, entry.getData());
  const importArchive = new Blob([compressed.toBuffer()]);
  const imported = await workspace.importSource(importArchive);
  assert.equal(imported.id, 'sample-2');
  const clone = await call(workspace, 'project?id=sample-2');
  assert.equal(clone.assets.backgrounds[0].path, assetPath.replace('/sample/', '/sample-2/'));
  await call(workspace, 'asset/delete', { project: 'sample-2', type: 'bg', filename: 'room light.png' });
  assert.equal((await call(workspace, 'assets?project=sample-2')).bg.length, 0);
  assert.equal((await call(workspace, 'assets?project=sample')).bg.length, 1);

  await workspace.download('sample', true);
  const [gameName, game] = first.download();
  assert.equal(gameName, 'sample_game.zip');
  const playable = new AdmZip(Buffer.from(await game.arrayBuffer()));
  assert.match(playable.readAsText('index.html'), /js\/project-workspace\.js/);
  assert.ok(playable.getEntry('js/project-workspace.js'));
  assert.match(playable.readAsText('data/project.js'), /window\.vnFairyProject/);
  assert.match(playable.readAsText('data/projects/sample/scenes/scene_1.js'), /window\.vnFairyScenes/);
  assert.equal(playable.readAsText('data/projects/sample/assets/bg/room light.png'), 'fixture');
  assert.equal(first.requests.filter(([url]) => url.includes('/api/')).length, 1);
});

test('folder mode uses the selected directory for project and asset writes', async () => {
  const folder = memoryFolder('Stories');
  const { workspace } = openWorkspace({ folder, preference: 'folder' });
  await call(workspace, 'project/create', { id: 'folder-story', title: 'Folder Story' });
  assert.equal(workspace.mode, 'folder');
  await workspace.upload('folder-story', 'sound', new File(['audio'], 'voice.ogg'));
  const projectDir = await folder.getDirectoryHandle('folder-story');
  const project = await (await projectDir.getFileHandle('project.json')).getFile();
  assert.equal(JSON.parse(await project.text()).scenes.scene_1.dialogue.length, 1);
  const sound = await (await projectDir.getDirectoryHandle('assets')).getDirectoryHandle('sound');
  assert.equal(await (await (await sound.getFileHandle('voice.ogg')).getFile()).text(), 'audio');
  assert.equal((await call(workspace, 'assets?project=folder-story')).metadata.sound['voice.ogg'].size, 5);
});

test('Node mode keeps forwarding requests under the application base', async () => {
  const { workspace, requests } = openWorkspace({ server: true });
  await call(workspace, 'project?id=sample', { id: 'sample' });
  assert.equal(workspace.mode, 'server');
  assert.deepEqual(requests, [['/VNFairy/api/projects', 'GET'], ['/VNFairy/api/project', 'POST']]);
});
