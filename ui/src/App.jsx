import { useState } from "react";
import "./App.css";

// The main app, a single-page proposal evaluation form.
// User fills in proposal details, clicks Evaluate, sees the verdict.
export default function App() {
  const [form, setForm] = useState({
    id: "",
    amount: "",
    recipient: "",
    justification: "",
  });
  const [result, setResult] = useState(null);   // holds the verdict after evaluation
  const [loading, setLoading] = useState(false); // shows spinner while agent runs

  // Update form state as user types
  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // Send proposal to the agent backend and store the result
  async function handleEvaluate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("http://localhost:4000/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(form.id),
          amount: Number(form.amount),
          recipient: form.recipient,
          justification: form.justification,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Could not reach the agent. Is the server running?" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <header>
        <h1>DAO Treasury Monitor</h1>
        <p>AI-powered proposal risk evaluation on Casper Network</p>
      </header>

      {/* Proposal form */}
      <section className="card">
        <h2>Submit a Proposal</h2>

        <label>Proposal ID</label>
        <input name="id" type="number" value={form.id} onChange={handleChange} placeholder="1" />

        <label>Amount (CSPR)</label>
        <input name="amount" type="number" value={form.amount} onChange={handleChange} placeholder="500" />

        <label>Recipient Address</label>
        <input name="recipient" value={form.recipient} onChange={handleChange} placeholder="0x123...abc" />

        <label>Justification</label>
        <textarea name="justification" value={form.justification} onChange={handleChange}
          placeholder="Describe what the funds will be used for..." rows={4} />

        <button onClick={handleEvaluate} disabled={loading}>
          {loading ? "Evaluating..." : "Evaluate Proposal"}
        </button>
      </section>

      {/* Verdict panel, only shown after evaluation */}
      {result && !result.error && (
        <section className="card">
          <h2>Verdict</h2>

          {/* Big status badge */}
          <div className={`badge ${result.flagged ? "flagged" : "clean"}`}>
            {result.flagged ? "⚠ FLAGGED" : "✓ CLEAN"}
          </div>

          {/* Deterministic rule violations */}
          <div className="verdict-section">
            <h3>Rule Check</h3>
            <p>{result.deterministicVerdict}</p>
          </div>

          {/* AI qualitative opinion */}
          <div className="verdict-section ai">
            <h3>AI Analysis</h3>
            <p>{result.aiOpinion}</p>
          </div>
        </section>
      )}

      {/* Error state */}
      {result?.error && (
        <section className="card error">
          <p>{result.error}</p>
        </section>
      )}
    </div>
  );
}