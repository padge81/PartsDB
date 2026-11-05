# Workshop preview

## Review routes

- `/workshop/preview`: isolated, fictional example with two demonstration catalogue parts. No Supabase calls are made by this route. Saved logs/photos and custom reference notes stay in this browser's IndexedDB. This is explicitly a device-local preview, not cross-device sync.
- `/workshop`: existing PartsDB authentication, live machine/part lookup, private drafts and an approved shared library. Apply all migrations through `20261104220000_repair_update_proposals.sql` for publishing, reviewed updates and measurement arrows.
- `/admin/workshop`: administrator-only submission review and shared-guide editing.

The UI supports camera/gallery capture, text steps, step reordering, circles/arrows/numbers, undo/clear, existing part links, repair outcome/testing and completion checks. Photos reuse `prepareImage`: WebP at 0.78 quality, max 1600 px longest side, 15 MiB input limit. Unmarked compressed photos and normalized annotations remain separate. Original full-resolution camera files are not retained by the app.

PDF exports wait for the current editable record to save successfully, A4 pages, pagination, marked-up photos, parts and verification. Repair reports include fault/outcome history; guides focus on preparation, parts, steps and verification. A completed job is not a certification that the procedure is appropriate for another machine. PDFs use a Latin font; unsupported characters currently become `?`.

## Focused guide reading

### Guide workflow and existing records (0.34.0)

Guide approval determines the workshop stage. **My work** includes the creator's private and returned records, even older records whose repair progress was marked completed. **My submissions** holds pending reviews. **Approved library** includes every approved guide, including older rows with `status='draft'`. **All my repairs** and **All available repairs** retain access to the wider lists. This is a display/filter change: no migration, automatic deletion, record rewriting, ID replacement or media transfer occurs. Repair progress remains separate and is not inferred from approval.

**Save changes** is disabled when there is nothing to save and after autosave completes. Reverting to the acknowledged content clears pending changes, while edits made during an in-flight save retain revision/conflict protection. New and recovered unsaved drafts still require a confirmed save. **Return to guide** saves and keeps an update proposal; **Discard update** explicitly removes the entire proposal, including saved edits, and returns to the original published guide. Discard requires confirmation, waits for in-flight saves and clears recovery copies. A failed deletion keeps the draft available. Existing approval audit history remains intact.

`/workshop/guides/[id]` opens an independent reading page with the guide document, PDF download and permitted Update log action. It uses the same authentication and record privacy rules but loads only that repair and its attached photos. Machine/search links open this page, and old `view=guide` notebook links redirect there. Open guide in the notebook saves first; updating sends the reader back to the notebook, with returned/private drafts opening in the editor only when allowed. Administrator approval remains in the notebook review screen.

## Compact Workshop actions (0.36.0)

The approved toolbar uses one outline icon style, 36px desktop controls and 44px mobile tap targets. Open guide, Save changes and Download PDF keep text labels on desktop and accessible icon controls on mobile; hints appear on hover and keyboard focus. Done editing remains orange and labelled at every size. Red × Discard update and green Submit update → remain labelled and aligned on the same row near the top. Submit still flushes edits and enforces the original workflow checks; no approval or privacy rules change. Detailed comparisons collapse in the editor, open automatically for a stale baseline and remain fully visible during review. The required What changed? field is retained. Guide reading typography and photos remain comfortably sized.

## Focused editing (0.35.0)

Workshop starts with the overview and no automatic draft selection. Existing repair selections open in viewing mode, including private drafts. Update log or a permitted explicit edit link starts editing. While editing, the repair list and its filters, New repair and Restore draft are unavailable; selecting another repair requires finishing or discarding first. Done editing waits for saving and keeps the draft without submitting it. A save error or unsaved changes keep the editor open. On phones, Done editing returns to the repair list; on desktop, the current document remains visible beside the unlocked list. The explicit edit query is cleared so refreshing does not reopen the editor. Discarding an update returns to Workshop and retains the original published guide.

## Viewing submitted logs

Submitted, approved and returned logs open in the read-only document viewer, including administrator review. All recorded steps appear together, in the same content order as the PDF. Use **Update log** to enter the same editor used to create a repair when permitted; existing personal private drafts also open for viewing until Update log is selected. Submission switches immediately into viewing. **Submission and review** expands the existing approval, return and withdrawal controls separately from the document.

## Updates to approved repairs

Any active signed-in user can choose **Update log** on an approved repair. A separate private draft preserves the approved revision as its comparison baseline. Reopening Update log resumes the author's existing proposal. Original approved content remains available to readers during editing, submission and returns.

The author records **What changed?** and submits actual content changes. The review shows old/new metadata, steps, photos and annotations, step order, and part quantities. Approve replaces the same approved record and part links in one transaction, retains the original creator, records the proposer/approver/summary in the audit trail, and removes the applied proposal. Return keeps the draft for correction. Even administrators propose updates rather than directly modifying published content.

Submission and approval check the approved baseline revision. If it changes, withdraw or return the proposal; its author can refresh the comparison against the latest approved version, keeping draft content, and must review all differences before resubmitting. There is no automatic merge. Originals with outstanding proposals cannot be deleted until those proposals are removed. Administrators still cannot read another user's unsubmitted drafts.

Sectioned backups include proposal metadata, baseline photos and proposed photos, deduplicating shared objects. Restore rewrites both photo sets. Restoring advances existing record revisions, so pending updates may need their comparison refreshed. Per-job ZIPs include baseline photos as well; audit history remains outside portable backups.

## Database and storage

`repair_logs` links an optional machine and owns an ordered JSON step document. `repair_log_parts` links catalogue parts with quantities. `bench_references` contains the user's custom text references. Existing catalogue records are reused, not copied.

RLS keeps unsubmitted repair drafts and bench references creator-only, including against other admins. Submitted/returned repairs are visible to their creator and active admins; approved repairs and their attached photos/parts are visible to all active signed-in users. Creators can edit their private/returned drafts; admins can edit submitted/returned drafts. Approved content changes through reviewed update proposals. Checked RPCs enforce revision-aware saves and submit/withdraw/approve/return transitions; direct repair-table mutation is revoked. The save RPC applies the log and part links atomically and verifies each new photo path or retains an existing attachment. Unattached photos are never shared, and referenced photos cannot be deleted through Storage. Standby prohibits mutations. Signed photo URLs are temporary presentation values and are never stored in the database. Photos are immutable unique objects; no overwrite permission is granted. Removed/replaced steps may leave unreferenced photos: garbage collection is a future maintenance feature.

The default machine lookup loads up to 1000 machines. Parts are fetched in pages for the selected machine only, restricted to active catalogue parts linked through part_machines. Larger machine catalogues still need paginated machine search. Live machine search and machine detail pages list approved repairs. Reverse repair lists on part pages remain a follow-up.

## Backups and future hosting

The per-job ZIP contains JSON records, compressed unmarked photos and editable annotation coordinates. Reference notes have a separate ZIP export including compressed photos. Individual job/reference ZIPs remain separate exports and are not imported by the main backup screen. Administrator portable ZIP v5 backups can include all selected Workshop records and their files, with merge or complete six-section replacement through a transactional restore. Older v4 catalogue ZIPs remain merge-only imports and do not contain Workshop records. See `docs/portable-backups.md` for ownership, scope and recovery limits.

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

## Release 0.17.0 / database 0.11.0

Existing repairs default to private. The creator selects a catalogue machine, adds at least one step, then uses Save & submit for approval. Admins review via Administrator > Repair log approvals and approve or return with feedback. Pending submissions can be withdrawn by the creator. Removing an approval returns the log for changes and removes it from machine search; already downloaded files and previously issued signed URLs are not revoked. All approval actions and saves check the expected revision and server mode. Shared-record changes enter the admin audit trail; unsubmitted drafts do not. Repair ZIPs preserve publication metadata; automatic workshop restore remains unimplemented.

The database regression suite exercises the workflow with creator, reader and admin identities in a disposable Supabase instance, including Storage policies, invalid transitions, revision conflicts, standby and inactive accounts. Local browser interaction tests could not run during this release because the Windows tool runtime was unavailable.

## Release 0.18.0 / database 0.12.0

The Measure tool draws a double-ended arrow. It starts unselected, supports Undo/Clear, persists with the photo annotations and appears in PDF exports. Record actual dimensions in the instructions; there is no automatic scale calibration. Parts selection requires a catalogue machine and only lists compatible active parts. Changing the machine preserves parts already linked to the repair, while refreshing the selectable catalogue. The isolated preview demonstrates separate parts for the claw and hockey examples.

## Release 0.19.0 / database 0.12.0

Workshop saves after a 1.2-second editing pause, on step navigation/addition, and before changing repairs or exporting. An in-flight save never replaces newer editor content; a subsequent save uses the acknowledged revision. Online and page-hide events also request a save. Unload completion is not assumed.

Each edit queues an IndexedDB recovery copy scoped to the signed-in account and a unique editor session. Incomplete saves are offered for recovery on reopening Workshop. Recovered records retain their expected revision; conflicts require review/export rather than a forced overwrite. Newly uploaded photo data is retained in the recovery record; existing remote photos may require connectivity to refresh links. This is draft recovery, not complete offline photo capture/synchronization. Browser storage can be unavailable, cleared or evicted; the UI reports failures and distinguishes a device copy from a confirmed Workshop save. Normal export stops if saving fails; an explicit recovery ZIP can preserve the on-screen draft.
