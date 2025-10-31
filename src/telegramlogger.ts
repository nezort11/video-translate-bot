import { Context, type Middleware, Telegraf, Telegram } from "telegraf";
// import type { Deunionize, PropOr } from "telegraf/typings/deunionize";
import { Deunionize, PropOr } from "telegraf/typings/core/helpers/deunionize";
import type { Update, UserFromGetMe, Message } from "telegraf/types";
import type { GetUpdateContent } from "telegraf/typings/context";
import { BOT_TOKEN, LOGGING_CHANNEL_CHAT_ID } from "./env";
import { logger } from "./logger";
import { botThrottler } from "./throttler";
import { formatDuration, formatFileSize } from "./utils";
import { round } from "lodash";

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
    ? `${ctx.from.first_name} ${ctx.from.last_name} (${ctx.from.username}, id ${ctx.from.id}, lang ${ctx.from.language_code})`
    : "";
  // dont forward user-sent videos/files/photos for privacy reasons
  if (
    "text" in ctx.message //&& ctx.message.text.includes("https")
  ) {
    // mask user links with plain hostname
    const maskedMessageText = ctx.message.text
      .replace(/https?:\/\/([^\s/.]+)\.[^\s]+/g, "<$1>")
      .replaceAll("@", "");
    await ctx.telegram.sendMessage(
      LOGGING_CHANNEL_CHAT_ID,
      `${fromInfo}\n${maskedMessageText}`
    );
  } else if ("video" in ctx.message) {
    const videoDuration = formatDuration(ctx.message.video.duration);
    const videoSize = ctx.message.video.file_size;
    const videoSizeMb = videoSize && formatFileSize(videoSize);
    await ctx.telegram.sendMessage(
      LOGGING_CHANNEL_CHAT_ID,
      `${fromInfo}\n[[video, ${videoDuration}, ${videoSizeMb}MB]]`
    );
  } else if ("video_note" in ctx.message) {
    const videoDuration = formatDuration(ctx.message.video_note.duration);
    await ctx.telegram.sendMessage(
      LOGGING_CHANNEL_CHAT_ID,
      `${fromInfo}\n[[video, ${videoDuration}]]`
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
      method !== "forwardMessage" &&
      // skip forwarding sent media messages (videos/audios)
      !(
        "video" in oldCallApiResponse ||
        "video_note" in oldCallApiResponse ||
        "audio" in oldCallApiResponse ||
        "voice" in oldCallApiResponse
      )
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
