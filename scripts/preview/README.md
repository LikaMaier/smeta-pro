# Предпросмотр экранов без сервера и базы

Собирает веб-приложение с **мок-сервером в памяти** и снимает экраны «как на телефоне» в headless Chrome.
Нужен, чтобы перед выкладкой посмотреть глазами, что экран не развалился (у разработки нет доступа к боевому приложению — оно открывается только из Telegram).

```
node scripts/preview/build.mjs                 # сборка в scripts/preview/dist
python3 scripts/preview/serve.py &             # http://127.0.0.1:5199/?dev=1
node scripts/preview/shot.mjs scripts/preview/example.mjs /tmp/smeta-shots
```

- `mock.ts` — ответы сервера: сметы, справочник (стартовые цены), шаблоны. Цифры считает тот же `shared/`, что и боевой сервер.
- `router-shim.tsx` — мини-замена `react-router-dom` (в окружении её нет).
- Пакеты (esbuild, react, playwright-core) берутся из `/opt/npm-tools/node_modules`; другой путь — переменная `NPM_TOOLS`.
- Проверка «страница не шире экрана»: `document.documentElement.scrollWidth` должен быть равен ширине окна (390).

В сборку приложения и в Docker-образ папка не входит.
