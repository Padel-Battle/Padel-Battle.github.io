// Run with: node --test download.test.cjs
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const assert = require("node:assert/strict");
const { test } = require("node:test");

const html = readFileSync(join(__dirname, "download.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const landingScript = readFileSync(join(__dirname, "download-redirect.js"), "utf8");
const apple = "https://apps.apple.com/app/id6775545020";
const google = "https://play.google.com/store/apps/details?id=com.courtflow.padelbattle";

function openPage({ userAgent = "", platform = "", maxTouchPoints = 0, userAgentData, languages = ["en"], language = "en", search = "", blocked = false } = {}) {
  const elements = Object.fromEntries(["title", "description", "apple-label", "google-label", "status", "home", "stores", "app-store", "google-play"].map(id => [id, { textContent: "", setAttribute() {} }]));
  elements["app-store"].href = apple;
  elements["google-play"].href = google;
  const document = { documentElement: {}, getElementById: id => elements[id] };
  let destination = null;
  runInNewContext(script, {
    navigator: { userAgent, platform, maxTouchPoints, userAgentData, languages, language },
    document,
    location: { search, replace(url) { if (blocked) throw new Error("Navigation blocked"); destination = url; } },
    URLSearchParams,
  });
  return { destination, document, elements };
}

const devices = [
  ["Android Chrome", { userAgent: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36" }, google],
  ["Android Firefox", { userAgent: "Mozilla/5.0 (Android 16; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0" }, google],
  ["Android client hints", { userAgentData: { platform: "Android" } }, google],
  ["iPhone Safari", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" }, apple],
  ["iPhone Chrome", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/143.0.0.0 Mobile/15E148 Safari/604.1" }, apple],
  ["iPad mobile mode", { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15" }, apple],
  ["iPad desktop mode", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", platform: "MacIntel", maxTouchPoints: 5 }, apple],
  ["iPod", { userAgent: "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)" }, apple],
  ["iPhone in-app browser", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0.0]" }, apple],
  ["Android in-app browser", { userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 9; wv) AppleWebKit/537.36 Mobile Safari/537.36" }, google],
  ["macOS", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" }, null],
  ["Windows touchscreen", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 10 }, null],
  ["Linux", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux x86_64" }, null],
  ["unknown device", {}, null],
  ["Googlebot Android", { userAgent: "Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (compatible; Googlebot/2.1)" }, null],
  ["Facebook preview", { userAgent: "facebookexternalhit/1.1 iPhone" }, null],
  ["Telegram preview", { userAgent: "TelegramBot (like TwitterBot) Android" }, null],
];

for (const [name, input, destination] of devices) {
  test(`${name}: opens the correct store or keeps both choices`, () => {
    const page = openPage(input);
    assert.equal(page.destination, destination);
    assert.equal(page.elements["app-store"].href, apple);
    assert.equal(page.elements["google-play"].href, google);
  });
}

for (const [language, title] of [
  ["en-US", "Get Padel Battle"],
  ["uk-UA", "Завантажити Padel Battle"],
  ["pl-PL", "Pobierz Padel Battle"],
  ["es-ES", "Descarga Padel Battle"],
  ["de-DE", "Padel Battle herunterladen"],
  ["pt-PT", "Descarregar Padel Battle"],
  ["ar-SA", "تنزيل Padel Battle"],
]) {
  test(`${language}: localises the page and text direction`, () => {
    const page = openPage({ languages: [language] });
    assert.equal(page.document.title, title);
    assert.equal(page.elements.title.textContent, title);
    assert.equal(page.document.documentElement.lang, language.split("-")[0]);
    assert.equal(page.document.documentElement.dir, language.startsWith("ar") ? "rtl" : "ltr");
    for (const id of ["description", "apple-label", "google-label", "status", "home"]) assert.ok(page.elements[id].textContent);
  });
}

test("uses the first supported preferred language", () => {
  assert.equal(openPage({ languages: ["fr-FR", "uk-UA", "en"] }).document.documentElement.lang, "uk");
});

test("falls back to English for unsupported languages", () => {
  assert.equal(openPage({ languages: ["fr-FR"] }).document.documentElement.lang, "en");
});

test("uses navigator.language when languages is empty", () => {
  assert.equal(openPage({ languages: [], language: "uk-UA" }).document.documentElement.lang, "uk");
});

test("manual selection skips automatic navigation", () => {
  assert.equal(openPage({ userAgent: "Android", search: "?choose" }).destination, null);
  assert.equal(openPage({ userAgent: "iPhone", search: "?choose=1" }).destination, null);
});

test("blocked navigation leaves a usable localised fallback", () => {
  const page = openPage({ userAgent: "iPhone", languages: ["uk"], blocked: true });
  assert.equal(page.destination, null);
  assert.equal(page.elements.status.textContent, "Виберіть магазин для свого телефона.");
});

test("query strings cannot change the trusted store destination", () => {
  assert.equal(openPage({ userAgent: "Android", search: "?url=https://example.com" }).destination, google);
});

test("both stores remain available without JavaScript", () => {
  const markup = html.replace(/<script>[\s\S]*?<\/script>/g, "");
  assert.ok(markup.includes(`href="${apple}"`));
  assert.ok(markup.includes(`href="${google}"`));
  assert.ok(markup.includes("Choose the store for your phone."));
  assert.ok(markup.includes('name="robots" content="noindex, follow"'));
});

function openLanding(hash, search = "") {
  let destination = null;
  runInNewContext(landingScript, {
    window: { location: { hash, search, replace(url) { destination = url; } } },
  });
  return destination;
}

test("the existing shared anchor opens the download page", () => {
  assert.equal(openLanding("#download"), "download.html");
});

test("ordinary landing page visits keep the existing page", () => {
  for (const hash of ["", "#formats", "#how-it-works"]) assert.equal(openLanding(hash), null);
});

test("the landing redirect preserves manual store selection", () => {
  assert.equal(openLanding("#download", "?choose"), "download.html?choose");
});
