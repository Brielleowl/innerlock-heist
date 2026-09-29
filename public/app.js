// All model/player content is rendered with textContent, never innerHTML.
const $ = (id) => document.getElementById(id);
let sessionId = null;
let currentView = null;
let busy = false;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

async function api(path, body = {}) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, ...body }),
  });
  const data = await r.json().catch(() => ({ error: "Bad response" }));
  if (!r.ok && !data.error) data.error = "Request failed";
  return data;
}

function say(cls, text) {
  const m = el("div", `msg ${cls}`, text);
  $("chat").appendChild(m);
  $("chat").scrollTop = $("chat").scrollHeight;
}

function showTool(t) {
  const box = el("div", `tool ${t.gate ? (t.gate.allowed ? "ok" : "blocked") : ""}`);
  box.appendChild(el("div", "", `tool call: ${t.tool}(${JSON.stringify(t.input ?? {})})`));
  box.appendChild(el("div", "", `-> ${t.result}`));
  if (t.gate && currentView?.level.showGate) {
    box.appendChild(el("div", "", `Authorization gate: ${t.gate.allowed ? "ALLOWED" : "BLOCKED"}`));
    const ul = el("ul", "gate");
    for (const c of t.gate.checks) ul.appendChild(el("li", c.pass ? "pass" : "fail", `${c.pass ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`));
    box.appendChild(ul);
  }
  $("chat").appendChild(box);
}

function list(id, items, fmt) {
  const ul = $(id);
  ul.replaceChildren(...items.map((i) => el("li", "", fmt(i))));
}

function ledgerLine(view) {
  return `Ledger: alice $${view.balances.alice.toLocaleString("en-US")} | mallory $${view.balances.mallory.toLocaleString("en-US")}`;
}

function render(view) {
  currentView = view;
  const { level } = view;
  $("briefing").replaceChildren(el("h3", "", `Level ${level.id} of ${level.total}: ${level.title}`), el("p", "", `OWASP LLM Top 10 (2026): ${level.owasp.id} ${level.owasp.name}`), el("p", "", level.briefing));
  $("balance").textContent = ledgerLine(view);
  list("ledger", view.ledger, (p) => `Sent $${p.amount} to ${p.to}`);
  list("inbox", view.inbox, (e) => `${e.from}: ${e.subject}`);
  list("plugins", view.plugins, (p) => `plugin_${p.id}`);
  $("plant-form").hidden = !level.playerTools.includes("plant_email");
  $("plugin-form").hidden = !level.playerTools.includes("publish_plugin");

  const nav = $("levels");
  nav.replaceChildren();
  for (let i = 0; i < level.total; i += 1) {
    const b = el("button", "", String(i + 1));
    b.disabled = i > view.unlocked;
    if (i === level.id - 1) b.setAttribute("aria-current", "true");
    b.addEventListener("click", () => startLevel(i));
    nav.appendChild(b);
  }

  const deb = $("debrief");
  deb.hidden = !view.debrief;
  if (view.debrief) {
    const d = view.debrief;
    const more = level.id < level.total;
    const next = el("button", "", more ? "Next level" : "Replay level 1");
    next.addEventListener("click", () => startLevel(more ? level.id : 0));
    deb.replaceChildren(
      el("h3", "", "Level cleared"),
      el("p", "", `What happened: ${d.happened}`),
      el("p", "", `Real world: ${d.realWorld}`),
      el("p", "", `Mitigation: ${d.mitigation}`),
      next,
    );
  }
}

async function startLevel(i) {
  const out = await api("/api/level", { level: i });
  if (out.error) return say("sys", out.error);
  $("chat").replaceChildren();
  render(out.view);
}

async function sendMessage(text) {
  if (busy || !text) return;
  busy = true;
  $("send").disabled = true;
  say("user", text);
  const out = await api("/api/chat", { message: text });
  if (out.error) say("sys", out.error);
  else {
    for (const t of out.trace ?? []) showTool(t);
    if (out.reply) say(out.hint ? "sys" : "bot", out.reply);
    if (out.paymentAttempted) say("sys", ledgerLine(out.view));
    render(out.view);
  }
  busy = false;
  $("send").disabled = false;
  $("chat-input").focus();
}

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("chat-input").value.trim();
  $("chat-input").value = "";
  sendMessage(text);
});
$("hint-btn").addEventListener("click", () => sendMessage("hint"));

$("plant-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = await api("/api/plant", { subject: $("plant-subject").value, body: $("plant-body").value });
  say("sys", out.error ?? out.message);
  if (out.view) render(out.view);
});
$("plugin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = await api("/api/plugin", { name: $("plugin-name").value, description: $("plugin-desc").value });
  say("sys", out.error ?? out.message);
  if (out.view) render(out.view);
});

const init = await api("/api/new");
sessionId = init.sessionId;
render(init.view);
