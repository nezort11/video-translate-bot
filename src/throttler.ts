import { telegrafThrottler } from "telegraf-throttler";
// import Bottleneck from "bottleneck";
import { duration } from "./time";

import { logger } from "./logger";

// currently uninstalled bottleneck package
const Bottleneck = {
  strategy: {
    LEAK: "LEAK",
  },
};

const inThrottleConfig = {
  highWater: 8, // max queue size (per chat)
  strategy: Bottleneck.strategy.LEAK, // forget about updates > queue
  maxConcurrent: 8, // max updates processed at the same time (per all chats)
  minTime: duration.seconds(0.3),
};
const inTranslateThrottleConfig = {
  highWater: 4, // max translate 4 videos in the queue (per chat)
  strategy: Bottleneck.strategy.LEAK,
  maxConcurrent: 1, // max 1 video at the same time because of low server (per all chats)
  minTime: duration.seconds(0.3),
};

// https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this
const outPrivateChatThrottleConfig = {
  maxConcurrent: 1,
  minTime: duration.seconds(0.025),
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: duration.seconds(1),
};
const outGroupChatThrottleConfig = {
  maxConcurrent: 1,
  minTime: duration.seconds(0.3),
  reservoir: 20,
  reservoirRefreshAmount: 20,
  reservoirRefreshInterval: duration.seconds(60),
};

export const botThrottler = telegrafThrottler({
  in: inThrottleConfig,
  out: outPrivateChatThrottleConfig,
  group: outGroupChatThrottleConfig,
  inThrottlerError: async (context) =>
    logger.info("Dropping updates due to throttling queue"),
});

export const translateThrottler = telegrafThrottler({
  in: inTranslateThrottleConfig,
  out: outPrivateChatThrottleConfig,
  group: outGroupChatThrottleConfig,
  inThrottlerError: async (context) =>
    logger.info("Dropping updates due to throttling queue"),
});
