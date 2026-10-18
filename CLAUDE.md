# СМЕТА PRO — заметки для разработки

Перед каждым пушем в `main` (Railway выкладывает сразу):
1. `node --import <tsx>/dist/loader.mjs --test tests/*.test.ts` — тесты.
2. `TSX_LOADER=<tsx>/dist/loader.mjs sh scripts/smoke-server.sh` — все модули сервера загружаются без ошибок
   (ловит падение при запуске, например «Cannot access X before initialization»; 18.10.2026 так упал прод).
3. После деплоя — проверить логи Railway: «Server listening» и нет ReferenceError/TypeError.
