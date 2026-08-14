/*
 * VNFairy shared artifact versioning.
 *
 * This file is intentionally usable from both the browser and Node without a
 * build step. Browser pages receive window.VNFairyCore.versioning; the server
 * can require the same module.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports && typeof window === 'undefined';
  const api = factory();
  if (typeof window !== 'undefined') {
    window.VNFairyCore = window.VNFairyCore || {};
    window.VNFairyCore.versioning = api;
  } else if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DEFAULT_ENGINE_VERSION = '2.0.0';

  function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function parseVersion(value) {
    if (value === null || value === undefined || value === '') return [0, 0, 0];
    const match = String(value).trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!match) return [0, 0, 0];
    return [Number(match[1]) || 0, Number(match[2]) || 0, Number(match[3]) || 0];
  }

  function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    for (let i = 0; i < 3; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  }

  function isNewerVersion(candidate, current) {
    return compareVersions(candidate, current) > 0;
  }

  function normalizeVersion(value, fallback) {
    const normalized = String(value || '').trim();
    return normalized || fallback;
  }

  function artifactMetadata({ schemaVersion, engineVersion, createdWithVersion, artifactType }) {
    return {
      schemaVersion: Number(schemaVersion),
      engineVersion: normalizeVersion(engineVersion, DEFAULT_ENGINE_VERSION),
      createdWithVersion: normalizeVersion(createdWithVersion, 'legacy'),
      ...(artifactType ? { artifactType } : {})
    };
  }

  return {
    DEFAULT_ENGINE_VERSION,
    cloneJson,
    parseVersion,
    compareVersions,
    isNewerVersion,
    normalizeVersion,
    artifactMetadata
  };
});
