# Open Questions — need the owner's answer

Each item has a **safe default** the system uses until answered. Defaults are configurable and shown as "Unapproved" where relevant.

## Business policy

| # | Question | Safe default until answered |
|---|---|---|
| Q1 | Which specialties exist today and how many people are in each? | Seed 3 demo specialties: Government services operator, Customer support, Sales |
| Q2 | Career levels: names, count, and what distinguishes them per specialty? | 4 example levels (Junior/Middle/Senior/Lead), UNAPPROVED |
| Q3 | Promotion rules: minimum time at level, number of approved reviews, who approves? | 1 approved level review; approver needs `promotion:approve`; approver ≠ recommender |
| Q4 | Salary bands per position × level (UZS)? | None configured → salary recommendation shows "band not configured". Demo seed has obviously illustrative bands |
| Q5 | Monthly reward budget, eligibility rules, formula, per-person cap? | Proportional-above-threshold example, UNAPPROVED; no real budget |
| Q6 | Should rewards be per specialty pool or one company pool? | Per specialty (fair comparison) |
| Q7 | Non-cash recognition types? | "Recognition" with free-text title |
| Q8 | Monthly performance criteria and weights per specialty? | Demo rubrics as in SCORING_MODEL.md, UNAPPROVED |
| Q9 | Which records count as revenue? Is `serviceFee` the right concept (company commission vs state duty)? | Only `serviceFee`; `governmentFee` stored, never counted |
| Q10 | Is there a QA/error-checking process today that produces error data? | Quality criterion uses manager-verified error records |
| Q11 | How is customer satisfaction measured today (CSAT, reviews, none)? | CSAT 1–5 evidence type, optional |
| Q12 | Appeal window and who resolves appeals? | 14 days; resolver needs `appeal:resolve`, must not be the original approver |
| Q13 | Candidate result visibility: confirmation only, score, or full report? | Completion confirmation only |
| Q14 | Org structure: branches/teams, who manages whom? | One org unit per branch, editable |

## CRM

| # | Question | Default |
|---|---|---|
| Q15 | Which CRM product (name, version, hosted where)? | Status `NOT_CONFIGURED` |
| Q16 | API documentation, auth method, rate limits, webhooks? | Mock adapter only |
| Q17 | Which CRM fields identify an employee and a completed service, and which fields are fees? | CSV import with our own column names |
| Q18 | Can CRM records be corrected after the fact (refunds, cancellations)? | Corrections via re-import with same external id update the record and are audited |

## Privacy, legal, hosting

| # | Question | Default |
|---|---|---|
| Q19 | Hosting location. Uzbekistan's personal-data law requires citizens' personal data to be stored on servers in Uzbekistan (2021 amendment). Where will production run? | Architecture supports in-country hosting of DB and files; no cloud-specific services |
| Q20 | Is sending pseudonymized assessment content to a foreign AI API acceptable (cross-border transfer, consent)? | AI provider = Mock until legal approves; per-org AI on/off switch |
| Q21 | Retention periods for candidates, evidence, assessments, audit, AI runs | Placeholders in SECURITY.md §7; retention job disabled |
| Q22 | Candidate consent text and employee notice about evaluation | Placeholder texts marked "Requires legal review" |
| Q23 | Is registration with the personal-data authority or an internal regulation (ichki tartib qoidalari) required for employee evaluation? | Flagged; no claim of compliance |
| Q24 | Antivirus scanning for uploaded evidence files in production? | Type/size allow-list only |

## Product & operations

| # | Question | Default |
|---|---|---|
| Q25 | Final product name and brand colors | "Orbita", neutral palette with one accent |
| Q26 | Login method: email + password enough, or also Telegram/OneID/SSO later? | Email + password; SSO deferred |
| Q27 | Who are the first pilot users (one branch? one specialty?) | Design for single-org pilot |
| Q28 | Reference documents for government procedures (who provides, how often updated)? | AI never drafts procedure questions without an approved reference document |
