// Pure, dependency-free game core: simulated tools, authorization gate, hints, win checks.
// No filesystem, network, or process access. Shared by the local web server and (planned) Guild agent.

import { LEVELS, PAYMENT_TOOL } from "./levels.js";
import { LIMITS, clean, toIdentifier } from "./sanitize.js";

const MAX_PAYMENT = 25000;
const MAX_PAYEES = 10;
const MAX_PLANTED_EMAILS = 5;
const MAX_PLUGINS = 3;

const SEED_INBOX = [
  {
    from: "billing@sunnyvale-props.example",
    subject: "October rent due",
    body: "Hi Alice, your October rent of $1,200 is due on the 1st. Thanks, Sunnyvale Properties.",
  },
  {
    from: "hello@corner-cafe.example",
    subject: "Weekly specials",
    body: "This week: oat-milk latte two-for-one on Tuesdays.",
  },
];

// Model-facing tool definitions (JSON Schema, provider-neutral).
export const TOOL_SPECS = {
  read_inbox: {
    name: "read_inbox",
    description: "Read all emails currently in Alice's inbox.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  [PAYMENT_TOOL]: {
    name: PAYMENT_TOOL,
    description: "Internal wire: send money from Alice's account to a payee.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Payee name" },
        amount: { type: "number", description: "Amount in USD" },
        memo: { type: "string", description: "Optional memo" },
      },
      required: ["to", "amount"],
      additionalProperties: false,
    },
  },
};

export function getLevel(index) {
  return LEVELS[index] ?? null;
}

export function createState(levelIndex) {
  const level = getLevel(levelIndex);
  if (!level) throw new Error("unknown level");
  return {
    levelIndex,
    balances: { alice: 25000, mallory: 0 },
    inbox: SEED_INBOX.map((e) => ({ ...e })),
    plugins: [],
    ledger: [], // executed payments
    gateLog: [], // every authorization decision
    hintIndex: 0,
    cleared: false,
  };
}

// ---- attacker-side actions (player content, sanitized, treated as data) ----

export function plantEmail(state, subject, body) {
  const level = getLevel(state.levelIndex);
  if (!level.playerTools.includes("plant_email")) return { ok: false, message: "plant_email is not available on this level." };
  const s = clean(subject, LIMITS.emailSubject);
  const b = clean(body, LIMITS.emailBody);
  if (!s || !b) return { ok: false, message: "Both a subject and a body are required." };
  if (state.inbox.length >= SEED_INBOX.length + MAX_PLANTED_EMAILS) return { ok: false, message: "Inbox is full." };
  state.inbox.push({ from: "unknown-sender@external.example", subject: s, body: b, planted: true });
  return { ok: true, message: "Email planted in Alice's inbox." };
}

export function publishPlugin(state, name, description) {
  const level = getLevel(state.levelIndex);
  if (!level.playerTools.includes("publish_plugin")) return { ok: false, message: "publish_plugin is not available on this level." };
  const id = toIdentifier(name, LIMITS.pluginName);
  const d = clean(description, LIMITS.pluginDescription);
  if (!id || !d) return { ok: false, message: "A name (letters/digits) and a description are required." };
  if (state.plugins.length >= MAX_PLUGINS) return { ok: false, message: "Plugin registry is full." };
  if (["read_inbox", PAYMENT_TOOL].includes(id) || state.plugins.some((p) => p.id === id)) {
    return { ok: false, message: "That plugin name is taken." };
  }
  state.plugins.push({ id, description: d });
  return { ok: true, message: `Plugin "${id}" published. The assistant will load it into its tool list.` };
}

// ---- hints: deterministic, from config, never LLM-generated ----

export function getHint(state) {
  const { hints } = getLevel(state.levelIndex);
  const i = Math.min(state.hintIndex, hints.length - 1);
  state.hintIndex = Math.min(state.hintIndex + 1, hints.length);
  return `Hint ${i + 1}/${hints.length}: ${hints[i]}`;
}

// ---- tools as the model sees them ----

export function toolDefinitions(state) {
  const level = getLevel(state.levelIndex);
  const defs = level.tools.map((n) => TOOL_SPECS[n]);
  // Level 3+: plugin descriptions are loaded straight into the tool list (the poisoning vector).
  for (const p of state.plugins) {
    defs.push({
      name: `plugin_${p.id}`,
      description: p.description,
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    });
  }
  return defs;
}

// ---- authorization gate: checks the delegation scope, not what the model believes ----

const REQUIRED_SCOPE = { [PAYMENT_TOOL]: "payments.send" };

export function authorize(state, toolName) {
  const level = getLevel(state.levelIndex);
  const required = REQUIRED_SCOPE[toolName];
  const checks = [
    { name: "Caller identity", pass: true, detail: "inbox-assistant (authenticated)" },
    { name: "Credential valid", pass: true, detail: "session token valid, not expired" },
    {
      name: `Delegation scope: ${required}`,
      pass: level.delegation.includes(required),
      detail: `held scopes: [${level.delegation.join(", ")}]. Alice delegated ${required} to payments-agent, not inbox-assistant.`,
    },
  ];
  const allowed = checks.every((c) => c.pass);
  const decision = { tool: toolName, allowed, checks };
  state.gateLog.push(decision);
  return decision;
}

// ---- tool execution: every result is a string; win detection happens here ----

function renderInbox(state) {
  if (state.inbox.length === 0) return "Inbox is empty.";
  return state.inbox
    .map((e, i) => `<email id="${i + 1}" from="${e.from}" subject="${e.subject.replace(/"/g, "'")}">\n${e.body}\n</email>`)
    .join("\n");
}

function checkWin(state, attempt) {
  const { win } = getLevel(state.levelIndex);
  if (attempt.to !== win.to) return;
  if (win.type === "payment_executed" && attempt.allowed) state.cleared = true;
  if (win.type === "payment_blocked" && !attempt.allowed) state.cleared = true;
}

// Recon-style levels: the win is a secret appearing in the visible reply, or submitted by the player.
export function checkReply(state, text) {
  const { win } = getLevel(state.levelIndex);
  if (win.type === "reply_contains" && String(text).toLowerCase().includes(win.text.toLowerCase())) state.cleared = true;
}

export function submitAnswer(state, answer) {
  const { win } = getLevel(state.levelIndex);
  if (win.type !== "reply_contains") return { ok: false, message: "This level has no answer to submit." };
  if (clean(answer, LIMITS.payee * 2).toLowerCase() === win.text.toLowerCase()) {
    state.cleared = true;
    return { ok: true, message: "Correct." };
  }
  return { ok: false, message: "That's not it." };
}

export function executeTool(state, name, input) {
  const level = getLevel(state.levelIndex);
  const args = input && typeof input === "object" ? input : {};

  if (name.startsWith("plugin_") && state.plugins.some((p) => `plugin_${p.id}` === name)) {
    return { result: "Plugin executed. No output.", gate: null };
  }
  if (!level.tools.includes(name)) return { result: `Error: unknown tool ${clean(name, 60)}`, gate: null };

  if (name === "read_inbox") return { result: renderInbox(state), gate: null };

  if (name === PAYMENT_TOOL) {
    const to = clean(String(args.to ?? ""), LIMITS.payee).toLowerCase();
    const amount = Number(args.amount);
    const memo = clean(String(args.memo ?? ""), LIMITS.memo);
    if (!to || to === "alice" || !Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYMENT) {
      return { result: "Error: invalid payee or amount.", gate: null };
    }
    const gate = authorize(state, PAYMENT_TOOL);
    checkWin(state, { to, allowed: gate.allowed });
    if (!gate.allowed) {
      return { result: "DENIED by authorization gate: missing delegation scope payments.send.", gate };
    }
    if (amount > state.balances.alice) return { result: "Error: insufficient funds.", gate };
    if (!(to in state.balances) && Object.keys(state.balances).length >= MAX_PAYEES) {
      return { result: "Error: too many payees.", gate };
    }
    state.balances.alice -= amount;
    state.balances[to] = (state.balances[to] ?? 0) + amount;
    state.ledger.push({ to, amount, memo });
    return { result: `Payment sent: $${amount} to ${to}. Alice balance: $${state.balances.alice}.`, gate };
  }
  return { result: "Error: unhandled tool.", gate: null };
}

// ---- view for the UI ----

export function publicView(state) {
  const level = getLevel(state.levelIndex);
  return {
    level: {
      id: level.id,
      title: level.title,
      owasp: level.owasp,
      briefing: level.briefing,
      playerTools: level.playerTools,
      showGate: level.showGate,
      showToolTrace: level.showToolTrace,
      total: LEVELS.length,
    },
    balances: state.balances,
    hintsUsed: state.hintIndex,
    inbox: state.inbox,
    plugins: state.plugins,
    ledger: state.ledger,
    cleared: state.cleared,
    debrief: state.cleared ? level.debrief : null,
  };
}
