/* VNFairy project artifact schema constants and lightweight constructors. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports && typeof window === 'undefined';
  const api = factory();
  if (typeof window !== 'undefined') {
    window.VNFairyCore = window.VNFairyCore || {};
    window.VNFairyCore.projectSchema = api;
  } else if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const CURRENT_PROJECT_SCHEMA_VERSION = 1;
  const PROJECT_ARTIFACT_TYPE = 'vnfairy-project';

  function createProjectMetadata({ id, title, author, engineVersion = '2.0.0' } = {}) {
    return {
      artifactType: PROJECT_ARTIFACT_TYPE,
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      engineVersion,
      createdWithVersion: engineVersion,
      id: id || undefined,
      title: title || 'New Visual Novel',
      author: author || 'Unknown'
    };
  }

  return {
    CURRENT_PROJECT_SCHEMA_VERSION,
    PROJECT_ARTIFACT_TYPE,
    createProjectMetadata
  };
});
