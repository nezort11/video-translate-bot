import moment from "moment";
import { BOT_TOKEN, EXECUTION_TIMEOUT } from "./env";
import { Telegraf } from "telegraf";
import { SceneActionContext } from "./actions";
// import { BotTelegraf } from "./botclient";

// const BOT_TIMEOUT = moment.duration(12, "hours").asMilliseconds(); // 1 hour video for 0.01x might take up to 12 hours

// trigger timeout handler 30 seconds before execution timeout
const BOT_TIMEOUT = moment
  .duration(EXECUTION_TIMEOUT - 30, "seconds")
  .asMilliseconds();

// extend bot context from action scene context
type BotContext = SceneActionContext;

export const bot = new Telegraf<BotContext>(BOT_TOKEN, {
  // REQUIRED for `sendChatAction` to work in serverless/webhook environment https://github.com/telegraf/telegraf/issues/1047
  telegram: { webhookReply: false },
  // handlerTimeout: BOT_TIMEOUT,
});
