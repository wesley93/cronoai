## 2024-11-08 - Avoid O(N^2) WBS hierarchy traversals
**Learning:** Codebase performance anti-pattern: Avoid O(N^2) WBS hierarchy traversals (e.g., repeated array filtering using `.startsWith()` for parent-child matching).
**Action:** Always pre-calculate hierarchical relationships or rollups in a single bottom-up O(N) pass.
