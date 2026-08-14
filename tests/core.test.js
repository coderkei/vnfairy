const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../shared');
const { createProjectStore } = require('../project-store');
const { createAssetService } = require('../asset-service');
const { createPackageService } = require('../package-service');

test('legacy projects receive explicit version metadata', () => {
  const project = core.migrations.migrateProject({
    id: 'demo',
    title: 'Legacy',
    scenes: { start: { id: 'start', dialogue: [], choices: [] } },
    startSceneId: 'start',
    vnFairyVersion: '0.9.0'
  }, { engineVersion: '2.0.0' });

  assert.equal(project.schemaVersion, 1);
  assert.equal(project.engineVersion, '0.9.0');
  assert.equal(project.createdWithVersion, '0.9.0');
  assert.equal(project.artifactType, 'vnfairy-project');
});

test('dialogue lines receive unique stable IDs during migration', () => {
  const input = {
    id: 'demo',
    scenes: {
      start: {
        id: 'start',
        dialogue: [
          { speaker: 'narrator', text: 'Same text' },
          { speaker: 'narrator', text: 'Same text' }
        ],
        choices: []
      }
    },
    startSceneId: 'start'
  };
  const first = core.migrations.migrateProject(input, { engineVersion: '2.0.0' });
  const second = core.migrations.migrateProject(first, { engineVersion: '2.0.0' });
  const ids = first.scenes.start.dialogue.map(line => line.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(second.scenes.start.dialogue.map(line => line.id), ids);
});

test('project migration rejects a future schema', () => {
  assert.throws(
    () => core.migrations.migrateProject({ schemaVersion: 99, scenes: {} }),
    error => error.code === 'FUTURE_PROJECT_SCHEMA'
  );
});

test('validator catches missing branch targets', () => {
  const result = core.validator.validateProject({
    id: 'demo',
    scenes: { start: { id: 'start', dialogue: [], choices: [{ targetSceneId: 'missing' }] } },
    startSceneId: 'start'
  });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /missing/);
});

test('scene model evaluates branches and supports legacy target names', () => {
  assert.equal(core.sceneModel.evaluateCondition({ type: 'number', variable: 'trust', operator: '>=', value: 2 }, { trust: 3 }), true);
  assert.equal(core.sceneModel.choiceTarget({ target: 'scene_2' }), 'scene_2');
});

test('typed project variables migrate legacy numbers and initialize defaults', () => {
  const project = core.migrations.migrateProject({
    config: {
      trackedNumbers: ['trust'],
      variables: [{ name: 'hasKey', type: 'boolean', default: true, description: 'Whether the key was found' }]
    },
    scenes: {}
  });
  assert.deepEqual(project.config.variables, [
    { name: 'hasKey', type: 'boolean', default: true, description: 'Whether the key was found' },
    { name: 'trust', type: 'number', default: 0, description: '' }
  ]);
  assert.deepEqual(core.logicModel.createRuntimeVariables(project.config), { hasKey: true, trust: 0 });
});

test('logic actions support flags, numbers, text, inventory, and comparisons', () => {
  const config = { variables: [
    { name: 'hasKey', type: 'boolean', default: false },
    { name: 'trust', type: 'number', default: 2 },
    { name: 'title', type: 'text', default: 'Rookie' },
    { name: 'items', type: 'inventory', default: {} }
  ] };
  const variables = core.logicModel.createRuntimeVariables(config);
  core.logicModel.applyActions([
    { type: 'toggle', variable: 'hasKey' },
    { type: 'increment', variable: 'trust', value: 3 },
    { type: 'set', variable: 'title', value: 'Friend' },
    { type: 'increment', variable: 'items', item: 'Potion', value: 2 },
    { type: 'decrement', variable: 'items', item: 'Potion', value: 1 }
  ], variables, config);
  assert.deepEqual(variables, { hasKey: true, trust: 5, title: 'Friend', items: { Potion: 1 } });
  assert.equal(core.logicModel.evaluateCondition({ type: 'variable', variable: 'hasKey', operator: '==', value: true }, variables, config), true);
  assert.equal(core.logicModel.evaluateCondition({ type: 'variable', variable: 'title', operator: 'contains', value: 'riend' }, variables, config), true);
  assert.equal(core.logicModel.evaluateCondition({ type: 'variable', variable: 'items', operator: 'contains', item: 'Potion' }, variables, config), true);
  assert.equal(core.logicModel.applyAction({ type: 'compare', variable: 'trust', operator: '>=', value: 5 }, variables, config).result, true);
});

test('save serializer wraps legacy raw state and preserves it', () => {
  const save = core.saveGameSerializer.deserialize({
    currentSceneId: 'start',
    dialogueIndex: 2,
    variables: { trust: 4 },
    history: [],
    timestamp: 123
  }, { projectId: 'demo', projectSchemaVersion: 1, engineVersion: '2.0.0' });

  assert.equal(save.artifactType, 'vnfairy-save');
  assert.equal(save.schemaVersion, 1);
  assert.equal(save.projectId, 'demo');
  assert.equal(save.state.currentSceneId, 'start');
  assert.equal(save.state.variables.trust, 4);
});

test('new saves carry the current engine as their creation version', () => {
  const save = core.saveGameSerializer.serialize({ currentSceneId: 'start', dialogueIndex: 0, variables: {}, history: [] }, {
    projectId: 'demo',
    projectSchemaVersion: 1,
    engineVersion: '2.0.0'
  });
  assert.equal(save.engineVersion, '2.0.0');
  assert.equal(save.createdWithVersion, '2.0.0');
  assert.equal(save.projectSchemaVersion, 1);
});

test('asset registry rejects traversal-like filenames', () => {
  assert.throws(() => core.assetRegistry.assetPath('demo', 'bg', '../secret.png'));
  assert.equal(core.assetRegistry.assetPath('demo', 'bg', 'forest.png'), 'data/projects/demo/assets/bg/forest.png');
  assert.equal(core.assetRegistry.isSafeFilename('forest.png'), true);
  assert.equal(core.assetRegistry.isSafeFilename('../secret.png'), false);
  assert.equal(core.assetRegistry.ALLOWED_EXTENSIONS.music.includes('.mp3'), true);
});

test('asset uploads validate extension, detected type, size, and resolved path boundaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vnfairy-assets-'));
  const projectsDir = path.join(root, 'projects');
  fs.mkdirSync(path.join(projectsDir, 'sample'), { recursive: true });
  const service = createAssetService({ projectsDir });
  const pngData = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')}`;
  try {
    const uploaded = service.upload({ project: 'sample', type: 'bg', filename: 'forest.png', data: pngData });
    assert.equal(uploaded.detectedType, 'image/png');
    assert.equal(fs.existsSync(path.join(projectsDir, 'sample', 'assets', 'bg', 'forest.png')), true);
    assert.throws(() => service.upload({ project: 'sample', type: 'bg', filename: 'forest.mp3', data: pngData }), /does not accept/);
    assert.throws(() => service.upload({ project: 'sample', type: 'music', filename: 'forest.mp3', data: pngData }), /Detected file type/);
    assert.throws(() => service.resolveWithin(path.join(projectsDir, 'sample', 'assets'), '..', '..', 'outside.txt'), /escapes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('asset inventory reports usage without changing runtime asset arrays', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vnfairy-inventory-'));
  const projectsDir = path.join(root, 'projects');
  fs.mkdirSync(path.join(projectsDir, 'sample', 'assets', 'bg'), { recursive: true });
  fs.writeFileSync(path.join(projectsDir, 'sample', 'assets', 'bg', 'forest.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const service = createAssetService({ projectsDir });
  const project = { id: 'sample', assets: { backgrounds: [{ id: 'forest', path: 'data/projects/sample/assets/bg/forest.png' }] }, scenes: { start: { background: 'forest' } } };
  try {
    const inventory = service.listAssets('sample', project);
    assert.deepEqual(inventory.bg, ['forest.png']);
    assert.equal(inventory.metadata.bg['forest.png'].usageCount, 1);
    assert.equal(inventory.metadata.bg['forest.png'].usages[0].location.includes('background'), true);
    assert.equal(inventory.metadata.bg['forest.png'].detectedType, 'image/png');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package preflight exposes asset size warnings before ZIP creation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vnfairy-package-'));
  const projectsDir = path.join(root, 'projects');
  const publicDir = path.join(root, 'public');
  fs.mkdirSync(path.join(projectsDir, 'sample', 'assets', 'bg'), { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(projectsDir, 'sample', 'assets', 'bg', 'small.png'), Buffer.from([1, 2, 3]));
  const service = createPackageService({ projectsDir, publicDir, loadProjectMerged: () => ({ id: 'sample', scenes: {} }) });
  try {
    const result = service.inspectPackageAssets('sample');
    assert.equal(result.assetCount, 1);
    assert.equal(result.totalBytes, 3);
    assert.deepEqual(result.warnings, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('project store persists version metadata and retains a recovery snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vnfairy-store-'));
  const projectsDir = path.join(root, 'projects');
  const recoveryDir = path.join(root, 'recovery');
  fs.mkdirSync(projectsDir, { recursive: true });
  fs.mkdirSync(recoveryDir, { recursive: true });
  const store = createProjectStore({ projectsDir, recoveryDir, assetTypes: core.assetRegistry.ASSET_TYPES });
  const project = { id: 'sample', title: 'Sample', scenes: { start: { id: 'start', dialogue: [], choices: [] } }, startSceneId: 'start' };

  try {
    store.saveProjectSplit('sample', project);
    const first = JSON.parse(fs.readFileSync(path.join(projectsDir, 'sample', 'project.json'), 'utf8'));
    assert.equal(first.schemaVersion, 1);
    assert.equal(first.engineVersion, '2.0.0');
    assert.equal(first.createdWithVersion, 'legacy');

    store.saveProjectSplit('sample', { ...project, title: 'Updated' });
    assert.equal(store.listRecoverySnapshots('sample').length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
