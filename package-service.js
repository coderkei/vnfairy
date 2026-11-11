/* Playable ZIP packaging service. Source archives remain a separate workflow. */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const core = require('./shared');

const PACKAGE_WARNING_BYTES = core.assetRegistry.PACKAGE_WARNING_BYTES;
const PACKAGE_WARNING_TOTAL_BYTES = core.assetRegistry.PACKAGE_WARNING_TOTAL_BYTES;

function createPackageService({ publicDir, projectsDir, loadProjectMerged }) {
  const runtimeFiles = [
    ['shared/versioning.js', 'shared/versioning.js'],
    ['shared/project-schema.js', 'shared/project-schema.js'],
    ['shared/logic-model.js', 'shared/logic-model.js'],
    ['shared/migrations.js', 'shared/migrations.js'],
    ['shared/scene-model.js', 'shared/scene-model.js'],
    ['shared/validator.js', 'shared/validator.js'],
    ['shared/save-game-serializer.js', 'shared/save-game-serializer.js'],
    ['shared/asset-registry.js', 'shared/asset-registry.js'],
    ['js/ui/dom-views.js', 'js/ui/dom-views.js'],
    ['js/ui/modal-controls.js', 'js/ui/modal-controls.js'],
    ['js/player/player-views.js', 'js/player/player-views.js'],
    ['js/project-workspace.js', 'js/project-workspace.js'],
    ['js/engine.js', 'js/engine.js']
  ];

  function copyRuntimeFile(tempDir, sourceRelative, destinationRelative) {
    const source = path.join(publicDir, sourceRelative);
    const destination = path.join(tempDir, destinationRelative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  function inspectPackageAssets(id) {
    const assetsRoot = path.resolve(projectsDir, id, 'assets');
    const warnings = [];
    const files = [];
    let totalBytes = 0;
    if (fs.existsSync(assetsRoot)) {
      core.assetRegistry.ASSET_TYPES.forEach(type => {
        const typeDir = path.resolve(assetsRoot, type);
        if (!typeDir.startsWith(`${assetsRoot}${path.sep}`) || !fs.existsSync(typeDir)) return;
        fs.readdirSync(typeDir, { withFileTypes: true }).filter(entry => entry.isFile()).forEach(entry => {
          const filePath = path.resolve(typeDir, entry.name);
          if (!filePath.startsWith(`${typeDir}${path.sep}`)) return;
          const stat = fs.statSync(filePath);
          const item = { type, filename: entry.name, size: stat.size };
          files.push(item);
          totalBytes += stat.size;
          if (stat.size > PACKAGE_WARNING_BYTES) warnings.push({ ...item, reason: 'single-asset-size' });
        });
      });
    }
    if (totalBytes > PACKAGE_WARNING_TOTAL_BYTES) warnings.push({ size: totalBytes, reason: 'total-asset-size' });
    return {
      totalBytes,
      assetCount: files.length,
      warningThresholdBytes: PACKAGE_WARNING_BYTES,
      totalWarningThresholdBytes: PACKAGE_WARNING_TOTAL_BYTES,
      warnings,
      files
    };
  }

  function packageProject(id) {
    const projectPath = path.join(projectsDir, id, 'project.json');
    if (!fs.existsSync(projectPath)) throw new Error('Project file not found to package');
    const tempDir = path.join(publicDir, `temp_pkg_${id}_${Date.now()}`);
    const zipPath = path.join(publicDir, `${id}_game.zip`);
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'css'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
      fs.copyFileSync(path.join(publicDir, 'index.html'), path.join(tempDir, 'index.html'));
      fs.copyFileSync(path.join(publicDir, 'css', 'common.css'), path.join(tempDir, 'css', 'common.css'));
      fs.copyFileSync(path.join(publicDir, 'css', 'engine.css'), path.join(tempDir, 'css', 'engine.css'));
      runtimeFiles.forEach(([source, destination]) => copyRuntimeFile(tempDir, source, destination));
      if (fs.existsSync(path.join(publicDir, 'OFL.txt'))) fs.copyFileSync(path.join(publicDir, 'OFL.txt'), path.join(tempDir, 'OFL.txt'));

      const mergedProject = loadProjectMerged(id);
      if (!mergedProject) throw new Error('Failed to load project data for packaging');
      const splitMetadata = { ...mergedProject, id, scenes: {} };
      for (const [sceneId, scene] of Object.entries(mergedProject.scenes || {})) splitMetadata.scenes[sceneId] = { id: scene.id, title: scene.title, name: scene.name };
      const splitMetadataStr = JSON.stringify(splitMetadata, null, 2);
      const tempDataDir = path.join(tempDir, 'data');
      const tempProjDir = path.join(tempDataDir, 'projects', id);
      fs.mkdirSync(path.join(tempProjDir, 'scenes'), { recursive: true });
      fs.writeFileSync(path.join(tempDataDir, 'project.json'), splitMetadataStr, 'utf8');
      fs.writeFileSync(path.join(tempProjDir, 'project.json'), splitMetadataStr, 'utf8');
      for (const [sceneId, scene] of Object.entries(mergedProject.scenes || {})) {
        fs.writeFileSync(path.join(tempProjDir, 'scenes', `${sceneId}.json`), JSON.stringify(scene, null, 2), 'utf8');
        fs.writeFileSync(path.join(tempProjDir, 'scenes', `${sceneId}.js`), `window.vnFairyScenes = window.vnFairyScenes || {};\nwindow.vnFairyScenes[${JSON.stringify(sceneId)}] = ${JSON.stringify(scene, null, 2)};`, 'utf8');
      }
      fs.writeFileSync(path.join(tempDataDir, 'project.js'), `window.vnFairyProject = ${splitMetadataStr};`, 'utf8');
      const sourceAssetsDir = path.join(projectsDir, id, 'assets');
      if (fs.existsSync(sourceAssetsDir)) fs.cpSync(sourceAssetsDir, path.join(tempProjDir, 'assets'), { recursive: true });

      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      const zip = new AdmZip();
      zip.addLocalFile(path.join(tempDir, 'index.html'));
      zip.addLocalFolder(path.join(tempDir, 'css'), 'css');
      zip.addLocalFolder(path.join(tempDir, 'shared'), 'shared');
      zip.addLocalFolder(path.join(tempDir, 'js'), 'js');
      zip.addLocalFolder(path.join(tempDir, 'data'), 'data');
      if (fs.existsSync(path.join(tempDir, 'OFL.txt'))) zip.addLocalFile(path.join(tempDir, 'OFL.txt'));
      zip.writeZip(zipPath);
      return { downloadUrl: `/${id}_game.zip`, zipPath };
    } finally {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return { packageProject, inspectPackageAssets };
}

module.exports = { createPackageService };
