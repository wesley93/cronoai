## 2024-05-18 - [Weak Random Number Generation Fallback]
**Vulnerability:** Weak random number generation using `Math.random()` for unique identifiers (`uid`) in `src/lib/format.ts`.
**Learning:** `Math.random()` is not cryptographically secure and can lead to collisions or predictable values. While standard, modern environments provide `crypto.randomUUID()` which generates a cryptographically secure random UUID v4.
**Prevention:** Avoid `Math.random()` for IDs where uniqueness and unpredictability are important. Always prefer `crypto.randomUUID()` when available in modern browser/Node contexts.
