/* Filesystem-backed project store extracted from the HTTP server. */
const fs = require('fs');
const path = require('path');
const core = require('./shared');

function createProjectStore({ projectsDir, recoveryDir, assetTypes, maxRecoverySnapshots = 10 }) {
  function isSafeProjectId(id) {
    return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(id);
  }

  function normalizeProjectId(value, fallback = 'project') {
    const normalized = String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return normalized || fallback;
  }

  function uniqueProjectId(preferred) {
    const base = normalizeProjectId(preferred);
    let candidate = base;
    let suffix = 2;
    while (fs.existsSync(path.join(projectsDir, candidate))) candidate = `${base}-${suffix++}`;
    return candidate;
  }

  function assertProjectData(id, projectData) {
    if (!isSafeProjectId(id)) throw new Error('Invalid project ID');
    const migrated = core.migrations.stampProjectForWrite(projectData, {
      engineVersion: core.versioning.DEFAULT_ENGINE_VERSION
    });
    core.validator.assertProject(migrated, { expectedId: id });
    return migrated;
  }

  function writeSplitProjectDirectory(targetDir, id, projectData, assetsSourceDir = null) {
    const normalized = assertProjectData(id, projectData);
    const scenesDir = path.join(targetDir, 'scenes');
    fs.mkdirSync(scenesDir, { recursive: true });

    const metadata = { ...normalized, id, scenes: {} };
    for (const [sceneId, originalScene] of Object.entries(normalized.scenes)) {
      const scene = { ...originalScene, id: sceneId };
      fs.writeFileSync(path.join(scenesDir, `${sceneId}.json`), JSON.stringify(scene, null, 2), 'utf8');
      metadata.scenes[sceneId] = { id: sceneId, title: scene.title, name: scene.name };
    }
    fs.writeFileSync(path.join(targetDir, 'project.json'), JSON.stringify(metadata, null, 2), 'utf8');

    const targetAssetsDir = path.join(targetDir, 'assets');
    if (assetsSourceDir && fs.existsSync(assetsSourceDir)) fs.cpSync(assetsSourceDir, targetAssetsDir, { recursive: true });
    else fs.mkdirSync(targetAssetsDir, { recursive: true });
    assetTypes.forEach(type => fs.mkdirSync(path.join(targetAssetsDir, type), { recursive: true }));
    return normalized;
  }

  function validateSplitProjectDirectory(projectDir, expectedId) {
    const metadataPath = path.join(projectDir, 'project.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (metadata.id !== expectedId) throw new Error('Staged project ID did not validate');

    const merged = { ...metadata, scenes: {} };
    for (const sceneId of Object.keys(metadata.scenes || {})) {
      const scenePath = path.join(projectDir, 'scenes', `${sceneId}.json`);
      const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
      merged.scenes[sceneId] = scene;
    }
    const migrated = core.migrations.migrateProject(merged, { engineVersion: core.versioning.DEFAULT_ENGINE_VERSION });
    core.validator.assertProject(migrated, { expectedId: expectedId });
    return migrated;
  }

  function pruneRecoverySnapshots(id) {
    const projectRecoveryDir = path.join(recoveryDir, id);
    if (!fs.existsSync(projectRecoveryDir)) return;
    const snapshots = fs.readdirSync(projectRecoveryDir)
      .filter(name => fs.statSync(path.join(projectRecoveryDir, name)).isDirectory())
      .sort((a, b) => b.localeCompare(a));
    snapshots.slice(maxRecoverySnapshots).forEach(name => fs.rmSync(path.join(projectRecoveryDir, name), { recursive: true, force: true }));
  }

  function renameWithRetrySync(source, destination, attempts = 6) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        fs.renameSync(source, destination);
        return;
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === attempts - 1) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
      }
    }
  }

  function preserveRecoverySnapshot(id, projectDir) {
    try {
      validateSplitProjectDirectory(projectDir, id);
    } catch (error) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      return null;
    }
    const projectRecoveryDir = path.join(recoveryDir, id);
    fs.mkdirSync(projectRecoveryDir, { recursive: true });
    const snapshotId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    renameWithRetrySync(projectDir, path.join(projectRecoveryDir, snapshotId));
    pruneRecoverySnapshots(id);
    return snapshotId;
  }

  function saveProjectSplit(id, projectData, options = {}) {
    const normalized = assertProjectData(id, projectData);
    const liveDir = path.join(projectsDir, id);
    const transactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const stageDir = path.join(projectsDir, `.${id}.save-${transactionId}`);
    const displacedDir = path.join(projectsDir, `.${id}.previous-${transactionId}`);
    const liveAssetsDir = options.assetsSourceDir || path.join(liveDir, 'assets');
    let displaced = false;

    try {
      writeSplitProjectDirectory(stageDir, id, normalized, liveAssetsDir);
      validateSplitProjectDirectory(stageDir, id);
      if (fs.existsSync(liveDir)) {
        renameWithRetrySync(liveDir, displacedDir);
        displaced = true;
      }
      try {
        renameWithRetrySync(stageDir, liveDir);
      } catch (error) {
        if (displaced && !fs.existsSync(liveDir)) renameWithRetrySync(displacedDir, liveDir);
        throw error;
      }

      let snapshotId = null;
      if (displaced) {
        try { snapshotId = preserveRecoverySnapshot(id, displacedDir); }
        catch (snapshotError) {
          console.error(`Saved '${id}', but could not retain its recovery snapshot:`, snapshotError);
          if (fs.existsSync(displacedDir)) fs.rmSync(displacedDir, { recursive: true, force: true });
        }
      }
      return { snapshotId, project: normalized };
    } finally {
      if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
    }
  }

  function loadProjectMergedHelper(id, data) {
    const scenesDir = path.join(projectsDir, id, 'scenes');
    data.scenes = data.scenes || {};
    if (fs.existsSync(scenesDir)) {
      for (const file of fs.readdirSync(scenesDir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const scene = JSON.parse(fs.readFileSync(path.join(scenesDir, file), 'utf8'));
          data.scenes[scene.id] = scene;
        } catch (error) {
          console.error(`Failed to load scene file ${file} for project ${id}:`, error);
        }
      }
    }
    return core.migrations.migrateProject(data, { engineVersion: core.versioning.DEFAULT_ENGINE_VERSION });
  }

  function loadProjectMerged(id) {
    const targetPath = path.join(projectsDir, id, 'project.json');
    if (!fs.existsSync(targetPath)) return null;
    const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    const legacyInlineScenes = Object.values(data.scenes || {}).some(scene => scene && (Array.isArray(scene.dialogue) || scene.choices || scene.background));
    if (legacyInlineScenes) {
      console.log(`Auto-migrating legacy project '${id}' into split scenes...`);
      saveProjectSplit(id, data);
      return loadProjectMergedHelper(id, JSON.parse(fs.readFileSync(targetPath, 'utf8')));
    }
    return loadProjectMergedHelper(id, data);
  }

  function rewriteProjectAssetPaths(value, oldId, newId) {
    const oldPrefix = `data/projects/${oldId}/assets/`;
    const newPrefix = `data/projects/${newId}/assets/`;
    if (typeof value === 'string') return value.startsWith(oldPrefix) ? newPrefix + value.slice(oldPrefix.length) : value;
    if (Array.isArray(value)) return value.map(item => rewriteProjectAssetPaths(item, oldId, newId));
    if (value && typeof value === 'object') Object.keys(value).forEach(key => { value[key] = rewriteProjectAssetPaths(value[key], oldId, newId); });
    return value;
  }

  function listRecoverySnapshots(id) {
    const projectRecoveryDir = path.join(recoveryDir, id);
    if (!fs.existsSync(projectRecoveryDir)) return [];
    return fs.readdirSync(projectRecoveryDir)
      .filter(snapshotId => fs.statSync(path.join(projectRecoveryDir, snapshotId)).isDirectory())
      .sort((a, b) => b.localeCompare(a))
      .map(snapshotId => {
        try {
          const data = validateSplitProjectDirectory(path.join(projectRecoveryDir, snapshotId), id);
          return {
            id: snapshotId,
            savedAt: new Date(Number(snapshotId.split('-')[0])).toISOString(),
            title: data.title || id,
            sceneCount: Object.keys(data.scenes || {}).length
          };
        } catch (error) {
          console.warn(`Skipping invalid recovery snapshot '${id}/${snapshotId}': ${error.message}`);
          return null;
        }
      })
      .filter(Boolean);
  }

  return {
    isSafeProjectId,
    normalizeProjectId,
    uniqueProjectId,
    assertProjectData,
    writeSplitProjectDirectory,
    validateSplitProjectDirectory,
    saveProjectSplit,
    loadProjectMerged,
    rewriteProjectAssetPaths,
    listRecoverySnapshots
  };
}

module.exports = { createProjectStore };
