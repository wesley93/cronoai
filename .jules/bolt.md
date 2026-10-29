## 2025-01-20 - Fast path for calendar working days counting
**Learning:** `countWorkingBetween` was implemented iteratively using strings parsing and Date manipulation for every day in between `fromIso` and `toIso`. It's called extensively by `computeSchedule` and `computeSCurve`.
**Action:** Adding a fast-path which utilizes the precomputed `dates` array in `WorkCalendar` (specifically via `indexByDate` and `indexOnOrAfter`) speeds up the counting from ~3.1ms per 10k calls to ~0.02ms. This leads to a massive speedup in `computeSCurve` which repeatedly loops and measures days across tasks.
