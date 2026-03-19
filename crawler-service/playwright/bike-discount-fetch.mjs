import { chromium } from "playwright-core";

const searchTerm = process.argv[2];

if (!searchTerm) {
  console.error("missing search term");
  process.exit(2);
}

const executablePath =
  process.env.BIKE_DISCOUNT_CHROME_PATH ||
  process.env.CHROME_EXECUTABLE_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/122.0.0.0 Safari/537.36";

let browser;

try {
  const searchTokens = searchTerm
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);

  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox"
    ]
  });

  const context = await browser.newContext({
    locale: "en-US",
    userAgent
  });
  const page = await context.newPage();

  await page.goto(`https://www.bike-discount.de/en/search?sSearch=${encodeURIComponent(searchTerm)}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });

  await page.waitForTimeout(4000);

  const results = await page.evaluate(searchTokens => {
    const pricePattern = /[\d.,]+\s*(?:€|\$|£|CHF)/gi;
    const cards = Array.from(document.querySelectorAll(".card.product-box.box-standard"));

    const products = cards
      .map(card => {
        const titleLink = card.querySelector(".product-title a[href]");
        const brand = card.querySelector(".product-title b")?.textContent?.trim() || null;
        const title = titleLink?.getAttribute("title")?.trim() || titleLink?.textContent?.replace(/\s+/g, " ").trim() || "";
        const fullName = [brand, title].filter(Boolean).join(" ").trim();
        const image = card.querySelector(".product-image-link img");
        const imageUrl = image?.getAttribute("data-src") || image?.getAttribute("src") || "";
        const href = titleLink?.href || "";
        const text = (card.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        const prices = Array.from(text.matchAll(pricePattern)).map(match => match[0]);
        const actions = Array.from(card.querySelectorAll("button, a.btn"))
          .map(el => (el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join(" ");

        const onSales = Boolean(card.querySelector(".badge-discount")) || /instead of/i.test(text);
        const onStock =
          !/sold out|out of stock|not available/i.test(text) &&
          (/add to shopping cart|choose variant/i.test(actions) || /ready for shipping|delivery time/i.test(text));

        return {
          brand,
          imageUrl,
          name: fullName,
          onSales,
          onStock,
          price: prices.at(-1) || "",
          productUrl: href
        };
      })
      .filter(product => product.name && product.price && product.productUrl);

    const allTokenMatches = products.filter(product => searchTokens.every(token => product.name.toLowerCase().includes(token)));

    if (allTokenMatches.length > 0) {
      return allTokenMatches;
    }

    return products.filter(product => searchTokens.some(token => product.name.toLowerCase().includes(token)));
  }, searchTokens);

  process.stdout.write(JSON.stringify(results));
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
} finally {
  if (browser) {
    await browser.close();
  }
}
