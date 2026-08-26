# QR cutover — closing the student QR hole

> Archived note:
>
> This document belongs to an earlier robot/device-oriented project shape.
> The active product scope no longer includes robot/device features, so do not
> use this file as the execution plan for the current finish work.

**Status: NOT DONE. `QR_ENDPOINT_STAFF_ONLY` is still `false`.**

This is the one remaining security decision in the attendance path, and it needs
your explicit approval — not because the change is hard, but because getting the
sequence wrong stops attendance campus-wide.

---

## The hole

`GET /api/sessions/:id/qr` is reachable by **any authenticated user, students
included**.

A QR token is an ordinary JWT. Its payload can be read by anyone holding it,
without any secret. So:

1. A student scans one code legitimately.
2. They decode it and learn the `sessionId`.
3. They call `/api/sessions/:sessionId/qr` themselves, as often as they like,
   for as long as the session stays open.
4. They now mint fresh, valid, 30-second codes and can forward them to anyone.

The 30-second expiry is the *only* thing standing between this system and
unlimited proxy attendance, and this endpoint hands out a renewable supply of
them.

## Why it is still open

Until now, the only client that could put a code on a screen was one signed in
as a user. Closing the endpoint to students would have closed it to whatever was
displaying the code, and attendance would have stopped everywhere.

**That is no longer true.** The robot console exists, runs on `/api/devices/*`
with a device token, and never touches `/api/sessions/:id/qr`. Staff have their
own full-screen display at `/sessions/:id/qr`, which stays permitted because
they are staff.

So the blocker is no longer code. It is **proof that a real robot works on the
device path**.

---

## The cutover, in order

### 1. Provision a real device

Super admin → **Robot Devices** → *Provision a device*. Give it the room it will
live in. Copy the key id and secret; the secret is shown once.

### 2. Pair the screen

On whatever will display codes — wall screen, laptop, phone, anything with a
browser — open `/robot` and paste the credential.

### 3. Prove the whole path, on real hardware, in a real lecture

Not a smoke test on your desk. In the room, during a lecture, with students:

- [ ] Pairing succeeds and the screen shows **IDLE** with the right room name.
- [ ] An instructor opens attendance from **My Teaching Timetable**.
- [ ] The robot picks the session up within one refresh cycle (≤20s).
- [ ] A student's phone scans the robot's code and attendance is recorded.
- [ ] The code visibly rotates and a scan of a **fresh** code still works.
- [ ] The count on the robot rises as students scan.
- [ ] Session closes; the robot returns to **IDLE** on its own.
- [ ] Leave it running past the device token TTL (15 min) and confirm it
      re-authenticates **silently** — no pairing screen, no blank display.

If any box is unticked, do not proceed. Each one is a way for attendance to fail
in a room full of people.

### 4. Check the fleet, not just the one

```
GET /api/admin/devices
```

Every screen that must serve a room has a `room` set, and every one shows a
recent `lastSeenAt`. A device left unbound serves the whole university, which
may not be what its operator assumes.

### 5. Flip it

```bash
QR_ENDPOINT_STAFF_ONLY=true
```

Restart. No redeploy, no code change — it was built as a flag precisely so this
step is instant.

### 6. Confirm the hole is closed

- [ ] A **student** token against `GET /api/sessions/:id/qr` → **403**.
- [ ] A **staff** token against the same → **200**.
- [ ] The robot is unaffected (different endpoint entirely).
- [ ] Students can still scan.

### Rollback

Set it back to `false` and restart. That is the whole rollback, and it is why
this is a flag rather than an edit.

---

## Separately: `DEVICE_JWT_SECRET`

Do this **before** the robot goes into real use, independently of the flag.

Right now it is unset, and the key is derived from `JWT_SECRET` with a warning
at boot. The derivation is a one-way hash under a fixed label, so it is still
independent key material — a device token cannot verify as a user token or vice
versa. But the two cannot be rotated separately, which is the point of having
two keys.

```bash
# 32+ characters
openssl rand -hex 32
```

Set `DEVICE_JWT_SECRET` in the production environment and restart.

Rotating it invalidates every live device token. The TTL is 15 minutes and
paired screens re-authenticate on their own from their stored credential, so the
impact is a brief reconnect — **not** a re-pairing, and no secrets need
re-entering.

---

## And: `DEVICE_ROOM_FILTER_STRICT`

A separate flag, a separate decision, and not required for this cutover.

It controls whether a room-bound device is shown sessions that have **no room
recorded**. It ships `false` — they stay visible — because hiding them would
take attendance offline for every session already in the database.

Turn it on only when all three hold:

1. `unlocatedCount` is **0** on `GET /api/devices/me/sessions/active` for every
   provisioned device, observed across a full teaching week. The endpoint
   reports this number precisely so the decision does not need a hand-written
   SQL query.
2. Every session-opening path in use sends `lectureScheduleId` (or an explicit
   `room`).
3. Every device that must serve a room has `room` set.

Until then `false` is correct, and `room = null` is a migration state being
worked through rather than a permanently acceptable one.
