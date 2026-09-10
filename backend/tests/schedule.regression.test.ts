import { DayOfWeek } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Feature 2 must keep working exactly as it did.
 *
 * Feature 3 touched the schedule service in two places — a lecture that is
 * cancelled or moved now clears the reminders queued against it — so this is
 * here to prove the student timetable is unchanged by that, and that the
 * academic profile is still the only thing deciding which lectures a student
 * sees.
 */

const mocks = vi.hoisted(() => ({
  findTimetable: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  findInstructorConflict: vi.fn().mockResolvedValue(null),
  findRoomConflict: vi.fn().mockResolvedValue(null),
  findByUserId: vi.fn(),
  deleteUnsentForSchedule: vi.fn().mockResolvedValue(0),
  cancelPendingForSchedule: vi.fn().mockResolvedValue(0),
}));

vi.mock("../src/repositories/schedule.repository.js", () => ({
  ScheduleRepository: class {
    findTimetable = mocks.findTimetable;
    findById = mocks.findById;
    update = mocks.update;
    findInstructorConflict = mocks.findInstructorConflict;
    findRoomConflict = mocks.findRoomConflict;
  },
}));

vi.mock("../src/repositories/student.repository.js", () => ({
  StudentRepository: class {
    findByUserId = mocks.findByUserId;
    findCohort = vi.fn().mockResolvedValue([]);
    // The schedule service now also notifies the cohort of created/changed/
    // cancelled lectures. This regression suite only cares that the timetable
    // behavior is unchanged, so the audience is empty and nothing is generated.
    findApprovedAudience = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock("../src/repositories/notification.repository.js", () => ({
  NotificationRepository: class {
    deleteUnsentForSchedule = mocks.deleteUnsentForSchedule;
    cancelPendingForSchedule = mocks.cancelPendingForSchedule;
  },
}));

// Imported after the mocks above only for readability — vi.mock is hoisted, so
// the service picks up the doubles whatever order this is written in.
import { ScheduleService } from "../src/services/schedule.service.js";

const STUDENT = {
  id: "student-b1",
  role: "STUDENT",
  organizationId: "org-a",
};

const SUPER_ADMIN = {
  id: "super-admin",
  role: "UNIVERSITY_ADMIN",
  organizationId: "org-a",
};

const electronics = {
  id: "lecture-electronics",
  organizationId: "org-a",
  faculty: "Faculty of Engineering",
  department: "Mechatronics",
  level: 2,
  semester: 1,
  section: "B",
  dayOfWeek: DayOfWeek.SUNDAY,
  startTime: "12:00",
  endTime: "14:00",
  room: "B-204",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  courseId: "course-mec201",
  instructorId: "instructor-1",
  course: {
    id: "course-mec201",
    courseCode: "MEC201",
    courseName: "Electronics",
    credits: 3,
  },
  instructor: {
    id: "instructor-1",
    fullName: "Adel Mansour",
    email: "adel.mansour@nctu.edu.eg",
    adminProfile: { jobTitle: "Associate Professor", office: "B-311" },
  },
};

describe("Feature 2 — student timetable", () => {
  let service: InstanceType<typeof ScheduleService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScheduleService();

    mocks.findByUserId.mockResolvedValue({
      faculty: "Faculty of Engineering",
      department: "Mechatronics",
      level: 2,
      semester: "First Semester",
      section: "B",
      status: "COMPLETED",
    });

    mocks.findTimetable.mockResolvedValue([electronics]);
  });

  it("still returns the student's week, matched from their own profile", async () => {
    const timetable = await service.getStudentTimetable(STUDENT);

    // The lookup is built from the profile, never from the request.
    expect(mocks.findTimetable).toHaveBeenCalledWith({
      organizationId: "org-a",
      isActive: true,
      faculty: "Faculty of Engineering",
      department: "Mechatronics",
      level: 2,
      semester: 1,
      section: "B",
    });

    expect(timetable.count).toBe(1);
    expect(timetable.criteria.semesterLabel).toBe("First Semester");

    expect(timetable.schedules[0]).toMatchObject({
      id: "lecture-electronics",
      dayOfWeek: DayOfWeek.SUNDAY,
      startTime: "12:00",
      endTime: "14:00",
      room: "B-204",
      isActive: true,
      course: { courseCode: "MEC201", courseName: "Electronics" },
      instructor: { fullName: "Adel Mansour", jobTitle: "Associate Professor" },
    });
  });

  it("still refuses a timetable to a student with an incomplete profile", async () => {
    mocks.findByUserId.mockResolvedValue({
      faculty: "Faculty of Engineering",
      department: null,
      level: 2,
      semester: "First Semester",
      section: null,
      status: "INCOMPLETE",
    });

    await expect(service.getStudentTimetable(STUDENT)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mocks.findTimetable).not.toHaveBeenCalled();
  });

  it("cancels the queued reminders when a lecture is deactivated", async () => {
    mocks.findById.mockResolvedValue(electronics);
    mocks.update.mockResolvedValue({ ...electronics, isActive: false });

    const result = await service.deactivateSchedule(
      "lecture-electronics",
      SUPER_ADMIN
    );

    expect(result.isActive).toBe(false);
    expect(mocks.cancelPendingForSchedule).toHaveBeenCalledWith(
      "lecture-electronics",
      "The lecture was cancelled"
    );
  });

  it("discards the queued reminders when a lecture is moved", async () => {
    mocks.findById.mockResolvedValue(electronics);
    mocks.update.mockResolvedValue({ ...electronics, room: "C-101" });

    await service.updateSchedule(
      "lecture-electronics",
      { room: "C-101" },
      SUPER_ADMIN
    );

    // Deleted, not cancelled: a cancelled row would hold the idempotency key
    // and stop the corrected reminder from ever being written.
    expect(mocks.deleteUnsentForSchedule).toHaveBeenCalledWith(
      "lecture-electronics"
    );
  });
});
