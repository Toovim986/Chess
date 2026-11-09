import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateViewport, getViewportReview } from '../viewport.mjs';

const policy = {
  version: 1, requiredViewports: [{width: 360, height: 640}],
  projectConstraints: {navigationHeight: 72, ctaMinHeight: 48, geometryTolerance: .001},
  requiredRuntimeScenarios: ['host-insets']
};
function fixture() {
  return {unit: 'CSS px', expectedStates: ['source'], screens: [{
    nodeId: '1:2', sourceState: 'source', width: 360, height: 640,
    navigation: {x: 0, y: 568, width: 360, height: 72, outsideScroll: true},
    contentViewport: {x: 0, y: 0, width: 360, height: 568}, contentHeight: 772, verticalScroll: true,
    critical: [{role: 'profile', x: 85, y: 32, width: 190, height: 135},
      {role: 'cta', x: 18, y: 420, width: 324, height: 48},
      {role: 'activities', x: 14, y: 579, width: 346, height: 160}]
  }], runtimeSamples: []};
}
const codes = result => result.findings.map(f => f.code);
function shopFixture() {
  const f = fixture(); f.productSurface = 'shop';
  f.screens[0].contentHeight = 1500;
  f.screens[0].critical = [
    {role: 'header', position: 'fixed', x: 0, y: 0, width: 360, height: 140},
    {role: 'content', x: 0, y: 140, width: 360, height: 428},
    {role: 'action', x: 14, y: 1456, width: 160, height: 44}
  ];
  return f;
}
test('Shop actions below the fold are reachable through scrolling without requiring Home blocks', () => {
  const f = shopFixture();
  const r = evaluateViewport(f, policy);
  assert.equal(r.productSurface, 'shop'); assert.equal(r.designStatus, 'PASS'); assert.equal(r.status, 'INCOMPLETE');
  f.screens[0].verticalScroll = false;
  assert.ok(codes(evaluateViewport(f, policy)).includes('CONTENT_UNREACHABLE'));
  delete f.productSurface;
  assert.ok(codes(evaluateViewport(f, policy)).includes('CRITICAL_EVIDENCE'));
});
test('Shop coverage counts 29 unique states in each of eight viewports', () => {
  const actualPolicy = getViewportReview().policy;
  const f = shopFixture(); f.expectedStates = Array.from({length: 29}, (_, i) => `source-${i}`);
  const screen = f.screens[0];
  f.screens = actualPolicy.requiredViewports.flatMap(({width, height}, v) => f.expectedStates.map((sourceState, i) => ({
    ...structuredClone(screen), nodeId: `${v}:${i}`, sourceState, width, height,
    navigation: {x: 0, y: height - 72, width, height: 72, outsideScroll: true},
    contentViewport: {x: 0, y: 0, width, height: height - 72}
  })));
  const r = evaluateViewport(f, actualPolicy);
  assert.equal(r.checkedScreens, 232); assert.equal(r.designStatus, 'PASS');
  assert.deepEqual(r.coverage.map(c => c.present), Array(8).fill(29));
  f.screens.pop();
  assert.ok(codes(evaluateViewport(f, actualPolicy)).includes('VIEWPORT_COVERAGE'));
});
test('Shop requires header, content viewport and actual actions, with separate primary CTA minimum', () => {
  const f = shopFixture(), action = f.screens[0].critical[2];
  action.height = 43;
  assert.ok(codes(evaluateViewport(f, policy)).includes('ACTION_PROJECT_MIN'));
  action.role = 'cta'; action.height = 44;
  assert.ok(codes(evaluateViewport(f, policy)).includes('CTA_PROJECT_MIN'));
  action.height = 48; action.y = 1452;
  assert.equal(evaluateViewport(f, policy).designStatus, 'PASS');
  f.screens[0].critical.pop();
  assert.ok(codes(evaluateViewport(f, policy)).includes('CRITICAL_EVIDENCE'));
  f.productSurface = 'unknown';
  assert.ok(codes(evaluateViewport(f, policy)).includes('PRODUCT_SURFACE'));
});
test('Shop keeps the header outside a content viewport starting at y174', () => {
  const f = shopFixture(), screen = f.screens[0];
  screen.contentViewport = {x: 0, y: 174, width: 360, height: 394};
  screen.critical[0].height = 200;
  screen.critical[1] = {role: 'content', x: 0, y: 0, width: 360, height: 394};
  assert.equal(evaluateViewport(f, policy).designStatus, 'PASS');
  delete screen.critical[0].position;
  assert.ok(codes(evaluateViewport(f, policy)).includes('HEADER_POSITION'));
  screen.critical[0].position = 'fixed'; screen.contentViewport.height++;
  assert.ok(codes(evaluateViewport(f, policy)).includes('CONTENT_NAV_OVERLAP'));
});
test('short screen is reachable with scrolling, but Figma cannot certify browser runtime', () => {
  const r = evaluateViewport(fixture(), policy);
  assert.equal(r.designStatus, 'PASS'); assert.equal(r.status, 'INCOMPLETE');
  assert.ok(codes(r).includes('SAFE_AREA_UNKNOWN'));
});
test('removing scroll exposes inaccessible activities, retaining nav separation', () => {
  const f = fixture(); f.screens[0].verticalScroll = false;
  assert.ok(codes(evaluateViewport(f, policy)).includes('CONTENT_UNREACHABLE'));
});
test('nav scrolling or overlap is a real layout failure', () => {
  const f = fixture(); f.screens[0].navigation.outsideScroll = false;
  f.screens[0].contentViewport.height = 640;
  const r = evaluateViewport(f, policy);
  assert.equal(r.status, 'FAIL'); assert.ok(codes(r).includes('NAV_LAYOUT')); assert.ok(codes(r).includes('CONTENT_NAV_OVERLAP'));
});
test('root duplicates cannot satisfy coverage; missing states remain incomplete', () => {
  const f = fixture(); f.expectedStates.push('other'); f.screens.push(structuredClone(f.screens[0]));
  const r = evaluateViewport(f, policy);
  assert.equal(r.coverage[0].present, 1); assert.equal(r.coverage[0].expected, 2);
  assert.ok(codes(r).includes('VIEWPORT_IDENTITY')); assert.ok(codes(r).includes('VIEWPORT_COVERAGE'));
});
test('physical dimensions and invalid geometry are never silently accepted', () => {
  const f = fixture(); f.unit = 'physical px'; f.screens[0].width = NaN;
  const r = evaluateViewport(f, policy);
  assert.equal(r.checkedScreens, 0); assert.equal(r.status, 'FAIL');
});
test('horizontal overflow and CTA shrink are reported independently', () => {
  const f = fixture(); f.screens[0].critical[1].width = 400; f.screens[0].critical[1].height = 40;
  const r = evaluateViewport(f, policy);
  assert.ok(codes(r).includes('HORIZONTAL_OVERFLOW')); assert.ok(codes(r).includes('CTA_PROJECT_MIN'));
});
function sample() {
  return {scenario: 'host-insets', environment: 'Synthetic test, not real evidence', capturedAt: '2026-09-10T00:00:00Z', artifact: 'test-fixture',
    visualViewport: {x: 0, y: 0, width: 360, height: 640}, insetOwnership: 'app-applies',
    effectiveInsets: {top: 0, right: 0, bottom: 34, left: 0},
    criticalRects: [{position: 'fixed', role: 'navigation', x: 0, y: 534, width: 360, height: 72},
      {position: 'content', role: 'profile', x: 85, y: 32, width: 190, height: 135},
      {position: 'content', role: 'cta', x: 18, y: 420, width: 324, height: 48},
      {position: 'content', role: 'activities', x: 14, y: 200, width: 346, height: 160}]};
}
test('Shop runtime checks measured actions after scrolling and detects navigation occlusion', () => {
  const f = shopFixture(), s = sample();
  s.criticalRects = [s.criticalRects[0],
    {position: 'content', role: 'header', x: 0, y: 0, width: 360, height: 140},
    {position: 'content', role: 'content', x: 0, y: 140, width: 360, height: 300},
    {position: 'content', role: 'action', x: 14, y: 450, width: 160, height: 44}];
  f.runtimeSamples = [s];
  assert.equal(evaluateViewport(f, policy).status, 'PASS');
  s.criticalRects[3].height = 43;
  assert.ok(codes(evaluateViewport(f, policy)).includes('ACTION_PROJECT_MIN'));
  s.criticalRects[3].height = 44; s.criticalRects[3].y = 520;
  assert.ok(codes(evaluateViewport(f, policy)).includes('RUNTIME_NAV_OVERLAP'));
  s.criticalRects.pop();
  assert.ok(codes(evaluateViewport(f, policy)).includes('RUNTIME_CRITICAL_EVIDENCE'));
});
test('safe-area underlap is detected from measured bounds', () => {
  const f = fixture(); const s = sample(); s.criticalRects[0].y = 568; f.runtimeSamples.push(s);
  assert.ok(codes(evaluateViewport(f, policy)).includes('RUNTIME_OCCLUSION'));
  s.criticalRects[0].y = 534;
  assert.equal(evaluateViewport(f, policy).status, 'PASS');
});
test('host-applied safe area is not subtracted twice', () => {
  const f = fixture(); const s = sample(); s.insetOwnership = 'host-already-applied'; f.runtimeSamples.push(s);
  assert.ok(codes(evaluateViewport(f, policy)).includes('SAFE_AREA_DOUBLE_COUNT'));
  s.effectiveInsets.bottom = 0;
  assert.equal(evaluateViewport(f, policy).status, 'PASS');
});
test('runtime sample with missing bounds cannot satisfy required scenario', () => {
  const f = fixture(); const s = sample(); delete s.criticalRects[0].width; f.runtimeSamples.push(s);
  const r = evaluateViewport(f, policy);
  assert.equal(r.status, 'INCOMPLETE'); assert.ok(codes(r).includes('RUNTIME_SCENARIOS'));
});
test('measuring only navigation cannot certify runtime content reachability', () => {
  const f = fixture(); const s = sample(); s.criticalRects = s.criticalRects.slice(0, 1); f.runtimeSamples.push(s);
  assert.ok(codes(evaluateViewport(f, policy)).includes('RUNTIME_CRITICAL_EVIDENCE'));
});
test('runtime CTA minimum is checked even when Figma CTA has correct size', () => {
  const f = fixture(); const s = sample(); s.criticalRects.find(c => c.role === 'cta').height = 1; f.runtimeSamples.push(s);
  const r = evaluateViewport(f, policy);
  assert.equal(r.status, 'FAIL'); assert.ok(codes(r).includes('CTA_PROJECT_MIN'));
});
test('control inside visual viewport but behind navigation is inaccessible', () => {
  const f = fixture(); const s = sample(); s.criticalRects.find(c => c.role === 'cta').y = 550; f.runtimeSamples.push(s);
  const r = evaluateViewport(f, policy);
  assert.ok(codes(r).includes('RUNTIME_NAV_OVERLAP')); assert.equal(r.status, 'FAIL');
});
test('current saved Home covers all eight viewport classes and 296 states; runtime evidence remains absent', () => {
  const {result} = getViewportReview();
  assert.equal(result.checkedScreens, 296);
  assert.equal(result.coverage.length, 8);
  assert.deepEqual(result.coverage.map(c => c.present), Array(8).fill(37));
  assert.deepEqual(result.coverage.filter(c => c.present < c.expected), []);
  assert.equal(result.runtimeSamples, 0); assert.equal(result.status, 'INCOMPLETE');
});
