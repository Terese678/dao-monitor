require("dotenv").config(); // loads OPENROUTER_API_KEY from .env file
const OpenAI = require("openai");

// OpenRouter uses the OpenAI SDK format but points to OpenRouter's API.
// This gives us access to free models like Gemini and Llama.
const client = new OpenAI.default({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// The three deterministic rules: same logic as the on-chain contract.
// We run these off-chain first so the agent can reason before submitting.
function applyRules(amount, recipient, justification, threshold) {
  const reasons = [];

  // Rule 1: proposal amount exceeds the DAO's configured limit
  if (threshold > 0 && amount > threshold) {
    reasons.push("amount exceeds threshold");
  }

  // Rule 2: justification is too short to be meaningful
  if (justification.trim().length < 10) {
    reasons.push("justification missing or too short");
  }

  // Rule 3: recipient has never interacted with this DAO before
  const knownAddresses = ["known_addr", "trusted_vendor"]; // simulated registry
  if (!knownAddresses.includes(recipient)) {
    reasons.push("recipient has no prior history");
  }

  return reasons;
}

// Ask an LLM to give a qualitative opinion on the justification text.
// This is the "AI" layer, deterministic rules can't judge intent, LLM can.
async function analyzeJustification(justification) {
  const response = await client.chat.completions.create({
    model: "openrouter/auto", // free model on OpenRouter
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

// Main agent function: perceive the proposal, decide, and report.
async function evaluateProposal(id, amount, recipient, justification, threshold = 1000) {
  console.log("\n=== DAO Treasury Proposal Monitor Agent ===");
  console.log(`Proposal ID  : ${id}`);
  console.log(`Amount       : ${amount} CSPR`);
  console.log(`Recipient    : ${recipient}`);
  console.log(`Justification: ${justification}`);
  console.log("-------------------------------------------");

  // Step 1: Run deterministic rules
  const violations = applyRules(amount, recipient, justification, threshold);
  const flagged = violations.length > 0;
  const deterministicVerdict = flagged
    ? `FLAGGED — ${violations.join("; ")}`
    : "CLEAN";

  // Step 2: Ask LLM for a qualitative opinion
  console.log("Consulting AI for qualitative analysis...");
  const aiOpinion = await analyzeJustification(justification);

  // Step 3: Print the full report
  console.log("\n=== VERDICT ===");
  console.log(`Deterministic verdict : ${deterministicVerdict}`);
  console.log(`AI qualitative opinion: ${aiOpinion}`);
  console.log("===============\n");
}

// --- Test cases ---
// Case 1: Oversized amount + weak justification + unknown address (all 3 rules fire)
evaluateProposal(1, 5000, "unknown_addr", "pls approve")

  // Case 2: Clean proposal from a known address (should pass all rules)
  .then(() => evaluateProposal(2, 500, "known_addr", "Funding Q3 marketing campaign for community growth"))

  // Case 3: Known address but suspicious justification (Rule 2 fires only)
  .then(() => evaluateProposal(3, 200, "trusted_vendor", "ok"))

  .catch(console.error);