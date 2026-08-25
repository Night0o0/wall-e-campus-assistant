/**
 * Whether a robot may act on a session, given its room binding.
 *
 * THIS IS THE ONLY DEFINITION OF THAT RULE, in the same sense that
 * session-access.ts is the only definition of who may see a session. It exists
 * because the rule previously lived in exactly one place — the SQL filter
 * behind `/api/devices/me/sessions/active` — and the mint path
 * (`/api/devices/me/sessions/:id/qr`) checked only the organization. A device
 * bound to one room could therefore not *discover* a session in another room,
 * but could mint a perfectly valid code for it if it knew the session id, which
 * every code it has ever displayed reveals.
 *
 * That is the shape of bug the tenant rule and the session-visibility rule were
 * each written to prevent: an invariant enforced on the read that lists things
 * and forgotten on the read that acts on one. So discovery and minting now call
 * this function, and neither can drift from the other without changing it.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 *   * A device with NO room binding is unbound and serves every session in its
 *     own university. This is unchanged behaviour and is what an unprovisioned
 *     room or a spare screen relies on.
 *
 *   * A bound device serves the room it is bound to, compared
 *     case-insensitively — `room` is free text on both sides, and whoever typed
 *     "b-204" into the timetable and whoever typed "B-204" onto the device
 *     meant the same room.
 *
 *   * A session with NO room recorded is not in another room; it is in no known
 *     room, so a binding has nothing to exclude it by. Whether a bound device
 *     serves it is exactly what DEVICE_ROOM_FILTER_STRICT decides, and the
 *     caller passes that decision in rather than reading the flag here — so
 *     this function stays a pure predicate and the tests can drive both sides
 *     of the flag without touching the environment.
 *
 * ── What this is NOT ───────────────────────────────────────────────────────
 *
 * It is not the tenant check. The organization is verified separately and
 * unconditionally by every caller, and no room match can substitute for it: two
 * universities may both have a room called "B-204".
 */

export interface DeviceRoomBinding {
  /** Null means unbound. */
  room: string | null;
}

export interface RoomedSession {
  /** Null means no room was recorded when the session was opened. */
  room: string | null;
}

export const deviceMaySeeRoom = (
  device: DeviceRoomBinding,
  session: RoomedSession,
  options: { includeUnlocated: boolean }
): boolean => {
  // Unbound: no room clause applies at all.
  if (!device.room) {
    return true;
  }

  if (session.room === null) {
    return options.includeUnlocated;
  }

  return session.room.toLowerCase() === device.room.toLowerCase();
};
