import { bot } from "./botinstance";
import { driver } from "./db";
import { importPTimeout } from "./utils";

const LONG_SPACE_CHARACTER = " ";

export const createDescription = (icon: string, description: string) =>
  `${LONG_SPACE_CHARACTER}${icon}${LONG_SPACE_CHARACTER.repeat(2)}${description}`;

const commands = [
  // {
  //   command: "translate",
  //   description: {
  //     ru: createDescription("🌍", "Перевести видео на другой язык"),
  //     en: createDescription("🌍", "Translate video to another language"),
  //   },
  // },
  // {
  //   command: "search",
  //   description: {
  //     ru: createDescription("🔍", "Искать видео на другом языке"),
  //     en: createDescription("🔍", "Search for videos on another language"),
  //   },
  // },
  // {
  //   command: "help",
  //   description: {
  //     ru: createDescription("💡", "Помощь по работе с ботом"),
  //     en: createDescription("💡", "Help about the bot"),
  //   },
  // },
  {
    command: "cancel",
    description: {
      ru: createDescription("🚫", "Отменить текущую операцию"),
      en: createDescription("🚫", "Cancel the current operation"),
    },
  },
];

const main = async () => {
  const { default: pTimeout } = await importPTimeout();
  const TIMEOUT = 15000; // 15 seconds per call

  const runWithLog = async (name: string, task: Promise<any>) => {
    console.log(`Starting: ${name}...`);
    try {
      await pTimeout(task, { milliseconds: TIMEOUT });
      console.log(`✅ Finished: ${name}`);
    } catch (error) {
      console.error(`❌ Failed: ${name}`, error);
      throw error;
    }
  };

  try {
    console.log("Initializing bot settings...");

    await Promise.all([
      runWithLog(
        "setName (default)",
        bot.telegram.setMyName(
          "Video Translator 🤖: voice-over 🔄 video translation 🇬🇧🇨🇳🇷🇺"
        )
      ),
      runWithLog(
        "setName (en)",
        bot.telegram.setMyName(
          "Video Translator 🤖: voice-over 🔄 video translation 🇬🇧🇨🇳🇷🇺",
          "en"
        )
      ),
      runWithLog(
        "setName (ru)",
        bot.telegram.setMyName(
          "Видео Переводчик 🤖: закадровый 🔄 перевод видео с 🇬🇧🇨🇳🇯🇵🇰🇷",
          "ru"
        )
      ),

      runWithLog(
        "setShortDescription (default)",
        bot.telegram.setMyShortDescription(
          "🤖 best voice-over 🔄 video translation bot 🇬🇧🇨🇳🇪🇸🇸🇦🇯🇵🇰🇷 to 🇬🇧🇷🇺🇰🇿. ✅ work 24/7. 💬 contact @vidtransnew"
        )
      ),
      runWithLog(
        "setShortDescription (en)",
        bot.telegram.setMyShortDescription(
          "🤖 best voice-over 🔄 video translation bot 🇬🇧🇨🇳🇪🇸🇸🇦🇯🇵🇰🇷 to 🇬🇧🇷🇺🇰🇿. ✅ work 24/7. 💬 contact @vidtransnew",
          "en"
        )
      ),
      runWithLog(
        "setShortDescription (ru)",
        bot.telegram.setMyShortDescription(
          "🤖 лучший бот для полного перевода видео 🔄 с 🇬🇧🇨🇳🇪🇸🇸🇦🇯🇵🇰🇷 языков. ✅ Работает 24/7. 💬 связь @vidtransnew",
          "ru"
        )
      ),

      runWithLog(
        "setDescription (default)",
        bot.telegram.setMyDescription(
          "🤖 best voice-over 🔄 video translation bot 🇬🇧🇨🇳🇪🇸🇸🇦🇯🇵🇰🇷 to 🇬🇧🇷🇺🇰🇿. ✅ work 24/7. 💬 contact @vidtransnew"
        )
      ),
      runWithLog(
        "setDescription (en)",
        bot.telegram.setMyDescription(
          "🤖 best voice-over 🔄 video translation bot 🇬🇧🇨🇳🇪🇸🇸🇦🇯🇵🇰🇷 to 🇬🇧🇷🇺🇰🇿. ✅ work 24/7. 💬 contact @vidtransnew",
          "en"
        )
      ),
      runWithLog(
        "setDescription (ru)",
        bot.telegram.setMyDescription(
          "🤖 лучший бот для полного перевода видео 🔄 с 🇬🇧🇨🇳🇪🇸🇸🇦🇯🇵🇰🇷 языков. ✅ Работает 24/7. 💬 связь @vidtransnew",
          "ru"
        )
      ),

      runWithLog(
        "setCommands (en)",
        bot.telegram.setMyCommands(
          commands.map((command) => ({
            command: command.command,
            description: command.description.en,
          })),
          { language_code: "en" }
        )
      ),
      runWithLog(
        "setCommands (ru)",
        bot.telegram.setMyCommands(
          commands.map((command) => ({
            command: command.command,
            description: command.description.ru,
          })),
          { language_code: "ru" }
        )
      ),

      runWithLog(
        "setChatMenuButton",
        bot.telegram.setChatMenuButton({ menuButton: { type: "default" } })
      ),
    ]);

    console.log("Successfully initialized bot.");
  } catch (error) {
    console.error("Error initializing bot:", error);
  } finally {
    console.log("Destroying DB driver...");
    try {
      await pTimeout(driver.destroy(), { milliseconds: 5000 });
      console.log("DB driver destroyed.");
    } catch (error) {
      console.error("Error destroying DB driver:", error);
    }
    process.exit(0);
  }
};

main().catch((err) => {
  console.error("Unhandle error in main:", err);
  process.exit(1);
});
