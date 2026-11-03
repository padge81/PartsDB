# Catalogue save safety — 4 November 2026

Application 0.30.0; database 0.14.0. Apply `20261104090000_catalogue_save_safety.sql` before deploying the frontend: company editing now uses `save_company(jsonb)`.

## Behaviour and compatibility

- A production migration restores/activates `unknown` independently of the optional sample seed. Existing IDs and display labels are retained. If another supply type already owns the name Unknown, the built-in row receives an available default label.
- Row and truncate triggers protect the default. Its display label/description can still be edited. Direct database operations and the deactivation function enforce the same protection; the latter explicitly checks standby before changing references.
- Explicit grants cover catalogue tables created/recreated after the initial schema's one-time grants. Existing RLS rules still limit writes to active administrators and enforce standby; no default grants to future tables or anonymous roles are introduced.
- Company identity and roles save together under the existing administrator and write-mode restrictions. The full editor and Reference Data creation use stable IDs so uncertain responses can be retried. The editor pages lookup data and reports lookup/default failures explicitly.
- Machine photo replacement uploads the new file and updates the unique machine-image link before cleaning up the old object. Uncertain writes retain objects rather than risk deleting a committed photo.
- A failed part/photo submission keeps its saved draft and the form's attempt ID. On-page retries reconcile existing photo links and reuse immutable File paths. Editing is disabled during submission. Keep the form open to retry: reopening the form starts a separate request, and this release does not add full draft-form recovery after closing the page.
- Catalogue ZIP format remains 4. Full restore excludes the destination `unknown` row from clearing; archived Unknown rows map to that row's ID and remain active. Archives without Unknown keep the installed default. An ID collision is rejected before data is cleared. Existing Workshop restore restrictions remain intact.
- Database/Storage operations are still separate for machine photos and request photos. Unlinked objects can remain after failures, replaced photos with lost acknowledgements or removed draft attachments. Automatic orphan cleanup is not included.

## Validation

- Full production vinext build, frontend TypeScript check and ESLint pass using the existing npm lockfile dependencies.
- 79 focused regression tests pass, including real Supabase-client HTTP fixtures for failures before and after upload/link/request commits, stable draft retries, removed attachments and safe machine-photo replacement.
- All 25 migrations execute in a disposable PGlite PostgreSQL runtime with minimal Auth/Storage scaffolding, no automatic grants to future public tables, and **without** development seed data. The new catalogue SQL suite verifies protected defaults, role replacement/retry, rollback after an injected role failure, non-admin/inactive-admin rejection and standby protection. The existing Workshop SQL suite also passes after fictional seed data is loaded. Hosted Supabase validation remains the repository CI's responsibility; no production mutations were used for testing.
- An isolated Edge fixture renders the actual CompanyEditor, searchable selectors and stylesheet with a mocked authenticated shell and fictional database responses. It verifies Add Company, name focus, a failed save followed by successful retry, missing-default feedback, failed-lookup retry, standby creation protection and a 390px phone viewport without horizontal overflow or browser exceptions.
- The older `tests/rendered-html.test.mjs` suite has nine pre-existing source-text assertion failures. The same nine fail on the unchanged `e34c48b` baseline; its actual rendered homepage check passes. Those obsolete assertions are outside this release. The active CI regression suite passes.

The added catalogue SQL tests run in the existing disposable Supabase CI job before migration planning/deployment. The upload tests are included in web CI.
