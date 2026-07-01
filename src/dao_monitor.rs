use odra::prelude::*;

/// This is the on-chain record of an agent's evaluation of a single treasury proposal.

/// `flagged` is the agent's verdict: true if the proposal violated one or more
/// rules, and false if it passed all checks ("clean").

/// `reason` is a human-readable explanation. When flagged, it lists every rule
/// that was violated (joined by "; "); when clean, it simply reads "clean".
/// This is what makes the agent's decision auditable rather than a black box.
#[odra::odra_type]
pub struct Verdict {
    pub flagged: bool,
    pub reason: String,
}

/// DaoMonitor is the on-chain component of the DAO Treasury Proposal Monitor
/// Agent. It never moves funds itself; it only records a verdict for each
/// proposal it is asked to evaluate. Fund movement / access control stays at
/// the smart contract gate that actually disburses funds, outside this module.
#[odra::module]
pub struct DaoMonitor {
    /// The DAO's configurable ceiling for a "reasonable" single proposal
    /// amount. Proposals above this trigger Rule 1. A value of 0 means no
    /// threshold has been set yet, so Rule 1 is skipped (we don't want an
    /// unset threshold of 0 to flag every proposal by accident).
    max_threshold: Var<u64>,

    /// Tracks which recipient addresses have a prior history with this DAO.
    /// Maps recipient (as a string identifier) -> has been seen before.
    /// Used for Rule 3 (first-time-address flag).
    known_addresses: Mapping<String, bool>,

    /// The permanent log of every verdict ever issued, keyed by proposal id.
    /// This is the agent's audit trail.
    verdict_log: Mapping<u64, Verdict>,
}

#[odra::module]
impl DaoMonitor {
    // Empty constructor, Odra initializes storage lazily via get_or_default()
    // so we don't need to explicitly set 0 here.
    pub fn init(&mut self) {}
    
    /// DAO admin entry point: sets the maximum amount considered "reasonable"
    /// for a single proposal before Rule 1 (oversized amount) triggers.
    pub fn set_threshold(&mut self, amount: u64) {
        self.max_threshold.set(amount);
    }

    /// Read-only: returns the currently configured threshold.
    pub fn get_threshold(&self) -> u64 {
        self.max_threshold.get_or_default()
    }

    /// DAO admin entry point: manually marks a recipient address as known,
    /// e.g. to pre-approve a vendor the DAO already has a relationship with,
    /// without that vendor having to pass through evaluate_proposal first.
    pub fn register_address(&mut self, recipient: String) {
        self.known_addresses.set(&recipient, true);
    }

    /// Read-only: checks whether a recipient address has prior history.
    pub fn is_known(&self, recipient: String) -> bool {
        self.known_addresses.get_or_default(&recipient)
    }

    /// The agent's core decision function. Applies three deterministic rules
    /// to a proposal and writes the resulting verdict on-chain.
    
    /// Rule 1: Oversized amount: amount exceeds the DAO's configured
    ///          max_threshold (skipped if threshold is unset / 0).
    /// Rule 2: Weak justification: justification text is empty or under
    ///          10 characters after trimming whitespace. Deterministic
    ///          length check only; no LLM judgment call here by design,
    ///          to keep this safety-critical path reliable and auditable.
    /// Rule 3: Unknown recipient: this is the first time this address has
    ///          appeared in the system.
    
    /// A proposal is flagged if ANY rule is violated. The reason field lists
    /// every violated rule so the verdict is fully explainable after the
    /// fact. After evaluation, the recipient is marked as known regardless
    /// of the verdict (the address now has history for next time).
    pub fn evaluate_proposal(
        &mut self,
        id: u64,
        amount: u64,
        recipient: String,
        justification: String,
    ) -> Verdict {
        let threshold = self.max_threshold.get_or_default();
        let mut reasons: Vec<String> = Vec::new();

        // Rule 1: oversized amount
        if threshold > 0 && amount > threshold {
            reasons.push(String::from("amount exceeds threshold"));
        }

        // Rule 2: justification too short or missing
        if justification.trim().len() < 10 {
            reasons.push(String::from("justification missing or too short"));
        }

        // Rule 3: recipient has no prior history
        if !self.known_addresses.get_or_default(&recipient) {
            reasons.push(String::from("recipient has no prior history"));
        }

        let flagged = !reasons.is_empty();
        let reason = if flagged {
            reasons.join("; ")
        } else {
            String::from("clean")
        };

        // Persist the verdict permanently in the audit log.
        self.verdict_log.set(&id, Verdict { flagged, reason: reason.clone() });

        // Whether flagged or clean, this recipient now has history.
        self.known_addresses.set(&recipient, true);

        Verdict { flagged, reason }
    }

    /// Read-only: looks up a past verdict by proposal id. Returns None if no
    /// proposal with that id has ever been evaluated.
    pub fn get_verdict(&self, id: u64) -> Option<Verdict> {
        self.verdict_log.get(&id)
    }
}

#[cfg(test)]
mod tests {
    use super::DaoMonitor;
    use odra::host::{Deployer, NoArgs};

    #[test]
    fn flags_oversized_unjustified_proposal_from_unknown_address() {
        let env = odra_test::env();
        let mut contract = DaoMonitor::deploy(&env, NoArgs);

        contract.set_threshold(1000);
        let verdict = contract.evaluate_proposal(
            1,
            5000,
            "unknown_addr".to_string(),
            "pls".to_string(),
        );
        assert!(verdict.flagged);
    }

    #[test]
    fn clears_reasonable_proposal_from_registered_address() {
        let env = odra_test::env();
        let mut contract = DaoMonitor::deploy(&env, NoArgs);

        contract.set_threshold(1000);
        contract.register_address("known_addr".to_string());
        let verdict = contract.evaluate_proposal(
            2,
            500,
            "known_addr".to_string(),
            "Funding Q3 marketing campaign".to_string(),
        );
        assert!(!verdict.flagged);
    }
}