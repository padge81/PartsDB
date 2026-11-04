# Portable backups

Application 0.31.0 / database 0.15.0. Apply `20261104120000_sectioned_portable_backups.sql` before deploying the frontend.

## Export

1. Open Administrator → Backup, export & import. Select all is the default.
2. Choose companies/reference data, machines, parts, requests, Workshop repair logs and/or bench references. Required linked sections are checked automatically. For example, repairs include parts, machines and reference data. Their photos and documents are always included.
3. Wait for the counts and size estimate. This fetches database records and stored file metadata, not media bodies. Missing size metadata is identified explicitly. The estimate includes database JSON, file bytes, manifests, checksums and ZIP overhead; it is not an exact measurement of the final archive.
4. Choose Prepare selected backup. Media are downloaded and the uncompressed portable ZIP is built. A missing file or a file whose known size changed stops preparation.
5. Review Exact ZIP size, then choose Download prepared ZIP. Preparation does not automatically save the ZIP. Section changes discard the prepared file.

The archive includes an explicit section list, database rows, all referenced selected files, release revisions, counts and SHA-256 checksums. Its filename identifies a full or selected backup. ZIP v5 is a new format; older application versions cannot restore it.

## Import

1. On a destination running database 0.15.0 or later, sign in as an active administrator. For a standby installation, enable Maintenance mode first.
2. Select the ZIP. Its exact file size appears immediately. The app validates archive paths, expanded size, format, section dependencies, table counts, file inventory and checksums before planning uploads or changing records.
3. Review the included sections and ownership information. Merge adds or updates matching rows and retains other rows, including rows in unselected sections. It does not delete relationship rows absent from the archive.
4. Replace all sections is available only for a v5 archive containing all six sections. Type RESTORE to confirm replacing all application records. Authentication profiles, server settings and existing system audit history are retained.
5. Run the import. Files upload to new random paths, leaving existing files intact. After all files are present, records and file references apply in one database transaction. If any constraint or file check fails, no record changes commit.
6. If interrupted, keep the page open and use Retry prepared restore. A lost success response is reconciled using the same operation ID. If the destination data changed during file preparation, cancel the prepared restore and validate again. Cancellation asks the server whether staged files are safe to remove; it never removes files from a committed restore.
7. Read the completion message and retain the downloaded restore report. Maintenance imports attempt to return the server to standby on both success and failure. A failed return is reported explicitly.

Legacy v4 catalogue ZIPs remain readable as merge-only imports. They do not contain Workshop records and cannot replace all sections. Individual Workshop job/reference ZIPs are separate formats and are not accepted by this screen.

## Ownership and privacy

- Administrator backups include all users' selected Workshop records, including private drafts/references. Keep archives secure. Ordinary Workshop visibility is unchanged.
- Exact selected file paths receive time-limited permissions for the active administrator's backup session. Unrelated files and other users' sessions are not exposed. Export is allowed in standby; restore requires writes enabled.
- Existing destination profile IDs retain their ownership. Missing source users map to the restoring administrator. Starter reference editions belonging to missing users import as standalone references to avoid the one-edition-per-owner constraint.
- Accounts, passwords, authentication secrets, server mode, system audit history, request status-history rows, browser BOM carts and unsaved device-only drafts are not included. Set up destination accounts separately. This is an application-data backup, not a PostgreSQL cluster/authentication backup.
- The protected Unknown supply type is preserved/reconciled even if an old archive omitted or deactivated it.

## Limits and recovery

- The browser limit remains 1 GB for the archive and expanded contents. Large archives need enough browser memory; select fewer sections if preparation fails. Files already compressed as WebP/PDF are stored in the ZIP without another compression pass.
- Backup record snapshots are taken with selected tables locked briefly against writes. Files missing or changed before download cause preparation to fail rather than produce a knowingly incomplete archive.
- Restore sessions expire after one hour. Do not close or reload during transfer if you intend to retry the same operation. Cancel before choosing a different file or mode.
- Existing Storage objects are retained after replacement. Cancelled operations clean up approved staged files; interrupted/expired sessions or failed cleanup can leave unlinked objects. Automatic orphan cleanup is outside this release. Never remove Storage rows directly to reclaim physical files.
- Merging can fail on conflicting unique names, part numbers, ordering-group memberships or Workshop owners. The transaction rolls back; resolve the conflict or use a complete replacement after reviewing its scope.
- Restoring an existing Workshop record advances its revision so stale editors cannot silently overwrite restored content. The server rejects a restore if selected destination records changed while files uploaded.

## Validation

Archive tests cover section dependencies, metadata-only estimates, exact prepared size, all tables and >1,000 rows, v4 imports, PDF round trips, unknown/changed sizes, checksums, missing/unexpected media, unsafe ZIP paths, upload failures and committed-operation cleanup.

SQL tests run against a disposable database and check full/private export, scoped file permissions, partial merge, full replacement, ownership, retry idempotence, concurrent changes, protected defaults, cancellation, standby and ordinary-user denial. Existing Workshop/catalogue suites remain required. Browser checks use actual backup components and styling with a mocked authenticated shell and fictional server responses; production records are not mutated to test restore.
