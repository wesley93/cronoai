## 2024-05-23 - O(N) WBS traversals
**Learning:** Codebase performance anti-pattern found: O(N^2) WBS hierarchy traversals, particularly via repeated `.startsWith()` filtering on arrays to associate children with parent summary WBS nodes. This issue compounds especially inside Pinia computed properties (like `msProjectTasks` or `rollupSummaries`).
**Action:** Always pre-calculate hierarchical relationships or data aggregations bottom-up in a single O(N) pass, such as by mapping the leaves WBS splits into ancestor prefixes before attempting to construct properties for summary nodes.
