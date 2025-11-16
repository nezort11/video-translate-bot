import axios from "axios";
import { OPENAI_API_BASE_URL, OPENAI_API_KEY } from "../env";
import { logger } from "../logger";
import { inspect } from "util";

// Use axios directly instead of OpenAI SDK for better proxy compatibility
const apiClient = axios.create({
  baseURL: OPENAI_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  },
  timeout: 30000, // 30 second timeout
});

/**
 * Context for translating video-related content
 */
export interface VideoTranslationContext {
  /** The main text to translate (e.g., video title or channel name) */
  text: string;
  /** Target language code (e.g., "ru", "en", "es") */
  targetLanguage: string;
  /** Optional: Channel name for additional context */
  channelName?: string;
  /** Optional: Channel description for better understanding */
  channelDescription?: string;
  /** Optional: Video description for topical context */
  videoDescription?: string;
  /** Optional: Type of content being translated */
  contentType?: "title" | "channel_name" | "general";
}

/**
 * Get language name from language code
 */
const getLanguageName = (code: string): string => {
  const languageMap: Record<string, string> = {
    en: "English",
    ru: "Russian",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    hi: "Hindi",
    tr: "Turkish",
    pl: "Polish",
    uk: "Ukrainian",
    nl: "Dutch",
    sv: "Swedish",
    da: "Danish",
    no: "Norwegian",
    fi: "Finnish",
  };
  return languageMap[code.toLowerCase()] || code.toUpperCase();
};

/**
 * Build a context-aware prompt for GPT translation
 */
const buildTranslationPrompt = (context: VideoTranslationContext): string => {
  const {
    text,
    targetLanguage,
    channelName,
    channelDescription,
    videoDescription,
    contentType,
  } = context;

  const languageName = getLanguageName(targetLanguage);

  let prompt = `You are a professional translator specializing in video content translation. Your task is to translate the following text to ${languageName}.

IMPORTANT INSTRUCTIONS:
- Provide ONLY the translated text, without any explanations, notes, or additional commentary
- Preserve the original meaning and tone
- Keep the translation natural and culturally appropriate for ${languageName} speakers
- Maintain any proper nouns, brand names, or technical terms where appropriate
- If the text is already in ${languageName}, return it as-is
`;

  // Add content type specific instructions
  if (contentType === "title") {
    prompt += `- This is a video title, so keep it concise and engaging\n`;
  } else if (contentType === "channel_name") {
    prompt += `- This is a channel name, so preserve branding and style\n`;
  }

  // Add contextual information if available
  if (channelName || channelDescription || videoDescription) {
    prompt += `\nCONTEXTUAL INFORMATION (to help you understand the content better):\n`;

    if (channelName) {
      prompt += `Channel Name: ${channelName}\n`;
    }

    if (channelDescription) {
      // Limit description length to avoid token overflow
      const truncatedDescription =
        channelDescription.length > 500
          ? channelDescription.substring(0, 500) + "..."
          : channelDescription;
      prompt += `Channel Description: ${truncatedDescription}\n`;
    }

    if (videoDescription) {
      // Limit description length
      const truncatedDescription =
        videoDescription.length > 1000
          ? videoDescription.substring(0, 1000) + "..."
          : videoDescription;
      prompt += `Video Description: ${truncatedDescription}\n`;
    }
  }

  prompt += `\nTEXT TO TRANSLATE:\n${text}`;

  return prompt;
};

/**
 * Translate text using GPT API with contextual information
 *
 * This function provides high-quality translation by including additional context
 * like channel name, channel description, and video description when available.
 *
 * @param context - Translation context including text and optional metadata
 * @returns Translated text
 */
export const translateWithGPT = async (
  context: VideoTranslationContext
): Promise<string> => {
  try {
    logger.info(
      `Translating "${context.text}" to ${context.targetLanguage} using GPT`
    );

    const prompt = buildTranslationPrompt(context);

    // Try multiple models in order of preference
    // Based on ProxyAPI documentation: https://proxyapi.ru/docs/openai-models
    const modelsToTry = [
      // "gpt-5-mini",      // 400k context, supports caching, 30k RPM
      // "gpt-5-nano",      // 400k context, supports caching, 30k RPM (faster/cheaper)
      "gpt-4.1-mini", // 1M context, supports caching, 30k RPM
      "gpt-4.1-nano", // 1M context, supports caching, 30k RPM (faster/cheaper)
      "gpt-4o-mini", // Legacy model, 128k context
      "gpt-3.5-turbo", // Fallback option
    ];

    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        logger.info(`Attempting translation with model: ${model}`);

        // Some models (like gpt-5-*, gpt-4.1-*) only support default temperature (1.0)
        const supportsCustomTemperature =
          !model.startsWith("gpt-5") && !model.startsWith("gpt-4.1");

        // Prepare request payload
        const requestPayload: any = {
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a professional translator. Always respond with ONLY the translated text, no explanations or additional content.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_completion_tokens: 500, // Sufficient for titles and channel names
        };

        // Only set temperature if the model supports it
        if (supportsCustomTemperature) {
          requestPayload.temperature = 0.3; // Lower temperature for more consistent translations
        }

        const response = await apiClient.post(
          "v1/chat/completions",
          requestPayload
        );

        const translatedText =
          response.data.choices[0]?.message?.content?.trim();

        if (!translatedText) {
          logger.warn(`Model ${model} returned empty response`);
          continue;
        }

        logger.info(
          `Translation successful with ${model}: "${translatedText}"`
        );
        return translatedText;
      } catch (modelError: any) {
        lastError = modelError;
        const status = modelError?.response?.status || modelError?.status;
        const message =
          modelError?.response?.data?.error?.message ||
          modelError?.message ||
          "Unknown error";

        logger.warn(`Model ${model} failed:`, {
          status,
          message,
          data: inspect(modelError?.response?.data, { depth: null }),
        });

        // If it's not a 400 error, stop trying other models
        if (status && status !== 400) {
          throw modelError;
        }

        // Continue to next model
        continue;
      }
    }

    // If we get here, all models failed
    throw lastError || new Error("All models failed");
  } catch (error: any) {
    // Log detailed error information
    logger.error("GPT translation failed:", {
      message: error?.message,
      status: error?.status,
      type: error?.type,
      code: error?.code,
    });
    throw new Error(
      `GPT translation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * Simple text translation (backwards compatible with existing API)
 *
 * @param text - Text to translate
 * @param targetLanguageCode - Target language code
 * @returns Translated text
 */
export const translateTextWithGPT = async (
  text: string,
  targetLanguageCode: string
): Promise<string> => {
  return translateWithGPT({
    text,
    targetLanguage: targetLanguageCode,
    contentType: "general",
  });
};
