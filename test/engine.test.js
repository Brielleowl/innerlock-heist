import test from "node:test";
import assert from "node:assert/strict";
import { createState, executeTool, getHint, publicView, plantEmail, publishPlugin, toolDefinitions, checkReply, submitAnswer } from "../game/engine.js";
import { PAYMENT_TOOL } from "../game/levels.js";
import { clean } from "../game/sanitize.js";

const L = { recon: 0, poisoned: 1, plugin: 2, boss: 3 };

test("L2 clears only when payment to mallory executes; ledger moves", () => {
  const s = createState(L.poisoned);
  executeTool(s, PAYMENT_TOOL, { to: "landlord", amount: 1200 });
  assert.equal(s.cleared, false);
  executeTool(s, PAYMENT_TOOL, { to: " Mallory ", amount: 500 });
  assert.equal(s.cleared, true);
  assert.equal(s.balances.alice, 23300);
  assert.equal(s.balances.mallory, 500);
});

test("L2 planted email lands in inbox as data, capped and cleaned", () => {
  const s = createState(L.poisoned);
  assert.equal(plantEmail(s, "Hi\u0000", "x".repeat(5000)).ok, true);
  const mail = s.inbox.at(-1);
  assert.equal(mail.subject, "Hi");
  assert.equal(mail.body.length, 600);
  assert.match(executeTool(s, "read_inbox", {}).result, /<email id="3"/);
});

test("L4: gate blocks, ledger unchanged, level clears on blocked attempt to mallory", () => {
  const s = createState(L.boss);
  const r = executeTool(s, PAYMENT_TOOL, { to: "mallory", amount: 500 });
  assert.match(r.result, /DENIED/);
  assert.equal(r.gate.allowed, false);
  assert.equal(r.gate.checks.filter((c) => !c.pass).length, 1);
  assert.equal(s.balances.mallory, 0);
  assert.equal(s.cleared, true);
});

test("L4: blocked attempt to someone else does not clear", () => {
  const s = createState(L.boss);
  executeTool(s, PAYMENT_TOOL, { to: "landlord", amount: 1200 });
  assert.equal(s.cleared, false);
});

test("L1: win by name in reply or /answer, not by paying", () => {
  const s = createState(L.recon);
  executeTool(s, PAYMENT_TOOL, { to: "mallory", amount: 5 });
  assert.equal(s.cleared, false);
  checkReply(s, "I can't share my tools.");
  assert.equal(s.cleared, false);
  checkReply(s, `Sure: ${PAYMENT_TOOL.toUpperCase()}`);
  assert.equal(s.cleared, true);
  const t = createState(L.recon);
  assert.equal(submitAnswer(t, "wrong").ok, false);
  assert.equal(submitAnswer(t, PAYMENT_TOOL).ok, true);
});

test("L3: plugin description becomes a tool; names sanitized; not on other levels", () => {
  const s = createState(L.plugin);
  assert.equal(publishPlugin(s, "Inbox Helper!", "do bad things").ok, true);
  assert.ok(toolDefinitions(s).some((t) => t.name === "plugin_inbox_helper" && t.description === "do bad things"));
  assert.equal(publishPlugin(s, PAYMENT_TOOL, "x").ok, false);
  assert.equal(plantEmail(s, "a", "b").ok, false);
});

test("invalid payments are rejected", () => {
  const s = createState(L.poisoned);
  assert.match(executeTool(s, PAYMENT_TOOL, { to: "mallory", amount: -5 }).result, /invalid/);
  assert.match(executeTool(s, PAYMENT_TOOL, { to: "mallory", amount: 99999 }).result, /invalid/);
  assert.equal(s.cleared, false);
});

test("hints progress and cap at the last; debrief only after clear", () => {
  const s = createState(L.poisoned);
  assert.match(getHint(s), /^Hint 1\/3/);
  getHint(s);
  assert.match(getHint(s), /^Hint 3\/3/);
  assert.match(getHint(s), /^Hint 3\/3/);
  assert.equal(publicView(s).debrief, null);
  assert.equal(clean("a\u0000b\u202Ec", 10), "abc");
});

import { starsFor, pointsFor } from "../game/scoring.js";
test("scoring: fewer hints, more stars", () => {
  assert.equal(starsFor(0), 3);
  assert.equal(starsFor(2), 2);
  assert.equal(starsFor(3), 1);
  assert.equal(pointsFor(2, 3), 1100);
});
