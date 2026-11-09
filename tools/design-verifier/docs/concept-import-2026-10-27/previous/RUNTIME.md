# Переносимый runtime Верификатора

Из корня самостоятельного инструмента:

```powershell
node verifier/server.mjs
```

По умолчанию открывается профиль `chess` на `http://127.0.0.1:43130`.
Профиль Poker с перенесённым архивом запускается отдельно:

```powershell
$env:VERIFIER_PROFILE = 'poker'
node verifier/server.mjs
```

Адрес Poker — `http://127.0.0.1:43131`. Порты отличаются от прежнего Poker runtime 43129. Node.js 20+ и Python 3.10+; установки npm-пакетов для сервиса нет. Для смены профиля перезапустите сервис с новым `VERIFIER_PROFILE`.

## Изоляция

`profiles/<id>/runtime.json` содержит источники, cases и подключаемый архив. Каждый профиль имеет собственные `data/` (журнал и неизменяемые ревизии), `incoming/` (новые файлы импорта), `evidence/` (исходные архивные снимки). `VERIFIER_DATA_DIR` переопределяет хранилище; уже помеченное хранилище другого профиля отклоняется. Историческое хранилище без profileId разрешено только для Poker. Сервис привязывается к loopback, не предназначен для сетевого многопользовательского размещения.

Общий движок находится в `engine/`. Poker viewport использует только свои `viewport-policy.json` и `viewport-input.json`. В профиле Chess контракт viewport пока отсутствует, поэтому результат INCOMPLETE. CLI `node verifier/viewport.mjs` следует `VERIFIER_PROFILE`; код 2 означает нехватку доказательств.

## Импорт ревизии

1. Положить отчёты и финальные PNG в `profiles/<id>/incoming/<revision>/`.
2. Подготовить манифест `verifier-design-audit/1`: `source/target` с точными fileKey/pageId, полный список screens с размерами и screenshotArtifact, sources, проверки checks, artifacts, limitations и findings. `artifact.path` — относительно **incoming**, например `revision-001/report.json`. Абсолютные пути, `..` за пределы incoming и symlink/junction наружу запрещены. Старый alias `docs/mobile` для новых API-импортов не используется.
3. Указать `parentAuditId` при исправлении ранее импортированной ревизии. Родитель должен существовать в текущем профиле. Обратные связи `screen.sourceIds` / `source.targetIds` должны совпадать; source может обозначать DS-компонент, а не обязательно desktop-экран. Текущая схема поддерживает один source file и один target file на ревизию; несколько файлов требуют отдельных ревизий.
4. Импортировать и проверить сохранённые байты:

```powershell
node verifier/agent.mjs import-audit --manifest manifest.json
node verifier/check-design-audit.mjs AUDIT_ID
```

`VERIFIER_PROFILE` должен совпадать с профилем сервиса; `VERIFIER_URL` позволяет указать иной адрес. Импорт копирует файлы в новую ревизию, сохраняет SHA-256 и исходную дату capturedAt. Импортированный FAIL/INCOMPLETE остаётся видимым. Старые manifest и артефакты читаются без переписывания, даже если originalPath содержит прежний `docs/mobile`.

`check-design-audit` проверяет скачанные байты манифеста и всех артефактов; поле storageVerification отделено от designAuditStatus. Проверка хранения не выполняет аудит дизайна и не заменяет просмотр изображений.

## Проверка исходного компонента

Задать case в runtime.json: id, name, source, target (пути в evidence), sourceRoot, targetRoot, sourcePage, targetPage, evidenceDate и description. `sourceFile/targetFile` задаются на уровне профиля. Для подтверждённого округления якорей отдельно установить `figmaRounding: true`; по умолчанию допуск не включён. UI запускает первый настроенный case; CLI позволяет выбрать любой case явно.

```powershell
node verifier/agent.mjs requests
node verifier/agent.mjs import --case CASE_ID --source source.json --target target.json --captured-at ACTUAL_ISO_TIMESTAMP
node verifier/agent.mjs run --case CASE_ID --grid 2
```

Снимки снимаются ассистентом через Figma с `engine/figma-capture.js`. Нет автоматической Figma-сессии или фоновой сборки макетов. Профиль Chess не содержит фиктивного кейса portrait.

## Реальные пределы проверки

- compare.py сверяет равномерно масштабированное дерево исходного компонента/графики. Это не алгоритм сборки или оценки mobile-first композиции.
- Проверяются геометрия, матрицы и ограниченный набор свойств. `boundVariables` исключаются; собранные textSegments не участвуют в сравнении. PASS здесь не доказывает соответствие токенам, всей типографике, эффектам, контурам, прототипу или продуктовым состояниям.
- pixel_grid.py проверяет целые пиксели и выбранный шаг сетки. Независимые исключения требуют явной причины.
- Импортированный дизайн-аудит хранит результаты автора отчёта; он не исполняет перечисленные проверки. Итог агрегируется из переданных check statuses и findings.
- Исторические Poker правила home/shop и геометрия нижней навигации не переносятся на Chess автоматически.
- Скриншоты и JSON проходят структурные проверки, но runtime не устанавливает истинность внешнего содержания доказательств. Финальная приёмка требует актуальных источников и визуального ревью.

## Проверки runtime

```powershell
node --test verifier/test/*.test.mjs
python -B -m unittest discover -s engine -p 'test_*.py' -v
```

Для настоящей браузерной проверки дополнительно установить Playwright в доступном окружении и передать полный путь пакета через `PLAYWRIGHT_MODULE`, затем `node verifier/test/browser-check.mjs`. Браузерный тест использует временное хранилище, проверяет пустой Chess, вкладки, сохранение пометки, ширину 390px и ошибки JavaScript. Он не запускается автоматически без браузерной зависимости.
