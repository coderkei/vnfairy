/*
 * VNFairy Server
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
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { createProjectStore } = require('./project-store');
const { createAssetService } = require('./asset-service');
const { createPackageService } = require('./package-service');

// Parse command line arguments for port & host
let argPort = null;
let argHost = null;

process.argv.forEach(val => {
  if (val.startsWith('--port=')) {
    argPort = parseInt(val.split('=')[1], 10);
  } else if (val.startsWith('--host=')) {
    argHost = val.split('=')[1];
  }
});

if (!argPort && process.argv[2] && !process.argv[2].startsWith('--')) {
  argPort = parseInt(process.argv[2], 10);
}
if (!argHost && process.argv[3] && !process.argv[3].startsWith('--')) {
  argHost = process.argv[3];
}

const PORT = argPort || process.env.PORT || process.env.npm_config_port || 3000;
const HOST = argHost || process.env.HOST || process.env.npm_config_host || '127.0.0.1';
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const RECOVERY_DIR = path.join(DATA_DIR, 'recovery');
const MAX_RECOVERY_SNAPSHOTS = 10;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ico': 'image/x-icon',
  '.vnfairy': 'application/vnd.vnfairy.project+zip'
};

// Ensure data folders exist
const assetTypes = ['bg', 'char', 'music', 'sound', 'video'];
const projectStore = createProjectStore({ projectsDir: PROJECTS_DIR, recoveryDir: RECOVERY_DIR, assetTypes, maxRecoverySnapshots: MAX_RECOVERY_SNAPSHOTS });
const assetService = createAssetService({ projectsDir: PROJECTS_DIR });
const packageService = createPackageService({ publicDir: PUBLIC_DIR, projectsDir: PROJECTS_DIR, loadProjectMerged: projectStore.loadProjectMerged });
const isSafeProjectId = projectStore.isSafeProjectId;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
if (!fs.existsSync(RECOVERY_DIR)) fs.mkdirSync(RECOVERY_DIR, { recursive: true });

// Setup paths for new project-specific demo folder
const demoDir = path.join(PROJECTS_DIR, 'demo');
const demoProjectPath = path.join(demoDir, 'project.json');
const demoAssetsDir = path.join(demoDir, 'assets');

const legacyProjectPath = path.join(DATA_DIR, 'project.json');
const oldDemoProjectPath = path.join(PROJECTS_DIR, 'demo.json');

// Ensure demo folders exist
if (!fs.existsSync(demoDir)) fs.mkdirSync(demoDir, { recursive: true });
if (!fs.existsSync(demoAssetsDir)) fs.mkdirSync(demoAssetsDir, { recursive: true });
assetTypes.forEach(type => {
  const p = path.join(demoAssetsDir, type);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Auto-migrate legacy project configurations
if (fs.existsSync(legacyProjectPath) && !fs.existsSync(demoProjectPath)) {
  try {
    fs.copyFileSync(legacyProjectPath, demoProjectPath);
    console.log("Migrated legacy project.json to data/projects/demo/project.json");
  } catch (err) {
    console.error("Migration failed:", err);
  }
} else if (fs.existsSync(oldDemoProjectPath) && !fs.existsSync(demoProjectPath)) {
  try {
    fs.copyFileSync(oldDemoProjectPath, demoProjectPath);
    fs.unlinkSync(oldDemoProjectPath);
    console.log("Migrated old data/projects/demo.json to data/projects/demo/project.json");
  } catch (err) {
    console.error("Migration of demo.json failed:", err);
  }
}

// Note: Global assets directory copying logic removed, as all assets are now project-specific

// Ensure at least one project (demo/project.json) exists
if (!fs.existsSync(demoProjectPath)) {
  const defaultProject = {
    artifactType: 'vnfairy-project',
    schemaVersion: 1,
    engineVersion: '2.0.0',
    createdWithVersion: '2.0.0',
    title: "VNFairy Demo",
    author: "coderkei",
    config: {
      kineticMode: false,
      textSpeed: 40,
      titleScreen: {
        background: "",
        music: "",
        titleColor: "#ffffff",
        subtitleColor: "#a5d6a7"
      },
      credits: {
        background: "",
        music: "",
        text: "Story & Art: coderkei\nCreated with VNFairy Engine"
      }
    },
    assets: {
      backgrounds: [],
      characters: [],
      music: [],
      sound: [],
      video: []
    },
    startSceneId: "scene_1",
    scenes: {
      scene_1: {
        id: "scene_1",
        name: "Introduction",
        background: "",
        music: "",
        dialogue: [
          {
            text: "Welcome to VNFairy! Create scenes, choices, characters, and test play them here.",
            layout: { left: null, center: null, right: null },
            speaker: "narrator"
          }
        ],
        choices: []
      }
    }
  };
  projectStore.saveProjectSplit('demo', defaultProject);
}

// Helper to migrate legacy project asset paths to project-specific folders
function migrateProjectAssetPaths(projectId, projectData) {
  let modified = false;
  const prefix = "data/assets/";
  const newPrefix = `data/projects/${projectId}/assets/`;

  const fixPath = (p) => {
    if (p && p.startsWith(prefix)) {
      modified = true;
      return p.replace(prefix, newPrefix);
    }
    return p;
  };

  if (projectData.assets) {
    if (Array.isArray(projectData.assets.backgrounds)) {
      projectData.assets.backgrounds.forEach(b => {
        if (b.path) b.path = fixPath(b.path);
      });
    }
    if (Array.isArray(projectData.assets.music)) {
      projectData.assets.music.forEach(m => {
        if (m.path) m.path = fixPath(m.path);
      });
    }
    if (Array.isArray(projectData.assets.sound)) {
      projectData.assets.sound.forEach(s => {
        if (s.path) s.path = fixPath(s.path);
      });
    }
    if (Array.isArray(projectData.assets.video)) {
      projectData.assets.video.forEach(v => {
        if (v.path) v.path = fixPath(v.path);
      });
    }
    if (Array.isArray(projectData.assets.characters)) {
      projectData.assets.characters.forEach(c => {
        if (Array.isArray(c.sprites)) {
          c.sprites.forEach(s => {
            if (s.path) s.path = fixPath(s.path);
          });
        }
      });
    }
  }

  return modified;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, res, callback, maxBytes = 300 * 1024 * 1024) {
  let body = '';
  let received = 0;
  let rejected = false;
  req.on('data', chunk => {
    if (rejected) return;
    received += chunk.length;
    if (received > maxBytes) {
      rejected = true;
      sendJson(res, 413, { success: false, error: 'Request is too large' });
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on('end', () => {
    if (rejected) return;
    try {
      callback(JSON.parse(body || '{}'));
    } catch (err) {
      sendJson(res, 400, { success: false, error: 'Invalid JSON data', details: err.message });
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch (e) {}

  // --- API ENDPOINTS ---

  // GET /api/projects - List all projects
  if (pathname === '/api/projects' && req.method === 'GET') {
    const includeArchived = url.searchParams.get('includeArchived') === '1';
    const dirs = fs.readdirSync(PROJECTS_DIR).filter(name => {
      try {
        return fs.statSync(path.join(PROJECTS_DIR, name)).isDirectory();
      } catch (e) {
        return false;
      }
    });
    const projectsList = [];
    dirs.forEach(dir => {
      const targetFile = path.join(PROJECTS_DIR, dir, 'project.json');
      if (fs.existsSync(targetFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
          const archived = Boolean(data.archivedAt);
          if (archived && !includeArchived) return;
          projectsList.push({
            id: dir,
            title: data.title || dir,
            author: data.author || "Unknown",
            archived,
            archivedAt: data.archivedAt || null
          });
        } catch (err) {
          // skip malformed json
        }
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(projectsList));
  }

  // GET /api/project - Load a specific project
  if (pathname === '/api/project' && req.method === 'GET') {
    const id = url.searchParams.get('id') || 'demo';
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    const targetPath = path.join(PROJECTS_DIR, id, 'project.json');
    if (!fs.existsSync(targetPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Project not found' }));
    }
    try {
      const data = projectStore.loadProjectMerged(id);
      if (!data) throw new Error('Failed to load project data');
      const modified = migrateProjectAssetPaths(id, data);
      if (modified) {
        projectStore.saveProjectSplit(id, data);
        console.log(`Auto-migrated asset paths for project folder: ${id}`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // POST /api/project - Save a specific project
  if (pathname === '/api/project' && req.method === 'POST') {
    const id = url.searchParams.get('id') || 'demo';
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const projectData = JSON.parse(body);
        const result = projectStore.saveProjectSplit(id, projectData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Project saved successfully', savedAt: new Date().toISOString(), snapshotId: result.snapshotId }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON data', details: err.message }));
      }
    });
    return;
  }

  // POST /api/project/create - Create a new project
  if (pathname === '/api/project/create' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        let { id, title, author } = payload;
        
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Project ID is required' }));
        }
        
        // Sanitize ID
        id = id.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Project ID must contain letters or numbers' });
        const projectDir = path.join(PROJECTS_DIR, id);
        
        if (fs.existsSync(projectDir)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Project directory already exists' }));
        }
        
        const newProject = {
          artifactType: 'vnfairy-project',
          schemaVersion: 1,
          engineVersion: '2.0.0',
          createdWithVersion: '2.0.0',
          title: title || "New Visual Novel",
          author: author || "Unknown",
          config: {
            kineticMode: false,
            textSpeed: 40,
            titleScreen: {
              background: "",
              music: "",
              titleColor: "#ffffff",
              subtitleColor: "#a5d6a7"
            },
            credits: {
              background: "",
              music: "",
              text: `Story & Art: ${author || "Unknown"}\nCreated with VNFairy Engine`
            }
          },
          assets: {
            backgrounds: [],
            characters: [],
            music: [],
            sound: [],
            video: []
          },
          startSceneId: "scene_1",
          scenes: {
            scene_1: {
              id: "scene_1",
               name: "Introduction",
               background: "",
               music: "",
               dialogue: [
                 {
                   text: "Start writing your visual novel dialogue here.",
                   layout: { left: null, center: null, right: null },
                   speaker: "narrator"
                 }
               ],
               choices: []
             }
           }
         };
         
         newProject.id = id;
         const saved = projectStore.saveProjectSplit(id, newProject);
         res.writeHead(200, { 'Content-Type': 'application/json' });
         res.end(JSON.stringify({ success: true, id: id, project: saved.project }));
       } catch (err) {
         res.writeHead(500, { 'Content-Type': 'application/json' });
         res.end(JSON.stringify({ success: false, error: err.message }));
       }
     });
     return;
   }

  // POST /api/project/delete - Delete a project
  if (pathname === '/api/project/delete' && req.method === 'POST') {
    const id = url.searchParams.get('id');
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Project ID is required' }));
    }
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    if (id === 'demo') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Cannot delete the demo project' }));
    }
    const projectDir = path.join(PROJECTS_DIR, id);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      const projectRecoveryDir = path.join(RECOVERY_DIR, id);
      if (fs.existsSync(projectRecoveryDir)) fs.rmSync(projectRecoveryDir, { recursive: true, force: true });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: 'Project deleted successfully' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Project not found' }));
    }
  }

  // POST /api/project/duplicate - Clone source data and assets under a new immutable ID
  if (pathname === '/api/project/duplicate' && req.method === 'POST') {
    const sourceId = url.searchParams.get('id');
    if (!isSafeProjectId(sourceId)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    return readJsonBody(req, res, payload => {
      try {
        const source = projectStore.loadProjectMerged(sourceId);
        if (!source) return sendJson(res, 404, { success: false, error: 'Project not found' });
        const newId = projectStore.uniqueProjectId(payload.id || `${sourceId}-copy`);
        const duplicate = JSON.parse(JSON.stringify(source));
        duplicate.id = newId;
        duplicate.title = String(payload.title || `${source.title || sourceId} Copy`).trim();
        delete duplicate.archivedAt;
        projectStore.rewriteProjectAssetPaths(duplicate, sourceId, newId);
        projectStore.saveProjectSplit(newId, duplicate, { assetsSourceDir: path.join(PROJECTS_DIR, sourceId, 'assets') });
        sendJson(res, 200, { success: true, id: newId, project: duplicate });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
    });
  }

  // POST /api/project/rename - Change the display title without changing the project ID
  if (pathname === '/api/project/rename' && req.method === 'POST') {
    const id = url.searchParams.get('id');
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    return readJsonBody(req, res, payload => {
      try {
        const title = String(payload.title || '').trim();
        if (!title) return sendJson(res, 400, { success: false, error: 'Story title is required' });
        const project = projectStore.loadProjectMerged(id);
        if (!project) return sendJson(res, 404, { success: false, error: 'Project not found' });
        project.title = title;
        projectStore.saveProjectSplit(id, project);
        sendJson(res, 200, { success: true, id, title });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
    });
  }

  // POST /api/project/archive - Hide or restore a project from the active dashboard
  if (pathname === '/api/project/archive' && req.method === 'POST') {
    const id = url.searchParams.get('id');
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    if (id === 'demo') return sendJson(res, 400, { success: false, error: 'Cannot archive the demo project' });
    return readJsonBody(req, res, payload => {
      try {
        const project = projectStore.loadProjectMerged(id);
        if (!project) return sendJson(res, 404, { success: false, error: 'Project not found' });
        if (payload.archived === false) delete project.archivedAt;
        else project.archivedAt = new Date().toISOString();
        projectStore.saveProjectSplit(id, project);
        sendJson(res, 200, { success: true, id, archived: Boolean(project.archivedAt), archivedAt: project.archivedAt || null });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
    });
  }

  // GET /api/project/recovery - List the last successful project versions
  if (pathname === '/api/project/recovery' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    try {
      return sendJson(res, 200, { success: true, snapshots: projectStore.listRecoverySnapshots(id) });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/project/restore - Validate a snapshot, then commit it like a normal save
  if (pathname === '/api/project/restore' && req.method === 'POST') {
    const id = url.searchParams.get('id');
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    return readJsonBody(req, res, payload => {
      try {
        const snapshotId = String(payload.snapshotId || '');
        if (!/^\d+-[a-z0-9]+$/.test(snapshotId)) return sendJson(res, 400, { success: false, error: 'Invalid snapshot ID' });
        const snapshotDir = path.join(RECOVERY_DIR, id, snapshotId);
        if (!fs.existsSync(snapshotDir)) return sendJson(res, 404, { success: false, error: 'Recovery snapshot not found' });
        const restoredProject = projectStore.validateSplitProjectDirectory(snapshotDir, id);
        const result = projectStore.saveProjectSplit(id, restoredProject, { assetsSourceDir: path.join(snapshotDir, 'assets') });
        sendJson(res, 200, { success: true, project: restoredProject, savedAt: new Date().toISOString(), snapshotId: result.snapshotId });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
    });
  }

  // GET /api/project/export - Source archive; deliberately separate from playable ZIP packaging
  if (pathname === '/api/project/export' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    const projectDir = path.join(PROJECTS_DIR, id);
    if (!fs.existsSync(projectDir)) return sendJson(res, 404, { success: false, error: 'Project not found' });
    try {
      projectStore.validateSplitProjectDirectory(projectDir, id);
      const zip = new AdmZip();
      zip.addFile('manifest.json', Buffer.from(JSON.stringify({ format: 'vnfairy-source', version: 1, projectId: id, exportedAt: new Date().toISOString() }, null, 2)));
      zip.addLocalFolder(projectDir, 'project');
      const buffer = zip.toBuffer();
      res.writeHead(200, {
        'Content-Type': 'application/vnd.vnfairy.project+zip',
        'Content-Disposition': `attachment; filename="${id}.vnfairy"`,
        'Content-Length': buffer.length
      });
      return res.end(buffer);
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/project/import - Import a validated VNFairy source archive
  if (pathname === '/api/project/import' && req.method === 'POST') {
    return readJsonBody(req, res, payload => {
      let importDir = null;
      try {
        if (!payload.data) return sendJson(res, 400, { success: false, error: 'Archive data is required' });
        const zip = new AdmZip(Buffer.from(payload.data, 'base64'));
        const manifestEntry = zip.getEntry('manifest.json');
        if (!manifestEntry) return sendJson(res, 400, { success: false, error: 'Not a VNFairy source project' });
        const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
        if (manifest.format !== 'vnfairy-source' || manifest.version !== 1) {
          return sendJson(res, 400, { success: false, error: 'Unsupported VNFairy source format' });
        }

        const originalId = projectStore.normalizeProjectId(manifest.projectId || 'imported-project');
        const newId = projectStore.uniqueProjectId(payload.id || originalId);
        importDir = path.join(PROJECTS_DIR, `.${newId}.import-${Date.now()}`);
        fs.mkdirSync(importDir, { recursive: true });
        const importRoot = path.resolve(importDir) + path.sep;
        let declaredArchiveBytes = 0;
        for (const entry of zip.getEntries()) {
          const entryName = entry.entryName.replace(/\\/g, '/');
          if (!entryName.startsWith('project/')) continue;
          const relativeName = entryName.slice('project/'.length);
          const parts = relativeName.split('/').filter(Boolean);
          if (!parts.length) continue;
          declaredArchiveBytes += Number(entry.header && entry.header.size || 0);
          if (declaredArchiveBytes > 500 * 1024 * 1024) throw new Error('Source archive expands beyond the 500 MB import limit');
          const destination = path.resolve(importDir, ...parts);
          if (!destination.startsWith(importRoot)) throw new Error('Source archive contains an unsafe path');
          if (entry.isDirectory) fs.mkdirSync(destination, { recursive: true });
          else {
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.writeFileSync(destination, entry.getData());
          }
        }

        const imported = projectStore.validateSplitProjectDirectory(importDir, originalId);
        imported.id = newId;
        if (payload.title) imported.title = String(payload.title).trim() || imported.title;
        projectStore.rewriteProjectAssetPaths(imported, originalId, newId);
        projectStore.saveProjectSplit(newId, imported, { assetsSourceDir: path.join(importDir, 'assets') });
        sendJson(res, 200, { success: true, id: newId, title: imported.title });
      } catch (err) {
        sendJson(res, 400, { success: false, error: err.message });
      } finally {
        if (importDir && fs.existsSync(importDir)) fs.rmSync(importDir, { recursive: true, force: true });
      }
    });
  }

  // GET /api/assets - Scan assets
  if (pathname === '/api/assets' && req.method === 'GET') {
    const project = url.searchParams.get('project') || 'demo';
    if (!isSafeProjectId(project)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    return sendJson(res, 200, assetService.listAssets(project, projectStore.loadProjectMerged(project)));
  }

  // POST /api/upload - Handle file upload via base64 json
  if (pathname === '/api/upload' && req.method === 'POST') {
    return readJsonBody(req, res, payload => {
      try {
        const { filename, type, data, project } = payload;
        if (!filename || !type || !data) return sendJson(res, 400, { success: false, error: 'Missing parameters' });
        if (!assetTypes.includes(type)) return sendJson(res, 400, { success: false, error: 'Invalid asset type' });
        const targetProj = project || 'demo';
        if (!isSafeProjectId(targetProj)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
        const result = assetService.upload({ filename, type, data, project: targetProj });
        return sendJson(res, 200, { success: true, message: 'File uploaded successfully', ...result });
      } catch (err) {
        const status = err.code === 'ASSET_TOO_LARGE' ? 413 : err.code && err.code.startsWith('ASSET_') ? 400 : 500;
        return sendJson(res, status, { success: false, error: err.message, code: err.code });
      }
    }, 360 * 1024 * 1024);
  }

  // POST /api/asset/delete - Delete a specific asset file from project directory
  if (pathname === '/api/asset/delete' && req.method === 'POST') {
    return readJsonBody(req, res, payload => {
      try {
        const { type, filename, project } = payload;
        if (!type || !filename || !project) return sendJson(res, 400, { success: false, error: 'Missing parameters' });
        if (!assetTypes.includes(type) || !isSafeProjectId(project)) return sendJson(res, 400, { success: false, error: 'Invalid project or asset type' });
        if (assetService.remove({ filename, type, project })) return sendJson(res, 200, { success: true, message: 'Asset file deleted successfully' });
        return sendJson(res, 404, { success: false, error: 'File not found on disk' });
      } catch (err) {
        const status = err.code && err.code.startsWith('ASSET_') ? 400 : 500;
        return sendJson(res, status, { success: false, error: err.message, code: err.code });
      }
    });
  }

  // GET /api/package/check - Inspect package size before creating a ZIP
  if (pathname === '/api/package/check' && req.method === 'GET') {
    const id = url.searchParams.get('id') || 'demo';
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    try {
      return sendJson(res, 200, { success: true, ...packageService.inspectPackageAssets(id) });
    } catch (error) {
      return sendJson(res, 500, { success: false, error: error.message });
    }
  }

  // POST /api/package - Zip the visual novel using powershell Compress-Archive
  if (pathname === '/api/package' && req.method === 'POST') {
    const id = url.searchParams.get('id') || 'demo';
    if (!isSafeProjectId(id)) return sendJson(res, 400, { success: false, error: 'Invalid project ID' });
    try {
      const result = packageService.packageProject(id);
      return sendJson(res, 200, { success: true, message: 'Game packaged successfully', downloadUrl: result.downloadUrl });
    } catch (error) {
      return sendJson(res, 500, { success: false, error: 'Failed to package project archive', details: error.message });
    }

  }

  // --- STATIC FILE SERVING ---

  // Handle root route
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Quick sanity check: don't allow directory traversal out of project root
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File Not Found');
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Internal Server Error');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

server.listen(PORT, HOST, () => {
  const displayHost = (HOST === '0.0.0.0' || HOST === '127.0.0.1') ? 'localhost' : HOST;
  console.log(`======================================================`);
  console.log(` VNFairy Server is running at http://${displayHost}:${PORT}`);
  if (HOST === '0.0.0.0') {
    console.log(` Accessible on your local network`);
  }
  console.log(` Press Ctrl+C to stop`);
  console.log(`======================================================`);
});
