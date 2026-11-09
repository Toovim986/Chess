// Read-only Figma Plugin API collector. Prepend `const config = {...};`.
// config: {pageId, rootIds, fileKey}. One page per invocation.
// Execute through use_figma, then persist the returned object outside Figma.
// This expands instance internals; get_metadata alone is not a fidelity check.
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(config.pageId));
const nodes = [];
const seen = new Set();
const unavailable = [];
function plain(value) {
  return JSON.parse(JSON.stringify(value, (key, item) =>
    typeof item === 'symbol' ? '__MIXED__' : item));
}
async function walk(node, parent) {
  if (seen.has(node.id)) return;
  seen.add(node.id);
  const row = {
    id: node.id, name: node.name, type: node.type, parent,
    geometry: {x: node.x, y: node.y, width: node.width, height: node.height},
    relativeTransform: plain(node.relativeTransform),
    visible: node.visible, opacity: node.opacity, rotation: node.rotation,
    children: 'children' in node ? node.children.map(child => child.id) : [],
  };
  row.effectiveVisible = true;
  for (let ancestor = node; ancestor && ancestor.type !== 'PAGE'; ancestor = ancestor.parent) {
    if (ancestor.visible === false) { row.effectiveVisible = false; break; }
  }
  for (const key of ['clipsContent', 'isMask', 'maskType', 'constraints', 'layoutMode',
    'layoutPositioning', 'layoutSizingHorizontal', 'layoutSizingVertical',
    'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing',
    'layoutWrap', 'counterAxisSpacing']) {
    if (key in node) row[key] = plain(node[key]);
  }
  if ('fills' in node) row.paints = plain(node.fills);
  if (node.type === 'TEXT') {
    row.characters = node.characters;
    row.textSegments = plain(node.getStyledTextSegments(['fontName', 'fontSize', 'lineHeight', 'fills']));
    row.hasMissingFont = node.hasMissingFont;
  }
  if (node.type === 'INSTANCE') {
    row.scaleFactor = node.scaleFactor;
    const component = await node.getMainComponentAsync();
    row.componentKey = component?.key ?? null;
    row.componentId = component?.id ?? null;
    row.componentProperties = plain(node.componentProperties);
  }
  nodes.push(row);
  if ('children' in node) for (const child of node.children) await walk(child, node.id);
}
for (const id of config.rootIds) {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) unavailable.push(id);
  else await walk(node, null);
}
return {schema: 2, fileKey: config.fileKey, pageId: config.pageId,
  roots: config.rootIds, coverage: unavailable.length ? 'partial' : 'complete',
  unavailable, nodes};
