## 2024-10-24 - Intl.DateTimeFormat is a rendering bottleneck
**Learning:** In large tables (like the WBS rendering hundreds of tasks with multiple dates), `Intl.DateTimeFormat` (even shared) and string parsing via `parseISO(iso)` adds measurable latency.
**Action:** When working with standardized ISO strings (`YYYY-MM-DD...`), directly slice the string to extract date components when formatting. It's up to 10x faster and visually identical.
