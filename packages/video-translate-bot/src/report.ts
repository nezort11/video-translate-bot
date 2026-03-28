import { driver, TypedValues } from "./db";
import { REPORT_CHANNEL_CHAT_ID, BOT_TOKEN } from "./env";
import { logger } from "./logger";
import { Telegram } from "telegraf";

const tg = new Telegram(BOT_TOKEN);

/**
 * Generates and sends a daily translation summary report to Telegram
 */
export const generateDailyReport = async () => {
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 24 * 60 * 60;

  let events: any[] = [];

  await driver.tableClient.withSessionRetry(async (session) => {
    const result = await session.executeQuery(
      `DECLARE $since AS Uint64;
       SELECT event_type, payload FROM events WHERE created_at >= $since;`,
      {
        $since: TypedValues.uint64(dayAgo),
      }
    );

    events = result.resultSets[0].rows.map((row) => ({
      event_type: row.items[0].textValue,
      payload: JSON.parse(row.items[1].textValue || "{}"),
    }));
  });

  if (events.length === 0) {
    const msg = `📊 *Ежедневный отчет*\nЗа последние 24 часа событий не зафиксировано.`;
    await tg.sendMessage(REPORT_CHANNEL_CHAT_ID, msg, { parse_mode: "Markdown" });
    return "No events found.";
  }

  const stats = {
    success: {
      video_youtube: 0,
      video_mp4: 0,
      audio: 0,
      voice: 0,
      other: 0,
    },
    error: 0,
    total: events.length,
    topErrors: {} as Record<string, number>,
  };

  events.forEach((event) => {
    if (event.event_type === "translation_success") {
      const type = event.payload.type;
      const url = event.payload.url || "";
      const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");

      if (type === "video") {
        if (isYoutube) stats.success.video_youtube++;
        else stats.success.video_mp4++;
      } else if (type === "audio") {
        stats.success.audio++;
      } else if (type === "voice") {
        stats.success.voice++;
      } else {
        stats.success.other++;
      }
    } else if (event.event_type === "translation_error") {
      stats.error++;
      const errMsg = (event.payload.error || "unknown error")
        .split("\n")[0]
        .substring(0, 100);
      stats.topErrors[errMsg] = (stats.topErrors[errMsg] || 0) + 1;
    }
  });

  const topErrorsList = Object.entries(stats.topErrors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([msg, count]) => `• ${msg}: ${count}`)
    .join("\n");

  const reportDate = new Date().toLocaleDateString("ru-RU");
  const reportMessage = [
    `📊 *Ежедневный отчет (${reportDate})*`,
    "",
    `✅ *Успешных переводов: ${stats.total - stats.error}*`,
    `  📺 YouTube: ${stats.success.video_youtube}`,
    `  📹 MP4/Другое: ${stats.success.video_mp4}`,
    `  🎧 Аудио: ${stats.success.audio}`,
    `  🎤 Voice: ${stats.success.voice}`,
    "",
    `❌ *Ошибок: ${stats.error}*`,
    topErrorsList ? `Топ-3 причины:\n${topErrorsList}` : "",
    "",
    `👥 *Всего событий: ${stats.total}*`,
  ].filter(Boolean).join("\n");

  try {
    await tg.sendMessage(REPORT_CHANNEL_CHAT_ID, reportMessage, {
      parse_mode: "Markdown",
    });
    return "Report sent successfully.";
  } catch (err) {
    logger.error("Failed to send report to Telegram", err);
    throw err;
  }
};

/**
 * Handler for Yandex Cloud Function triggered by timer
 */
export const handler = async () => {
  logger.info("Starting daily report generation...");
  try {
    const result = await generateDailyReport();
    logger.info(result);
    return { statusCode: 200, body: result };
  } catch (error) {
    logger.error("Report generation failed", error);
    return { statusCode: 500, body: String(error) };
  }
};
