/* Filesystem asset registry operations extracted from the HTTP server. */
const fs = require('fs');
const path = require('path');
const core = require('./shared');

const MIME_BY_EXTENSION = Object.freeze({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg'
});

function validationError(message, code = 'ASSET_VALIDATION') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function detectMimeType(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const textHead = buffer.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (textHead.startsWith('<svg') || (textHead.startsWith('<?xml') && textHead.includes('<svg'))) return 'image/svg+xml';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buffer.subarray(0, 4).toString('ascii') === 'fLaC') return 'audio/flac';
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (buffer.subarray(0, 4).toString('latin1') === '\u001aE\u00df\u00a3') return 'video/webm';
  return null;
}

function isCompatibleType(type, extension, detectedMime) {
  if (!detectedMime) return false;
  if (type === 'bg' || type === 'char') return detectedMime.startsWith('image/');
  if (type === 'music' || type === 'sound') return detectedMime.startsWith('audio/') || (extension === '.m4a' && detectedMime === 'video/mp4');
  if (type === 'video') return detectedMime.startsWith('video/') || (extension === '.ogg' && detectedMime === 'audio/ogg');
  return false;
}

function createAssetService({ projectsDir }) {
  function assertProjectId(project) {
    if (typeof project !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(project)) throw validationError('Invalid project ID');
  }

  function projectAssetsDir(project) {
    assertProjectId(project);
    return path.resolve(projectsDir, project, 'assets');
  }

  function resolveWithin(root, ...parts) {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, ...parts);
    if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw validationError('Resolved asset path escapes the project asset directory');
    return resolved;
  }

  function assertFilename(filename, type) {
    core.assetRegistry.assertAssetType(type);
    if (!core.assetRegistry.isSafeFilename(filename)) throw validationError('Filename must be a simple name with one safe extension');
    const extension = core.assetRegistry.extensionOf(filename);
    if (!core.assetRegistry.ALLOWED_EXTENSIONS[type].includes(extension)) throw validationError(`The ${type} asset type does not accept ${extension} files`);
    return extension;
  }

  function decodeBase64(data) {
    const raw = String(data || '');
    const commaIndex = raw.indexOf(',');
    const encoded = (commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw).replace(/\s/g, '');
    if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) throw validationError('Upload data is not valid base64');
    const buffer = Buffer.from(encoded, 'base64');
    if (encoded.replace(/=+$/, '') !== buffer.toString('base64').replace(/=+$/, '')) throw validationError('Upload data is not valid base64');
    return buffer;
  }

  function inspectFile(project, type, filename, projectData = null) {
    const extension = assertFilename(filename, type);
    const filePath = resolveWithin(projectAssetsDir(project), type, filename);
    const stat = fs.statSync(filePath);
    const previewLength = Math.min(stat.size, 64 * 1024);
    const bytes = Buffer.alloc(previewLength);
    const descriptor = fs.openSync(filePath, 'r');
    try { fs.readSync(descriptor, bytes, 0, previewLength, 0); } finally { fs.closeSync(descriptor); }
    const detectedType = detectMimeType(bytes);
    const usages = projectData ? core.assetRegistry.findUsages(projectData, type, filename) : [];
    const audioLike = !!detectedType && (detectedType.startsWith('audio/') || (extension === '.m4a' && detectedType === 'video/mp4'));
    return {
      filename, type, extension, size: stat.size, modifiedAt: stat.mtime.toISOString(),
      mimeType: MIME_BY_EXTENSION[extension] || 'application/octet-stream', detectedType,
      isImage: !!detectedType && detectedType.startsWith('image/'), isAudio: audioLike, isVideo: !!detectedType && detectedType.startsWith('video/') && !audioLike,
      usageCount: usages.length, usages, path: core.assetRegistry.assetPath(project, type, filename)
    };
  }

  function scanDir(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).filter(name => core.assetRegistry.isSafeFilename(name));
  }

  function listAssets(project, projectData = null) {
    assertProjectId(project);
    const root = projectAssetsDir(project);
    fs.mkdirSync(root, { recursive: true });
    const assets = {}, metadata = {};
    let totalBytes = 0, assetCount = 0;
    core.assetRegistry.ASSET_TYPES.forEach(type => {
      const dir = resolveWithin(root, type);
      fs.mkdirSync(dir, { recursive: true });
      assets[type] = scanDir(dir);
      metadata[type] = {};
      assets[type].forEach(filename => {
        try {
          const item = inspectFile(project, type, filename, projectData);
          metadata[type][filename] = item;
          totalBytes += item.size;
          assetCount += 1;
        } catch (error) {
          metadata[type][filename] = { filename, type, invalid: true, error: error.message, usageCount: 0 };
        }
      });
    });
    return { ...assets, metadata, summary: { assetCount, totalBytes }, limits: core.assetRegistry.MAX_UPLOAD_BYTES };
  }

  function upload({ filename, type, data, project }) {
    const extension = assertFilename(filename, type);
    const buffer = decodeBase64(data);
    const maxBytes = core.assetRegistry.MAX_UPLOAD_BYTES[type];
    if (buffer.length > maxBytes) throw validationError(`Asset exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB ${type} upload limit`, 'ASSET_TOO_LARGE');
    const detectedType = detectMimeType(buffer);
    if (!isCompatibleType(type, extension, detectedType)) throw validationError(`Detected file type ${detectedType || 'unknown'} does not match the ${type} asset category or extension`, 'ASSET_TYPE_MISMATCH');
    const targetDir = resolveWithin(projectAssetsDir(project), type);
    const targetPath = resolveWithin(targetDir, filename);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, buffer);
    return { path: core.assetRegistry.assetPath(project, type, filename), filename, type, size: buffer.length, mimeType: MIME_BY_EXTENSION[extension], detectedType };
  }

  function remove({ filename, type, project }) {
    assertFilename(filename, type);
    const targetPath = resolveWithin(projectAssetsDir(project), type, filename);
    if (!fs.existsSync(targetPath)) return false;
    if (!fs.statSync(targetPath).isFile()) throw validationError('Asset target is not a file');
    fs.unlinkSync(targetPath);
    return true;
  }

  return { listAssets, upload, remove, inspectFile, detectMimeType, resolveWithin };
}

module.exports = { createAssetService, detectMimeType, MIME_BY_EXTENSION };
