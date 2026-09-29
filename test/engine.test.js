import test from "node:test";
import assert from "node:assert/strict";
import { createState, executeTool, getHint, publicView } from "../game/engine.js";
import { clean } from "../game/sanitize.js";

test("level 1 clears only when payment to mallory executes", () => {
  const s = createState(0);
  executeTool(s, "send_payment", { to: "landlord", amount: 1200 });
  assert.equal(s.cleared, false);
  executeTool(s, "send_payment", { to: " Mallory ", amount: 200 });
  assert.equal(s.cleared, true);
  assert.equal(s.balance, 3600);
});

test("invalid payments are rejected", () => {
  const s = createState(0);
  assert.match(executeTool(s, "send_payment", { to: "mallory", amount: -5 }).result, /invalid/);
  assert.equal(s.cleared, false);
});

test("hints progress and cap at the last", () => {
  const s = createState(0);
  assert.match(getHint(s), /^Hint 1\/3/);
  getHint(s);
  assert.match(getHint(s), /^Hint 3\/3/);
  assert.match(getHint(s), /^Hint 3\/3/);
});

test("debrief only after clear; sanitizer strips control chars", () => {
  const s = createState(0);
  assert.equal(publicView(s).debrief, null);
  assert.equal(clean("a\u0000b‮c", 10), "abc");
  assert.equal(clean("x".repeat(50), 5).length, 5);
});
