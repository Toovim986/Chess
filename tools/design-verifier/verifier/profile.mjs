import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadProfile(profileId = process.env.VERIFIER_PROFILE || 'chess') {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profileId)) throw new Error('Недопустимый профиль');
  const profileRoot = path.join(packageRoot, 'profiles', profileId);
  const profilesRoot = fs.realpathSync(path.join(packageRoot, 'profiles'));
  const actualRoot = fs.realpathSync(profileRoot);
  if (!actualRoot.startsWith(profilesRoot + path.sep)) throw new Error('Профиль выходит за каталог profiles');
  const config = JSON.parse(fs.readFileSync(path.join(actualRoot, 'runtime.json'), 'utf8'));
  if (config.profileId !== profileId || !Array.isArray(config.cases) || !Array.isArray(config.boards)) throw new Error('Некорректный runtime.json');
  return { profileId, profileRoot: actualRoot, config,
    engineRoot: path.join(packageRoot, 'engine'), evidenceRoot: path.join(actualRoot, 'evidence'),
    importRoot: path.join(actualRoot, 'incoming'), dataDir: path.join(actualRoot, 'data') };
}

export function unavailableViewport() {
  return { policy: null, result: { status: 'INCOMPLETE', designStatus: 'INCOMPLETE', checkedScreens: 0, coverage: [],
    findings: [{ code: 'PROFILE_VIEWPORT_PENDING', severity: 'incomplete', title: 'Контракт viewport ещё не подключён',
      detail: 'Нужны утверждённые размеры, критические элементы и измерения среды для этого проекта.' }],
    capturedAt: null, evidenceKind: 'unavailable', inputHash: null, ruleVersion: null } };
}
