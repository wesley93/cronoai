## 2025-02-27 - O(1) Calendar diffs
**Learning:** `countWorkingBetween` was O(N) by day-stepping, becoming a massive bottleneck on large schedules. The `WorkCalendar` object already maintains an internal index mapping dates to working day offsets relative to `baseDate`.
**Action:** Replace the iterative loop with index subtraction via `indexOnOrAfter` to jump straight to the difference in working days, dropping runtime from ~30s per 10k iterations to ~0.02s per 10k.
