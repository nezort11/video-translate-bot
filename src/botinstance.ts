import { duration } from "./time";
import { BOT_TOKEN, EXECUTION_TIMEOUT } from "./env";
import { Telegraf } from "telegraf";
import { SceneActionContext, SceneActionSession } from "./actions";
import {
  SceneContextScene,
  WizardContext,
  WizardSessionData,
} from "telegraf/scenes";
// import { BotTelegraf } from "./botclient";

// const BOT_TIMEOUT = duration.hours(12); // 1 hour video for 0.01x might take up to 12 hours

// trigger timeout handler 30 seconds before serverless function/container execution timeout
const BOT_TIMEOUT = duration.seconds(EXECUTION_TIMEOUT - 30);

// extend bot context from action scene and wizard context

export interface BotContext
  extends Omit<SceneActionContext, "scene">,
    WizardContext<WizardSessionData> {
  session: SceneActionSession; // Ensure session is always present and satisfies both types
  scene: SceneContextScene<BotContext, WizardSessionData>; // Ensure compatibility with WizardContext
}

export const bot = new Telegraf<BotContext>(BOT_TOKEN, {
  // REQUIRED for `sendChatAction` to work in serverless/webhook environment https://github.com/telegraf/telegraf/issues/1047
  telegram: { webhookReply: false },
  // default telegraf handler timeout is 90 sec
  handlerTimeout: BOT_TIMEOUT,
});
