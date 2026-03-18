import { chromium } from "playwright-core";

const searchTerm = process.argv[2];

if (!searchTerm) {
  console.error("missing search term");
  process.exit(2);
}

const executablePath =
  process.env.BIKE24_CHROME_PATH ||
  process.env.CHROME_EXECUTABLE_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/122.0.0.0 Safari/537.36";

let browser;

try {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"]
  });

  const context = await browser.newContext({
    locale: "en-US",
    userAgent
  });
  const page = await context.newPage();

  await page.goto(`https://www.bike24.com/search-result?searchTerm=${encodeURIComponent(searchTerm)}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });

  await page.waitForTimeout(5000);

  const results = await page.evaluate(() => {
    const pricePattern = /[\d.,]+\s*(?:€|\$|£|CHF)/gi;
    const productAnchors = Array.from(document.querySelectorAll('main a[href^="/p"][title]'));

    return productAnchors.map(anchor => {
      const texts = Array.from(anchor.querySelectorAll("div, span"))
        .map(el => (el.textContent || "").replace(/\u00a0/g, " ").trim())
        .filter(Boolean);
      const joinedText = texts.join(" ");
      const prices = Array.from(joinedText.matchAll(pricePattern)).map(match => match[0]);

      const title = (anchor.getAttribute("title") || "").trim();
      const brand =
        texts.find(text => text.length <= 40 && text === text.toUpperCase() && /[A-Z]/.test(text)) ||
        title.split(" ")[0] ||
        null;
      const price = prices.at(-1) || "";
      const imageUrl = anchor.querySelector("img")?.getAttribute("src") || "";
      const href = anchor.getAttribute("href") || "";
      const availabilityText = texts.find(text => /working days|available|delivery|in stock|ready/i.test(text)) || "";
      const onStock = availabilityText.length > 0 && !/not available|out of stock|sold out/i.test(availabilityText);
      const onSales = /instead of/i.test(joinedText) || texts.some(text => /^sale$/i.test(text) || /discount/i.test(text));

      return {
        brand,
        imageUrl,
        name: title,
        onSales,
        onStock,
        price,
        productUrl: href ? new URL(href, window.location.origin).toString() : ""
      };
    });
  });

  process.stdout.write(JSON.stringify(results));
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
} finally {
  if (browser) {
    await browser.close();
  }
}
