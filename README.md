# PartsDB

A centralised, searchable repository for external machine parts, supplier ordering information, machine compatibility, images, and controlled add-part approvals.

The project is in initial database-design setup. Application code and Supabase migrations will be proposed through pull requests.

Known Issues:
- Part Categories not saving when adding part, following error when saving edited part selecting a category "null value in column "record_id" of relation "audit_log" violates not-null constraint"
- Machine Model field needs to be set to non mandatory, also currently unable to have same model (per manufacturer?).

Future Improvements
- Need ability to edit Machine name and model
- Add ability to edit all fields for suppliers (website, ordering info)
- Add ability to edit / add notes to manufacturers
- Add ability to add and edit pics for machines, only one and same compression as parts pics
    -Add a separate search feature to main page to look up machines, future proof to add manuals, service notes (submission same as parts, title, notes and ability to upload pics)
