## 2023-10-25 - O(N^2) Lag in Vue Reactivity from WBS string operations
**Learning:** In highly reactive Vue applications that constantly recompute graphs or tree state (like Gantt/CPM), looping over summary tasks and then `.filter(l => l.wbs.startsWith(summary.wbs))` causes O(S * L) complexity. This blocked the main thread on every state mutation (e.g. typing in inputs).
**Action:** Replace nested loops matching parent WBS strings with O(N) pre-grouping maps (`Map<string, Task[]>`). Always look out for `.filter` operations inside computed property `.map` operations.
