# Database decisions

## Principles

- PostgreSQL remains the portable system of record.
- Images live in object storage; PostgreSQL stores paths and metadata.
- A part is stored once and can be linked to many machine revisions.
- Supplier preference is a ranked relationship limited to positions 1–3.
- Commonly ordered parts use navigable foreign-key relationships.
- Destructive part deletion should be exceptional; normal removal uses status changes.
- Submitted requests remain separate from approved parts.
- Audit records are append-only to application users.

## Main relationships

- Manufacturer → machines → machine revisions
- Manufacturer → parts
- Parts ↔ machine revisions
- Parts ↔ tags
- Parts ↔ suppliers through ranked part suppliers
- Parts → multiple images
- Parts ↔ commonly ordered parts
- User profile → part requests → request images and status history
- Approved request → resulting part

## Portability

The schema uses standard PostgreSQL features wherever practical. Supabase-specific code is limited primarily to Auth, Row Level Security helpers, and Storage bucket policies. This boundary keeps a future self-hosted Supabase migration straightforward and makes a later move to plain PostgreSQL possible with replacement authentication and object storage.
