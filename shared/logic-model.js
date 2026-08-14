/* Typed project variables and the small, declarative logic language used by VNFairy. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports && typeof window === 'undefined';
  const api = factory();
  if (typeof window !== 'undefined') {
    window.VNFairyCore = window.VNFairyCore || {};
    window.VNFairyCore.logicModel = api;
  } else if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const VARIABLE_TYPES = Object.freeze(['boolean', 'number', 'text', 'inventory']);
  const ACTION_TYPES = Object.freeze(['set', 'increment', 'decrement', 'toggle', 'compare']);
  const MAX_TEXT_LENGTH = 280;
  const MAX_DESCRIPTION_LENGTH = 500;

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidVariableName(value) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || '').trim());
  }

  function parseBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.trim().toLowerCase() === 'true') return true;
      if (value.trim().toLowerCase() === 'false') return false;
    }
    return value === undefined ? fallback : !!value;
  }

  function parseNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeInventory(value) {
    const inventory = {};
    if (Array.isArray(value)) {
      value.forEach(item => {
        const name = String(item || '').trim();
        if (name) inventory[name] = (inventory[name] || 0) + 1;
      });
      return inventory;
    }
    if (!isPlainObject(value)) return inventory;
    Object.entries(value).forEach(([item, count]) => {
      const name = String(item || '').trim().slice(0, 120);
      const normalizedCount = Math.max(0, Math.floor(parseNumber(count, 0)));
      if (name && normalizedCount > 0) inventory[name] = normalizedCount;
    });
    return inventory;
  }

  function coerceValue(type, value, fallback) {
    switch (type) {
      case 'boolean': return parseBoolean(value, fallback === undefined ? false : fallback);
      case 'number': return parseNumber(value, fallback === undefined ? 0 : fallback);
      case 'inventory': return normalizeInventory(value === undefined ? fallback : value);
      case 'text':
      default:
        return String(value === undefined || value === null ? (fallback || '') : value).slice(0, MAX_TEXT_LENGTH);
    }
  }

  function normalizeDefinition(input) {
    if (!input) return null;
    const source = typeof input === 'string' ? { name: input, type: 'number', default: 0 } : input;
    const name = String(source.name || '').trim();
    if (!isValidVariableName(name)) return null;
    const type = VARIABLE_TYPES.includes(source.type) ? source.type : 'number';
    const fallback = type === 'boolean' ? false : type === 'inventory' ? {} : type === 'number' ? 0 : '';
    return {
      name,
      type,
      default: coerceValue(type, source.default !== undefined ? source.default : source.defaultValue, fallback),
      description: String(source.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH)
    };
  }

  function normalizeVariableDefinitions(config = {}) {
    const definitions = [];
    const seen = new Set();
    const source = Array.isArray(config.variables)
      ? config.variables
      : isPlainObject(config.variables)
        ? Object.entries(config.variables).map(([name, definition]) => ({ name, ...(isPlainObject(definition) ? definition : { default: definition }) }))
        : [];

    source.forEach(input => {
      const definition = normalizeDefinition(input);
      if (!definition || seen.has(definition.name)) return;
      seen.add(definition.name);
      definitions.push(definition);
    });

    // Numeric trackedNumbers is the legacy public format. Keep it readable by old players
    // while presenting it as a normal typed definition to the new editor/runtime.
    (Array.isArray(config.trackedNumbers) ? config.trackedNumbers : []).forEach(name => {
      const normalizedName = String(name || '').trim();
      if (!isValidVariableName(normalizedName) || seen.has(normalizedName)) return;
      seen.add(normalizedName);
      definitions.push({ name: normalizedName, type: 'number', default: 0, description: '' });
    });
    return definitions;
  }

  function getDefinition(definitionsOrConfig, name) {
    const definitions = Array.isArray(definitionsOrConfig)
      ? definitionsOrConfig
      : normalizeVariableDefinitions(definitionsOrConfig || {});
    return definitions.find(definition => definition && definition.name === name) || null;
  }

  function createRuntimeVariables(config = {}, existing) {
    const variables = isPlainObject(existing) ? clone(existing) : {};
    normalizeVariableDefinitions(config).forEach(definition => {
      if (!Object.prototype.hasOwnProperty.call(variables, definition.name)) {
        variables[definition.name] = clone(definition.default);
      } else {
        variables[definition.name] = coerceValue(definition.type, variables[definition.name], definition.default);
      }
    });
    return variables;
  }

  function operatorForType(type) {
    if (type === 'boolean') return ['==', '!='];
    if (type === 'text') return ['==', '!=', 'contains', 'not_contains', 'starts_with', 'ends_with'];
    if (type === 'inventory') return ['contains', 'not_contains', '==', '!=', '>', '<', '>=', '<='];
    return ['==', '!=', '>', '<', '>=', '<='];
  }

  function compare(left, operator, right) {
    switch (operator) {
      case '==':
      case 'is': return left === right;
      case '!=':
      case 'is_not': return left !== right;
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      case 'contains': return String(left).toLowerCase().includes(String(right).toLowerCase());
      case 'not_contains': return !String(left).toLowerCase().includes(String(right).toLowerCase());
      case 'starts_with': return String(left).toLowerCase().startsWith(String(right).toLowerCase());
      case 'ends_with': return String(left).toLowerCase().endsWith(String(right).toLowerCase());
      default: return false;
    }
  }

  function evaluateCondition(condition, variables = {}, definitionsOrConfig = []) {
    if (!condition || typeof condition !== 'object') return false;
    if (condition.type === 'choice') {
      const selected = !!variables['choice_' + condition.choiceId];
      return condition.choiceState === 'not_selected' ? !selected : selected;
    }

    // `number` is the original branch format. It remains supported without a definition.
    const variableName = condition.variable;
    if (!variableName || (condition.type !== 'number' && condition.type !== 'variable' && condition.type !== 'condition')) return false;
    const definition = getDefinition(definitionsOrConfig, variableName);
    const type = condition.type === 'number' ? 'number' : (definition ? definition.type : 'text');
    const rawCurrent = variables[variableName];
    const operator = condition.operator || '==';

    if (type === 'inventory') {
      const inventory = normalizeInventory(rawCurrent);
      const item = String(condition.item || condition.value || '').trim();
      if (operator === 'contains' || operator === 'not_contains') {
        const contains = !!item && (inventory[item] || 0) > 0;
        return operator === 'contains' ? contains : !contains;
      }
      const count = inventory[item] || 0;
      const target = parseNumber(condition.value, 0);
      return compare(count, operator, target);
    }

    const current = coerceValue(type, rawCurrent);
    const target = coerceValue(type, condition.value);
    return compare(current, operator, target);
  }

  function evaluateConditions(conditions, variables = {}, definitionsOrConfig = []) {
    return !Array.isArray(conditions) || conditions.length === 0
      ? true
      : conditions.every(condition => evaluateCondition(condition, variables, definitionsOrConfig));
  }

  function applyAction(action, variables = {}, definitionsOrConfig = []) {
    if (!action || typeof action !== 'object' || !ACTION_TYPES.includes(action.type)) return { applied: false, result: undefined };
    if (action.type === 'compare') {
      return { applied: false, result: evaluateCondition({ ...action, type: 'variable' }, variables, definitionsOrConfig) };
    }

    const name = String(action.variable || '').trim();
    if (!name) return { applied: false, result: undefined };
    const definition = getDefinition(definitionsOrConfig, name);
    const type = definition ? definition.type : action.valueType || 'number';
    const current = variables[name] === undefined
      ? (definition ? clone(definition.default) : type === 'boolean' ? false : type === 'inventory' ? {} : type === 'text' ? '' : 0)
      : variables[name];

    if (type === 'boolean') {
      if (action.type === 'toggle') variables[name] = !parseBoolean(current);
      else if (action.type === 'set') variables[name] = parseBoolean(action.value);
      else return { applied: false, result: variables[name] };
    } else if (type === 'number') {
      const amount = parseNumber(action.value, 1);
      const currentNumber = parseNumber(current, 0);
      if (action.type === 'set') variables[name] = amount;
      else if (action.type === 'increment') variables[name] = currentNumber + amount;
      else if (action.type === 'decrement') variables[name] = currentNumber - amount;
      else return { applied: false, result: variables[name] };
    } else if (type === 'text') {
      if (action.type !== 'set') return { applied: false, result: variables[name] };
      variables[name] = coerceValue('text', action.value);
    } else if (type === 'inventory') {
      const inventory = normalizeInventory(current);
      const item = String(action.item || '').trim().slice(0, 120);
      if (!item) {
        if (action.type !== 'set') return { applied: false, result: inventory };
        variables[name] = normalizeInventory(action.value);
      } else {
        const amount = Math.max(0, Math.floor(parseNumber(action.value, 1)));
        if (action.type === 'set') inventory[item] = amount;
        else if (action.type === 'increment') inventory[item] = (inventory[item] || 0) + amount;
        else if (action.type === 'decrement') inventory[item] = Math.max(0, (inventory[item] || 0) - amount);
        else return { applied: false, result: inventory };
        if (inventory[item] <= 0) delete inventory[item];
        variables[name] = inventory;
      }
    }
    return { applied: true, result: variables[name] };
  }

  function applyActions(actions, variables = {}, definitionsOrConfig = []) {
    (Array.isArray(actions) ? actions : []).forEach(action => applyAction(action, variables, definitionsOrConfig));
    return variables;
  }

  return {
    VARIABLE_TYPES,
    ACTION_TYPES,
    MAX_TEXT_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    isValidVariableName,
    normalizeDefinition,
    normalizeVariableDefinitions,
    getDefinition,
    createRuntimeVariables,
    operatorForType,
    evaluateCondition,
    evaluateConditions,
    applyAction,
    applyActions,
    normalizeInventory
  };
});
