import { bot } from "./bot";

const LONG_SPACE_CHARACTER = " ";

export const createDescription = (icon: string, description: string) =>
  `${LONG_SPACE_CHARACTER}${icon}${LONG_SPACE_CHARACTER.repeat(
    2
  )}${description}`;

const commands = [
  // {
  //   command: "translate",
  //   description: {
  //     ru: createDescription("🌍", "Перевести видео на другой язык"),
  //     en: createDescription("🌍", "Translate video to another language"),
  //   },
  // },
  {
    command: "search",
    description: {
      ru: createDescription("🔍", "Искать видео на другом языке"),
      en: createDescription("🔍", "Search for videos on another language"),
    },
  },
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
  await Promise.all([
    // bot.telegram.setMyName(
    //   "Video Translator 🤖: voice-over 🔄 video translation 🇬🇧🇨🇳🇷🇺"
    // ),
    // bot.telegram.setMyName(
    //   "Видео Переводчик 🤖: закадровый 🔄 перевод видео с 🇬🇧🇨🇳🇯🇵🇰🇷",
    //   "ru"
    // ),

    // bot.telegram.setMyShortDescription(
    //   "🤖 best voice-over 🔄 video translation bot 🇬🇧🇨🇳🇪🇸🇸🇦🇯🇵🇰🇷 to 🇬🇧🇷🇺🇰🇿. ✅ work 24/7. 💬 contact @nezort11"
    // ),
    // bot.telegram.setMyShortDescription(
    //   "🤖 лучший бот для полного перевода видео 🔄 с 🇬🇧🇨🇳🇪🇸🇸🇦🇯🇵🇰🇷 языков. ✅ Работает 24/7. 💬 связь @nezort11",
    //   "ru"
    // ),

    // bot.telegram.setMyDescription(
    //   "[Beta🏗] 🤖 a bot for voice-over 🔄 video translation from 🇬🇧🇨🇳🇪🇸🇫🇷🇸🇦🇷🇺🇩🇪🇯🇵🇰🇷 to 🇬🇧🇷🇺🇰🇿. ✅ Online 24/7 . 💬 feeback/contact @nezort11"
    // ),
    // bot.telegram.setMyDescription(
    //   "[Beta🏗] 🤖 Бот для озвученного 🔄 перевода видео с 🇬🇧🇨🇳🇪🇸🇫🇷🇸🇦🇷🇺🇩🇪🇯🇵🇰🇷 на 🇬🇧🇷🇺🇰🇿. ✅ Онлайн 24/7. 💬 Обратная связь/контакт @nezort11",
    //   "ru"
    // ),

    bot.telegram.setMyCommands(
      commands.map((command) => ({
        command: command.command,
        description: command.description.en,
      }))
      // { language_code: "en" }
    ),
    bot.telegram.setMyCommands(
      commands.map((command) => ({
        command: command.command,
        description: command.description.ru,
      })),
      { language_code: "ru" }
    ),
  ]);
};

main();
