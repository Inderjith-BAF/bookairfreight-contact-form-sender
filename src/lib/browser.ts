import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const VERCEL_CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

export async function launchBrowser(): Promise<Browser> {
  const localExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;

  if (process.env.VERCEL_ENV) {
    chromium.setGraphicsMode = false;

    // Vercel's function tracer can omit @sparticuz/chromium/bin/*.br assets.
    // Use the official v153 x64 pack as a remote source so the runtime does
    // not depend on those package-local binary files being present.
    const executablePath = await chromium.executablePath(
      process.env.CHROMIUM_PACK_URL || VERCEL_CHROMIUM_PACK_URL,
    );

    return puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: "shell",
      defaultViewport: {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
      },
    });
  }

  if (!localExecutable) {
    throw new Error(
      "PUPPETEER_EXECUTABLE_PATH is required for local browser automation.",
    );
  }

  return puppeteer.launch({
    executablePath: localExecutable,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
    },
  });
}
