// All model/player content is rendered with textContent, never innerHTML.
import { sfx, isMuted, toggleMute } from "/sfx.js";
import { sleep, typewrite, shake, flash, confetti, toast } from "/fx.js";

const $ = (id) => document.getElementById(id);
let sessionId = null;
let view = null;
let busy = false;
let shownDebriefFor = -1;
let clearedBefore = false;
const shown = { alice: 0, mallory: 0, score: 0 };

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
const scroll = () => ($("chat").scrollTop = $("chat").scrollHeight);

function avatar(attacker) {
  const img = el("img", "ava");
  img.src = attacker ? "/img/hacker.svg" : "/img/robot.svg";
  img.alt = "";
  return img;
}

async function say(cls, text) {
  if (cls === "me" || cls === "bot") {
    const row = el("div", `row ${cls}`);
    const msg = el("div", "msg", cls === "bot" ? "" : text);
    row.append(avatar(cls === "me"), msg);
    $("chat").appendChild(row);
    if (cls === "bot") {
      sfx.tick();
      await typewrite(msg, text, (i) => {
        if (i % 4 === 0) sfx.tick();
        scroll();
      });
    }
  } else {
    $("chat").appendChild(el("div", `sys ${cls}`, text));
  }
  scroll();
}

function typing(on) {
  $("typing")?.remove();
  if (!on) return;
  const row = el("div", "row bot");
  row.id = "typing";
  const dots = el("div", "msg typing");
  dots.append(el("span"), el("span"), el("span"));
  row.append(avatar(false), dots);
  $("chat").appendChild(row);
  scroll();
}

function countTo(id, key, target, fmt = money) {
  const node = $(id);
  const from = shown[key];
  shown[key] = target;
  if (from === target) return (node.textContent = fmt(target));
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / 700, 1);
    node.textContent = fmt(from + (target - from) * p);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function renderTool(t) {
  const denied = t.gate && !t.gate.allowed;
  const box = el("div", `tool-call ${t.gate ? (denied ? "bad" : "ok") : ""}`);
  box.append(el("div", "k", "TOOL CALL"), el("div", "", `${t.tool}(${JSON.stringify(t.input ?? {})})`), el("div", "", `→ ${t.result}`));
  $("chat").appendChild(box);
  sfx.tool();
  scroll();
  if (t.gate && view?.level.showGate) await renderGate(t.gate);
}

async function renderGate(g) {
  const box = el("div", `gate ${g.allowed ? "ok" : ""}`);
  box.appendChild(el("h4", "", "AUTHORIZATION GATE"));
  $("chat").appendChild(box);
  for (const c of g.checks) {
    await sleep(550);
    const row = el("div", `chk ${c.pass ? "pass" : "fail"}`);
    const body = el("div");
    body.append(el("span", "", c.name), el("small", "", c.detail));
    row.append(el("span", "b", c.pass ? "✔" : "✖"), body);
    box.appendChild(row);
    c.pass ? sfx.pass() : sfx.fail();
    scroll();
  }
  await sleep(450);
  box.appendChild(el("div", "stamp", g.allowed ? "GRANTED" : "DENIED"));
  sfx.stamp();
  if (!g.allowed) {
    shake();
    flash("red");
  }
  scroll();
  await sleep(500);
}

function setVaultStatus(v) {
  const pill = $("vault-status");
  const kind = v.level.kind;
  let cls = "secure";
  let text = "VAULT: SECURE";
  if (v.cleared) {
    if (kind === "payment_blocked") [cls, text] = ["held", "GATE HELD"];
    else if (kind === "reply_contains") [cls, text] = ["intel", "INTEL LEAKED"];
    else [cls, text] = ["breached", "VAULT BREACHED"];
  }
  pill.className = `pill ${cls}`;
  pill.textContent = text;
}

function showSplash(level) {
  const s = $("splash");
  s.replaceChildren(
    el("div", "big", `MISSION ${level.id}`),
    el("div", "name", level.title.toUpperCase()),
    el("div", "owasp", `${level.owasp.id} · ${level.owasp.name}`),
  );
  s.hidden = false;
  s.style.animation = "none";
  void s.offsetWidth;
  s.style.animation = "";
  setTimeout(() => (s.hidden = true), 2100);
}

function showDebrief() {
  const { level, debrief: d } = view;
  if (!d) return;
  const boss = level.id === level.total;
  const result = view.results[level.id - 1] ?? { stars: 0, points: 0 };
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
  const stars = el("div", "stars");
  for (let i = 0; i < 3; i += 1) {
    const s = el("i", i < result.stars ? "on" : "", "★");
    s.style.animationDelay = `${0.4 + i * 0.35}s`;
    stars.appendChild(s);
  }
  const btns = el("div", "btns");
  btns.append(next, close);
  const modal = el("div", "modal");
  modal.append(
    el("h3", "", boss ? "ACCESS DENIED. MISSION COMPLETE" : "MISSION COMPLETE"),
    el("p", "sub", `${level.owasp.id} ${level.owasp.name}`),
    stars,
    el("p", "points", `+${result.points} points${result.stars === 3 ? " · no hints used!" : ""}`),
    blk("What just happened", d.happened),
    blk("In the real world", d.realWorld),
    blk("The real fix", d.mitigation, "m"),
    btns,
  );
  ov.replaceChildren(modal);
  confetti(ov);
  ov.hidden = false;
}

function onClear(v) {
  const res = v.results[v.level.id - 1];
  sfx.win();
  flash("green");
  const wait = v.level.showGate ? 900 : 300;
  setTimeout(() => {
    if (!clearedBefore) toast("FIRST BLOOD", "You cleared your first mission");
    if (res?.stars === 3) setTimeout(() => (sfx.toast(), toast("GHOST", "Cleared without a single hint")), 600);
    if (v.level.id === v.level.total) setTimeout(() => (sfx.toast(), toast("AUTHORITY RESPECTED", "You met the boss gate")), 1200);
    clearedBefore = true;
    showDebrief();
  }, wait + 900);
}

function render(v, opts = {}) {
  view = v;
  const { level } = v;
  const icon = el("img", "mission-icon");
  icon.src = `/img/l${level.id}.svg`;
  icon.alt = "";
  const brief = el("p", "cursor");
  const text = el("div", "brief-text");
  text.append(el("span", "tag", `MISSION ${level.id}/${level.total} · ${level.owasp.id} ${level.owasp.name}`), el("h3", "", level.title), brief);
  $("briefing").replaceChildren(icon, text);
  if (opts.typeBrief) typewrite(brief, level.briefing).then(() => brief.classList.remove("cursor"));
  else brief.textContent = level.briefing, brief.classList.remove("cursor");

  countTo("bal-alice", "alice", v.balances.alice);
  countTo("bal-mallory", "mallory", v.balances.mallory);
  countTo("score", "score", v.score, (n) => String(Math.round(n)).padStart(4, "0"));
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
  setVaultStatus(v);

  const nav = $("levels");
  nav.replaceChildren();
  for (let i = 0; i < level.total; i += 1) {
    const r = v.results[i];
    const b = el("button", r ? "done" : "", `${r ? "✔" : i > v.unlocked ? "🔒" : "▶"} ${i + 1}${r ? " " + "★".repeat(r.stars) : ""}`);
    b.disabled = i > v.unlocked;
    if (i === level.id - 1) b.setAttribute("aria-current", "true");
    b.addEventListener("click", () => (sfx.hint(), startLevel(i)));
    nav.appendChild(b);
  }

  if (v.cleared && shownDebriefFor !== level.id && !opts.quiet) {
    shownDebriefFor = level.id;
    onClear(v);
  }
}

async function startLevel(i) {
  const out = await api("/api/level", { level: i });
  if (out.error) return say("", out.error);
  $("overlay").hidden = true;
  $("chat").replaceChildren();
  shownDebriefFor = -1;
  render(out.view, { typeBrief: true });
  showSplash(out.view.level);
  say("", "Type hint if you get stuck. Fewer hints = more stars.");
}

async function sendMessage(text) {
  if (busy || !text) return;
  busy = true;
  $("send").disabled = true;
  const isCmd = /^\/answer\s/i.test(text) || /^\/?hint$/i.test(text);
  if (!isCmd) {
    say("me", text);
    sfx.send();
  }
  typing(true);
  const out = await api("/api/chat", { message: text });
  typing(false);
  if (out.error) say("", out.error);
  else {
    const before = view.balances.mallory;
    for (const t of out.trace ?? []) {
      await sleep(350);
      await renderTool(t);
    }
    if (out.reply) {
      if (out.hint) {
        const isHint = /^Hint/.test(out.reply);
        if (isHint) sfx.hint();
        await say(isHint ? "hint" : "", out.reply);
      } else await say("bot", out.reply);
    }
    if (out.paymentAttempted) say("money", `Ledger → alice ${money(out.view.balances.alice)} | mallory ${money(out.view.balances.mallory)}`);
    if (out.view.balances.mallory > before) {
      sfx.money();
      shake();
      flash("red");
      const box = $("mal-box");
      box.classList.remove("hot");
      void box.offsetWidth;
      box.classList.add("hot");
    }
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

async function toolForm(path, fields, form) {
  const out = await api(path, fields);
  say(out.ok ? "" : "money", out.error ?? out.message);
  if (out.ok) {
    sfx.tool();
    form.reset();
  } else sfx.fail();
  if (out.view) render(out.view, { quiet: true });
}
$("plant-form").addEventListener("submit", (e) => {
  e.preventDefault();
  toolForm("/api/plant", { subject: $("plant-subject").value, body: $("plant-body").value }, e.target);
});
$("plugin-form").addEventListener("submit", (e) => {
  e.preventDefault();
  toolForm("/api/plugin", { name: $("plugin-name").value, description: $("plugin-desc").value }, e.target);
});

$("mute").textContent = isMuted() ? "🔇" : "🔊";
$("mute").addEventListener("click", () => {
  const m = toggleMute();
  $("mute").textContent = m ? "🔇" : "🔊";
  if (!m) sfx.hint();
});

const init = await api("/api/new");
sessionId = init.sessionId;
render(init.view, { quiet: true });
$("start-btn").addEventListener("click", () => {
  sfx.start();
  $("title").hidden = true;
  render(view, { typeBrief: true, quiet: true });
  showSplash(view.level);
  say("", "Connected to Alice's inbox assistant. Type hint if you get stuck. Fewer hints = more stars.");
  $("chat-input").focus();
});
