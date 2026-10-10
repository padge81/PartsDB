# Module navigation

Application 0.20.0, database 0.12.0.

Home (/home) opens after sign-in. It presents Parts, Machines and Workshop as equal modules.

| Module | Landing | Tools |
| --- | --- | --- |
| Parts | /parts | /parts/search, /parts/new, /requests, /bom |
| Machines | /machines | /machines/search, /machines/[id] |
| Workshop | /workshop | /workshop/logs, /workshop/references |

Administration remains at /admin. Existing account and database permission checks are unchanged. Admin pages have their own main-navigation state, rather than appearing as standard module tools.

The top bar contains four main destinations and separate Admin/account controls. At phone widths it becomes two rows, with four evenly spaced module links below the brand/account row. Tool navigation wraps instead of overflowing the screen.

Existing /dashboard links still open parts search. Existing /workshop?log=ID links redirect to /workshop/logs?log=ID. Workshop preview retains its isolated repair/reference tabs. Live bench references have a dedicated page. Module navigation uses document links so the repair editor's unsaved-change warning remains effective during navigation.

Manual verification to complete when browser access is available: Galaxy S24 width and desktop; keyboard focus and account menu; sign-in destination; all module links; old bookmarks; machine filters, details and approved logs; repair autosave before navigation; standby and non-admin access.
