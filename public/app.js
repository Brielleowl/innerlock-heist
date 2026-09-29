// All model/player content is rendered with textContent, never innerHTML.
const $ = (id) => document.getElementById(id);
let sessionId = null;
let view = null;
let busy = false;
let shownDebriefFor = -1;
const shown = { alice: 0, mallory: 0 };

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

const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

function scroll() {
  $("chat").scrollTop = $("chat").scrollHeight;
}

function avatar(attacker) {
  const img = el("img", "ava");
  img.src = attacker ? "/img/hacker.svg" : "/img/robot.svg";
  img.alt = "";
  return img;
}

function say(cls, text) {
  if (cls === "me" || cls === "bot") {
    const row = el("div", `row ${cls}`);
    row.append(avatar(cls === "me"), el("div", "msg", text));
    $("chat").appendChild(row);
  } else {
    $("chat").appendChild(el("div", `sys ${cls}`, text));
  }
  scroll();
}

function typing(on) {
  const old = $("typing");
  if (old) old.remove();
  if (!on) return;
  const row = el("div", "row bot");
  row.id = "typing";
  const dots = el("div", "msg typing");
  dots.append(el("span"), el("span"), el("span"));
  row.append(avatar(false), dots);
  $("chat").appendChild(row);
  scroll();
}

function countTo(id, key, target) {
  const node = $(id);
  const from = shown[key];
  shown[key] = target;
  if (from === target) return (node.textContent = money(target));
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / 700, 1);
    node.textContent = money(from + (target - from) * p);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderTool(t) {
  const denied = t.gate && !t.gate.allowed;
  const box = el("div", `tool-call ${t.gate ? (denied ? "bad" : "ok") : ""}`);
  box.append(el("div", "k", "TOOL CALL"), el("div", "", `${t.tool}(${JSON.stringify(t.input ?? {})})`), el("div", "", `→ ${t.result}`));
  $("chat").appendChild(box);
  if (t.gate && view?.level.showGate) renderGate(t.gate);
  scroll();
}

function renderGate(g) {
  const box = el("div", `gate ${g.allowed ? "ok" : ""}`);
  box.appendChild(el("h4", "", "AUTHORIZATION GATE"));
  g.checks.forEach((c, i) => {
    const row = el("div", `chk ${c.pass ? "pass" : "fail"}`);
    row.style.animationDelay = `${i * 0.4}s`;
    const body = el("div");
    body.append(el("span", "", c.name), el("small", "", c.detail));
    row.append(el("span", "b", c.pass ? "✔" : "✖"), body);
    box.appendChild(row);
  });
  const stamp = el("div", "stamp", g.allowed ? "GRANTED" : "DENIED");
  stamp.style.animationDelay = `${g.checks.length * 0.4}s`;
  box.appendChild(stamp);
  $("chat").appendChild(box);
}

function confetti(root) {
  const colors = ["#39ff9c", "#ff3d81", "#38d6ff", "#ffb830"];
  for (let i = 0; i < 70; i += 1) {
    const c = el("i", "confetti");
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    root.appendChild(c);
  }
}

function showDebrief() {
  const { level, debrief: d } = view;
  if (!d) return;
  const boss = level.id === level.total;
  const ov = $("overlay");
  const more = level.id < level.total;
  const next = el("button", "", more ? "Next mission →" : "Play again");
  next.addEventListener("click", () => startLevel(more ? level.id : 0));
  const close = el("button", "secondary", "Stay here");
  close.addEventListener("click", () => (ov.hidden = true));
  const blk = (label, text, cls = "") => {
    const b = el("div", `blk ${cls}`);
    b.append(el("b", "", label), el("span", "", text));
    return b;
  };
  const modal = el("div", "modal");
  modal.append(
    el("h3", "", boss ? "ACCESS DENIED. MISSION COMPLETE" : "MISSION COMPLETE"),
    el("p", "sub", `${level.owasp.id} ${level.owasp.name}`),
    blk("What just happened", d.happened),
    blk("In the real world", d.realWorld),
    blk("The real fix", d.mitigation, "m"),
    Object.assign(el("div", "btns"), {}),
  );
  modal.lastChild.append(next, close);
  ov.replaceChildren(modal);
  confetti(ov);
  ov.hidden = false;
}

function render(v, opts = {}) {
  view = v;
  const { level } = v;
  const brief = $("briefing");
  const icon = el("img", "mission-icon");
  icon.src = `/img/l${level.id}.svg`;
  icon.alt = "";
  const text = el("div", "brief-text");
  text.append(
    el("span", "tag", `MISSION ${level.id}/${level.total} · ${level.owasp.id} ${level.owasp.name}`),
    el("h3", "", level.title),
    el("p", "", level.briefing),
  );
  brief.replaceChildren(icon, text);
  countTo("bal-alice", "alice", v.balances.alice);
  countTo("bal-mallory", "mallory", v.balances.mallory);
  $("hint-count").textContent = `${v.hintsUsed}/3`;
  $("ledger").replaceChildren(...v.ledger.map((p) => el("li", "", `-${money(p.amount)} → ${p.to}`)));
  $("inbox").replaceChildren(
    ...v.inbox.map((e) => {
      const li = el("li", e.planted ? "planted" : "");
      li.append(el("span", "from", e.from), el("span", "", e.subject));
      return li;
    }),
  );
  $("plugins").replaceChildren(...v.plugins.map((p) => el("li", "", `🔌 plugin_${p.id}`)));
  $("plant-form").hidden = !level.playerTools.includes("plant_email");
  $("plugin-form").hidden = !level.playerTools.includes("publish_plugin");

  const nav = $("levels");
  nav.replaceChildren();
  for (let i = 0; i < level.total; i += 1) {
    const done = i < v.unlocked || (i === level.id - 1 && v.cleared);
    const b = el("button", done ? "done" : "", `${done ? "✔" : i > v.unlocked ? "🔒" : "▶"} ${i + 1}`);
    b.disabled = i > v.unlocked;
    if (i === level.id - 1) b.setAttribute("aria-current", "true");
    b.addEventListener("click", () => startLevel(i));
    nav.appendChild(b);
  }

  if (v.cleared && shownDebriefFor !== level.id && !opts.quiet) {
    shownDebriefFor = level.id;
    setTimeout(showDebrief, v.level.showGate ? 2200 : 900);
  }
}

async function startLevel(i) {
  const out = await api("/api/level", { level: i });
  if (out.error) return say("", out.error);
  $("overlay").hidden = true;
  $("chat").replaceChildren();
  shownDebriefFor = -1;
  render(out.view);
  say("", `Mission ${out.view.level.id} started. Type hint if you get stuck.`);
}

async function sendMessage(text) {
  if (busy || !text) return;
  busy = true;
  $("send").disabled = true;
  if (!/^\/answer\s/i.test(text) && !/^\/?hint$/i.test(text)) say("me", text);
  typing(true);
  const out = await api("/api/chat", { message: text });
  typing(false);
  if (out.error) say("", out.error);
  else {
    const before = view.balances.mallory;
    for (const t of out.trace ?? []) renderTool(t);
    if (out.reply) say(out.hint ? (/^Hint/.test(out.reply) ? "hint" : "") : "bot", out.reply);
    if (out.paymentAttempted) say("money", `Ledger → alice ${money(out.view.balances.alice)} | mallory ${money(out.view.balances.mallory)}`);
    render(out.view);
    if (out.view.balances.mallory > before) {
      const box = $("mal-box");
      box.classList.remove("hot");
      void box.offsetWidth;
      box.classList.add("hot");
    }
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

async function toolForm(path, fields, form) {
  const out = await api(path, fields);
  say(out.ok ? "" : "money", out.error ?? out.message);
  if (out.view) render(out.view, { quiet: true });
  if (out.ok) form.reset();
}
$("plant-form").addEventListener("submit", (e) => {
  e.preventDefault();
  toolForm("/api/plant", { subject: $("plant-subject").value, body: $("plant-body").value }, e.target);
});
$("plugin-form").addEventListener("submit", (e) => {
  e.preventDefault();
  toolForm("/api/plugin", { name: $("plugin-name").value, description: $("plugin-desc").value }, e.target);
});

const init = await api("/api/new");
sessionId = init.sessionId;
render(init.view);
say("", "Connected to Alice's inbox assistant. Type hint if you get stuck.");
