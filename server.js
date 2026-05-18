import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 3000;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "openid",
  "email",
].join(" ");
const DRIVE_PORTFOLIO_FILE = "stock-dashboard-portfolio.json";
const SESSION_COOKIE = "stocklab_drive_session";
const STATE_COOKIE = "stocklab_drive_state";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

const historyRangeConfig = {
  "1m": { range: "1mo", interval: "1d", label: "1M" },
  "6m": { range: "6mo", interval: "1d", label: "6M" },
  "1y": { range: "1y", interval: "1d", label: "1Y" },
  "5y": { range: "5y", interval: "1d", label: "5Y" },
  max: { range: "max", interval: "1wk", label: "Max" },
};

const quoteCache = new Map();
const QUOTE_CACHE_TTL_MS = 60_000;
const symbolAliases = new Map([
  ["APPL", "AAPL"],
]);

function securityHeaders() {
  return {
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; " +
      "base-uri 'self'; " +
      "object-src 'none'; " +
      "frame-ancestors 'none'; " +
      "form-action 'self'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "connect-src 'self';",
  };
}

function cleanSymbol(symbol) {
  const cleaned = String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
  return symbolAliases.get(cleaned) || cleaned;
}

function yahooSymbol(symbol) {
  return String(symbol || "").toUpperCase().replace(/\./g, "-");
}

function stooqSymbol(symbol) {
  const clean = String(symbol || "").toLowerCase();
  if (clean.includes(".")) {
    return `${clean.replace(/\./g, "_")}.us`;
  }
  if (clean.endsWith("usd")) {
    return clean;
  }
  return `${clean}.us`;
}

function secLookupSymbol(symbol) {
  return String(symbol || "").toUpperCase().replace(/\./g, "-");
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...headers,
  });
  res.end();
}

function configuredForDrive() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && SESSION_SECRET);
}

function shaKey() {
  return crypto.createHash("sha256").update(SESSION_SECRET).digest();
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function encryptPayload(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", shaKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(base64UrlEncode).join(".");
}

function decryptPayload(serialized) {
  if (!serialized) return null;
  try {
    const [ivPart, tagPart, dataPart] = String(serialized).split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", shaKey(), base64UrlDecode(ivPart));
    decipher.setAuthTag(base64UrlDecode(tagPart));
    const decrypted = Buffer.concat([decipher.update(base64UrlDecode(dataPart)), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function cookieBaseAttributes(req) {
  const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
  return [`Path=/`, `HttpOnly`, `SameSite=Lax`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

function setCookie(res, req, name, value, maxAgeSeconds) {
  const cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; ${cookieBaseAttributes(req)}`;
  const current = res.getHeader("Set-Cookie");
  const list = Array.isArray(current) ? current : current ? [current] : [];
  res.setHeader("Set-Cookie", [...list, cookie]);
}

function clearCookie(res, req, name) {
  setCookie(res, req, name, "", 0);
}

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  return `${proto}://${req.headers.host}`;
}

function getRedirectUri(req) {
  return `${getOrigin(req)}/api/drive/auth/callback`;
}

function getDriveSession(req) {
  const cookies = parseCookies(req);
  return decryptPayload(cookies[SESSION_COOKIE]) || null;
}

function setDriveSession(res, req, session) {
  setCookie(res, req, SESSION_COOKIE, encryptPayload(session), 60 * 60 * 24 * 30);
}

function setOauthState(res, req, payload) {
  setCookie(res, req, STATE_COOKIE, encryptPayload(payload), 60 * 10);
}

function getOauthState(req) {
  const cookies = parseCookies(req);
  return decryptPayload(cookies[STATE_COOKIE]) || null;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req) {
  const raw = await readRequestBody(req);
  return raw ? JSON.parse(raw) : {};
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, headers = {}, timeoutMs = 6_000) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "StockProjectionLab/2.0",
      Accept: "application/json",
      ...headers,
    },
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchText(url, timeoutMs = 6_000) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "StockProjectionLab/2.0",
      Accept: "text/plain,text/csv,*/*",
    },
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function exchangeGoogleCode(req, code) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: getRedirectUri(req),
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Could not finish Google sign-in.");
  }
  return data;
}

async function refreshGoogleAccessToken(session) {
  if (!session?.refreshToken) {
    throw new Error("Missing refresh token.");
  }

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: session.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Could not refresh Drive access.");
  }

  return {
    ...session,
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    scope: data.scope || session.scope,
    tokenType: data.token_type || session.tokenType || "Bearer",
  };
}

async function ensureDriveSession(req, res) {
  if (!configuredForDrive()) {
    throw new Error("Drive sync is not configured on the server.");
  }

  let session = getDriveSession(req);
  if (!session?.accessToken) {
    throw new Error("Drive is not connected.");
  }

  if (!session.expiresAt || session.expiresAt - Date.now() < 60_000) {
    session = await refreshGoogleAccessToken(session);
    setDriveSession(res, req, session);
  }

  return session;
}

async function driveFetchJson(req, res, url, options = {}) {
  const session = await ensureDriveSession(req, res);
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  }, 10_000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || data.error_description || `Drive request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

async function driveFetchText(req, res, url, options = {}) {
  const session = await ensureDriveSession(req, res);
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(options.headers || {}),
    },
  }, 10_000);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Drive request failed (${response.status})`);
  }
  return text;
}

function buildDriveMultipartBody(metadata, rawContent, boundary) {
  return [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    rawContent,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function findPortfolioFile(req, res) {
  const query = encodeURIComponent(`name='${DRIVE_PORTFOLIO_FILE.replace(/'/g, "\\'")}' and trashed=false`);
  const data = await driveFetchJson(
    req,
    res,
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`,
  );
  return data.files?.[0] || null;
}

async function readPortfolioFile(req, res, fileId) {
  const raw = await driveFetchText(req, res, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return JSON.parse(raw);
}

async function createPortfolioFile(req, res, payload) {
  const boundary = `stocklab_${crypto.randomBytes(8).toString("hex")}`;
  const body = buildDriveMultipartBody(
    {
      name: DRIVE_PORTFOLIO_FILE,
      parents: ["appDataFolder"],
      mimeType: "application/json",
    },
    JSON.stringify(payload),
    boundary,
  );

  const data = await driveFetchJson(
    req,
    res,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  return data;
}

async function updatePortfolioFile(req, res, fileId, payload) {
  const data = await driveFetchJson(
    req,
    res,
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,modifiedTime`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(payload),
    },
  );
  return data;
}

async function fetchFinnhub(symbol) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;

  const [quote, profile, metrics] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`),
    fetchJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`),
    fetchJson(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token}`),
  ]);

  if (!quote?.c) return null;

  const metric = metrics?.metric || {};
  const shareCount = profile?.shareOutstanding || metric.shareOutstanding || null;

  return {
    source: "Finnhub",
    symbol,
    price: quote.c,
    previousClose: quote.pc,
    open: quote.o,
    high: quote.h,
    low: quote.l,
    timestamp: quote.t ? quote.t * 1000 : Date.now(),
    name: profile?.name || symbol,
    exchange: profile?.exchange || "",
    industry: profile?.finnhubIndustry || "",
    sector: profile?.finnhubIndustry || "",
    marketCap: profile?.marketCapitalization ? profile.marketCapitalization * 1_000_000 : null,
    sharesOutstanding: shareCount,
    eps: metric.epsTTM || metric.epsInclExtraItemsTTM || null,
    revenueTtm: metric.revenuePerShareTTM && shareCount ? metric.revenuePerShareTTM * shareCount : null,
    peTtm: metric.peTTM || null,
    grossMargin: metric.grossMarginTTM || null,
    netMargin: metric.netProfitMarginTTM || null,
    beta: metric.beta || null,
    week52High: metric["52WeekHigh"] || null,
    week52Low: metric["52WeekLow"] || null,
  };
}

async function fetchAlphaVantage(symbol) {
  const token = process.env.ALPHA_VANTAGE_API_KEY;
  if (!token) return null;

  const [quote, overview] = await Promise.all([
    fetchJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${token}`),
    fetchJson(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${token}`),
  ]);

  const global = quote?.["Global Quote"];
  const price = Number(global?.["05. price"]);
  if (!price) return null;

  return {
    source: "Alpha Vantage",
    symbol,
    price,
    previousClose: Number(global?.["08. previous close"]) || null,
    open: Number(global?.["02. open"]) || null,
    high: Number(global?.["03. high"]) || null,
    low: Number(global?.["04. low"]) || null,
    timestamp: Date.now(),
    name: overview?.Name || symbol,
    exchange: overview?.Exchange || "",
    industry: overview?.Industry || "",
    sector: overview?.Sector || "",
    marketCap: Number(overview?.MarketCapitalization) || null,
    sharesOutstanding: Number(overview?.SharesOutstanding) ? Number(overview.SharesOutstanding) / 1_000_000 : null,
    eps: Number(overview?.EPS) || null,
    revenueTtm: Number(overview?.RevenueTTM) ? Number(overview.RevenueTTM) / 1_000_000 : null,
    peTtm: Number(overview?.PERatio) || null,
    grossMargin:
      Number(overview?.GrossProfitTTM) && Number(overview?.RevenueTTM)
        ? (Number(overview.GrossProfitTTM) / Number(overview.RevenueTTM)) * 100
        : null,
    netMargin: Number(overview?.ProfitMargin) ? Number(overview.ProfitMargin) * 100 : null,
    beta: Number(overview?.Beta) || null,
    week52High: Number(overview?.["52WeekHigh"]) || null,
    week52Low: Number(overview?.["52WeekLow"]) || null,
  };
}

async function fetchYahooFallback(symbol) {
  const modules = "price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile";
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol(symbol))}?modules=${modules}`,
  );
  const result = data?.quoteSummary?.result?.[0];
  if (!result?.price?.regularMarketPrice?.raw) return null;

  return {
    source: "Yahoo Finance delayed fallback",
    symbol,
    price: result.price.regularMarketPrice.raw,
    previousClose: result.summaryDetail?.previousClose?.raw || null,
    open: result.summaryDetail?.open?.raw || null,
    high: result.summaryDetail?.dayHigh?.raw || null,
    low: result.summaryDetail?.dayLow?.raw || null,
    timestamp: result.price.regularMarketTime ? result.price.regularMarketTime * 1000 : Date.now(),
    name: result.price.longName || result.price.shortName || symbol,
    exchange: result.price.exchangeName || result.price.exchange || "",
    industry: result.summaryProfile?.industry || "",
    sector: result.summaryProfile?.sector || "",
    marketCap: result.price.marketCap?.raw || null,
    sharesOutstanding: result.defaultKeyStatistics?.sharesOutstanding?.raw
      ? result.defaultKeyStatistics.sharesOutstanding.raw / 1_000_000
      : null,
    eps: result.defaultKeyStatistics?.trailingEps?.raw || result.defaultKeyStatistics?.forwardEps?.raw || null,
    revenueTtm: result.financialData?.totalRevenue?.raw ? result.financialData.totalRevenue.raw / 1_000_000 : null,
    peTtm: result.summaryDetail?.trailingPE?.raw || result.defaultKeyStatistics?.forwardPE?.raw || null,
    grossMargin: result.financialData?.grossMargins?.raw ? result.financialData.grossMargins.raw * 100 : null,
    netMargin: result.financialData?.profitMargins?.raw ? result.financialData.profitMargins.raw * 100 : null,
    beta: result.defaultKeyStatistics?.beta?.raw || null,
    week52High: result.summaryDetail?.fiftyTwoWeekHigh?.raw || null,
    week52Low: result.summaryDetail?.fiftyTwoWeekLow?.raw || null,
  };
}

async function fetchYahooChartQuoteFallback(symbol) {
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=5d&interval=1d&includePrePost=false`,
  );
  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const quote = result?.indicators?.quote?.[0] || {};
  const timestamps = result?.timestamp || [];
  const lastClose = [...(quote.close || [])].reverse().find((value) => Number.isFinite(Number(value)));
  const price = Number(meta.regularMarketPrice) || Number(lastClose);
  if (!price) return null;

  return {
    source: "Yahoo Finance chart fallback",
    symbol,
    price,
    previousClose: Number(meta.previousClose) || null,
    open: Number(meta.regularMarketOpen) || Number(quote.open?.[quote.open.length - 1]) || null,
    high: Number(meta.regularMarketDayHigh) || Number(quote.high?.[quote.high.length - 1]) || null,
    low: Number(meta.regularMarketDayLow) || Number(quote.low?.[quote.low.length - 1]) || null,
    timestamp: timestamps.length ? timestamps[timestamps.length - 1] * 1000 : Date.now(),
    name: meta.longName || meta.shortName || symbol,
    exchange: meta.exchangeName || "",
    industry: "",
    sector: "",
    marketCap: null,
    sharesOutstanding: null,
    eps: null,
    revenueTtm: null,
    peTtm: null,
    grossMargin: null,
    netMargin: null,
    beta: null,
    week52High: Number(meta.fiftyTwoWeekHigh) || null,
    week52Low: Number(meta.fiftyTwoWeekLow) || null,
    volume: Number(quote.volume?.[quote.volume.length - 1]) || null,
  };
}

function latestFact(facts, tags, unit, preferredForms = ["10-K", "10-Q"]) {
  const tagList = Array.isArray(tags) ? tags : [tags];
  const candidates = [];
  for (const tag of tagList) {
    const rows = facts?.["us-gaap"]?.[tag]?.units?.[unit] || [];
    rows.forEach((row) => {
      if (Number.isFinite(Number(row.val)) && preferredForms.includes(row.form)) {
        candidates.push(row);
      }
    });
  }
  candidates.sort((a, b) => {
    const dateCompare = String(b.end || "").localeCompare(String(a.end || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(b.filed || "").localeCompare(String(a.filed || ""));
  });
  return candidates[0]?.val || null;
}

async function fetchSecCompanyFacts(symbol) {
  const tickers = await fetchJson("https://www.sec.gov/files/company_tickers.json", {
    "User-Agent": "StockProjectionLab/2.0 support@example.com",
  }, 8_000);
  const lookup = secLookupSymbol(symbol);
  const company = Object.values(tickers).find((item) => item.ticker?.toUpperCase() === lookup);
  if (!company?.cik_str) return null;

  const cik = String(company.cik_str).padStart(10, "0");
  const facts = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    "User-Agent": "StockProjectionLab/2.0 support@example.com",
  }, 8_000);
  const revenue =
    latestFact(facts.facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"], "USD", ["10-K"]) ||
    latestFact(facts.facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"], "USD");
  const netIncome =
    latestFact(facts.facts, "NetIncomeLoss", "USD", ["10-K"]) ||
    latestFact(facts.facts, "NetIncomeLoss", "USD");
  const eps =
    latestFact(facts.facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares", ["10-K"]) ||
    latestFact(facts.facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares");
  const shares =
    latestFact(
      facts.facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"],
      "shares",
      ["10-K"],
    ) ||
    latestFact(
      facts.facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"],
      "shares",
    );

  return {
    name: facts.entityName || company.title || symbol,
    revenueTtm: revenue ? Number(revenue) / 1_000_000 : null,
    eps: eps ? Number(eps) : null,
    sharesOutstanding: shares ? Number(shares) / 1_000_000 : null,
    netMargin: revenue && netIncome ? (Number(netIncome) / Number(revenue)) * 100 : null,
  };
}

async function fetchStooqFallback(symbol) {
  const csv = await fetchText(`https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol(symbol))}&f=sd2t2ohlcv&h&e=csv`, 4_500);
  const [, row] = csv.trim().split(/\r?\n/);
  if (!row) return null;
  const [returnedSymbol, date, time, open, high, low, close, volume] = row.split(",");
  const price = Number(close);
  if (!price || close === "N/D") return null;

  let sec = null;
  try {
    sec = await fetchSecCompanyFacts(symbol);
  } catch {
    sec = null;
  }

  const sharesOutstanding = sec?.sharesOutstanding || null;
  const eps = sec?.eps || null;
  return {
    source: "Stooq delayed price fallback",
    symbol,
    price,
    previousClose: null,
    open: Number(open) || null,
    high: Number(high) || null,
    low: Number(low) || null,
    timestamp: date && time ? new Date(`${date}T${time}`).getTime() : Date.now(),
    name: sec?.name || returnedSymbol || symbol,
    exchange: "US delayed",
    industry: "",
    sector: "",
    marketCap: sharesOutstanding ? price * sharesOutstanding * 1_000_000 : null,
    sharesOutstanding,
    eps,
    revenueTtm: sec?.revenueTtm || null,
    peTtm: eps ? price / eps : null,
    grossMargin: null,
    netMargin: sec?.netMargin || null,
    beta: null,
    week52High: null,
    week52Low: null,
    volume: Number(volume) || null,
  };
}

async function fetchHistoricalYahoo(symbol, rangeKey) {
  const chosen = historyRangeConfig[rangeKey] || historyRangeConfig["5y"];
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=${chosen.range}&interval=${chosen.interval}&includePrePost=false`,
  );
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp?.length) return null;

  const quote = result.indicators?.quote?.[0] || {};
  const points = result.timestamp
    .map((timestamp, index) => ({
      date: timestamp * 1000,
      open: Number(quote.open?.[index]) || null,
      high: Number(quote.high?.[index]) || null,
      low: Number(quote.low?.[index]) || null,
      close: Number(quote.close?.[index]) || null,
      volume: Number(quote.volume?.[index]) || null,
    }))
    .filter((point) => Number.isFinite(point.close));

  if (!points.length) return null;

  return {
    source: "Yahoo Finance history",
    symbol: result.meta?.symbol || symbol,
    name: result.meta?.longName || result.meta?.shortName || symbol,
    currency: result.meta?.currency || "USD",
    exchange: result.meta?.exchangeName || "",
    range: rangeKey,
    rangeLabel: chosen.label,
    points,
  };
}

async function handleGoogleAuthStart(req, res) {
  if (!configuredForDrive()) {
    sendJson(res, 501, {
      error: "Drive sync is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET in Render.",
    });
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  setOauthState(res, req, { state, redirectUri: getRedirectUri(req), createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(req),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
    state,
  });
  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function handleGoogleAuthCallback(req, res, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getOauthState(req);

  if (!code || !state || !savedState || savedState.state !== state) {
    clearCookie(res, req, STATE_COOKIE);
    redirect(res, "/?drive=error");
    return;
  }

  try {
    const tokens = await exchangeGoogleCode(req, code);
    const existing = getDriveSession(req) || {};
    const session = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || existing.refreshToken || null,
      expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
      scope: tokens.scope || DRIVE_SCOPES,
      tokenType: tokens.token_type || "Bearer",
    };
    setDriveSession(res, req, session);
    clearCookie(res, req, STATE_COOKIE);
    redirect(res, "/?drive=connected#portfolio");
  } catch {
    clearCookie(res, req, STATE_COOKIE);
    redirect(res, "/?drive=error#portfolio");
  }
}

async function handleDriveAuthStatus(req, res) {
  if (!configuredForDrive()) {
    sendJson(res, 200, { connected: false, configured: false });
    return;
  }

  try {
    await ensureDriveSession(req, res);
    const file = await findPortfolioFile(req, res);
    sendJson(res, 200, {
      connected: true,
      configured: true,
      fileId: file?.id || null,
      remoteUpdatedAt: file?.modifiedTime || null,
      remoteRevision: file?.modifiedTime || null,
    });
  } catch {
    sendJson(res, 200, { connected: false, configured: true });
  }
}

async function handleDriveLogout(req, res) {
  clearCookie(res, req, SESSION_COOKIE);
  clearCookie(res, req, STATE_COOKIE);
  sendJson(res, 200, { ok: true });
}

async function handleDrivePortfolioLoad(req, res) {
  const file = await findPortfolioFile(req, res);
  if (!file?.id) {
    sendJson(res, 404, { error: "No private Drive portfolio file exists yet." });
    return;
  }

  const portfolio = await readPortfolioFile(req, res, file.id);
  sendJson(res, 200, {
    fileId: file.id,
    remoteUpdatedAt: file.modifiedTime || portfolio.updatedAt || null,
    remoteRevision: file.modifiedTime || portfolio.updatedAt || null,
    portfolio,
  });
}

async function handleDrivePortfolioSave(req, res) {
  const body = await readJsonBody(req);
  const portfolio = body?.portfolio;
  const clientRemoteUpdatedAt = body?.remoteUpdatedAt || null;
  const force = Boolean(body?.force);

  if (!portfolio || !Array.isArray(portfolio.trades)) {
    sendJson(res, 400, { error: "Portfolio payload must include a trades array." });
    return;
  }

  const existing = await findPortfolioFile(req, res);
  if (
    existing?.modifiedTime &&
    clientRemoteUpdatedAt &&
    !force &&
    new Date(existing.modifiedTime).getTime() > new Date(clientRemoteUpdatedAt).getTime()
  ) {
    sendJson(res, 409, {
      error: "The private Drive copy is newer than the local cache.",
      remoteUpdatedAt: existing.modifiedTime,
      remoteRevision: existing.modifiedTime,
      fileId: existing.id,
    });
    return;
  }

  const saved = existing?.id
    ? await updatePortfolioFile(req, res, existing.id, portfolio)
    : await createPortfolioFile(req, res, portfolio);

  sendJson(res, 200, {
    ok: true,
    fileId: saved.id,
    remoteUpdatedAt: saved.modifiedTime || portfolio.updatedAt || new Date().toISOString(),
    remoteRevision: saved.modifiedTime || portfolio.updatedAt || new Date().toISOString(),
  });
}

async function handleStockApi(res, symbol) {
  const clean = cleanSymbol(symbol);
  if (!clean) {
    sendJson(res, 400, { error: "Missing ticker symbol." });
    return;
  }

  const cached = quoteCache.get(clean);
  if (cached && cached.expiresAt > Date.now()) {
    sendJson(res, 200, { ...cached.payload, cached: true });
    return;
  }

  const errors = [];
  for (const provider of [fetchFinnhub, fetchAlphaVantage, fetchYahooChartQuoteFallback, fetchYahooFallback, fetchStooqFallback]) {
    try {
      const data = await provider(clean);
      if (data) {
        const payload = { ...data, fetchedAt: new Date().toISOString() };
        quoteCache.set(clean, {
          payload,
          expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
        });
        sendJson(res, 200, payload);
        return;
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  sendJson(res, 502, {
    error: "Could not fetch reliable stock data for this ticker.",
    details: errors,
  });
}

async function handleHistoryApi(res, symbol, rangeKey) {
  const clean = cleanSymbol(symbol);
  if (!clean) {
    sendJson(res, 400, { error: "Missing ticker symbol." });
    return;
  }

  try {
    const data = await fetchHistoricalYahoo(clean, rangeKey);
    if (!data) {
      sendJson(res, 404, { error: "Historical data unavailable for this ticker." });
      return;
    }
    sendJson(res, 200, { ...data, fetchedAt: new Date().toISOString() });
  } catch (error) {
    sendJson(res, 502, { error: "Could not fetch historical price data.", details: error.message });
  }
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, normalized);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
      ...securityHeaders(),
    });
    res.end(file);
  } catch {
    if (path.extname(normalized)) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        ...securityHeaders(),
      });
      res.end("Not Found");
      return;
    }
    const fallback = await readFile(path.join(__dirname, "index.html"));
    res.writeHead(200, {
      "Content-Type": mimeTypes[".html"],
      "Cache-Control": "no-cache",
      ...securityHeaders(),
    });
    res.end(fallback);
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const stockHistoryMatch = url.pathname.match(/^\/api\/stock\/([^/]+)\/history$/);
    const stockMatch = url.pathname.match(/^\/api\/stock\/([^/]+)$/);

    if (url.pathname === "/api/drive/auth/start" && req.method === "GET") {
      await handleGoogleAuthStart(req, res);
      return;
    }

    if (url.pathname === "/api/drive/auth/callback" && req.method === "GET") {
      await handleGoogleAuthCallback(req, res, url);
      return;
    }

    if (url.pathname === "/api/drive/auth/status" && req.method === "GET") {
      await handleDriveAuthStatus(req, res);
      return;
    }

    if (url.pathname === "/api/drive/auth/logout" && req.method === "POST") {
      await handleDriveLogout(req, res);
      return;
    }

    if (url.pathname === "/api/drive/portfolio" && req.method === "GET") {
      await handleDrivePortfolioLoad(req, res);
      return;
    }

    if (url.pathname === "/api/drive/portfolio" && req.method === "POST") {
      await handleDrivePortfolioSave(req, res);
      return;
    }

    if (stockHistoryMatch) {
      await handleHistoryApi(res, stockHistoryMatch[1], url.searchParams.get("range") || "5y");
      return;
    }

    if (stockMatch) {
      await handleStockApi(res, stockMatch[1]);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error." });
  }
}).listen(port, () => {
  console.log(`Stock Projection Lab running on port ${port}`);
});
