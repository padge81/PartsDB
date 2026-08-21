# PartsDB

A centralised, searchable repository for external machine parts, supplier ordering information, machine compatibility, images and controlled add-part approvals.

## Current revision

| Component | Revision |
| --- | --- |
| Application | `0.6.3` |
| Database | `0.6.0` |

PartsDB uses semantic revisions: major revisions represent incompatible architectural changes, minor revisions represent new features or schema capabilities, and patch revisions represent compatible fixes. Every release must update the application revision, database revision when the schema changes, and this README.

The application footer displays both revisions so a frontend/database mismatch is visible immediately.

## Delivery process

- Work is delivered as small, independently testable pull requests.
- Database migrations must be backward-safe and pass the Supabase workflow before merge.
- Completed roadmap items are removed from **Action plan** and recorded under **Updates**.
- Backup/export/import compatibility must be checked whenever tables or relationships change.

## Action plan

### Later expansion

- Add machine manuals and service notes after machine search/details are stable.
- Add controlled machine change requests with title, notes and compressed images.
- Keep machine documents, notes, requests and images separate from part-request records.

## Updates

### `0.6.3` — 21 August 2026

- Replaced the browser-dependent part-category multi-select with clear checkbox options.
- Applied the same category selection control to Add Part, administrator request review and Edit Part.

### `0.6.2` — 21 August 2026

- Restored multi-category selection when submitting an Add Part request.
- Restored category review and editing before an administrator approves a request.
- Restored multi-category assignment when an administrator edits an approved part.
- Ensured approved request categories are copied into the part-category relationships used by search.

### `0.6.1` — 21 August 2026

- Fixed the Add Part blank page caused by an invalid supply-type render reference.
- Restored the part-category filter and its database relationships on the parts search page.
- Added a visible patch revision so the deployed frontend can be identified reliably.

### `0.6.0` — 21 August 2026

- Added full administrator machine editing for company, name, optional model, category, notes and status.
- Added one compressed WebP image per machine with preview, replacement and removal in a dedicated storage bucket.
- Added administrator-managed machine categories and optional machine-category assignment.
- Added separate machine search by company, category, name and model on the main page.
- Added machine detail pages showing machine information, image and compatible parts.
- Added ranked duplicate detection during request approval using exact/partial part numbers, trigram description similarity and same-machine preference.
- Added match reasons, confidence scores, new-tab review links and a required override for high-confidence matches.
- Updated backup/export coverage for machine categories and machine image records.

### `0.5.0` — 20 August 2026

- Replaced separate manufacturer and supplier tables with one `companies` table and explicit Manufacturer, Supplier and Distributor roles.
- Added one unified Companies section to administrator Reference Data.
- Preserved manufacturer default-supplier selection while allowing one company to perform multiple roles.
- Updated machine, part and preferred-supplier relationships to reference companies.
- Replaced the bulk-import workbook with Companies and Machines sheets.
- Updated JSON backup and restore to format version 2 with companies and company roles.
- Intentionally resets catalogue and reference data while retaining authentication users and profiles.
- Removed the old manufacturer and supplier tables and updated all application queries to use companies directly.

### `0.4.0` — 20 August 2026

- Replaced hard-coded supply-type choices with one shared database-managed list.
- Updated Add Part, admin approval, part editing, supplier editing, search and bulk import to use supply-type codes while displaying editable names.
- Added supply-type usage counts and active/inactive status to Reference Data.
- Added safe deactivation: unused types can be disabled directly, while types in use require an active replacement.
- Added an administrator-only database operation that replaces all part, request and supplier references before deactivation.
- Added reactivation support and ensured new forms always select an active supply type.

### `0.3.0` — 20 August 2026

- Made Machine Name required and Machine Model optional.
- Backfilled missing machine names from existing model values.
- Removed the manufacturer/model uniqueness rule so different machines may share a model.
- Added case-insensitive manufacturer/name duplicate protection.
- Updated add-part, approval, reference-data, search and bulk-import paths to use the corrected machine identity.
- Added a separate machine name field to part requests while retaining the model for display and migration compatibility.

### `0.2.1` — 20 August 2026

- Fixed category relationship auditing for tables that use composite primary keys.
- Changed the audit trigger to derive record identifiers from each table's actual primary key columns.
- Added a deterministic fallback identifier for any audited table without a primary key.
- Restored adding, editing and removing part categories without a null `audit_log.record_id` failure.

### `0.2.0` — 20 August 2026

- Added formal application and database revision tracking.
- Added visible application/database revision information to the frontend.
- Replaced the informal known-issues list with a dependency-ordered delivery plan.
- Established the rule that completed work moves from the action plan into this Updates section.
