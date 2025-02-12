import { Context, type Middleware, Telegraf, Telegram } from "telegraf";
// import type { Deunionize, PropOr } from "telegraf/typings/deunionize";
import { Deunionize, PropOr } from "telegraf/typings/core/helpers/deunionize";
import type { Update, UserFromGetMe, Message } from "telegraf/types";
import type { GetUpdateContent } from "telegraf/typings/context";
import { BOT_TOKEN, LOGGING_CHANNEL_CHAT_ID } from "./env";
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

const forwardContextMessage = async (ctx: Context) => {
  // skip forward callback queries and other non-messages
  if (ctx.callbackQuery || !ctx.message) {
    return;
  }

  const fromInfo = ctx.from
    ? `${ctx.from.first_name} ${ctx.from.last_name} (id ${ctx.from.id})`
    : "";
  // dont forward user-sent videos/files/photos for privacy reasons
  if ("video" in ctx.message || "video_note" in ctx.message) {
    await ctx.telegram.sendMessage(
      LOGGING_CHANNEL_CHAT_ID,
      `${fromInfo}\n[[video]]`
    );
  } else if ("document" in ctx.message) {
    await ctx.telegram.sendMessage(
      LOGGING_CHANNEL_CHAT_ID,
      `${fromInfo}\n[[document]]`
    );
  } else if ("photo" in ctx.message) {
    await ctx.telegram.sendMessage(
      LOGGING_CHANNEL_CHAT_ID,
      `${fromInfo}\n[[photo]]`
    );
  } else {
    await ctx.forwardMessage(LOGGING_CHANNEL_CHAT_ID);
  }
};

export const telegramLoggerIncomingMiddleware: Middleware<Context> = async (
  ctx,
  next
) => {
  forwardContextMessage(ctx).catch((error) =>
    logger.warn("Proxy forward message error:", error)
  );

  return await next();
};

export const telegramLoggerOutgoingMiddleware: Middleware<Context> = async (
  ctx,
  next
) => {
  const oldCallApi = ctx.telegram.callApi.bind(ctx.telegram);
  const newCallApi: typeof ctx.telegram.callApi = async function newCallApi(
    this: typeof ctx.telegram, // fake this parameter for typization
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
