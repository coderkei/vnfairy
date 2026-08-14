/* Shared asset type and path rules. Filesystem operations remain server-side. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports && typeof window === 'undefined';
  const api = factory();
  if (typeof window !== 'undefined') {
    window.VNFairyCore = window.VNFairyCore || {};
    window.VNFairyCore.assetRegistry = api;
  } else if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const ASSET_TYPES = Object.freeze(['bg', 'char', 'music', 'sound', 'video']);
  const ALLOWED_EXTENSIONS = Object.freeze({
    bg: Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']),
    char: Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']),
    music: Object.freeze(['.mp3', '.wav', '.ogg', '.oga', '.flac', '.m4a']),
    sound: Object.freeze(['.mp3', '.wav', '.ogg', '.oga', '.flac', '.m4a']),
    video: Object.freeze(['.mp4', '.webm', '.ogv', '.ogg'])
  });
  const MAX_UPLOAD_BYTES = Object.freeze({
    bg: 50 * 1024 * 1024,
    char: 50 * 1024 * 1024,
    music: 100 * 1024 * 1024,
    sound: 100 * 1024 * 1024,
    video: 250 * 1024 * 1024
  });
  const PACKAGE_WARNING_BYTES = 50 * 1024 * 1024;
  const PACKAGE_WARNING_TOTAL_BYTES = 250 * 1024 * 1024;

  function isAssetType(type) { return ASSET_TYPES.includes(type); }
  function assertAssetType(type) {
    if (!isAssetType(type)) throw new Error(`Invalid asset type: ${type}`);
    return type;
  }
  function assetPath(projectId, type, filename) {
    assertAssetType(type);
    if (!projectId || !filename || filename !== String(filename).split(/[\\/]/).pop()) throw new Error('Invalid asset path');
    return `data/projects/${projectId}/assets/${type}/${filename}`;
  }

  function extensionOf(filename) {
    const match = String(filename || '').toLowerCase().match(/\.[a-z0-9]+$/);
    return match ? match[0] : '';
  }

  function assetIdFromFilename(filename) {
    return String(filename || '').replace(/\.[^/.]+$/, '');
  }

  function assetKey(type, filename) {
    assertAssetType(type);
    return `${type}:${filename}`;
  }

  function isSafeFilename(filename) {
    return typeof filename === 'string'
      && filename.length >= 3
      && filename.length <= 128
      && /^[A-Za-z0-9][A-Za-z0-9 _().-]*\.[A-Za-z0-9]{1,10}$/.test(filename)
      && !filename.endsWith('.')
      && !filename.endsWith(' ')
      && !filename.includes('..')
      && filename === filename.split(/[\\/]/).pop();
  }

  function isAssetIdReference(key, type, ancestors) {
    const normalized = String(key || '').toLowerCase();
    const parentKeys = ancestors.map(item => String(item).toLowerCase());
    if (normalized === 'background') return type === 'bg';
    if (normalized === 'music') return type === 'music';
    if (normalized === 'video') return type === 'video';
    if (normalized === 'voice') return type === 'sound';
    if (normalized === 'endingsfx' || normalized === 'uiclicksound') return type === 'sound';
    if (normalized === 'path') return type === 'char' || !parentKeys.includes('assets');
    if (normalized === 'id' && parentKeys.includes('assets')) return false;
    if (normalized === 'id' && parentKeys.some(value => value === 'backgrounds' || value === 'music' || value === 'sound' || value === 'video')) return true;
    return false;
  }

  function findUsages(project, type, filename) {
    assertAssetType(type);
    const targetPath = assetPath(project && project.id ? project.id : 'demo', type, filename);
    const targetId = assetIdFromFilename(filename);
    const usages = [];
    const seen = new Set();

    function add(location, value) {
      const key = `${location}|${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      usages.push({ location, value });
    }

    function visit(value, location, ancestors) {
      if (typeof value === 'string') {
        const isRegistryRecord = ancestors.includes('assets') && ['backgrounds', 'music', 'sound', 'video'].some(key => ancestors.includes(key));
        if (!isRegistryRecord && (value === targetPath || value.endsWith(`/assets/${type}/${filename}`))) add(location, value);
        if (value === targetId && isAssetIdReference(ancestors[ancestors.length - 1], type, ancestors.slice(0, -1))) add(location, value);
        return;
      }
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${location}[${index}]`, ancestors.concat(String(index))));
        return;
      }
      Object.entries(value).forEach(([key, child]) => visit(child, location ? `${location}.${key}` : key, ancestors.concat(key)));
    }

    visit(project || {}, '', []);
    return usages;
  }

  return {
    ASSET_TYPES,
    ALLOWED_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    PACKAGE_WARNING_BYTES,
    PACKAGE_WARNING_TOTAL_BYTES,
    isAssetType,
    assertAssetType,
    assetPath,
    extensionOf,
    assetIdFromFilename,
    assetKey,
    isSafeFilename,
    findUsages
  };
});
