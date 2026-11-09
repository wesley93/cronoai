## 2025-02-06 - [Insecure Randomness for UIDs]
**Vulnerability:** [Usage of Math.random() to generate unique IDs for system logs and events]
**Learning:** [Using Math.random() is predictable and cryptographically insecure, which can lead to predictable IDs and potential ID collisions, especially in environments executing concurrently or pseudo-concurrently]
**Prevention:** [Use natively supported crypto.randomUUID() when generating unique identifiers rather than Math.random()]
