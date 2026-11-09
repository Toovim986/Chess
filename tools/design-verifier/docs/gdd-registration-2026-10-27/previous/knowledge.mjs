import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = path.dirname(fileURLToPath(import.meta.url));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function loadProject(id, packageRoot = root) {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error('Некорректный ID проекта');
  const project = read(path.join(packageRoot, 'profiles', id, 'project.json'));
  if (project.schema !== 'verifier-project/1' || project.id !== id || !Array.isArray(project.ruleIds)) throw new Error('Некорректный профиль проекта');
  return project;
}

// Configuration readiness only: this never certifies a Figma design or a product.
export function preflight(project, packageRoot = root) {
  const gaps = [];
  const gap = (type, field, decision) => gaps.push({ type, field, decision });
  function source(field, type) {
    const s = project[field];
    const fields = ['fileKey', 'nodeId', 'revision', 'reviewedBy', 'verifiedAt', 'evidencePath', 'sha256'];
    if (!s || fields.some(key => typeof s[key] !== 'string' || !s[key].trim())) {
      gap(type, field, 'Нужны fileKey, nodeId, revision, reviewedBy, verifiedAt, evidencePath и SHA-256 локального доказательства.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(s.fileKey) || !/^\d+:\d+$/.test(s.nodeId) ||
        !Number.isFinite(Date.parse(s.verifiedAt)) || Date.parse(s.verifiedAt) > Date.now() + 60000 || !/^[a-f0-9]{64}$/.test(s.sha256)) {
      gap(type, field, 'Некорректные идентификаторы, дата или SHA-256 источника.'); return;
    }
    try {
      const base = fs.realpathSync(path.join(packageRoot, 'profiles', project.id));
      const actual = fs.realpathSync(path.resolve(base, s.evidencePath));
      if (!actual.startsWith(base + path.sep) || !fs.statSync(actual).isFile() || sha(fs.readFileSync(actual)) !== s.sha256) throw new Error();
    } catch { gap(type, field, 'Доказательство отсутствует, выходит за профиль или не совпадает по SHA-256.'); }
  }
  source('designSystem', 'DESIGN_GAP');
  source('productContract', 'PRODUCT_GAP');
  source('compositionContract', 'DESIGN_GAP');
  const destination = project.destination;
  if (!destination || !/^[a-zA-Z0-9_-]+$/.test(destination.fileKey || '') || !/^\d+:\d+$/.test(destination.pageId || ''))
    gap('DESIGN_GAP', 'destination', 'Указать отдельный Figma-файл и страницу сдачи этой игры.');
  if (!project.viewportPolicy?.version || !Array.isArray(project.viewportPolicy?.sizes) || !project.viewportPolicy.sizes.length ||
      project.viewportPolicy.sizes.some(v => !Number.isInteger(v.width) || !Number.isInteger(v.height) || v.width <= 0 || v.height <= 0))
    gap('DESIGN_GAP', 'viewportPolicy', 'Согласовать версию и матрицу CSS viewport для текущей игры.');
  const registry = read(path.join(packageRoot, 'knowledge', 'rules.json'));
  const canonical = new Set(registry.rules.filter(r => r.status === 'canonical').map(r => r.id));
  for (const id of project.ruleIds) if (!canonical.has(id)) gap('DESIGN_GAP', 'ruleIds', `Правило ${id} отсутствует в каноническом процессе; кандидат требует решения.`);
  return { schema: 'verifier-preflight/1', profileId: project.id, status: gaps.length ? 'INCOMPLETE' : 'READY_FOR_REVIEW',
    scope: 'Проверены конфигурация источников и наличие локальных доказательств. Содержательная актуальность Figma, качество дизайна и приложение здесь не проверяются.',
    gaps, designSystemCompliance: 'INCOMPLETE', runtime: 'INCOMPLETE' };
}

export function context(id, packageRoot = root) {
  const project = loadProject(id, packageRoot);
  const registry = read(path.join(packageRoot, 'knowledge', 'rules.json'));
  const lessons = read(path.join(packageRoot, 'knowledge', 'lessons.json'));
  return { schema: 'verifier-context/1', profile: project, preflight: preflight(project, packageRoot),
    rulesVersion: registry.version,
    activeRules: registry.rules.filter(r => project.ruleIds.includes(r.id) && r.status === 'canonical'),
    candidatesRequiringDecision: registry.rules.filter(r => r.status === 'candidate'),
    lessons: lessons.lessons,
    workflow: [
      'Прочитать активные правила и релевантные уроки, проверить источники через Figma MCP; архивные ссылки не доказывают актуальность.',
      'Закрыть пробелы текущего экрана и составить контракт: цель, состояния, переходы, DS instances/variants, viewport, критерии сдачи.',
      'Собрать отдельную ревизию средствами Figma с применением профильных правил. Сборку выполняет агент/дизайнер.',
      'Исполнить применимые проверки компонентов; композицию, поведение и DS bindings проверить отдельно. Записать охват каждой проверки.',
      'Импортировать снимки, отчёты, fileKey/nodeId и измерения до/после; перечитать сохранённый импорт и сверить все SHA-256.',
      'Передать на визуальное/продуктовое ревью с видимыми FAIL/INCOMPLETE. После исправления создать следующую ревизию.',
      'Новый урок оформить кандидатом с доказательством; повысить до канона только после решения владельца в указанной области.'
    ] };
}

export function search(id, query, packageRoot = root) {
  const data = context(id, packageRoot);
  const terms = query.toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
  const items = [...data.activeRules, ...data.candidatesRequiringDecision, ...data.lessons];
  const matches = items.filter(item => terms.every(t => JSON.stringify(item).toLocaleLowerCase('ru').includes(t)));
  if (!terms.length) return matches;
  const historicalIds = [id, ...data.profile.historicalProfileIds];
  for (const profileId of historicalIds) {
    const docsRoot = path.join(packageRoot, 'profiles', profileId, 'source-repository', 'docs', 'mobile');
    const visit = directory => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, {withFileTypes:true}).sort((a,b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile() && entry.name.endsWith('.md') && fs.statSync(file).size <= 1024 * 1024) {
          const text = fs.readFileSync(file, 'utf8');
          const lower = text.toLocaleLowerCase('ru');
          if (terms.every(t => lower.includes(t)) && matches.filter(m => m.type === 'historical-document').length < 20) {
            const start = Math.max(0, lower.indexOf(terms[0]) - 100);
            matches.push({type:'historical-document', profileId, status:'historical-not-canonical',
              path:path.relative(packageRoot, file).replaceAll('\\','/'), excerpt:text.slice(start,start+500)});
          }
        }
      }
    };
    visit(docsRoot);
    const statePath = path.join(packageRoot, 'profiles', profileId, 'data', 'state.json');
    if (fs.existsSync(statePath)) {
      const state = read(statePath);
      for (const audit of state.audits || []) if (terms.every(t => JSON.stringify(audit).toLocaleLowerCase('ru').includes(t))) {
        matches.push({type:'historical-audit', profileId, id:audit.id, status:audit.status, title:audit.title,
          capturedAt:audit.capturedAt, manifestHash:audit.manifestHash});
      }
    }
  }
  return matches;
}
