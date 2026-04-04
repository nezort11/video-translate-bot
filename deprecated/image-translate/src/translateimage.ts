import { setTimeout } from "node:timers/promises";
import fs from "fs/promises";

import puppeteer, { Browser, Page } from "puppeteer";
import dotenv from "dotenv";

// Time utilities
const duration = {
  seconds: (value: number): number => value * 1000,
  minutes: (value: number): number => value * 60 * 1000,
};

const IS_PRODUCTION = !!process.env.CHROME_USER_DATA_DIR;

if (!IS_PRODUCTION) {
  dotenv.config({ path: "./.env" });
}

const YANDEX_IMAGE_TRANSLATE_URL = "https://translate.yandex.ru/ocr";
const CHROME_USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR!;
const CHROME_DOWNLOADS_DIR = "./chrome_downloads";

let browser: Browser;
let page: Page;

const initTranslateImage = async () => {
  try {
    console.log("launching browser");
    browser = await puppeteer.launch({
      ...(IS_PRODUCTION
        ? {
            headless: true,
            executablePath: "/usr/bin/chromium",
          }
        : {
            headless: false,
            devtools: true,
          }),
      userDataDir: CHROME_USER_DATA_DIR,
      args: [
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        ...(IS_PRODUCTION ? ["--no-sandbox", "--disable-setuid-sandbox"] : []),
      ],
      protocolTimeout: duration.minutes(5), // Chrome DevTools Protocol timeout
    });
    console.log("creating new page");
    page = await browser.newPage();

    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: CHROME_DOWNLOADS_DIR,
    });

    console.log("opening image translate page");
    const translatePageResponse = await page.goto(YANDEX_IMAGE_TRANSLATE_URL);
    if (translatePageResponse && translatePageResponse.status() >= 400) {
      throw new ImageTranslatePageResponseError();
    }
    console.log("getting image translate content");
    const content = await translatePageResponse?.text();
    if (content?.includes("captcha")) {
      throw new ImageTranslateCaptchaError();
    }
    console.log("successfully opened image translate page without captcha");
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
    console.log("initing image translate browser");
    await initTranslateImage();
  }

  await setTimeout(duration.seconds(3));
  const ocrUrlInputSelector = "#ocrUrlInput";
  await page.waitForSelector(ocrUrlInputSelector, {
    timeout: duration.seconds(20),
  });
  await page.focus(ocrUrlInputSelector);
  try {
    try {
      await page.keyboard.type(imageLink);
      await page.keyboard.press("Enter");

      await setTimeout(duration.seconds(5));
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
      timeout: duration.seconds(20),
    });
    try {
      await page.click(downloadButtonSelector);

      await setTimeout(duration.seconds(5));
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
