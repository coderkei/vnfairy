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

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

// Ensure data folders exist
const assetTypes = ['bg', 'char', 'music', 'sound', 'video'];
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

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
  saveProjectSplit('demo', defaultProject);
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

// Helper to save a project by splitting its scenes into separate files
function saveProjectSplit(id, projectData) {
  const targetPath = path.join(PROJECTS_DIR, id, 'project.json');
  const scenesDir = path.join(PROJECTS_DIR, id, 'scenes');
  
  // Extract and isolate scenes
  const scenes = projectData.scenes || {};
  
  // Create project directory and scenes directory
  fs.mkdirSync(scenesDir, { recursive: true });
  
  const savedSceneFiles = new Set();
  const metadata = { ...projectData };
  metadata.id = id;
  metadata.scenes = {};
  
  for (const [sceneId, scene] of Object.entries(scenes)) {
    const sceneFileName = `${sceneId}.json`;
    const scenePath = path.join(scenesDir, sceneFileName);
    
    // Save scene details to individual file
    fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2), 'utf8');
    savedSceneFiles.add(sceneFileName);
    
    // Maintain key mapping in metadata
    metadata.scenes[sceneId] = {
      id: scene.id,
      title: scene.title
    };
  }
  
  // Remove deleted scene files
  if (fs.existsSync(scenesDir)) {
    const files = fs.readdirSync(scenesDir);
    for (const file of files) {
      if (file.endsWith('.json') && !savedSceneFiles.has(file)) {
        try {
          fs.unlinkSync(path.join(scenesDir, file));
        } catch (err) {
          console.error(`Failed to delete scene file ${file}:`, err);
        }
      }
    }
  }
  
  // Save metadata
  fs.writeFileSync(targetPath, JSON.stringify(metadata, null, 2), 'utf8');
}

// Helper to load a project and merge split scene files
function loadProjectMerged(id) {
  const targetPath = path.join(PROJECTS_DIR, id, 'project.json');
  if (!fs.existsSync(targetPath)) return null;
  
  const dataStr = fs.readFileSync(targetPath, 'utf8');
  const data = JSON.parse(dataStr);
  
  // Detect if the metadata contains full scenes directly (legacy project migration)
  let isLegacy = false;
  if (data.scenes && typeof data.scenes === 'object') {
    for (const scene of Object.values(data.scenes)) {
      if (scene && (Array.isArray(scene.dialogue) || scene.choices || scene.background)) {
        isLegacy = true;
        break;
      }
    }
  }
  
  if (isLegacy) {
    console.log(`Auto-migrating legacy project '${id}' into split scenes...`);
    saveProjectSplit(id, data);
    // Reload metadata after split save
    const updatedStr = fs.readFileSync(targetPath, 'utf8');
    const updatedData = JSON.parse(updatedStr);
    return loadProjectMergedHelper(id, updatedData);
  }
  
  return loadProjectMergedHelper(id, data);
}

// Inner helper to perform the scene merging
function loadProjectMergedHelper(id, data) {
  const scenesDir = path.join(PROJECTS_DIR, id, 'scenes');
  data.scenes = data.scenes || {};
  
  if (fs.existsSync(scenesDir)) {
    const files = fs.readdirSync(scenesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const sceneDataStr = fs.readFileSync(path.join(scenesDir, file), 'utf8');
          const sceneData = JSON.parse(sceneDataStr);
          data.scenes[sceneData.id] = sceneData;
        } catch (err) {
          console.error(`Failed to load scene file ${file} for project ${id}:`, err);
        }
      }
    }
  }
  
  return data;
}

// Helper to scan a directory recursively
function scanDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).filter(file => {
    const stat = fs.statSync(path.join(dirPath, file));
    return !stat.isDirectory();
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
          projectsList.push({
            id: dir,
            title: data.title || dir,
            author: data.author || "Unknown"
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
    const targetPath = path.join(PROJECTS_DIR, id, 'project.json');
    if (!fs.existsSync(targetPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Project not found' }));
    }
    try {
      const data = loadProjectMerged(id);
      if (!data) throw new Error('Failed to load project data');
      const modified = migrateProjectAssetPaths(id, data);
      if (modified) {
        saveProjectSplit(id, data);
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
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const projectData = JSON.parse(body);
        saveProjectSplit(id, projectData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Project saved successfully' }));
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
        const projectDir = path.join(PROJECTS_DIR, id);
        const targetPath = path.join(projectDir, 'project.json');
        
        if (fs.existsSync(projectDir)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Project directory already exists' }));
        }
        
        fs.mkdirSync(projectDir, { recursive: true });
        const projectAssetsDir = path.join(projectDir, 'assets');
        fs.mkdirSync(projectAssetsDir, { recursive: true });
        assetTypes.forEach(type => {
          fs.mkdirSync(path.join(projectAssetsDir, type), { recursive: true });
        });
        
        const newProject = {
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
         
         fs.writeFileSync(targetPath, JSON.stringify(newProject, null, 2), 'utf8');
         res.writeHead(200, { 'Content-Type': 'application/json' });
         res.end(JSON.stringify({ success: true, id: id, project: newProject }));
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
    if (id === 'demo') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Cannot delete the demo project' }));
    }
    const projectDir = path.join(PROJECTS_DIR, id);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: 'Project deleted successfully' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Project not found' }));
    }
  }

  // GET /api/assets - Scan assets
  if (pathname === '/api/assets' && req.method === 'GET') {
    const project = url.searchParams.get('project') || 'demo';
    const projectAssetsDir = path.join(PROJECTS_DIR, project, 'assets');
    
    // Ensure directories exist
    if (!fs.existsSync(projectAssetsDir)) fs.mkdirSync(projectAssetsDir, { recursive: true });
    
    const assets = {};
    assetTypes.forEach(type => {
      const typePath = path.join(projectAssetsDir, type);
      if (!fs.existsSync(typePath)) fs.mkdirSync(typePath, { recursive: true });
      assets[type] = scanDir(typePath);
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(assets));
  }

  // POST /api/upload - Handle file upload via base64 json
  if (pathname === '/api/upload' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { filename, type, data, project } = payload; // data is base64 string
        
        if (!filename || !type || !data) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Missing parameters' }));
        }

        if (!assetTypes.includes(type)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Invalid asset type' }));
        }

        // Strip data prefix if present (e.g., "data:image/png;base64,")
        const base64Data = data.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        const targetProj = project || 'demo';
        const projectDir = path.join(PROJECTS_DIR, targetProj);
        const projectAssetsDir = path.join(projectDir, 'assets');
        const targetDir = path.join(projectAssetsDir, type);
        
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
        if (!fs.existsSync(projectAssetsDir)) fs.mkdirSync(projectAssetsDir, { recursive: true });
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        
        const returnPath = `data/projects/${targetProj}/assets/${type}/${filename}`;
        
        const targetPath = path.join(targetDir, filename);
        fs.writeFileSync(targetPath, buffer);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'File uploaded successfully', 
          path: returnPath 
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/asset/delete - Delete a specific asset file from project directory
  if (pathname === '/api/asset/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { type, filename, project } = payload;
        
        if (!type || !filename || !project) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Missing parameters' }));
        }

        if (!assetTypes.includes(type)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Invalid asset type' }));
        }

        const projectDir = path.join(PROJECTS_DIR, project);
        const targetPath = path.join(projectDir, 'assets', type, filename);

        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Asset file deleted successfully' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'File not found on disk' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/package - Zip the visual novel using powershell Compress-Archive
  if (pathname === '/api/package' && req.method === 'POST') {
    const id = url.searchParams.get('id') || 'demo';
    const projectPath = path.join(PROJECTS_DIR, id, 'project.json');
    
    if (!fs.existsSync(projectPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Project file not found to package' }));
    }
    
    const tempDir = path.join(PUBLIC_DIR, `temp_pkg_${id}_${Date.now()}`);
    const zipPath = path.join(PUBLIC_DIR, `${id}_game.zip`);

    try {
      // Create staged structure
      fs.mkdirSync(tempDir, { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'css'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'js'), { recursive: true });
      
      const tempDataDir = path.join(tempDir, 'data');
      fs.mkdirSync(tempDataDir, { recursive: true });
      
      const tempProjDir = path.join(tempDataDir, 'projects', id);
      fs.mkdirSync(tempProjDir, { recursive: true });

      // Copy required files
      fs.copyFileSync(path.join(PUBLIC_DIR, 'index.html'), path.join(tempDir, 'index.html'));
      
      // Copy only required CSS files
      fs.copyFileSync(path.join(PUBLIC_DIR, 'css', 'common.css'), path.join(tempDir, 'css', 'common.css'));
      fs.copyFileSync(path.join(PUBLIC_DIR, 'css', 'engine.css'), path.join(tempDir, 'css', 'engine.css'));
      
      // Copy only required JS file
      fs.copyFileSync(path.join(PUBLIC_DIR, 'js', 'engine.js'), path.join(tempDir, 'js', 'engine.js'));

      // Copy OFL license file
      if (fs.existsSync(path.join(PUBLIC_DIR, 'OFL.txt'))) {
        fs.copyFileSync(path.join(PUBLIC_DIR, 'OFL.txt'), path.join(tempDir, 'OFL.txt'));
      }

      // Load and compile the merged project data
      const mergedProject = loadProjectMerged(id);
      if (!mergedProject) throw new Error('Failed to load project data for packaging');

      // Create split metadata
      const splitMetadata = { ...mergedProject };
      splitMetadata.id = id;
      splitMetadata.scenes = {};
      for (const [sceneId, scene] of Object.entries(mergedProject.scenes || {})) {
        splitMetadata.scenes[sceneId] = { id: scene.id, title: scene.title };
      }
      const splitMetadataStr = JSON.stringify(splitMetadata, null, 2);

      // Write split project.json at data/project.json
      fs.writeFileSync(path.join(tempDataDir, 'project.json'), splitMetadataStr, 'utf8');

      // Write split project.json at data/projects/{id}/project.json
      fs.writeFileSync(path.join(tempProjDir, 'project.json'), splitMetadataStr, 'utf8');

      // Copy all split scene files to data/projects/{id}/scenes/
      const tempProjScenesDir = path.join(tempProjDir, 'scenes');
      fs.mkdirSync(tempProjScenesDir, { recursive: true });
      for (const [sceneId, scene] of Object.entries(mergedProject.scenes || {})) {
        // Write the .json file
        fs.writeFileSync(path.join(tempProjScenesDir, `${sceneId}.json`), JSON.stringify(scene, null, 2), 'utf8');
        // Write the .js file to act as wrapper/CORS bypass for offline local plays
        const sceneJsContent = `window.vnFairyScenes = window.vnFairyScenes || {};\nwindow.vnFairyScenes['${sceneId}'] = ${JSON.stringify(scene, null, 2)};`;
        fs.writeFileSync(path.join(tempProjScenesDir, `${sceneId}.js`), sceneJsContent, 'utf8');
      }

      // Generate project.js using the split metadata
      const projectJsContent = `window.vnFairyProject = ${splitMetadataStr};`;
      fs.writeFileSync(path.join(tempDataDir, 'project.js'), projectJsContent, 'utf8');

      // Copy project assets folder recursively if it exists
      const srcAssetsDir = path.join(PROJECTS_DIR, id, 'assets');
      if (fs.existsSync(srcAssetsDir)) {
        fs.cpSync(srcAssetsDir, path.join(tempProjDir, 'assets'), { recursive: true });
      }
    } catch (e) {
      // Cleanup on failure
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (rmErr) {}
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Failed to stage project files for packaging', details: e.message }));
    }

    // Clean old zip if exists
    if (fs.existsSync(zipPath)) {
      try { fs.unlinkSync(zipPath); } catch(e) {}
    }

    try {
      const zip = new AdmZip();
      
      // Add staged files and directories
      zip.addLocalFile(path.join(tempDir, 'index.html'));
      zip.addLocalFolder(path.join(tempDir, 'css'), 'css');
      zip.addLocalFolder(path.join(tempDir, 'js'), 'js');
      zip.addLocalFolder(path.join(tempDir, 'data'), 'data');
      if (fs.existsSync(path.join(tempDir, 'OFL.txt'))) {
        zip.addLocalFile(path.join(tempDir, 'OFL.txt'));
      }
      
      // Write zip file
      zip.writeZip(zipPath);
      
      // Cleanup temp project files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Game packaged successfully', downloadUrl: `/${id}_game.zip` }));
    } catch (err) {
      // Cleanup temp project files on error
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Failed to package project archive', details: err.message }));
    }
    return;
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
