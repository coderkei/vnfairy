/* Structural and semantic validation for projects and save artifacts. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports && typeof window === 'undefined';
  const deps = isNode
    ? { schema: require('./project-schema'), migrations: require('./migrations'), sceneModel: require('./scene-model') }
    : { schema: window.VNFairyCore.projectSchema, migrations: window.VNFairyCore.migrations, sceneModel: window.VNFairyCore.sceneModel };
  const api = factory(deps.schema, deps.migrations, deps.sceneModel);
  if (typeof window !== 'undefined') window.VNFairyCore.validator = api;
  else if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (schema, migrations, sceneModel) {
  function validateProject(project, options = {}) {
    const errors = [];
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      return { valid: false, errors: ['Project data must be an object'] };
    }
    if (options.expectedId && project.id !== options.expectedId) errors.push(`Project ID must be '${options.expectedId}'`);
    if (!project.scenes || typeof project.scenes !== 'object' || Array.isArray(project.scenes)) {
      errors.push('Project scenes must be an object');
      return { valid: false, errors };
    }
    if (project.schemaVersion !== undefined && (!Number.isInteger(Number(project.schemaVersion)) || Number(project.schemaVersion) < 0)) {
      errors.push('Project schemaVersion must be a non-negative integer');
    }

    const sceneIds = new Set(Object.keys(project.scenes));
    for (const [sceneId, scene] of Object.entries(project.scenes)) {
      if (!/^[A-Za-z0-9_-]+$/.test(sceneId)) errors.push(`Invalid scene ID: ${sceneId}`);
      if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
        errors.push(`Scene '${sceneId}' must be an object`);
        continue;
      }
      if (scene.id && scene.id !== sceneId) errors.push(`Scene ID mismatch for '${sceneId}'`);
      if (scene.dialogue !== undefined && !Array.isArray(scene.dialogue)) errors.push(`Dialogue for '${sceneId}' must be an array`);
      if (scene.choices !== undefined && !Array.isArray(scene.choices)) errors.push(`Choices for '${sceneId}' must be an array`);
      for (const target of sceneModel.sceneTargets(scene)) {
        if (!sceneIds.has(target)) errors.push(`Scene '${sceneId}' targets missing scene '${target}'`);
      }
    }
    if (project.startSceneId && !sceneIds.has(project.startSceneId)) errors.push(`Start scene '${project.startSceneId}' does not exist`);
    return { valid: errors.length === 0, errors };
  }

  function assertProject(project, options = {}) {
    const result = validateProject(project, options);
    if (!result.valid) {
      const error = new Error(result.errors.join('; '));
      error.code = 'INVALID_PROJECT';
      error.errors = result.errors;
      throw error;
    }
    return project;
  }

  function validateSaveGame(save) {
    const errors = [];
    if (!save || typeof save !== 'object' || Array.isArray(save)) errors.push('Save data must be an object');
    else {
      if (save.artifactType !== migrations.SAVE_ARTIFACT_TYPE) errors.push('Save artifactType is invalid');
      if (!Number.isInteger(Number(save.schemaVersion))) errors.push('Save schemaVersion must be an integer');
      if (!save.projectId) errors.push('Save projectId is required');
      if (!save.state || typeof save.state !== 'object' || Array.isArray(save.state)) errors.push('Save state must be an object');
      if (save.state && !save.state.currentSceneId) errors.push('Save currentSceneId is required');
    }
    return { valid: errors.length === 0, errors };
  }

  return { validateProject, assertProject, validateSaveGame };
});
