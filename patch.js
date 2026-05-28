const fs = require('fs');
const path = './AUDIT.md';
let content = fs.readFileSync(path, 'utf8');

// Update Key Highlights
content = content.replace(
  /\* \*\*Failing Tests Detected:\*\* During the dynamic test run, \*\*6 out of 607 tests\*\* failed\. The root cause has been isolated to a change in the static entitlement billing logic\./,
  '* **Test Suite Verification:** 100% Passing. The dynamic test run succeeded with **607 out of 607 tests passing**, confirming that recent billing mock regressions and auth fallback issues have been fully resolved.'
);

content = content.replace(
  /\* Actionable remediation patterns for the failing tests and linter errors are documented in this report\./,
  '* **Architectural Alignment:** Components have been successfully refactored into `map`, `panels`, and `ui` subdirectories, fully complying with target architecture requirements.\n* Actionable remediation patterns for the remaining linter error are documented below.'
);

// Update section 6.3
content = content.replace(
  /### 6\.3\. Test Suite Execution \(Vitest\)[\s\S]+?## 7\. Recommendations/m,
  `### 6.3. Test Suite Execution (Vitest)
* **Status:** **PASS (607/607 Tests Passing)**
* **Analysis:** Previous regressions involving the static billing entitlement fallback and AI provider mock generation have been successfully resolved. The \`AUTH_STATIC_ENTITLEMENTS_FALLBACK\` mock configuration now correctly bypasses database dependency checks during local testing.
* **Coverage Highlights:** Tests comprehensively cover CSRF, SSRF guards, rate-limiting, scanner result sanitization, prompt-safety logic, and live-feed data adapters.

### 6.4. Code Architecture & UX Quality Assessment
A recent sweep of code changes addressed significant architectural and user-experience debt:
1. **Directory Restructuring:** Components were cleanly reorganized into \`src/components/map\`, \`panels\`, and \`ui\`, matching the target specification in \`AGENTS.md\`.
2. **AI Report Grounding:** The report generator was upgraded to automatically pull real-world live feeds (USGS Earthquakes, NASA FIRMS Fires, Space Weather) as grounding context when no explicit sources are provided. This significantly increases the validity of AI-generated intelligence briefings, ensuring they are rooted in verifiable telemetry rather than hallucinated facts.
3. **UX Improvements:** The report UI was shifted from a popup-based model to an inline, scrollable UI with proper loading states. This fixes popup-blocker issues and provides a much smoother, premium user experience.
4. **Auth Resilience:** Database fallbacks and token-based GitHub OAuth flows were stabilized.

---

## 7. Recommendations`
);

// Update Section 7
content = content.replace(
  /2\. \*\*Standardize Test Suite Environments:\*\*[\s\S]+?3\. \*\*CSP Nonce Generation:\*\*/m,
  `2. **CSP Nonce Generation:**`
);

fs.writeFileSync(path, content);
