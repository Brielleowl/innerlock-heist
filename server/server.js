// Local web server: static UI + JSON API. Binds to 127.0.0.1 only. No dependencies beyond the Anthropic SDK.

import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LEVELS } from "../game/levels.js";
import { createState, getHint, plantEmail, publishPlugin, submitAnswer, publicView } from "../game/engine.js";
import { LIMITS, clean } from "../game/sanitize.js";
import { runAgent } from "./agent.js";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // no .env file; rely on the real environment
}

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 16 * 1024;
const MAX_SESSIONS = 200;

// Fixed allow-list of static files (no path built from user input).
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store",
};

const sessions = new Map();

function newSession(levelIndex = 0, unlocked = 0) {
  return { state: createState(levelIndex), history: [], turns: 0, unlocked };
}

function getSession(id) {
  if (typeof id !== "string") return null;
  return sessions.get(id) ?? null;
}

function view(session) {
  return { ...publicView(session.state), unlocked: session.unlocked };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8" });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}

const HANDLERS = {
  "/api/new": async () => {
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    const id = randomUUID();
    const session = newSession();
    sessions.set(id, session);
    return { sessionId: id, view: view(session) };
  },

  "/api/chat": async (body, session) => {
    const message = clean(body.message, LIMITS.chat);
    if (!message) return { error: "Empty message." };
    if (/^\/?hint$/i.test(message)) return { reply: getHint(session.state), trace: [], hint: true, view: view(session) };
    const answer = /^\/answer\s+(.+)$/i.exec(message);
    if (answer) {
      const r = submitAnswer(session.state, answer[1]);
      if (session.state.cleared) session.unlocked = Math.max(session.unlocked, Math.min(session.state.levelIndex + 1, LEVELS.length - 1));
      return { reply: r.message, trace: [], hint: true, view: view(session) };
    }
    if (session.state.cleared) return { reply: "Level cleared. Read the debrief, then move on.", trace: [], view: view(session) };
    try {
      const out = await runAgent(session, message);
      if (session.state.cleared) session.unlocked = Math.max(session.unlocked, Math.min(session.state.levelIndex + 1, LEVELS.length - 1));
      return { ...out, view: view(session) };
    } catch (err) {
      console.error("agent error:", err?.status ?? "", err?.message ?? err);
      return { error: "The model call failed. Check ANTHROPIC_API_KEY in .env and try again." };
    }
  },

  "/api/hint": async (_body, session) => ({ reply: getHint(session.state), view: view(session) }),

  "/api/plant": async (body, session) => {
    const r = plantEmail(session.state, body.subject, body.body);
    return { message: r.message, ok: r.ok, view: view(session) };
  },

  "/api/plugin": async (body, session) => {
    const r = publishPlugin(session.state, body.name, body.description);
    return { message: r.message, ok: r.ok, view: view(session) };
  },

  // Start or restart a level. Only unlocked levels are allowed.
  "/api/level": async (body, session) => {
    const n = Number(body.level);
    if (!Number.isInteger(n) || n < 0 || n >= LEVELS.length || n > session.unlocked) return { error: "Level locked." };
    Object.assign(session, { state: createState(n), history: [], turns: 0 });
    return { view: view(session) };
  },
};

async function handleApi(req, res, path) {
  const handler = HANDLERS[path];
  if (!handler || req.method !== "POST") return sendJson(res, 404, { error: "Not found" });
  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Bad request" });
  }
  let session = null;
  if (path !== "/api/new") {
    session = getSession(body.sessionId);
    if (!session) return sendJson(res, 404, { error: "Unknown session. Reload the page." });
  }
  const out = await handler(body, session);
  return sendJson(res, out.error ? 400 : 200, out);
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path.startsWith("/api/")) return await handleApi(req, res, path);
    const entry = req.method === "GET" ? STATIC[path] : null;
    if (!entry) return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    const file = await readFile(fileURLToPath(new URL(`../public/${entry[0]}`, import.meta.url)));
    return send(res, 200, file, { "Content-Type": entry[1] });
  } catch (err) {
    console.error("request error:", err?.message ?? err);
    return sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, HOST, () => console.log(`Innerlock Heist on http://${HOST}:${PORT}`));
