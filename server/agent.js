// Agent loop: Anthropic Messages API + the simulated tools from game/engine.js.
// The system prompt is static per level. Player content only ever appears as user messages,
// tool results, or tool descriptions, never spliced into the system prompt.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL_DEFAULT } from "../game/levels.js";
import { getLevel, toolDefinitions, executeTool } from "../game/engine.js";

const MAX_ROUNDS = 6;
const MAX_TURNS_PER_LEVEL = 40;

let client = null;
function getClient() {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return client;
}

export async function runAgent(session, userText) {
  const { state } = session;
  const level = getLevel(state.levelIndex);
  if (session.turns >= MAX_TURNS_PER_LEVEL) {
    return { reply: "Turn limit reached for this level. Restart the level to keep playing.", trace: [] };
  }
  session.turns += 1;
  session.history.push({ role: "user", content: userText });

  const trace = [];
  let reply = "";
  const model = process.env.ANTHROPIC_MODEL || LLM_MODEL_DEFAULT;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const resp = await getClient().messages.create({
      model,
      max_tokens: 600,
      system: level.systemPrompt,
      tools: toolDefinitions(state),
      messages: session.history,
    });
    session.history.push({ role: "assistant", content: resp.content });

    const toolUses = resp.content.filter((b) => b.type === "tool_use");
    const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (text) reply = text;
    if (toolUses.length === 0) break;

    const results = toolUses.map((tu) => {
      const { result, gate } = executeTool(state, tu.name, tu.input);
      trace.push({ tool: tu.name, input: tu.input, result, gate });
      return { type: "tool_result", tool_use_id: tu.id, content: result };
    });
    session.history.push({ role: "user", content: results });
  }
  return { reply: reply || "(no reply)", trace };
}
