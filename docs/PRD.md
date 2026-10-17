# PRD — Orbita (working name)

Status: Draft for review · Phase 1 · 2026-10-18

## 1. Problem

An online services center in Uzbekistan (government digital services and other paid online services) has no consistent way to:

- assess job candidates against the real requirements of a specific specialty;
- decide a fair starting level and salary range;
- evaluate employees on verified work instead of impressions;
- separate long-term professional growth from one month's results;
- distribute monthly rewards transparently and without duplicates;
- show employees exactly what they need to reach the next level.

## 2. Goals and non-goals

**Goals (MVP)**
1. Specialty-specific candidate assessment with a human-approved report, starting-level and salary-range recommendation.
2. Evidence-based monthly performance assessment with deterministic, reproducible scores.
3. Configurable career levels with gate competencies and an approval-based promotion flow.
4. Monthly ranking within comparable cohorts and a configurable reward recommendation flow.
5. AI assistance for drafting, explaining and gap analysis — always reviewed by a human.
6. CRM-ready architecture; manual entry and CSV import until the CRM is known.

**Non-goals (MVP)**
- Payroll or payout integration; the system never moves money.
- Automatic hiring, rejection, promotion or salary decisions.
- Real CRM adapter (no API documentation yet).
- Public self-registration for employees.
- Market salary benchmarking.

## 3. Users

| Persona | Main jobs |
|---|---|
| **Administrator** (owner, HR lead) | Configure specialties, rubrics, levels, salary bands, reward policies, users, roles; read audit log. |
| **Manager / HR / Evaluator** | Assess candidates, verify evidence, review assessments, recommend and (with permission) approve promotions and rewards. Scoped to their org units. |
| **Employee** | Submit evidence, see own results and level requirements, follow development plan, appeal. |
| **Candidate** | Complete an assigned assessment through a secure expiring link. |

## 4. Core concepts (glossary)

| Term (en) | Uzbek UI term | Meaning |
|---|---|---|
| Specialty | Mutaxassislik | Professional family (e.g. Government services operator). Owns rubrics. |
| Position | Lavozim | Job title within a specialty; salary bands attach to position + level. |
| Competency | Kompetensiya | Skill/knowledge area, reusable across specialties. |
| Career level | Kasbiy daraja | Long-term level (example: Junior → Middle → Senior → Lead). |
| Rubric / version | Baholash mezonlari / versiya | Weighted criteria; versions immutable once used. |
| Criterion | Mezon | One weighted item in a rubric. |
| Gate | Majburiy mezon | Criterion with a minimum score that blocks level recommendations when failed. |
| Evidence | Dalil | Verifiable work record (service record, sale, training, mentoring, work sample…). |
| Period | Baholash davri | Calendar month by default (Asia/Tashkent). |
| Assessment | Baholash | One scored evaluation: candidate, monthly performance, or level review. |
| Reward | Mukofot | Cash or non-cash recognition proposed by a policy. |

## 5. User stories and acceptance criteria

### 5.1 Configuration (Admin)
- **C1** As an admin I create a specialty, positions and competencies.
  *AC:* names stored per language (uz required, ru/en optional, fallback to uz); unique key per org.
- **C2** As an admin I build a rubric version with weighted criteria and preview it.
  *AC:* weights in percent with 2 decimals in UI (stored as basis points); "Activate" disabled until sum = 100.00 %; live error message shows the difference; activating creates an audit event.
- **C3** I edit an active rubric.
  *AC:* if any assessment used it, the editor clones it into a new DRAFT version; the old version stays readable.
- **C4** I define career levels and per-specialty competency thresholds and gates.
  *AC:* levels can be renamed, reordered, disabled; seeded levels display an "Unapproved example" badge until approved.
- **C5** I define salary bands for position × level and reward policies.
  *AC:* min ≤ max, UZS integers; overlapping effective periods for the same position × level are rejected.

### 5.2 Candidate assessment
- **K1** As a manager I create a candidate for a position and invite them to that specialty's active candidate rubric.
  *AC:* invite link shown once and copyable; token stored hashed; expires in 72 h (configurable); can be revoked.
- **K2** As a candidate I open the link, see instructions in my chosen language, answer questions, and submit.
  *AC:* autosave; time limit optional; after submit the link stops working; I see only a completion confirmation (default policy).
- **K3** Multiple-choice answers are auto-scored; written/practical answers wait for human scoring.
  *AC:* AI may suggest a score with rationale; the evaluator must accept or change it; both values stored.
- **K4** As a manager I see the candidate report.
  *AC:* overall score, per-criterion scores with evidence (answers), measured vs AI-estimated clearly labelled, gates passed/failed, recommended starting level, salary range from approved band (or "band not configured"), evidence coverage, strengths, gaps, suggested training.
- **K5** As a manager I record a hiring decision (Hire / Reject / Hold) with a note.
  *AC:* decision requires a human; audit event; creating an employee from a hired candidate pre-fills data.

### 5.3 Evidence and monthly performance
- **E1** As an employee I submit evidence for a period (type, description, date, optional file, optional amounts).
  *AC:* file type/size validated; status SUBMITTED; manager notified.
- **E2** As a manager I verify or reject evidence (reason required on reject) within my scope.
  *AC:* I cannot verify my own evidence; employee notified.
- **E3** As a manager I open a period assessment for an employee.
  *AC:* system pre-computes metric criteria from VERIFIED evidence, lists missing/pending evidence; status INCOMPLETE until requirements are met.
- **E4** I review, adjust manual criteria, add feedback and approve.
  *AC:* total recalculated deterministically; approval locks scores; audit event; employee notified.
- **E5** As an employee I see my result with component breakdown and feedback, and may appeal within N days (default 14).
  *AC:* appeal requires a reason; resolution either upholds or triggers reassessment (new assessment linked to the original; original kept).

### 5.4 Career progression
- **P1** The system shows each employee the next level's requirements and their current gap.
- **P2** A manager creates a promotion recommendation.
  *AC:* system evaluates level thresholds and gates using approved assessments; failed gates are shown and block the "Recommend" action unless the rule is configured as advisory.
- **P3** An approver approves or rejects.
  *AC:* approver ≠ recommender (configurable, default on); on approval a level-history row is written; salary review is a separate compensation recommendation.

### 5.5 Ranking and rewards
- **R1** For a closed period I see rankings per cohort (specialty + rubric version).
  *AC:* cohort < 3 → no rank shown; ties share rank; components and verified vs pending evidence visible.
- **R2** The system generates reward recommendations from an active policy.
  *AC:* deterministic; amounts in whole UZS rounded down to step; never exceed budget; unallocated remainder shown.
- **R3** An approver approves/cancels; finance marks paid.
  *AC:* a second recommendation for the same employee + period + policy is impossible; PROPOSED / APPROVED / PAID clearly distinguished.

### 5.6 AI assistance
- **A1** Draft candidate questions for a rubric criterion; drafts must be approved before use.
- **A2** Explain an assessment: per-criterion reasoning with evidence references, coverage, limitations, next step.
- **A3** Suggest skill gaps and development activities; employee/manager can accept into the development plan.
- **A4** If AI fails, show an error with retry; all non-AI flows keep working.

### 5.7 Import and CRM readiness
- **I1** Admin imports employees and service records via CSV with a dry-run validation report.
  *AC:* re-importing the same rows creates no duplicates; row-level errors listed.
- **I2** Integrations page shows CRM status `Not configured` with a description of what is needed.

### 5.8 Platform
- Login, logout, forgot/reset password, session expiry, 401/403 pages.
- Language (uz/ru/en) and theme (light/dark/system) selectors in the shell; preferences saved to the user profile.
- In-app notifications for: assessment assigned, review needed, evidence verified/rejected, reward approved, appeal updated.
- Role-aware dashboard with honest empty states.

## 6. Screens (route map)

```
/login  /forgot-password  /reset-password/[token]
/a/[token]                       Candidate assessment (public, tokenized)
/                                Dashboard (role-aware)
/employees  /employees/[id]      (tabs: overview, level, assessments, evidence, development, compensation*)
/candidates /candidates/[id]     (tabs: profile, invitations, report, decision)
/assessments /assessments/[id]   (review screen, AI panel, history)
/evidence                        (my evidence / verification queue)
/levels                          Career framework
/performance                     Periods, rankings
/rewards                         Policies, recommendations, budget
/ai                              AI center: runs history, drafts awaiting approval
/settings/{organization,specialties,positions,competencies,rubrics,levels,salary-bands,reward-policies,users,roles,integrations,import,audit}
/me                              Profile, preferences
/dev/ui                          Component gallery (dev only)
```
`*` visible only with `compensation:read` or to the employee themself.

## 7. Success metrics (to confirm with owner)
- 100 % of approved assessments reproducible from stored rubric version + inputs.
- Time to produce a candidate report after submission < 10 minutes of manager effort.
- Zero duplicate reward records.
- ≥ 80 % of monthly assessments reach COMPLETE without manual evidence chasing after month 3.

## 8. Risks
| Risk | Mitigation |
|---|---|
| Business rules unknown (bands, budgets, promotion rules) | Configurable, seeded as `UNAPPROVED`, listed in OPEN_QUESTIONS. |
| Perceived unfairness of AI | AI only suggests; every number traceable; appeals. |
| Personal-data law (localization, cross-border transfer) | In-country hosting option, pseudonymized AI calls, legal review before production. |
| CRM unknown | Adapter interface + CSV import; no invented endpoints. |
| Cross-specialty comparison misleads | Ranking cohorts restricted by design. |
