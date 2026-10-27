## 2025-02-14 - Weak Random Number Generation in UIDs
**Vulnerability:** Weak random number generation using `Math.random()` to generate UIDs.
**Learning:** `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG) and shouldn't be used to create tokens or unique IDs, as it could result in predictable output.
**Prevention:** Use `crypto.randomUUID()` or `crypto.getRandomValues()` to generate cryptographically secure random values instead of relying on `Math.random()`.
