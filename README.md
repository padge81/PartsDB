# PartsDB

A centralised, searchable repository for external machine parts, supplier ordering information, machine compatibility, images and controlled add-part approvals.

## Current revision

| Component | Revision |
| --- | --- |
| Application | `0.5.0` |
| Database | `0.5.0` |

PartsDB uses semantic revisions: major revisions represent incompatible architectural changes, minor revisions represent new features or schema capabilities, and patch revisions represent compatible fixes. Every release must update the application revision, database revision when the schema changes, and this README.

The application footer displays both revisions so a frontend/database mismatch is visible immediately.

## Delivery process

- Work is delivered as small, independently testable pull requests.
- Database migrations must be backward-safe and pass the Supabase workflow before merge.
- Completed roadmap items are removed from **Action plan** and recorded under **Updates**.
- Backup/export/import compatibility must be checked whenever tables or relationships change.

## Action plan

### Phase 3 — Machine management

#### 2. Full machine editing and images

- Add an administrator machine editor for name, optional model, company, notes and status.
- Support one machine image with the same WebP compression used for part images.
- Add image preview, replacement and removal.
- Store machine images in a separate Supabase Storage bucket with appropriate policies.

#### 3. Machine categories and search

- Add administrator-managed machine categories.
- Allow one optional category per machine.
- Add a separate machine search on the main page.
- Filter machines by company, category, name and model.
- Add a machine details page showing its image, company, name, model, category, notes and compatible parts.

### Phase 4 — Duplicate prevention

#### 4. Similar-part warnings during approval

- Search active parts using exact and partial manufacturer part numbers.
- Rank similar descriptions using PostgreSQL trigram search.
- Prefer matches linked to the same machine.
- Display likely matches, match reasons and scores beside the pending request.
- Allow each possible match to open in a new tab.
- Warn before approving a high-confidence duplicate while allowing an administrator override.

### Later expansion

- Add machine manuals and service notes after machine search/details are stable.
- Add controlled machine change requests with title, notes and compressed images.
- Keep machine documents, notes, requests and images separate from part-request records.

## Updates

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
