# Backend authorization matrix

This is the Phase 6 source of truth for API authority. The React and Flutter
clients may hide controls, but only the backend grants access. Tenant, role,
department, instructor assignment, enrollment, cohort, account status, and
resource ownership are derived from the authenticated application user; client
metadata, request bodies, query strings, URLs, and local storage do not grant
authority.

Legend: `OWNER` = `SYSTEM_OWNER`, `UA` = `UNIVERSITY_ADMIN`, `DA` =
`DEPARTMENT_ADMIN`, `I` = `INSTRUCTOR`, `S` = `STUDENT`.

| Surface | Method/path | Allowed principal | Required backend scope |
|---|---|---|---|
| Health | `GET /api/health` | Public | No account data |
| Registration/login | `/api/auth/register*`, `/login`, `/mobile-login` | Public or verified Supabase identity, per route | Registration completion derives identity/email from verified token and always creates `STUDENT/PENDING` |
| Recovery | `/api/auth/forgot-password`, `/reset-password` | Public recovery flow | Non-enumerating, rate-limited; Supabase owns current password reset |
| Own account | `GET/PATCH /api/auth/profile`, `PATCH /api/auth/password` | Authenticated self | User id from authenticated record; Supabase reauthentication/change rules apply |
| Student profile | `GET/PATCH /api/students/me/profile` | S, including pending | Self only; academic profile authority is never accepted from another user id |
| Student timetable | `GET /api/students/me/schedule` | Approved S | Stored profile/cohort only |
| Departments | `GET /api/departments*` | OWNER, UA, DA, I | Same university; DA/I only their linked department |
| Department writes | `POST/PATCH /api/departments*` | OWNER, UA | Same university |
| Courses list/read | `GET /api/courses`, `GET /api/courses/:id` | Approved authenticated users | UA/OWNER university; DA linked department id; I assigned/created course; S active enrollment |
| My courses | `GET /api/courses/my` | I, UA, OWNER | Assigned or created course within university |
| Course create | `POST /api/courses` | UA, OWNER | Organization from authenticated record |
| Course update/delete | `PATCH/DELETE /api/courses/:id` | DA, UA, OWNER | DA must match trusted `departmentId`; all roles remain tenant-bound |
| Course session history | `GET /api/courses/:id/sessions` | I, UA, OWNER | Same course scope; students and DA denied |
| Course roster export | `GET /api/courses/:id/students/export` | DA, I, UA, OWNER | DA same department; I assigned/creator; same university; no student access |
| Schedules read | `GET /api/schedules*` | Approved authenticated users | UA/OWNER university; I own lectures; S stored cohort; tenant always fixed |
| Schedules write | `POST/PATCH /api/schedules*` | UA, OWNER | Same university; course and instructor references must belong to it |
| Sessions | `/api/sessions*` | I, UA, OWNER | I only sessions they opened; UA/OWNER same university |
| QR issue | `GET /api/sessions/:id/qr` | I, UA, OWNER | Same session scope; permanently non-configurable staff-only policy |
| Attendance scan/history | `POST /api/attendance/scan`, `GET /history`, `GET /summary` | Approved S | Student id and cohort from authenticated/stored records |
| Session attendance/analytics | Staff attendance routes | I, UA, OWNER | I limited by session/teaching ownership; tenant always fixed |
| Materials for student | `GET /api/materials/my` | Approved S | Stored cohort only |
| Materials staff | `/api/materials` staff routes | I, UA, OWNER | I only assigned lecture/published material; UA/OWNER same university |
| Assignments | `/api/assignments*` | Approved S for list; DA/I/UA/OWNER for staff operations | S active enrollment/cohort; DA department; I active teaching assignment; tenant fixed |
| Approval queue | `/api/admin/students*` | DA, I, UA, OWNER | UA/OWNER university; DA linked department cohorts; I assigned cohorts |
| Campus directory/accounts | `/api/admin/users*`, `/overview` | UA, OWNER | Same university; cannot administer owner/peer admin roles through campus endpoint |
| Instructor schedule | `GET /api/admin/schedule` | I | Authenticated instructor only |
| Notifications | `/api/notifications*` | Authenticated self | Recipient/user id always from token; production simulation routes absent |
| Organizations/platform users/metrics | `/api/organizations`, `/api/users`, `/api/metrics` | OWNER | Owner-only middleware; platform services apply explicit target organization rules |

## Account-state boundary

- `PENDING`: may authenticate and complete the self academic profile; protected
  academic routes return `ACCOUNT_PENDING_APPROVAL`.
- `ACTIVE`: receives only the role/scope permissions above.
- `REJECTED`: authentication middleware rejects immediately.
- `DISABLED` or inactive: authentication middleware rejects immediately, even
  when the identity-provider token has not expired.

## Failure semantics

- Missing/invalid/expired identity: `401`.
- Known authenticated role without permission: `403`.
- Foreign-tenant or ownership-scoped resource id: safe `404` where revealing
  existence would leak information.
- Invalid client input: `400`/validation response; client-supplied authority is
  stripped or rejected before service execution.
