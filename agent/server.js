require("dotenv").config(); // loads OPENROUTER_API_KEY from .env
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const { CasperClient, ContractClient } = require("casper-js-sdk");

const app = express();
app.use(cors());          // allows the React UI to call this server
app.use(express.json());  // parses incoming JSON request bodies

// OpenRouter client, same setup as the agent script
const client = new OpenAI.default({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Live Casper Testnet node and deployed contract details
const CASPER_NODE_URL = "https://rpc.testnet.casperlabs.io/rpc";
const CONTRACT_PACKAGE_HASH = "d1c56241f681405a5f57adc4021e3a642d5c24cd006815e332d59783aef252dd";

// Query the live contract to check if a recipient address has prior history.
// This replaces the hardcoded knownAddresses array that was here before.
// Uses the contract's is_known() entry point via the Casper JS SDK.
async function isKnownOnChain(recipient) {
  try {
    const casperClient = new CasperClient(CASPER_NODE_URL);
    const contractClient = new ContractClient(casperClient);

    // Look up the contract by package hash to get the active contract hash
    const stateRootHash = await casperClient.nodeClient.getStateRootHash();
    const contractPackageData = await casperClient.nodeClient.getBlockState(
      stateRootHash,
      `hash-${CONTRACT_PACKAGE_HASH}`,
      []
    );

    // Extract the active contract hash from the package
    const activeContractHash =
      contractPackageData.ContractPackage.versions[
        contractPackageData.ContractPackage.versions.length - 1
      ].contract_hash.replace("contract-", "");

    contractClient.setContractHash(`hash-${activeContractHash}`);

    // Call is_known() on the live contract with the recipient address
    const result = await contractClient.queryContractData(
      ["known_addresses", recipient]
    );

    // result is a CLBool — true if address is known, false/undefined if not
    return result === true || result?.data === true;
  } catch (err) {
    // If the key doesn't exist in the mapping, the SDK throws — that means
    // the address is not known. Any other error, we fail safe (treat as unknown).
    console.warn(`is_known query failed for ${recipient}:`, err.message);
    return false;
  }
}

// The three deterministic rules, mirroring the on-chain contract logic.
// Now async because Rule 3 queries the live contract instead of a local array.
async function applyRules(amount, recipient, justification, threshold = 1000) {
  const reasons = [];

  // Rule 1: proposal amount exceeds the DAO's configured limit
  if (threshold > 0 && amount > threshold)
    reasons.push("amount exceeds threshold");

  // Rule 2: justification is too short to be meaningful
  if (justification.trim().length < 10)
    reasons.push("justification missing or too short");

  // Rule 3: query live contract — recipient has no prior history on-chain
  const known = await isKnownOnChain(recipient);
  if (!known)
    reasons.push("recipient has no prior history");

  return reasons;
}

// Ask the LLM for a qualitative opinion on the justification text.
// Deterministic rules can't judge intent — the LLM can.
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

// POST /evaluate — the single endpoint the UI calls
app.post("/evaluate", async (req, res) => {
  const { id, amount, recipient, justification } = req.body;

  // Run deterministic rules first (now queries live contract for Rule 3)
  const violations = await applyRules(amount, recipient, justification);
  const flagged = violations.length > 0;
  const deterministicVerdict = flagged
    ? `FLAGGED — ${violations.join("; ")}`
    : "CLEAN";

  // Then get AI qualitative opinion on the justification text
  const aiOpinion = await analyzeJustification(justification);

  // Return the full verdict to the UI
  res.json({ id, flagged, deterministicVerdict, aiOpinion });
});

// Start the server — use the platform's assigned port, fall back to 4000 locally
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Agent server running on port ${PORT}`);
});