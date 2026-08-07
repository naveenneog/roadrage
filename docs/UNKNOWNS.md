# Road Rash Bharat — Known unknowns

> The most expensive failure in AI-assisted engineering is not "I don't know".
> It is **"I didn't know, and I didn't say so."**
>
> Log unknowns **before** implementing. Close each one before the packet that depends on it ships.

**States:** `OPEN` (blocks release) · `RESEARCHED` (primary source + date) ·
`ASSUMED` (blast radius + a detector that would catch it being wrong) ·
`RESOLVED` (proved by our own test/measurement) · `MOOT` (design changed)

| ID | Packet | Unknown | State | Resolution | Source / risk |
|----|--------|---------|-------|------------|---------------|
| U-1 | P-1 | <what you don't know> | OPEN | — | — |

---

## Watchwords
If you catch yourself writing **"should be" · "typically" · "usually" · "I believe" · "probably" ·
"something like"** — that is an unknown wearing a hedge. Verify it, or log it here.

## Closing an unknown
- **RESEARCHED** — primary source (official docs > source > release notes), the **version** you
  checked against, and the **date**. Not a blog post for a version number.
- **ASSUMED** — state the consequence if wrong, and name the test/measurement that would catch it.
  An assumption with no detector is a guess with better formatting.
- **RESOLVED** — link the test or the measurement run.
