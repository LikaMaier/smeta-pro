# СМЕТА PRO — заметки для разработки

Перед каждым пушем в `main` (Railway выкладывает сразу):
1. `node --import <tsx>/dist/loader.mjs --test tests/*.test.ts` — тесты.
2. `TSX_LOADER=<tsx>/dist/loader.mjs sh scripts/smoke-server.sh` — все модули сервера загружаются без ошибок
   (ловит падение при запуске, например «Cannot access X before initialization»; 18.10.2026 так упал прод).
3. После деплоя — проверить логи Railway: «Server listening» и нет ReferenceError/TypeError.

## Посмотреть экраны перед выкладкой

`scripts/preview/` — сборка приложения с мок-сервером и скриншоты «как на телефоне» (см. README там же):
`node scripts/preview/build.mjs && python3 scripts/preview/serve.py & node scripts/preview/shot.mjs scripts/preview/example.mjs`.
Сборка заодно ловит синтаксические ошибки в `web/src` (на Railway их поймал бы только `vite build`).

## Правила, которые легко сломать

- Служебные пометки строк («Примерная цена — проверьте», «проверьте у своего поставщика») заказчику не показываются:
  всё, что уходит в PDF / ссылку / Excel заказчика, проходит через `publicNote()` (`shared/notes.ts`).
- Поле мастера с `showIf` при скрытии считается по значению по умолчанию. Скрывать можно только поле, которое при этом
  не влияет на расчёт (или по умолчанию равно 0) — проверяет `tests/visibility.test.ts`.
- Подсказки «Часто забывают» (`shared/forgotten.ts`): корни слов — только через `ws()` (начало слова), иначе
  «укладка» срабатывает как «кладка», а «защита» — как «щит».
