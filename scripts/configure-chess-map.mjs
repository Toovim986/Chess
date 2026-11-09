import fs from 'node:fs';
const mapFile = new URL('../tools/design-verifier/verifier/public/screen-map/chess.json', import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL('../design-system/chess-component-plan.json', import.meta.url), 'utf8'));
const buttons = JSON.parse(fs.readFileSync(new URL('../design-system/evidence/buttons-2026-10-27.json', import.meta.url), 'utf8'));
for (const component of plan.components) {
  const actual = buttons.data.components.find(item => item.id === component.source?.nodeId);
  if (actual) component.source.key = actual.key;
}
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
map.components = plan.components;
fs.writeFileSync(mapFile, JSON.stringify(map, null, 2) + '\n');
fs.writeFileSync(new URL('../design-system/chess-component-plan.json', import.meta.url), JSON.stringify(plan, null, 2) + '\n');
console.log(`Configured ${map.screens.length} screens and ${map.components.length} component entries.`);
