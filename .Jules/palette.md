## 2024-05-18 - Missing ID and For Linkages in Forms
**Learning:** Found several input and select elements across modules (WbsModule, SupplyModule) that lacked `id` properties and matching `for` attributes on their labels, leading to missing error associations and poorer accessibility.
**Action:** Always link `<label for="id">` with `<input id="id">` or `<select id="id">` elements to ensure the elements are properly associated for screen readers.
