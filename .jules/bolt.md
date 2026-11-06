## 2024-11-06 - O(N^2) WBS Hierarchy Traversal Optimization
**Learning:** Found an anti-pattern in `src/lib/wbs.ts` where finding children tasks in the WBS hierarchy (`childrenOf`) uses `filter()` with `.startsWith()` in loops, causing O(N^2) performance bottlenecks when processing schedules or rolling up summaries.
**Action:** Implemented `buildWbsIndex` to construct an O(N) map of WBS-to-children relationships in a single pass. Used this index to provide O(1) lookups during summary rollups, effectively optimizing the `rollupSummaries` traversal.
