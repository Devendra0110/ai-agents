/**
 * AI Agents Demo using @google/genai
 * ====================================
 * Demonstrates three agent patterns:
 *  1. Tool-Use Agent       — an agent that calls functions/tools
 *  2. ReAct Agent          — Reason + Act loop (think → act → observe → repeat)
 *  3. Multi-Agent Pipeline — orchestrator delegates to specialist sub-agents
 */

import { GoogleGenAI } from "@google/genai";

// ─── Initialise client ────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: 'AIzaSyDhGMO-_0jlMBHrSoT5qcSDPmZk6ocDu0U' });
const MODEL = "gemini-2.0-flash";

// ─── Shared utility ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function section(title) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function log(role, text) {
  const icons = { system: "⚙️ ", user: "👤", assistant: "🤖", tool: "🔧", obs: "👁️ " };
  const icon = icons[role] ?? "•";
  console.log(`\n${icon}  [${role.toUpperCase()}]\n   ${text.trim().replace(/\n/g, "\n   ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO 1 — Tool-Use Agent
// The agent decides which tools to call, we execute them, then feed results back.
// ═══════════════════════════════════════════════════════════════════════════════

// --- Fake tool implementations ------------------------------------------------
const tools = {
  get_weather: ({ city }) => {
    const data = {
      London: { temp: "15°C", condition: "Cloudy" },
      Tokyo: { temp: "22°C", condition: "Sunny" },
      "New York": { temp: "18°C", condition: "Partly cloudy" },
    };
    return data[city] ?? { temp: "20°C", condition: "Unknown" };
  },

  calculate: ({ expression }) => {
    try {
      // Safe eval for simple arithmetic only
      const result = Function(`"use strict"; return (${expression})`)();
      return { result, expression };
    } catch {
      return { error: "Invalid expression" };
    }
  },

  search_web: ({ query }) => ({
    results: [
      { title: `Latest on: ${query}`, snippet: "This is a simulated search result." },
      { title: `${query} — Wikipedia`, snippet: "Encyclopedia article overview..." },
    ],
  }),
};

// Tool schemas passed to the model
const toolDeclarations = [
  {
    name: "get_weather",
    description: "Get current weather for a city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string", description: "City name" } },
      required: ["city"],
    },
  },
  {
    name: "calculate",
    description: "Evaluate a mathematical expression.",
    parameters: {
      type: "object",
      properties: { expression: { type: "string", description: "Math expression, e.g. '2 + 2 * 10'" } },
      required: ["expression"],
    },
  },
  {
    name: "search_web",
    description: "Search the web for information.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
];

async function runToolUseAgent(userQuery) {
  section("DEMO 1 — Tool-Use Agent");
  log("user", userQuery);

  const messages = [{ role: "user", parts: [{ text: userQuery }] }];

  // Agentic loop — keep running until no more tool calls
  while (true) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: messages,
      config: {
        tools: [{ functionDeclarations: toolDeclarations }],
        systemInstruction:
          "You are a helpful assistant. Use the available tools when needed. " +
          "Be concise in your final answer.",
      },
    });

    const candidate = response.candidates[0];
    const parts = candidate.content.parts;

    // Collect tool calls from this turn
    const toolCalls = parts.filter((p) => p.functionCall);
    const textParts = parts.filter((p) => p.text);

    if (textParts.length > 0) {
      log("assistant", textParts.map((p) => p.text).join(" "));
    }

    // If no tool calls, we're done
    if (toolCalls.length === 0) break;

    // Execute each tool call and collect results
    const toolResults = [];
    for (const part of toolCalls) {
      const { name, args } = part.functionCall;
      log("tool", `Calling ${name}(${JSON.stringify(args)})`);
      const result = tools[name]?.(args) ?? { error: "Unknown tool" };
      log("obs", JSON.stringify(result, null, 2));
      toolResults.push({
        functionResponse: { name, response: result },
      });
    }

    // Add model turn + tool results to history
    messages.push({ role: "model", parts });
    messages.push({ role: "user", parts: toolResults });

    await sleep(300); // be polite to the API
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO 2 — ReAct Agent  (Reason + Act)
// The model explicitly thinks before acting; we parse Thought / Action / Observation.
// ═══════════════════════════════════════════════════════════════════════════════

async function runReActAgent(task) {
  section("DEMO 2 — ReAct Agent (Reason + Act)");
  log("user", task);

  const systemPrompt = `You are a ReAct agent. Solve tasks by alternating between:
Thought: <your reasoning about what to do next>
Action: <tool_name>(<json_args>)

Available actions:
- get_weather({"city": "..."})
- calculate({"expression": "..."})
- search_web({"query": "..."})

After each Observation I provide, continue with the next Thought/Action.
When you have enough information, output:
Final Answer: <your answer>

Important: Output ONLY one Thought+Action pair per turn, then stop and wait.`;

  const messages = [{ role: "user", parts: [{ text: task }] }];
  let step = 0;

  while (step < 6) {
    step++;
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: messages,
      config: { systemInstruction: systemPrompt },
    });

    const text = response.candidates[0].content.parts[0].text.trim();
    messages.push({ role: "model", parts: [{ text }] });

    // Parse the response
    if (text.includes("Final Answer:")) {
      const answer = text.split("Final Answer:")[1].trim();
      log("assistant", `Final Answer: ${answer}`);
      break;
    }

    // Extract Thought
    const thoughtMatch = text.match(/Thought:\s*(.+?)(?=\nAction:|$)/s);
    const actionMatch = text.match(/Action:\s*(\w+)\((.+?)\)/s);

    if (thoughtMatch) log("assistant", `Thought: ${thoughtMatch[1].trim()}`);

    if (actionMatch) {
      const [, toolName, argsRaw] = actionMatch;
      let args;
      try {
        args = JSON.parse(argsRaw);
      } catch {
        args = {};
      }
      log("tool", `Action: ${toolName}(${JSON.stringify(args)})`);
      const result = tools[toolName]?.(args) ?? { error: "Unknown tool" };
      const observation = `Observation: ${JSON.stringify(result)}`;
      log("obs", observation);
      messages.push({ role: "user", parts: [{ text: observation }] });
    } else {
      // No action found — model may be done or confused
      log("assistant", text);
      break;
    }

    await sleep(300);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO 3 — Multi-Agent Pipeline
// An orchestrator agent breaks down a task and delegates to specialist agents.
// ═══════════════════════════════════════════════════════════════════════════════

async function callSpecialistAgent(role, systemPrompt, userMessage) {
  log("system", `Delegating to [${role}] agent…`);
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    config: { systemInstruction: systemPrompt },
  });
  const result = response.candidates[0].content.parts[0].text.trim();
  log("assistant", `[${role}] → ${result}`);
  return result;
}

async function runMultiAgentPipeline(topic) {
  section("DEMO 3 — Multi-Agent Pipeline");
  log("user", `Research and summarise: "${topic}"`);

  // Step 1 — Orchestrator decides the plan
  const planResponse = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: `Create a 3-step research plan for: ${topic}` }] }],
    config: {
      systemInstruction:
        "You are an orchestrator. Output a numbered list of 3 concise research steps. " +
        "Each step should be one sentence. No preamble.",
    },
  });
  const plan = planResponse.candidates[0].content.parts[0].text.trim();
  log("assistant", `[Orchestrator] Plan:\n${plan}`);

  await sleep(300);

  // Step 2 — Researcher agent gathers information
  const researchResult = await callSpecialistAgent(
    "Researcher",
    "You are a research specialist. Given a topic, provide key facts, figures, and context in bullet points. Be factual and concise.",
    `Research this topic thoroughly: ${topic}`
  );

  await sleep(300);

  // Step 3 — Analyst agent interprets the research
  const analysisResult = await callSpecialistAgent(
    "Analyst",
    "You are a critical analyst. Given research findings, identify key insights, trends, and implications. Be analytical and concise.",
    `Analyse these research findings:\n${researchResult}`
  );

  await sleep(300);

  // Step 4 — Writer agent produces the final output
  const finalReport = await callSpecialistAgent(
    "Writer",
    "You are a professional writer. Synthesise research and analysis into a clear, engaging 3-paragraph summary for a general audience.",
    `Write a summary using:\n\nRESEARCH:\n${researchResult}\n\nANALYSIS:\n${analysisResult}`
  );

  console.log("\n📄  FINAL REPORT\n" + "─".repeat(60));
  console.log(finalReport);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌  Missing GEMINI_API_KEY environment variable.");
    console.error("    Export it first:  export GEMINI_API_KEY=your_key_here");
    process.exit(1);
  }

  try {
    await runToolUseAgent(
      "What is the weather in Tokyo and London? Also, what is 15% of 2400?"
    );

    await runReActAgent(
      "Find information about the James Webb Space Telescope and calculate how many years ago it launched (it launched in December 2021)."
    );

    await runMultiAgentPipeline("The impact of large language models on software development");
  } catch (err) {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  }
}

main();
