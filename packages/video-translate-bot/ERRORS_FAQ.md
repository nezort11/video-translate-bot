# Incidents Runbook

## RPCError: 406: AUTH_KEY_DUPLICATED

Сессии в телеграме закончились - нужно проверить ./env/telegram_sessions.json и если нужно сгенерировать еще дополнительные.

А также проверить store таблицу в YDB! -

https://console.yandex.cloud/folders/b1gjh7irh9poadr6llcg/ydb/databases/etn29aj5cptp508dsdsb/browse?path=%2Fstore

## ⚠️ System is currently at full capacity. 🕔 Please try again later...

Закончились свободные telegram клиентские сессии в YDB таблице.

## Не скачиваются youtube видео

Скорее всего протухла куки сессия для ютуба.

Открыть ютуб в отдельном профиле и следовать инструкции в репозитории youtube-downloader.

https://github.com/nezort11/ytdl-api/blob/8e66ffbe5578382b3c958f245dd99f3d78bd4bdd/cookies.txt.example#L1

## AxiosError: Request failed with status code 502 Status: 502 Bad Gateway – Response: {"errorMessage":"exit status 1","errorType":"UserCodeError"} – Code: ERR_BAD_RESPONSE

## 🚨 RPCError: 400: CHAT_RESTRICTED (caused by messages.SendMedia)

Канал был заблокирова телеграмом из-за переведенных видео
"This message couldn't be displayed on your device because it violates the Telegram Terms of Service"

Нужно создать новый чистый приватный канал, добавить необходимых ботов в качестве администраторов, и установить ID нового канала в STORAGE_CHANNEL_ID .env файле.
