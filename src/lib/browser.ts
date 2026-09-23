import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export async function launchBrowser(): Promise<Browser> {
  const localExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.VERCEL_ENV) {
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: "shell",
      defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 }
    });
  }
  if (!localExecutable) throw new Error("PUPPETEER_EXECUTABLE_PATH is required for local browser automation.");
  return puppeteer.launch({
    executablePath: localExecutable,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 }
  });
}
