const http = require("http");
const crypto = require("crypto");
const { syncBuiltinESMExports } = require("module");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "openid",
  "email",
].join(" ");
const DRIVE_PORTFOLIO_FILE = "stock-dashboard-portfolio.json";
const PORTFOLIO_SPREADSHEET_NAMES = ["Portfolio", "Portfolio Dashboard - Clean Copy"];
const PORTFOLIO_SPREADSHEET_TABS = ["Total Holdings", "Holdings"];
const SESSION_COOKIE = "stocklab_drive_session";
const STATE_COOKIE = "stocklab_drive_state";

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
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

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  return `${proto}://${req.headers.host}`;
}

function getRedirectUri(req) {
  return `${getOrigin(req)}/api/drive/auth/callback`;
}

function getDriveSession(req) {
  return decryptPayload(parseCookies(req)[SESSION_COOKIE]) || null;
}

function setDriveSession(res, req, session) {
  setCookie(res, req, SESSION_COOKIE, encryptPayload(session), 60 * 60 * 24 * 30);
}

function setOauthState(res, req, payload) {
  setCookie(res, req, STATE_COOKIE, encryptPayload(payload), 60 * 10);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

function sessionScopeSet(session) {
  return new Set(String(session?.scope || "").split(/\s+/).filter(Boolean));
}

function canReadPortfolioSpreadsheets(session) {
  const scopes = sessionScopeSet(session);
  return (
    scopes.has("https://www.googleapis.com/auth/drive.metadata.readonly") &&
    scopes.has("https://www.googleapis.com/auth/spreadsheets.readonly")
  );
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
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || data.error_description || `Drive request failed (${response.status})`);
    error.status = response.status;
    throw error;
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
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || `Drive request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return text;
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

function portfolioPayloadHasRows(payload) {
  return Boolean(
    payload &&
      ((Array.isArray(payload.trades) && payload.trades.length) ||
        (Array.isArray(payload.holdingsSnapshot) && payload.holdingsSnapshot.length) ||
        (Array.isArray(payload.holdings) && payload.holdings.length)),
  );
}

function parsePortfolioNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const accountingNegative = /^\(.+\)$/.test(raw);
  const parsed = Number(raw.replace(/[,$%\s]/g, "").replace(/[()]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return accountingNegative && parsed > 0 ? -parsed : parsed;
}

function normalizePortfolioHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function portfolioCell(row, aliases, fallback = "") {
  const wanted = new Set((Array.isArray(aliases) ? aliases : [aliases]).map(normalizePortfolioHeader));
  const key = Object.keys(row).find((candidate) => wanted.has(normalizePortfolioHeader(candidate)));
  const value = key ? row[key] : undefined;
  return value === undefined || value === null || value === "" ? fallback : value;
}

function rowsToObjects(values = []) {
  const headers = values[0] || [];
  return values.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [String(header || "").trim(), row[index] ?? ""])),
  );
}

function normalizePortfolioSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 20);
}

function spreadsheetHoldingFromRow(row) {
  const account = String(portfolioCell(row, ["Account"], "Primary")).trim();
  const accountLabel = account.toLowerCase();
  const asset = String(portfolioCell(row, ["Asset", "Symbol", "Ticker"], "")).trim();
  const symbol = normalizePortfolioSymbol(portfolioCell(row, ["Symbol", "Ticker"], asset));
  if (!symbol || accountLabel === "total" || accountLabel.includes("cash total") || accountLabel.includes("stock total")) {
    return null;
  }

  let quantity = parsePortfolioNumber(portfolioCell(row, ["Quantity", "Quanity", "Qty", "Shares"]));
  let averageCost = parsePortfolioNumber(portfolioCell(row, ["Average Cost", "Trade Price", "Cost Basis"]));
  let currentPrice = parsePortfolioNumber(portfolioCell(row, ["Current Price", "Market Price"], averageCost));
  let initialValue = parsePortfolioNumber(portfolioCell(row, ["Initial Value", "Cost Value", "Cost Basis"]));
  let currentValue = parsePortfolioNumber(portfolioCell(row, ["Current Value", "Market Value"]));
  const manualValue = quantity <= 0 && currentPrice <= 0 && currentValue > 0;

  if (quantity <= 0 && currentPrice > 0 && currentValue > 0) quantity = currentValue / currentPrice;
  if (quantity <= 0 && averageCost > 0 && initialValue > 0) quantity = initialValue / averageCost;
  if (quantity <= 0 && currentValue > 0) quantity = 1;
  if (averageCost <= 0 && quantity > 0 && initialValue > 0) averageCost = initialValue / quantity;
  if (currentPrice <= 0 && quantity > 0 && currentValue > 0) currentPrice = currentValue / quantity;
  if (initialValue <= 0 && quantity > 0 && averageCost > 0) initialValue = quantity * averageCost;
  if (currentValue <= 0 && quantity > 0 && currentPrice > 0) currentValue = quantity * currentPrice;
  if (quantity <= 0 || currentValue <= 0) return null;

  return {
    symbol,
    asset: asset || symbol,
    sector: String(portfolioCell(row, ["Sector"], "Unassigned")).trim() || "Unassigned",
    quantity,
    averageCost,
    initialValue,
    account: account || "Primary",
    realizedProfit: parsePortfolioNumber(portfolioCell(row, ["Realized Profit"])),
    currentPrice,
    currentValue,
    dayChange: parsePortfolioNumber(portfolioCell(row, ["Day Change"])),
    dayPercentChange: parsePortfolioNumber(portfolioCell(row, ["Day % Change", "Day Percent Change"])),
    unrealizedProfit: parsePortfolioNumber(portfolioCell(row, ["Unrealized Profit"])) || currentValue - initialValue,
    allocation: parsePortfolioNumber(portfolioCell(row, ["Allocation (%)", "Allocation"])),
    quoteRefreshDisabled: manualValue,
  };
}

function parseSpreadsheetHoldings(values = []) {
  const holdings = rowsToObjects(values).map(spreadsheetHoldingFromRow).filter(Boolean);
  const totalValue = holdings.reduce((sum, holding) => sum + (Number(holding.currentValue) || 0), 0);
  return holdings.map((holding) => ({
    ...holding,
    allocation: totalValue > 0 ? ((Number(holding.currentValue) || 0) / totalValue) * 100 : holding.allocation || 0,
  }));
}

async function findPortfolioSpreadsheet(req, res) {
  const query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains 'Portfolio'",
  );
  const data = await driveFetchJson(
    req,
    res,
    `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=10&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,webViewLink)`,
  );
  const files = data.files || [];
  return (
    PORTFOLIO_SPREADSHEET_NAMES.map((name) => files.find((file) => file.name === name)).find(Boolean) ||
    files[0] ||
    null
  );
}

async function readSpreadsheetValues(req, res, spreadsheetId, sheetName) {
  const quotedSheet = `'${String(sheetName).replace(/'/g, "''")}'!A1:AD1000`;
  const data = await driveFetchJson(
    req,
    res,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(quotedSheet)}?valueRenderOption=FORMATTED_VALUE`,
  );
  return data.values || [];
}

async function readPortfolioSpreadsheet(req, res) {
  const session = await ensureDriveSession(req, res);
  if (!canReadPortfolioSpreadsheets(session)) {
    const error = new Error("Reconnect Drive so the dashboard can read your Portfolio spreadsheet.");
    error.status = 403;
    throw error;
  }

  const file = await findPortfolioSpreadsheet(req, res);
  if (!file?.id) return null;

  for (const sheetName of PORTFOLIO_SPREADSHEET_TABS) {
    try {
      const values = await readSpreadsheetValues(req, res, file.id, sheetName);
      const holdings = parseSpreadsheetHoldings(values);
      if (holdings.length) {
        return {
          file,
          sheetName,
          portfolio: {
            schemaVersion: 2,
            source: "google-sheet",
            sourceFileId: file.id,
            sourceFileName: file.name,
            sourceSheetName: sheetName,
            updatedAt: file.modifiedTime || new Date().toISOString(),
            trades: [],
            holdingsSnapshot: holdings,
          },
        };
      }
    } catch (error) {
      if (error.status !== 400 && error.status !== 404) throw error;
    }
  }

  return null;
}

async function handleGoogleAuthStart(req, res) {
  if (!configuredForDrive()) {
    sendJson(res, 501, {
      error: "Drive sync is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET in Render.",
    });
    return true;
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
  return true;
}

async function handleDriveAuthStatus(req, res) {
  if (!configuredForDrive()) {
    sendJson(res, 200, { connected: false, configured: false });
    return true;
  }

  try {
    const session = await ensureDriveSession(req, res);
    if (!canReadPortfolioSpreadsheets(session)) {
      sendJson(res, 200, { connected: false, configured: true, needsReconnectForSheets: true });
      return true;
    }
    const file = await findPortfolioFile(req, res);
    sendJson(res, 200, {
      connected: true,
      configured: true,
      fileId: file?.id || null,
      remoteUpdatedAt: file?.modifiedTime || null,
      remoteRevision: file?.modifiedTime || null,
      canReadPortfolioSheets: true,
    });
  } catch {
    sendJson(res, 200, { connected: false, configured: true });
  }
  return true;
}

async function handleDrivePortfolioLoad(req, res) {
  const file = await findPortfolioFile(req, res);
  if (file?.id) {
    const portfolio = await readPortfolioFile(req, res, file.id);
    if (portfolioPayloadHasRows(portfolio)) {
      sendJson(res, 200, {
        fileId: file.id,
        remoteUpdatedAt: file.modifiedTime || portfolio.updatedAt || null,
        remoteRevision: file.modifiedTime || portfolio.updatedAt || null,
        source: "appdata",
        portfolio,
      });
      return true;
    }
  }

  const spreadsheet = await readPortfolioSpreadsheet(req, res);
  if (!spreadsheet) {
    sendJson(res, 404, { error: "No private Drive portfolio file or readable Portfolio spreadsheet was found." });
    return true;
  }

  sendJson(res, 200, {
    fileId: file?.id || spreadsheet.file.id,
    remoteUpdatedAt: spreadsheet.file.modifiedTime || spreadsheet.portfolio.updatedAt || null,
    remoteRevision: spreadsheet.file.modifiedTime || spreadsheet.portfolio.updatedAt || null,
    source: "spreadsheet",
    sourceFileId: spreadsheet.file.id,
    sourceFileName: spreadsheet.file.name,
    sourceSheetName: spreadsheet.sheetName,
    portfolio: spreadsheet.portfolio,
  });
  return true;
}

async function interceptDriveRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/drive/auth/start" && req.method === "GET") return handleGoogleAuthStart(req, res);
  if (url.pathname === "/api/drive/auth/status" && req.method === "GET") return handleDriveAuthStatus(req, res);
  if (url.pathname === "/api/drive/portfolio" && req.method === "GET") return handleDrivePortfolioLoad(req, res);
  return false;
}

const originalCreateServer = http.createServer;
http.createServer = function patchedCreateServer(options, listener) {
  const hasOptions = typeof options !== "function";
  const originalListener = hasOptions ? listener : options;
  const wrappedListener = async (req, res) => {
    try {
      if (await interceptDriveRequest(req, res)) return;
    } catch (error) {
      const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 500;
      sendJson(res, status, { error: error.message || "Server error." });
      return;
    }
    return originalListener(req, res);
  };

  return hasOptions
    ? originalCreateServer.call(this, options, wrappedListener)
    : originalCreateServer.call(this, wrappedListener);
};

syncBuiltinESMExports();
