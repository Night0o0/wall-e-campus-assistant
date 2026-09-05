# QR issuance authorization

**Status: decided and enforced in Phase 6.**

## Decision

`GET /api/sessions/:id/qr` is permanently staff-only. An `INSTRUCTOR`,
`UNIVERSITY_ADMIN`, or `SYSTEM_OWNER` may request a QR payload when the session
policy also permits them to see that session. A `STUDENT` and a
`DEPARTMENT_ADMIN` may not request one.

This is code policy, not a deployment flag. `QR_ENDPOINT_STAFF_ONLY` has been
removed from the environment schema and example configuration, so a deployment
cannot accidentally reopen QR minting by changing an environment value.

## Why

A QR token is a short-lived attendance credential. Its readable payload
contains the session id. If students could call the QR endpoint, one legitimate
scan would let a student learn that id and continuously mint fresh codes for
other people. The 30-second expiry would no longer protect against proxy
attendance.

Students therefore scan a code through `POST /api/attendance/scan`; they never
mint, read, close, or administer an attendance session.

## Session scope

- `INSTRUCTOR`: only sessions they opened, and only in their university.
- `UNIVERSITY_ADMIN`: any session in their university.
- `SYSTEM_OWNER`: any session in the organization attached to their campus API
  identity. Platform-wide administration continues through owner-only platform
  routes; a frontend URL does not widen a campus request.
- `DEPARTMENT_ADMIN`: denied. A session is not yet a department-authoritative
  resource at this boundary, so granting access would be organization-wide.
- `STUDENT`: denied.

Foreign or unauthorized session ids return not found so the endpoint cannot be
used to discover another tenant's or instructor's records.

## Display flow

The current display is the authenticated staff web/mobile QR screen. Robot and
device authentication are permanently outside the product scope. There is no
robot verification gate, device fallback, or rollback procedure.

## Required regression checks

- no token or an invalid token: `401`
- student or department administrator: `403` at the route boundary
- instructor requesting another instructor's session: safe `404`
- any role requesting another university's session: safe `404`
- authorized instructor or university administrator, active in-window session:
  `200` with a 30-second token
- closed, upcoming, or ended session: `409`, with no token minted

The service repeats the role/scope decision so removing a route middleware in a
future refactor does not expose session data.
