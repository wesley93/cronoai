## 2024-05-15 - O(N²) WBS Rollups
**Learning:** WBS hierarchy traversals using `.startsWith()` for parent-child matching inside loops are O(N²) and cause significant UI block during state updates.
**Action:** Always pre-calculate hierarchical relationships or rollups in a single bottom-up O(N) pass, maintaining a map of summary WBS prefixes to their children tasks.
