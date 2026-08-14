/* Pure scene and branching operations shared by the editor, player, and tests. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports && typeof window === 'undefined';
  const logic = isNode ? require('./logic-model') : window.VNFairyCore.logicModel;
  const api = factory(logic);
  if (typeof window !== 'undefined') {
    window.VNFairyCore = window.VNFairyCore || {};
    window.VNFairyCore.sceneModel = api;
  } else if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (logic) {
  function getScene(project, sceneId) {
    return project && project.scenes ? project.scenes[sceneId] || null : null;
  }

  function choiceTarget(choice) {
    return choice && (choice.targetSceneId || choice.target || null);
  }

  function evaluateCondition(branch, variables = {}, definitionsOrConfig = []) {
    return logic.evaluateCondition(branch, variables, definitionsOrConfig);
  }

  function evaluateConditions(conditions, variables = {}, definitionsOrConfig = []) {
    return logic.evaluateConditions(conditions, variables, definitionsOrConfig);
  }

  function firstMatchingBranch(scene, variables = {}, definitionsOrConfig = []) {
    if (!scene || !Array.isArray(scene.conditionalBranches)) return null;
    return scene.conditionalBranches.find(branch => evaluateCondition(branch, variables, definitionsOrConfig) && choiceTarget(branch)) || null;
  }

  function sceneTargets(scene) {
    if (!scene) return [];
    const targets = [];
    if (scene.nextSceneId) targets.push(scene.nextSceneId);
    for (const choice of scene.choices || []) {
      const target = choiceTarget(choice);
      if (target) targets.push(target);
    }
    for (const branch of scene.conditionalBranches || []) {
      const target = choiceTarget(branch);
      if (target) targets.push(target);
    }
    return [...new Set(targets)];
  }

  return { getScene, choiceTarget, evaluateCondition, evaluateConditions, firstMatchingBranch, sceneTargets };
});
