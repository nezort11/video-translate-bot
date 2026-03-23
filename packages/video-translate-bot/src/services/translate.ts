import axios from "axios";
import { YC_API_KEY, YC_FOLDER_ID } from "../env";

const TRANSLATE_API_URL =
  "https://translate.api.cloud.yandex.net/translate/v2/translate";

type TranslateTranslationData = {
  text: string;
  detectedLanguageCode: string;
};

type TranslateResponseData = {
  translations: TranslateTranslationData[];
};

export const translate = async (
  texts: string[],
  targetLanguageCode: string = "ru"
) => {
  const translateResponse = await axios.post<TranslateResponseData>(
    TRANSLATE_API_URL,
    {
      targetLanguageCode,
      texts,
      folder_id: YC_FOLDER_ID,
    },
    {
      headers: {
        Authorization: `Api-Key ${YC_API_KEY}`,
      },
    }
  );

  return translateResponse.data;
};
