import { z } from "zod";

/**
 * Opening an attendance session.
 *
 * `lectureScheduleId` is what makes a session part of the timetable rather than
 * a loose event: it names the recurring lecture this occurrence belongs to, and
 * the room is taken from that lecture rather than from the request. Optional,
 * because a session may legitimately be opened for something with no timetable
 * entry — a makeup class, a one-off seminar.
 *
 * `room` is only read when no schedule is given. Sending both is rejected
 * rather than silently resolved: a session cannot be in two places, and quietly
 * picking one of the two answers is how a room-bound robot ends up displaying
 * the wrong code.
 *
 * Note what is absent, as everywhere else in this API: `organizationId`. A
 * session always inherits the authenticated user's organization.
 */
export const createSessionSchema = z
  .object({
    title: z.string().min(3, "Session title must be at least 3 characters"),
    lectureScheduleId: z
      .string()
      .uuid("lectureScheduleId must be a valid id")
      .optional(),
    /** Free text, matched case-insensitively against a device's binding. */
    room: z.string().trim().min(1).max(50).optional(),
  })
  .refine((data) => !(data.lectureScheduleId && data.room), {
    message:
      "Send either lectureScheduleId or room, not both — a linked session takes its room from the lecture",
    path: ["room"],
  });

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
