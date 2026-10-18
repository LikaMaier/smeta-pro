#!/bin/sh
# Проверка перед пушем: все модули сервера загружаются без ошибок (ловит падение при запуске,
# например «Cannot access X before initialization»). Пакеты подменяются заглушками во временной node_modules.
set -e
cd "$(dirname "$0")/.."
[ -d node_modules ] && HAD=1 || HAD=0
python3 scripts/smoke-stubs.py >/dev/null
node --import "${TSX_LOADER:-tsx}" scripts/smoke-server.mjs; RC=$?
[ "$HAD" = 0 ] && rm -rf node_modules
exit $RC
