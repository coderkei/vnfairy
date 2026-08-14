/*
 * Explicit, one-way migrations for persisted project and save artifacts.
 * Migrations are pure: callers decide when a migrated artifact is written.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports && typeof window === 'undefined';
  const deps = isNode
    ? { schema: require('./project-schema'), versioning: require('./versioning'), logic: require('./logic-model') }
    : { schema: window.VNFairyCore.projectSchema, versioning: window.VNFairyCore.versioning, logic: window.VNFairyCore.logicModel };
  const api = factory(deps.schema, deps.versioning, deps.logic);
  if (typeof window !== 'undefined') window.VNFairyCore.migrations = api;
  else if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (schema, versioning, logic) {
  const CURRENT_SAVE_SCHEMA_VERSION = 1;
  const SAVE_ARTIFACT_TYPE = 'vnfairy-save';

  function clone(value) {
    return versioning.cloneJson(value);
  }

  function schemaNumber(value) {
    if (value === undefined || value === null || value === '') return 0;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  function legacyCreatedWithVersion(value, fallback = 'legacy') {
    return versioning.normalizeVersion(value, fallback);
  }

  function stableLineHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function legacyDialogueLineId(sceneId, index, step) {
    const speaker = step && step.speaker ? step.speaker : 'narrator';
    const text = step && step.text ? String(step.text) : '';
    const signature = `${sceneId}|${index}|${speaker}|${text}`;
    const safeSceneId = String(sceneId).replace(/[^A-Za-z0-9_-]/g, '_');
    return `line_${safeSceneId}_${index + 1}_${stableLineHash(signature)}`;
  }

  function ensureDialogueLineIds(project) {
    const usedIds = new Set();
    Object.entries(project && project.scenes ? project.scenes : {}).forEach(([sceneId, scene]) => {
      if (!scene || !Array.isArray(scene.dialogue)) return;
      scene.dialogue.forEach((step, index) => {
        if (!step || typeof step !== 'object') return;
        let lineId = typeof step.id === 'string' && step.id.trim() ? step.id.trim() : '';
        if (!lineId || usedIds.has(lineId)) {
          lineId = legacyDialogueLineId(sceneId, index, step);
          let suffix = 2;
          while (usedIds.has(lineId)) lineId = `${legacyDialogueLineId(sceneId, index, step)}_${suffix++}`;
          step.id = lineId;
        }
        usedIds.add(lineId);
      });
    });
    return project;
  }

  function normalizeAssetLibrary(project) {
    project.assets = project.assets && typeof project.assets === 'object' ? project.assets : {};
    ['backgrounds', 'characters', 'music', 'sound', 'video'].forEach(key => {
      project.assets[key] = Array.isArray(project.assets[key]) ? project.assets[key] : [];
    });
    const library = project.assets.library && typeof project.assets.library === 'object' ? project.assets.library : {};
    library.folders = Array.isArray(library.folders) ? library.folders.filter(folder => folder && folder.id && folder.name) : [];
    library.items = library.items && typeof library.items === 'object' ? library.items : {};
    Object.values(library.items).forEach(item => {
      if (!item || typeof item !== 'object') return;
      item.tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).map(tag => String(tag).trim()).filter(Boolean) : [];
      item.favorite = !!item.favorite;
      item.folderId = item.folderId || '';
    });
    project.assets.library = library;

    project.assets.characters.forEach(character => {
      if (!character || typeof character !== 'object') return;
      character.sprites = Array.isArray(character.sprites) ? character.sprites : [];
      const spriteIds = new Set(character.sprites.map(sprite => sprite && sprite.id).filter(Boolean));
      if (!character.defaultExpression || !spriteIds.has(character.defaultExpression)) {
        character.defaultExpression = character.sprites[0] ? character.sprites[0].id : '';
      }
    });

    project.presets = project.presets && typeof project.presets === 'object' ? project.presets : {};
    const legacyPoseSets = Array.isArray(project.presets.characterPlacements) ? project.presets.characterPlacements : [];
    project.presets.poseSets = Array.isArray(project.presets.poseSets) ? project.presets.poseSets : legacyPoseSets;
    project.presets.characterPlacements = project.presets.poseSets;
  }

  function migrateProject(input, options = {}) {
    const project = clone(input || {});
    const currentEngineVersion = options.engineVersion || versioning.DEFAULT_ENGINE_VERSION;
    const fromVersion = schemaNumber(project.schemaVersion);

    if (fromVersion > schema.CURRENT_PROJECT_SCHEMA_VERSION) {
      const error = new Error(`Project schema ${fromVersion} is newer than supported schema ${schema.CURRENT_PROJECT_SCHEMA_VERSION}`);
      error.code = 'FUTURE_PROJECT_SCHEMA';
      throw error;
    }

    // v0 represents all projects written before explicit schema metadata.
    if (fromVersion < 1) {
      const originalVersion = project.createdWithVersion || project.vnFairyVersion || 'legacy';
      project.schemaVersion = schema.CURRENT_PROJECT_SCHEMA_VERSION;
      project.createdWithVersion = legacyCreatedWithVersion(originalVersion);
      project.engineVersion = versioning.normalizeVersion(project.engineVersion || project.vnFairyVersion, currentEngineVersion);
    }

    project.artifactType = project.artifactType || schema.PROJECT_ARTIFACT_TYPE;
    project.schemaVersion = schema.CURRENT_PROJECT_SCHEMA_VERSION;
    project.engineVersion = versioning.normalizeVersion(project.engineVersion, currentEngineVersion);
    project.createdWithVersion = legacyCreatedWithVersion(project.createdWithVersion, project.vnFairyVersion || 'legacy');
    project.config = project.config && typeof project.config === 'object' ? project.config : {};
    project.config.variables = logic.normalizeVariableDefinitions(project.config);
    normalizeAssetLibrary(project);
    // Keep the old field during the compatibility window for older packaged players.
    project.vnFairyVersion = versioning.normalizeVersion(project.vnFairyVersion, project.engineVersion);
    ensureDialogueLineIds(project);
    return project;
  }

  function stampProjectForWrite(input, options = {}) {
    const project = migrateProject(input, options);
    project.engineVersion = options.engineVersion || versioning.DEFAULT_ENGINE_VERSION;
    project.vnFairyVersion = project.engineVersion;
    return project;
  }

  function migrateSaveGame(input, options = {}) {
    const source = clone(input || {});
    const fromVersion = schemaNumber(source.schemaVersion);
    const currentEngineVersion = options.engineVersion || versioning.DEFAULT_ENGINE_VERSION;

    if (fromVersion > CURRENT_SAVE_SCHEMA_VERSION) {
      const error = new Error(`Save schema ${fromVersion} is newer than supported schema ${CURRENT_SAVE_SCHEMA_VERSION}`);
      error.code = 'FUTURE_SAVE_SCHEMA';
      throw error;
    }

    const isArtifact = source.artifactType === SAVE_ARTIFACT_TYPE && source.state && typeof source.state === 'object';
    const state = clone(isArtifact ? source.state : source);
    const timestamp = Number(source.timestamp || state.timestamp) || Date.now();
    const preview = source.preview || state.preview || {};
    const createdWithVersion = legacyCreatedWithVersion(source.createdWithVersion, 'legacy');

    return {
      artifactType: SAVE_ARTIFACT_TYPE,
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      engineVersion: versioning.normalizeVersion(source.engineVersion, currentEngineVersion),
      createdWithVersion,
      projectId: source.projectId || options.projectId || 'unknown-project',
      projectSchemaVersion: schemaNumber(source.projectSchemaVersion || options.projectSchemaVersion || 0),
      savedAt: source.savedAt || new Date(timestamp).toISOString(),
      timestamp,
      preview,
      state
    };
  }

  function stampSaveForWrite(input, options = {}) {
    const save = migrateSaveGame(input, options);
    save.engineVersion = options.engineVersion || versioning.DEFAULT_ENGINE_VERSION;
    save.createdWithVersion = versioning.normalizeVersion(
      input && input.artifactType === SAVE_ARTIFACT_TYPE && input.createdWithVersion,
      save.engineVersion
    );
    save.projectId = options.projectId || save.projectId;
    save.projectSchemaVersion = schemaNumber(options.projectSchemaVersion || save.projectSchemaVersion || 0);
    save.savedAt = new Date().toISOString();
    save.timestamp = Date.now();
    save.state.timestamp = save.timestamp;
    save.preview = save.state.preview || save.preview || {};
    return save;
  }

  return {
    CURRENT_SAVE_SCHEMA_VERSION,
    SAVE_ARTIFACT_TYPE,
    migrateProject,
    ensureDialogueLineIds,
    stampProjectForWrite,
    migrateSaveGame,
    stampSaveForWrite
  };
});
