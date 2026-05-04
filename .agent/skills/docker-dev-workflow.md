# Скилл: Разработка в Docker с Hot-Reload

Для того чтобы избежать долгой сборки Docker-контейнеров при локальной разработке Node.js/TypeScript (ts-node), нужно:

1. **Создавать `compose.dev.yaml`** (или `docker-compose.override.yml`), который переопределяет команду запуска на dev-сервер (например, `pnpm dev`, который использует `nodemon`).
2. **Монтировать исходный код** (например, `- ../../:/app`), чтобы изменения на хосте сразу отражались в контейнере.
3. **Изолировать `node_modules`** через анонимные volume (например, `- /app/node_modules`), чтобы бинарники (типа `esbuild` или `ffmpeg`), собранные для macOS, не заменяли Linux-бинарники внутри контейнера.
4. **Использовать Makefile**, чтобы удобно вызывать `docker compose -f compose.yaml -f compose.dev.yaml up -d` (например, команда `make up-dev`).

Это правило уже применено: добавлен файл `packages/video-translate-bot/compose.dev.yaml` и команды `make up-dev`, `make down-dev`, `make logs-dev`. В будущем для других сервисов (например, `telegram-service` на Golang) можно применять аналогичный подход (монтировать код и запускать `air` или аналог).
