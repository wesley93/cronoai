## 2024-11-06 - [MEDIUM] Fix weak random number generation
**Vulnerability:** The application used `Math.random()` to generate unique identifiers (UIDs) in `src/lib/format.ts`.
**Learning:** `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG). Its outputs can be predictable, potentially allowing an attacker to guess UIDs and exploit vulnerabilities like Insecure Direct Object References (IDOR).
**Prevention:** Always use the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for generating any sensitive or unique identifiers where predictability is a concern.
