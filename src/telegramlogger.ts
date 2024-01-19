import { Context, type Middleware, Telegraf, Telegram } from "telegraf";
import type { Deunionize, PropOr } from "telegraf/typings/deunionize";
import type { Update, UserFromGetMe, Message } from "telegraf/types";
import type { GetUpdateContent } from "telegraf/typings/context";
import { BOT_TOKEN, LOGGING_CHANNEL_CHAT_ID } from "./constants";
import { logger } from "./logger";
import { botThrottler } from "./throttler";

const bot = new Telegraf(BOT_TOKEN);
bot.use(botThrottler);

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

export const telegramLoggerForwardMessage = async (
  context: Context,
  message: Message
) => {
  if (context.chat) {
    try {
      return await context.telegram.forwardMessage(
        LOGGING_CHANNEL_CHAT_ID,
        context.chat.id,
        message.message_id
      );
    } catch (error) {
      logger.warn(error);
    }
  }
};

export const telegramLoggerIncomingMiddleware: Middleware<Context> = async (
  ctx,
  next
) => {
  if (!ctx.callbackQuery) {
    (async () => {
      try {
        await ctx.forwardMessage(LOGGING_CHANNEL_CHAT_ID);
      } catch {}
    })();
  }

  return await next();
};

export const telegramLoggerOutcomingMiddleware: Middleware<Context> = async (
  ctx,
  next
) => {
  const oldCallApi = ctx.telegram.callApi.bind(ctx.telegram);
  const newCallApi: typeof ctx.telegram.callApi = async function newCallApi(
    this: typeof ctx.telegram,
    method,
    payload,
    { signal } = {}
  ) {
    const oldCallApiResponse = await oldCallApi(method, payload, { signal });

    if (
      typeof oldCallApiResponse === "object" &&
      "message_id" in oldCallApiResponse &&
      // don't forward forwarded messages (recursion)
      // only forward messages forwarded to bot (not from bot)
      method !== "forwardMessage"
    ) {
      setTimeout(
        async () =>
          await telegramLoggerForwardMessage(
            ctx,
            oldCallApiResponse as Message
          ),
        1000
      );
    }

    return oldCallApiResponse;
  };

  ctx.telegram.callApi = newCallApi.bind(ctx.telegram);
  return await next();
};
