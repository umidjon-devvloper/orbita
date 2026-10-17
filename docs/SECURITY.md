# Security & Privacy — Orbita

Status: Draft for review · Phase 1. This document describes design intent; it is **not** a statement of legal compliance.

## 1. Data classification

| Class            | Examples                                                                                                                 | Who can read                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Restricted**   | salary bands, compensation recommendations, reward amounts, password hashes, session/token hashes                        | Admin; users with `compensation:read`; the employee for their own records |
| **Confidential** | assessments, criterion scores, evidence and attachments, appeals, candidate answers, hiring decisions, development plans | Admin; managers within scope; the employee for own records                |
| **Internal**     | employee directory (name, position, unit, level name), specialties, rubric definitions                                   | Any authenticated staff user                                              |
| **Public**       | login page, candidate instructions behind a valid token                                                                  | Anyone with the link                                                      |

Customer data from the CRM (end-customers of the services center) is **not needed** for assessments. Import only aggregated or pseudonymous service-record fields; never import customer passport data, PINFL, phone numbers or document scans.

## 2. Permission catalogue

| Key                                                      | Meaning                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| `org:manage`                                             | organization settings, org units                                 |
| `user:manage`, `role:manage`                             | users, roles, assignments                                        |
| `config:manage`                                          | specialties, positions, competencies, levels, rubrics, questions |
| `compensation:manage`                                    | salary bands                                                     |
| `compensation:read`                                      | see salary bands and compensation recommendations                |
| `employee:read`, `employee:manage`                       | employee records                                                 |
| `candidate:read`, `candidate:manage`                     | candidates, invites, hiring decisions                            |
| `assessment:conduct`                                     | create assessments, enter scores                                 |
| `assessment:approve`                                     | approve / reject assessments                                     |
| `evidence:submit`                                        | submit own evidence                                              |
| `evidence:verify`                                        | verify / reject evidence                                         |
| `appeal:submit`, `appeal:resolve`                        | appeals                                                          |
| `promotion:recommend`, `promotion:approve`               | promotions                                                       |
| `reward_policy:manage`                                   | reward policies and budgets                                      |
| `reward:recommend`, `reward:approve`, `reward:mark_paid` | reward lifecycle                                                 |
| `ai:use`, `ai:configure`                                 | run AI features; configure provider                              |
| `import:run`, `integration:manage`                       | CSV import; CRM connection                                       |
| `report:read`                                            | reports within scope                                             |
| `audit:read`                                             | audit log                                                        |

Each grant has a scope: `OWN`, `ORG_UNIT` (unit + descendants) or `ORG`.

## 3. Default roles (seeded, editable)

| Permission                                                                                                   | Admin | Manager/HR         | Employee |
| ------------------------------------------------------------------------------------------------------------ | ----- | ------------------ | -------- |
| org/user/role/config/compensation:manage, reward_policy:manage, integration:manage, ai:configure, audit:read | ORG   | –                  | –        |
| employee:read                                                                                                | ORG   | ORG_UNIT           | OWN      |
| employee:manage                                                                                              | ORG   | –                  | –        |
| candidate:read/manage                                                                                        | ORG   | ORG_UNIT           | –        |
| assessment:conduct, assessment:approve                                                                       | ORG   | ORG_UNIT           | –        |
| evidence:submit                                                                                              | –     | OWN                | OWN      |
| evidence:verify                                                                                              | ORG   | ORG_UNIT           | –        |
| appeal:submit                                                                                                | –     | OWN                | OWN      |
| appeal:resolve                                                                                               | ORG   | ORG_UNIT           | –        |
| promotion:recommend                                                                                          | ORG   | ORG_UNIT           | –        |
| promotion:approve, reward:approve                                                                            | ORG   | (grant explicitly) | –        |
| reward:recommend                                                                                             | ORG   | ORG_UNIT           | –        |
| reward:mark_paid                                                                                             | ORG   | –                  | –        |
| compensation:read                                                                                            | ORG   | (grant explicitly) | OWN      |
| ai:use                                                                                                       | ORG   | ORG_UNIT           | –        |
| import:run                                                                                                   | ORG   | –                  | –        |
| report:read                                                                                                  | ORG   | ORG_UNIT           | –        |

Candidates have no account; they act only through a token bound to one assessment.

**Separation of duties (on by default, configurable per org):** nobody verifies their own evidence, approves their own assessment, approves a promotion/reward they recommended, or approves anything about themselves.

Integration tests cover each cell of this matrix: one allowed case and one forbidden case (including out-of-scope org unit).

## 4. Threat model (STRIDE summary)

| Threat                 | Example                               | Control                                                                                                                              |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Spoofing               | credential stuffing                   | Argon2id (m=19 MiB, t=2, p=1), rate limits, generic errors, optional lockout after 10 failures/15 min                                |
| Spoofing               | stolen candidate link                 | 256-bit token, hashed, 72 h expiry, single assessment, revocable, invalid after submit                                               |
| Tampering              | editing a score after approval        | approved assessments immutable; changes only via appeal → reassessment; DB trigger blocks UPDATE on locked rows                      |
| Tampering              | changing a used rubric                | versions locked on first use (application check + DB trigger)                                                                        |
| Repudiation            | "I didn't approve that"               | append-only `AuditEvent` with actor, before/after, request id, IP; UPDATE/DELETE revoked from app role                               |
| Information disclosure | manager sees salaries                 | `compensation:read` required, enforced in API serializers (fields removed, not just hidden)                                          |
| Information disclosure | IDOR on `/employees/:id`              | every query filtered by scope; tests for cross-unit access                                                                           |
| Information disclosure | data sent to AI                       | pseudonymization, field allow-list per prompt, no free-text PII fields sent unless reviewed                                          |
| Information disclosure | notifications leak                    | notification payload contains IDs + generic text; details fetched with permission checks                                             |
| DoS                    | huge uploads / imports                | 10 MB file limit, 5 000-row CSV limit per batch, streaming parse, rate limits                                                        |
| Elevation              | user grants self admin                | `role:manage` required; cannot modify own role assignments; audit                                                                    |
| Injection              | SQL/XSS/CSV formula injection         | Prisma parameterization, React escaping, no `dangerouslySetInnerHTML` for user content, CSV export prefixes `=,+,-,@` cells with `'` |
| AI prompt injection    | evidence text tells model to give 100 | AI cannot write scores; output validated; suggestions shown with source; humans decide                                               |

## 5. Web security controls

- Cookies: `HttpOnly; Secure; SameSite=Lax`, `__Host-` prefix in production.
- CSRF token on all state-changing requests.
- Security headers: strict CSP (no inline scripts except the nonce'd theme script), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` minimal, HSTS in production, `frame-ancestors 'none'`.
- Input validation with Zod on every endpoint; output serialization through response schemas (prevents accidental field leaks).
- Uploads: extension + MIME sniffing (magic bytes) allow-list, size limit, random storage keys, served as attachment, never executed. Antivirus scanning: open question for production.
- Error responses never include stack traces, SQL, or internal IDs of other tenants.
- Dependencies: lockfile committed, `pnpm audit` in CI.

## 6. AI data handling

- Allowed inputs per purpose are defined as Zod schemas; anything not in the schema is not sent.
- Names replaced by stable pseudonyms (`EMP-7f3a`), mapping kept server-side.
- Never sent: passport data, PINFL, phone, email, address, passwords, OTPs, e-signature data, salary amounts, customer identifiers.
- Free-text fields (evidence descriptions, candidate answers) may contain PII typed by users; a regex scrubber removes phone numbers, emails, 14-digit PINFL-like and passport-like patterns before sending. This is best-effort and documented as such.
- AI can be disabled per organization; all flows work without it.
- Provider data-retention terms must be reviewed before production use (open question).

## 7. Retention and deletion (placeholders — require owner + legal approval)

| Data                            | Default placeholder          | Action at end                                                    |
| ------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| Rejected/withdrawn candidates   | 12 months after decision     | anonymize (name, contacts → removed; scores kept for statistics) |
| Hired candidates                | moved to employee record     | —                                                                |
| Evidence attachments            | 3 years after period end     | delete file, keep metadata                                       |
| Assessments, decisions, rewards | 5 years after employment end | anonymize                                                        |
| Audit events                    | 5 years                      | delete                                                           |
| Sessions / reset tokens         | on expiry + 7 days           | delete                                                           |
| AI runs (inputs/outputs)        | 12 months                    | delete payloads, keep metadata                                   |

Implemented as a `retention.sweep` job with dry-run report; disabled until values are approved.

## 8. Legal considerations (for legal review, not legal advice)

- Uzbekistan's Law "On Personal Data" (2019) and its 2021 amendment introduced a requirement that personal data of Uzbek citizens processed with information technologies be collected, systematized and stored in databases physically located in Uzbekistan. The deployment must therefore support **in-country hosting** of the database and file storage.
- Sending pseudonymized assessment content to a foreign AI provider may still be treated as cross-border transfer; legal must confirm whether it is allowed, under what consent, or whether AI must be disabled / self-hosted.
- Candidate consent text (data processing for assessment, retention period, AI assistance) must be approved and shown before the assessment starts.
- Employee monitoring and evaluation rules may require internal regulations (ichki tartib qoidalari) and employee acknowledgment.
- Possible registration requirements with the personal data authority must be checked.

All of the above are listed in OPEN_QUESTIONS.md. The product will not claim compliance.
