/* Versioned save-game serialization boundary. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports && typeof window === 'undefined';
  const deps = isNode
    ? { migrations: require('./migrations'), validator: require('./validator') }
    : window.VNFairyCore;
  const api = factory(deps.migrations, deps.validator);
  if (typeof window !== 'undefined') window.VNFairyCore.saveGameSerializer = api;
  else if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (migrations, validator) {
  function serialize(state, options = {}) {
    const save = migrations.stampSaveForWrite(state, options);
    validator.validateSaveGame(save);
    return save;
  }

  function deserialize(value, options = {}) {
    const save = migrations.migrateSaveGame(value, options);
    const result = validator.validateSaveGame(save);
    if (!result.valid) {
      const error = new Error(result.errors.join('; '));
      error.code = 'INVALID_SAVE';
      error.errors = result.errors;
      throw error;
    }
    return save;
  }

  return { serialize, deserialize };
});
