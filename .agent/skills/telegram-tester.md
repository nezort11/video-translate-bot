# Skill: Telegram Bot Tester

This skill provides a set of tools to interact with Telegram bots using a real Telegram service account. It is designed for end-to-end testing and verification of bot behavior, such as sending messages, inspecting responses, clicking inline buttons, and waiting for asynchronous updates.

## Tooling

The primary interface is a CLI tool located at `telegram-tester/tg_cli.sh`. All commands return structured JSON, making them easy to parse and act upon.

### Commands

#### 1. Send Message
Sends a text message to a specified bot.
```bash
./telegram-tester/tg_cli.sh send <bot_username> "/start"
```
**Output:** JSON object representing the sent message.

#### 2. List Messages
Retrieves the most recent messages from the conversation with the bot. Use this to find `message_id`s and button data.
```bash
./telegram-tester/tg_cli.sh list-messages <bot_username> --limit 5
```
**Output:** A list of JSON objects, each containing `id`, `text`, and `buttons`.

#### 3. Click Inline Button
Clicks an inline button on a specific message. Buttons are indexed starting from 0 (left-to-right, top-to-bottom).
```bash
./telegram-tester/tg_cli.sh click-button <bot_username> <message_id> <button_index>
```
**Output:** `{"status": "clicked", "button": "Button Text"}`

#### 4. Wait for Response
Waits for the bot to send a *new* message. This is essential for testing flows where the bot processes a command and responds later.
```bash
./telegram-tester/tg_cli.sh wait-response <bot_username> --timeout 30
```
**Output:** JSON object of the new message, or `{"error": "timeout"}` if no message arrives within the specified time.

## Verification Workflow

When verifying a bot feature, follow this general loop:

1.  **Trigger:** Use `send` or `click-button` to initiate an action.
2.  **Wait:** Use `wait-response` to capture the bot's immediate reaction.
3.  **Inspect:** If the bot sends multiple messages or you missed one, use `list-messages` to get the full state.
4.  **Interact:** Analyze the `buttons` array in the JSON output and use `click-button` to continue the flow.
5.  **Assert:** Check the `text` and `buttons` of the received messages against expected behavior.

## Environment Note
This tool requires a system-wide VPN to be active if running from a restricted network (like Russia), as it connects directly to Telegram's MTProto servers.
