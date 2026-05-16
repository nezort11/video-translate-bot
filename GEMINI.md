# Project Instructions

Please adhere to the rules and guidelines defined in the `.agent/rules` directory for all tasks and modifications within this repository. These rules provide project-specific context and standards that take precedence.

- The GitHub CLI (`gh`) can be used to create pull requests when requested.
- **REQUIRED:** Use `git mv` for all file and directory moves to ensure proper history tracking.
- **ENVIRONMENT:** Built-in proxy logic has been removed. The bot must be run on a host with an active VPN (if running from Russia) or on a server located in a country where Telegram is not blocked.

## Git & Commits

- **Logical Separation:** NEVER bundle unrelated changes into a single commit. Divide work into small, atomic, and logically consistent commits.
- **Security:** Rigorously verify that NO secrets, credentials, or `.env` files are being staged. Always check `.gitignore` and `git status` before committing.

## Production Environment

**IMPORTANT:** The active production environment for the Video Translate Bot is a remote VPS (host alias: `egorindev`).

- Access via `ssh egorindev`.
- **Do NOT confuse with Yandex Cloud (YC).** While Terraform/YC files exist, they are not the primary production environment for this bot.
- For more details, activate the skill: `video-translate-bot-prod`.
