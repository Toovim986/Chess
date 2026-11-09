// Read-only regression inventory. Prepend config: {pageId, sourceBoard, targetBoard}.
// Reports all differences; classification/approval is a separate explicit step.
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(config.pageId));
const sourceBoard = await figma.getNodeByIdAsync(config.sourceBoard);
const targetBoard = await figma.getNodeByIdAsync(config.targetBoard);
const phones = board => board.findAll(n => n.type === 'FRAME' && Math.abs(n.width - 390) < .01 && Math.abs(n.height - 844) < .01 && /source /.test(n.name));
const key = n => n.name.split('/ source ').pop();
const oldPhones = phones(sourceBoard), newPhones = phones(targetBoard);
function effectivelyVisible(node) {
  for (let n = node; n && n.type !== 'PAGE'; n = n.parent) if (n.visible === false) return false;
  return true;
}
const hiddenScreens = [];
const groups = {}, missing = [], added = [];
let matchedNodes = 0, equalNodes = 0, matchedScreens = 0;
function normalize(value) {
  return JSON.stringify(value, (k, v) => k === 'boundVariables' ? undefined : typeof v === 'number' ? Math.round(v * 10000) / 10000 : typeof v === 'symbol' ? '__MIXED__' : v);
}
function report(a, b, property, from, to, path) {
  const group = b.name + ' :: ' + property;
  if (!groups[group]) groups[group] = {name: b.name, property, count: 0, example: {source: a.id, target: b.id, path, from, to}};
  groups[group].count++;
}
function childrenByKey(n) {
  const counts = {}, map = new Map();
  if (!('children' in n)) return map;
  for (const c of n.children) {
    const k = c.type + '|' + c.name;
    const i = counts[k] || 0; counts[k] = i + 1;
    map.set(k + '|' + i, c);
  }
  return map;
}
function walk(a, b, path, root = false) {
  matchedNodes++;
  let equal = true;
  const properties = root ? ['width', 'height', 'visible'] : ['x', 'y', 'width', 'height', 'rotation', 'visible', 'opacity', 'clipsContent', 'fills', 'strokes'];
  if (a.type === 'TEXT') properties.push('characters', 'fontName', 'fontSize');
  for (const property of properties) {
    if (!(property in a) || !(property in b)) continue;
    const av = a[property], bv = b[property];
    const same = typeof av === 'number' && typeof bv === 'number' ? Math.abs(av - bv) < .25 : normalize(av) === normalize(bv);
    if (!same) { equal = false; report(a, b, property, typeof av === 'object' ? normalize(av).slice(0,120) : av, typeof bv === 'object' ? normalize(bv).slice(0,120) : bv, path); }
  }
  if (equal) equalNodes++;
  if (!a.visible || !b.visible) return;
  const ac = childrenByKey(a), bc = childrenByKey(b);
  for (const [k, c] of ac) {
    if (bc.has(k)) walk(c, bc.get(k), path + '/' + c.name);
    else missing.push({source: c.id, targetParent: b.id, name: c.name, path});
  }
  for (const [k, c] of bc) if (!ac.has(k)) added.push({target: c.id, sourceParent: a.id, name: c.name, path});
}
for (const target of newPhones) {
  const matches = oldPhones.filter(n => key(n) === key(target));
  if (matches.length !== 1) { missing.push({target: target.id, reason: 'Ambiguous or missing screen source'}); continue; }
  matchedScreens++;
  if (!effectivelyVisible(target)) { hiddenScreens.push({source: matches[0].id, target: target.id, reason: 'Target hidden by node or ancestor'}); continue; }
  walk(matches[0], target, target.name, true);
}
const list = Object.values(groups).sort((a,b) => b.count - a.count);
const result = {sourceBoard: sourceBoard.id, targetBoard: targetBoard.id, sourceScreens: oldPhones.length, targetScreens: newPhones.length, matchedScreens, visibleScreens: matchedScreens - hiddenScreens.length, hiddenScreens, matchedNodes, equalNodes, changedNodes: matchedNodes - equalNodes, groups: list, missing, added};
// Page-sized results are paginated: never accept the MCP's 20 kB truncation as a full report.
return config.part === 'summary' ? {...result, groups: list.slice(0, 18), missing: missing.slice(0,10), added: added.slice(0,10), totalGroups: list.length, totalMissing: missing.length, totalAdded: added.length}
  : config.part === 'groups' ? {groups: list.slice(config.offset || 0, (config.offset || 0) + 30), totalGroups: list.length}
  : {missing: missing.slice(config.offset || 0, (config.offset || 0) + 30), added: added.slice(config.offset || 0, (config.offset || 0) + 30), totalMissing: missing.length, totalAdded: added.length};
