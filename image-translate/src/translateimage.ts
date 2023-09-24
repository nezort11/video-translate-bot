import { setTimeout } from "node:timers/promises";
import fs from "fs/promises";

import puppeteer, { Browser, Page } from "puppeteer";
import moment from "moment";
import dotenv from "dotenv";

if (!process.env.CHROME_USER_DATA_DIR) {
  dotenv.config({ path: "./.env" });
}

const YANDEX_IMAGE_TRANSLATE_URL = "https://translate.yandex.ru/ocr";
const CHROME_USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR as string;
const CHROME_DOWNLOADS_DIR = "./chrome_downloads";

let browser: Browser;
let page: Page;

const initTranslateImage = async () => {
  try {
    browser = await puppeteer.launch({
      // headless: "new",
      headless: false,
      devtools: true,
      userDataDir: CHROME_USER_DATA_DIR,
      args: [
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
      ],
    });
    page = await browser.newPage();

    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: CHROME_DOWNLOADS_DIR,
    });

    const translatePageResponse = await page.goto(YANDEX_IMAGE_TRANSLATE_URL);
    if (translatePageResponse && translatePageResponse.status() >= 400) {
      throw new ImageTranslatePageResponseError();
    }
    const content = await translatePageResponse?.text();
    if (content?.includes("captcha")) {
      throw new ImageTranslateCaptchaError();
    }
  } catch (error) {
    console.error("Translate image init error");
    throw error;
  }
};

export class ImageTranslatePageResponseError extends Error {}
export class ImageTranslateCaptchaError extends Error {}
export class ImageTranslateTranslateError extends Error {}

export const translateImage = async (imageLink: string) => {
  if (!browser) {
    await initTranslateImage();
  }

  await setTimeout(moment.duration(3, "seconds").asMilliseconds());
  const ocrUrlInputSelector = "#ocrUrlInput";
  await page.waitForSelector(ocrUrlInputSelector, {
    timeout: moment.duration(20, "seconds").asMilliseconds(),
  });
  await page.focus(ocrUrlInputSelector);
  try {
    try {
      await page.keyboard.type(imageLink);
      await page.keyboard.press("Enter");

      await setTimeout(moment.duration(5, "seconds").asMilliseconds());
      const errorMessageElement = await page.$(".urlInput-errorMessage");
      if (errorMessageElement) {
        throw new ImageTranslateTranslateError();
      }
    } catch (error) {
      // Cleanup input on error
      const ocrUrlInput = await page.$('.button[data-action="resetImage"]');
      if (ocrUrlInput) {
        await ocrUrlInput.focus();
        await ocrUrlInput.click({ clickCount: 3 });
        await page.keyboard.press("Backspace");
      }
      throw error;
    }

    const downloadButtonSelector =
      '.button_type_download[data-tooltip-position="top"]';
    await page.waitForSelector(downloadButtonSelector, {
      timeout: moment.duration(20, "seconds").asMilliseconds(),
    });
    try {
      await page.click(downloadButtonSelector);

      await setTimeout(moment.duration(5, "seconds").asMilliseconds());
      // check if file is downloaded file
      const translatedImage = await fs.readFile(
        "./chrome_downloads/translated.jpg"
      );
      return translatedImage;
    } finally {
      await fs.rm(CHROME_DOWNLOADS_DIR, { recursive: true, force: true });
    }
  } finally {
    // Cleanup after image translate if necessary
    const resetImageButton = await page.$('.button[data-action="resetImage"]');
    if (resetImageButton) {
      const isResetImageButtonVisible = await resetImageButton.evaluate(
        (resetImageButtonElement) => {
          // https://stackoverflow.com/a/64306331/13774599
          function isElementVisible(element) {
            if (!element.ownerDocument || !element.ownerDocument.defaultView) {
              return true;
            }
            const style =
              element.ownerDocument.defaultView.getComputedStyle(element);
            if (!style || style.visibility === "hidden") {
              return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }

          return isElementVisible(resetImageButtonElement);
        }
      );
      if (isResetImageButtonVisible) {
        resetImageButton.click();
      }
    }
  }
};

const main = async () => {
  // const imageLink = process.argv[2];
  // if (!imageLink) {
  //   throw new Error("Please provide a image link to translate");
  // }
  const imageLink = "https://img.youtube.com/vi/7iy0wRTUZ58/maxresdefault.jpg";
  const translatedImage = await translateImage(imageLink);
  console.log("Image downloaded");
  process.exit(0);
};

if (require.main === module) {
  main();
}
