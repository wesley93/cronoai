## 2024-05-17 - O(1) Lookups in Heavy CPM/EVM Loops
**Learning:** `countWorkingBetween` was operating in O(N) by manually counting days between two dates. Since it's deeply nested inside timeline rendering, EVM metrics calculations, and Critical Path Methods across the entire project (calling it thousands of times per re-render), this created a significant bottleneck.
**Action:** Always pre-compute a lookup table (`indexByDate`) on instantiation and check it first to ensure O(1) performance before falling back to iterative counting for out-of-bounds dates.
