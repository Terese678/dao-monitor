require("dotenv").config(); // will load OPENROUTER_API_KEY from .env
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());         // it allows the React UI to call this server
app.use(express.json()); // parses incoming JSON request bodies

// OpenRouter client, same setup as the agent script
const client = new OpenAI.default({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Simulated on-chain known address registry.
// In production this would query the live Casper contract.
const knownAddresses = ["known_addr", "trusted_vendor"];

// The three deterministic rules, mirrors the on-chain contract logic exactly
function applyRules(amount, recipient, justification, threshold = 1000) {
  const reasons = [];

  if (threshold > 0 && amount > threshold)
    reasons.push("amount exceeds threshold");

  if (justification.trim().length < 10)
    reasons.push("justification missing or too short");

  if (!knownAddresses.includes(recipient))
    reasons.push("recipient has no prior history");

  return reasons;
}

// Ask the LLM for a qualitative opinion on the justification
async function analyzeJustification(justification) {
  const response = await client.chat.completions.create({
    model: "openrouter/auto",
    messages: [
      {
        role: "user",
        content: `You are a DAO treasury risk analyst. Analyze this funding justification and reply in one sentence: is it a genuine, specific funding rationale or vague/suspicious boilerplate?

Justification: "${justification}"`,
      },
    ],
  });
  return response.choices[0].message.content;
}

// POST /evaluate, the single endpoint the UI calls
app.post("/evaluate", async (req, res) => {
  const { id, amount, recipient, justification } = req.body;

  // Run deterministic rules first
  const violations = applyRules(amount, recipient, justification);
  const flagged = violations.length > 0;
  const deterministicVerdict = flagged
    ? `FLAGGED — ${violations.join("; ")}`
    : "CLEAN";

  // Then get AI qualitative opinion
  const aiOpinion = await analyzeJustification(justification);

  // Return the full verdict to the UI
  res.json({ id, flagged, deterministicVerdict, aiOpinion });
});

// Start the server, use the platform's assigned port, fall back to 4000 for local dev
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Agent server running on port ${PORT}`);
});