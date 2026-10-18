# Frontend review — 18 October 2026

Baseline: application 0.27.1, database 0.13.0. Cleanup release: 0.28.0. No schema or dependency changes.

## Review coverage
Reviewed the route/module structure and shared shell, catalogue search/details, BOM, submission and admin editors, image preparation, Workshop/guide/autosave, bench references, shared selectors, styling and release checks. This was a source review plus targeted component/browser validation, not a claim that every signed-in production workflow was exercised.

## Changes delivered
| Area | Finding | Change |
| --- | --- | --- |
| Catalogue search | Repeated per-part scans of compatibility, machines and categories on every keystroke | Build a reusable search index when catalogue data changes; use sets/maps for filters, machine summaries and repair counts |
| Data loading | Parts and Machines fetched data only needed by the other screen | Fetch part/category/compatibility data only for Parts; approved logs and machine categories only for Machines |
| Large lists | Several search dropdowns, category links, requests and Workshop reads could stop at the first API page | Use ordered paged reads for these paths and surface failed search lookups |
| Search controls | Sort menu and displayed keyboard shortcut did nothing | Description ascending/descending and natural part-number sorting; Ctrl/Cmd+K focuses search |
| Saved filters | Unavailable browser session storage could break search effects | Treat storage as optional; searches remain usable |
| Copy controls | BOM duplicated the shared button; part detail clipboard failures were unhandled | Reuse one component with success/failure feedback |
| Machine selection | Older picker had separate behaviour, no arrow-key navigation, a 30-result cap and stale machine text when cleared | Use the shared editable searchable field and clear corresponding machine name/model |
| BOM | Errors looked like missing parts; late responses could overwrite a newer cart; export could include failed loads | Ignore stale loads, show retry, block CSV export after load errors, and page lookup results |
| Photos | Batch preparation decoded multiple large images concurrently and leaked previews on partial failure | Process sequentially, revoke prior previews on failure, and always close source bitmaps; keep existing 1600px/WebP settings |
| Machine photo editing | Replaced/unmounted local previews retained object URLs | Release each retired preview |
| Workshop | Signed every photo link in a separate sequential request | Deduplicate paths and sign batches of up to 100 |
| Enlarged part photos | Dialog lacked Escape, focus containment and focus restoration | Use native modal dialog; preserve current photo layout |
| Accessibility | No reduced-motion styling | Respect reduced-motion preference |
| Connection errors | Some auth/request failures left spinners or misleading empty states | Surface connection errors and end loading |
| Admin save checks | Supplier/machine link mutations ignored failures | Stop and report failed mutations rather than returning apparent success |
| Release checks | Build did not perform full frontend type checking | Add frontend typecheck to CI; fix pre-existing nullability/type issues |

## Validation
- Frontend TypeScript and ESLint checks passed locally.
- 52 regression tests passed, including new filter/sort and image cleanup tests, plus existing compatibility, navigation, autosave/deletion, guide/PDF and selector checks.
- Browser component fixture used the actual updated components with isolated sample data and routing/database adapters: verified machine filtering and keyboard selection, Escape and focus restoration, Ctrl+K focus and descending sort.
- Checked search at a 390px phone viewport; no horizontal document overflow was reported. This is not physical Galaxy S24 testing.
- Production authentication, uploads and destructive admin/backup operations were not exercised with real records during this review.
- Release CI also runs lint, frontend typecheck, regression checks and production build before merge.

## Prioritised follow-ups
1. **Atomic catalogue writes and retryable photo submissions.** Part approval, part editing, machine photo replacement and some import actions still use multiple database/storage requests. A mid-operation failure can leave partial changes; add transactional database procedures and upload retry/reconciliation rather than trying to hide the issue in UI. The part-request upload loop currently permits submission when a photo upload/link fails. That needs a saved-draft/retry flow so retries cannot duplicate requests.
2. **Load large libraries on demand.** Search currently loads the catalogue into the browser. Paged API reads remove truncation but do not cap total memory or rendered rows. Move filtering/counting/pagination to the server before significantly larger catalogues. Lazy-load Workshop/bench media for the selected record and refresh expiring links.
3. **Separate components around existing boundaries.** Workshop, admin approval and reference-data management remain large components. Extract library, editor and data hooks with behaviour tests; avoid moving autosave state ownership during a cosmetic refactor. Split legacy CSS by module after snapshot coverage, rather than deleting apparent duplicates which currently override earlier responsive styles.
4. **Broader load/error consistency.** Extend paged loading and explicit errors to remaining admin/company/reference pickers. Introduce a small shared request-state pattern and authenticated shell context once navigation/unmount behaviour is covered.
5. **End-to-end coverage.** Add a non-production seeded account and browser checks for real auth, upload/retry, approval, permissions, mobile camera selection, offline/recovery and BOM export. Keep production records out of automated mutation tests.

The larger follow-ups deliberately remain separate from this frontend cleanup because they need schema design, migration/rollback checks or realistic authenticated test data. Existing permissions, autosave ownership and backup format are unchanged.
