import { Telegraf } from "telegraf";
import moment from "moment";
import { BOT_TOKEN } from "./constants";

const BOT_TIMEOUT = moment.duration(12, "hours").asMilliseconds(); // 1 hour video for 0.01x might take up to 12 hours

export const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: BOT_TIMEOUT });
