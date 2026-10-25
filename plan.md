1. **Optimize `msProjectTasks` in `useProjectStore.ts`**
   - In `msProjectTasks`, for every summary task, it currently filters all leaves using `startsWith`. This is an O(S * L) operation where S is the number of summaries and L is the number of leaves.
   - We will replace `leaves.value.filter((k) => k.wbs.startsWith(t.wbs + '.'))` with a much faster lookup by pre-grouping leaves by their summary's WBS.
   - We will write a simple grouping loop before the `.map()`:
     ```typescript
     const kidsBySummary = new Map<string, Task[]>()
     for (const leaf of leaves.value) {
       const parts = leaf.wbs.split('.')
       let current = ''
       for (let i = 0; i < parts.length - 1; i++) {
         current = current ? `${current}.${parts[i]}` : parts[i]
         let list = kidsBySummary.get(current)
         if (!list) kidsBySummary.set(current, (list = []))
         list.push(leaf)
       }
     }
     ```
   - Then replace `const kids = leaves.value.filter(...)` with `const kids = kidsBySummary.get(t.wbs) || []`.
2. **Optimize `rollupSummaries` in `src/lib/wbs.ts`**
   - Similarly, in `rollupSummaries`, it calls `childrenOf(tasks, s)` inside a loop over all summary tasks.
   - We will use the same pre-grouping approach inside `rollupSummaries`.
3. **Optimize `buildEdges` in `src/lib/cpm.ts`**
   - In `buildEdges`, it calls `leafDescendants(pred)` which does `leaves.filter((l) => l.wbs.startsWith(summary.wbs + '.'))`.
   - We will use the same pre-grouping strategy for leaf descendants to prevent O(L^2) or O(S*L) scaling in CPM calculations, which block the main thread since `computeSchedule` is completely synchronous and runs on every edit.
4. **Complete Pre-Commit Steps**
   - I will check test coverage, run tests and formatting before committing.
