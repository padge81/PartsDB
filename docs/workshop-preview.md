# Workshop preview

## Review routes

- `/workshop/preview`: isolated, fictional example with two demonstration catalogue parts. No Supabase calls are made by this route. Saved logs/photos and custom reference notes stay in this browser's IndexedDB. This is explicitly a device-local preview, not cross-device sync.
- `/workshop`: existing PartsDB authentication, live machine/part lookup and private workshop persistence. Requires migration `20261005090000_workshop_preview.sql` on the selected database before it can save. The 0.14.0 release applies this migration through the existing Supabase deployment workflow after validation.

The UI supports camera/gallery capture, text steps, step reordering, circles/arrows/numbers, undo/clear, existing part links, repair outcome/testing and completion checks. Photos reuse `prepareImage`: WebP at 0.78 quality, max 1600 px longest side, 15 MiB input limit. Unmarked compressed photos and normalized annotations remain separate. Original full-resolution camera files are not retained by the app.

PDF exports use the current on-screen record (including unsaved edits), A4 pages, pagination, marked-up photos, parts and verification. Repair reports include fault/outcome history; guides focus on preparation, parts, steps and verification. A completed job is not a certification that the procedure is appropriate for another machine. PDFs use a Latin font; unsupported characters currently become `?`.

## Database and storage

`repair_logs` links an optional machine and owns an ordered JSON step document. `repair_log_parts` links catalogue parts with quantities. `bench_references` contains the user's custom text references. Existing catalogue records are reused, not copied.

RLS restricts all workshop records and the private `repair-images` bucket to the active owning user, including against other admins. The save RPC applies the log and part links atomically, checks expected revision and verifies photo ownership/path. Standby prohibits mutations. Signed photo URLs are temporary presentation values and are never stored in the database. Photos are immutable unique objects; no overwrite permission is granted. Removed/replaced steps may leave unreferenced photos: garbage collection is a future maintenance feature.

The default catalogue lookup loads up to 1000 machines and 1000 parts. Server-side paginated search is needed for larger catalogues before production use. The preview does not yet provide reverse repair lists on part or machine pages.

## Backups and future hosting

The per-job ZIP contains JSON records, compressed unmarked photos and editable annotation coordinates. Reference notes have a separate ZIP export including compressed photos. These are portable data exports; automated restore is not implemented. The existing v4 catalogue backup does not include private workshop records. A guard prevents full catalogue restore when any repair logs exist, before image deletion starts. A coordinated full workshop/catalogue restore must be implemented before production adoption.

Keep PostgreSQL for relational data and private object storage for images. Self-hosted Supabase can retain current Auth/RLS/Storage interfaces. A move to another stack will need replacement authentication and storage adapters. No SharePoint or OneDrive dependency exists.

## Reference content

Four starter cards cite Intel ATX 3.0 guide v2.0, Molex Fit family and Bolt Depot references reviewed on 5 October 2026. The ATX table lists numbered pin assignments and is deliberately not a physical connector view. Custom cards retain source URL, review state, revision and date. Starter cards can be saved as private editable editions. References support custom categories and up to 12 captioned photos. Reference PDF export remains follow-up work.

## Follow-up capabilities

AI prompts in this preview are clearly labelled checklist prompts. There is no model/API connection yet. No API key is required for this preview. AI interviewing, visual matching, server search, offline synchronization, archive import, complete backups and native home-screen installation are not implemented.

## Validation

Build and the existing regression suite should pass. `tests/workshop-db.sql` tests isolation, revision conflicts, atomic rollback, completion validation and standby restrictions against a disposable Supabase database, rolling back its fixtures. It must never be run against production. Apply migrations and test storage/auth with two accounts in staging before production rollout.

## Release 0.14.0 / database 0.9.0

The workshop is available at `/workshop` after deployment. The isolated preview remains at `/workshop/preview`; preview records are not copied into the live database. Existing catalogue data is preserved by the additive migration. README Updates and application/package versions record this release.

## Release 0.15.0 / database 0.10.0

Bench references now support compressed camera/gallery photos, captions, removal and custom categories with optional subcategories. Category and subcategory filters support component-library browsing. Administrators can open the same private library at `/admin/bench-references`. Starter editing saves an owner-specific edition, without changing other users’ libraries. Migration adds nullable starter keys and default-empty photo arrays, preserving existing references. Images are stored in private `reference-images` and `reference-documents`; expired links are refreshed during archive export. Removed/cancelled uploads may remain unreferenced until future garbage collection. PDF attachments preserve original bytes, with up to 10 PDFs per reference and a 20 MB per-file limit. ZIP export includes images, PDFs and relative paths; restore is not yet implemented.
