# Supabase setup

## Prerequisites

- A Supabase project
- Supabase CLI
- Docker for local Supabase development
- Node.js if the web application is developed locally

## Local development

```bash
supabase init
supabase start
supabase db reset
```

The committed migrations are the source of truth. Do not make undocumented production-only schema changes in the Supabase dashboard.

## Link a hosted project

Authenticate and link the local repository:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Enter credentials through the CLI prompt or environment-secret manager. Never commit passwords, access tokens, database URLs, or service-role keys.

## Create the first administrator

1. Create the user through Supabase Auth.
2. In the SQL editor, promote the known user by UUID:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_UUID';
```

Verify the UUID carefully before running the update.

## Storage

The security migration creates private `part-images` and `request-images` buckets. Database rows store bucket names and object paths; image bytes are not stored in PostgreSQL.

## Production workflow

1. Create a feature branch.
2. Add a new immutable migration.
3. Reset and test the local database.
4. Open a pull request.
5. Review for destructive statements.
6. Back up production.
7. Apply the migration through an approved deployment.

Never rewrite a migration that has already reached production. Add a corrective migration instead.

## Current scope

This checkpoint establishes the relational model, authentication profile, role checks, request ownership, storage buckets, row-level security, partial-search indexes, status history, and audit logging. Approval orchestration and the web application will be added separately.
