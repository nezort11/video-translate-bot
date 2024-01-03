import { bot } from "./bot";

import { Context, Telegram } from "telegraf";
import { Deunionize, PropOr } from "telegraf/typings/deunionize";
import { Update, UserFromGetMe } from "telegraf/types";
import { GetUpdateContent } from "telegraf/typings/context";
import { LOGGING_CHANNEL_CHAT_ID } from "./constants";

// https://github.com/telegraf/telegraf/blob/2847aec91d1fc088809ceb921ed25e513b07430e/src/context.ts#L1409
type Getter<U extends Deunionize<Update>, P extends string> = PropOr<
  GetUpdateContent<U>,
  P
>;

export class TelegramLoggerContext extends Context {
  constructor(readonly telegram: Telegram, readonly botInfo: UserFromGetMe) {
    super({} as any, telegram, botInfo);
  }

  get chat(): Getter<Deunionize<Update>, "chat"> {
    return {
      id: LOGGING_CHANNEL_CHAT_ID,
    } as any as Getter<Deunionize<Update>, "chat">;
  }
}

const tg = new Telegram(bot.telegram.token, bot.telegram.options);

export const telegramLoggerContext = new TelegramLoggerContext(
  tg,
  bot.botInfo!
);
