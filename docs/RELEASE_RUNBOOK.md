# Release and Operations Runbook

This is the production release gate for Leornian Campus Assistant. A release is
ready only when every required gate below passes in the target environment.

## Release decisions

- Transactional email is required. Production refuses `MAIL_PROVIDER=log` and
  SMTP must use implicit TLS or required STARTTLS.
- Push delivery is deferred from the first release. Notifications remain fully
  available in-app with `PUSH_PROVIDER=none`; device-token APIs are retained for
  a later FCM rollout.
- The attendance and notification workers run inside the API. Exactly one API
  replica may enable each worker. Additional replicas must set both worker flags
  to `false` until the workers are moved to dedicated processes.
- Production authentication is Supabase-only. Legacy and dual modes are rollout
  tools, not final production modes.
- The physical Android-device smoke test remains required before public release;
  emulator acceptance covered the development checkpoint only.

## Required external services

Before a staging or production release, provision:

1. a PostgreSQL database and a direct migration connection;
2. a Supabase project with publishable and service-role keys;
3. an SMTP relay with a verified sending domain;
4. HTTPS hostnames for the web app and API;
5. a log destination and uptime/alerting service;
6. an encrypted backup destination outside the application host.

No service-role key, SMTP password, database URL, JWT secret, signing material,
or mobile service configuration belongs in Git. CI scans tracked files, and the
repository ignores those credential-bearing file types.

## Environment preparation

Copy `backend/.env.production.example` to the deployment secret store, never to
Git, and replace every placeholder. Copy `.env.release.example` for the public
web build values.

Validate the private API configuration without printing any secret values:

```powershell
npm run check:production-env -- backend/.env.production
```

The API also refuses to boot when production auth, CORS, mail, release identity,
or TLS settings are unsafe. Set `RELEASE_SHA` to the deployed Git commit so
health responses and logs can be tied to source.

## CI gate

Every pull request and main-branch push must pass `.github/workflows/ci.yml`:

- tracked-secret scan;
- all migrations replayed from an empty PostgreSQL database;
- Prisma validation, backend source/test typechecks, 504 backend tests, and build;
- web lint, 24 tests, and production build;
- Flutter formatting, analysis, 13 tests, and Android debug build;
- production dependency audits at high severity;
- API runtime, migration, and web container builds.

Dependabot checks npm, Dart/Flutter, and GitHub Actions dependencies weekly.
Branch protection should require every CI job and at least one reviewer.

The current backend audit has no high/critical runtime finding. As of
September 3, 2026, the `qs` dependency is pinned to the patched `6.16.0`
release through `backend/package.json` overrides. One moderate advisory remains
in ExcelJS's transitive `uuid` package. The vulnerable UUID buffer API is not
called by Leornian's export path, and the audit's proposed "fix" is a breaking
downgrade of ExcelJS, so this residual risk is accepted with explicit review:

- owner: backend maintainers
- review date: October 3, 2026
- control: keep Dependabot enabled, rerun `npm audit --omit=dev --omit=optional --audit-level=high` in CI, and revisit immediately if ExcelJS publishes a compatible fix

Optional Prisma CLI dependencies are excluded from the runtime image and its
production audit.

## Platform boundary decision

Decision recorded on September 3, 2026:

- release 1 accepts `X-Client-Platform` as a first-party product boundary only
- it is not treated as device attestation or a security-grade control
- authorization, tenant scope, approval state, and resource permissions still
  derive only from the verified database identity

This expectation is tested in `backend/tests/client-platform.test.ts` and in
the browser/mobile authentication suites.

## Backup and restore gate

Before the first release and before any risky migration:

1. create an encrypted database backup outside the database host;
2. record the UTC timestamp, database identifier, schema migration, checksum,
   encryption key owner, and retention expiry;
3. restore it into an isolated scratch database;
4. run `npx prisma migrate status` and `npm run verify:database` against scratch;
5. confirm row counts for organizations, users, enrollments, sessions,
   attendance records, materials, and audit events;
6. destroy the scratch database after verification.

Recommended minimum policy: daily backups, 30-day retention, and a monthly
restore rehearsal. The database-provider snapshot is not enough on its own;
keep a second encrypted copy under a separate failure domain. Never restore over
production. Restore to scratch, verify, then perform a controlled cutover.

Portable PostgreSQL commands, run from a trusted machine with credentials
supplied by its secret store:

```powershell
pg_dump --format=custom --no-owner --no-acl --file leornian.backup $env:DIRECT_URL
pg_restore --clean --if-exists --no-owner --no-acl --dbname $env:SCRATCH_DATABASE_URL leornian.backup
```

## Deployment order

1. Confirm CI is green for the exact commit and the worktree is clean.
2. Freeze the release commit and set `RELEASE_SHA`.
3. Complete and verify the backup/restore gate.
4. Build immutable API runtime, migration, and web images.
5. Run the migration image once against the target database.
6. Run `npx prisma migrate status`; stop if any migration is pending or failed.
7. Deploy the API with workers disabled and wait for `/api/health/ready`.
8. Run `npm run verify:mail` from the deployment network.
9. Deploy the web image built with the target public URLs.
10. Run `npm run smoke:release -- https://api.example.edu/api https://app.example.edu`.
11. Run the authenticated web role flows and Android integration harness using
    dedicated staging accounts; test approved, pending, rejected, and disabled
    states, QR issuance/scan/replay rejection, materials, approvals, and logout.
    Explicitly prove that every staff role is refused on mobile and an approved
    student is refused on web.
12. Enable each in-process worker on one API replica only. Confirm a generation,
    delivery, stale-session close, and absence sweep in staging.
13. Observe errors, latency, database connections, mail failure rate, and worker
    output for at least 15 minutes before promoting production traffic.

The included `compose.release.yml` is a reproducible packaging reference. Run
the one-off `migrate` service separately; do not start it as a long-running
dependency of the API.

## Monitoring and alerts

Ship the API's JSON logs to the chosen log service. Every entry carries a UTC
timestamp, severity, service, version, release commit, event name, and safe
request correlation data. Credential-shaped fields are redacted. The API echoes
`x-request-id`; support staff should record it with an incident.

Monitor:

- `GET /api/health` every minute for process liveness;
- `GET /api/health/ready` every minute for database readiness;
- 5xx rate, 429 rate, p95 latency, container restarts, CPU/memory, and database
  connections;
- SMTP delivery errors and OTP challenge issuance failures;
- notification rows in retry/failed state;
- sessions left open past their stale deadline and closed sessions without an
  absence sweep.

Initial alert thresholds: readiness fails twice consecutively, 5xx exceeds 2%
for five minutes, p95 exceeds two seconds for ten minutes, or any worker has no
successful pass for twice its configured interval. Tune them from staging data.

## Rollback

Application rollback means redeploying the previous immutable API and web image.
Do not automatically reverse database migrations. First confirm the prior image
is compatible with the migrated schema. If it is not, keep the current API,
disable affected writes, and ship a forward repair. A database restore is an
incident procedure, not an ordinary code rollback.

During rollback, disable both workers on all but the designated healthy replica,
check readiness, rerun the public smoke test, then repeat authenticated role
checks. Record the release SHA, incident window, migration state, and decision
owner in the audit/incident record.

## Final acceptance record

Record these facts for staging and production:

- release SHA and image digests;
- CI run and approver;
- migration status;
- backup checksum and restore-rehearsal result;
- SMTP preflight and a received test message;
- public smoke output;
- authenticated web and mobile test results;
- physical Android model/OS and QR-camera result;
- monitoring dashboard and alert test;
- worker-owning replica;
- rollback owner and previous compatible image.
