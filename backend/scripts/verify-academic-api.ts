/**
 * Non-mutating live verification for the normalized academic API.
 *
 * Uses seeded Supabase identities exactly like a client, but performs only GET
 * requests plus authorization/validation failures. It never writes demo rows
 * or prints credentials, tokens, identity ids, or organization ids.
 */
import {
  ACCOUNTS,
  callApi,
  check,
  finish,
  profileOf,
  section,
  signIn,
} from "./auth-harness.js";

type RecordValue = Record<string, unknown>;

const recordOf = (value: unknown): RecordValue =>
  value && typeof value === "object" ? (value as RecordValue) : {};

const dataOf = (body: unknown): RecordValue[] => {
  const data = recordOf(body).data;
  return Array.isArray(data) ? data.map(recordOf) : [];
};

const hasPagination = (body: unknown) => {
  const meta = recordOf(recordOf(body).meta);
  return (
    typeof meta.page === "number" &&
    typeof meta.limit === "number" &&
    typeof meta.total === "number" &&
    typeof meta.hasNext === "boolean"
  );
};

const main = async () => {
  const [nctuAdmin, cuAdmin, instructor, student, pending] = await Promise.all([
    signIn(ACCOUNTS.universityAdmin),
    signIn(ACCOUNTS.otherUniversityAdmin),
    signIn(ACCOUNTS.instructorA),
    signIn(ACCOUNTS.studentApproved),
    signIn(ACCOUNTS.studentPending),
  ]);

  section("Academic API — health and university-scoped reads");

  const ready = await callApi("/api/health/ready");
  check("database readiness is healthy", ready.status === 200, `status ${ready.status}`);

  for (const [label, path] of [
    ["terms", "/api/academic/terms"],
    ["cohorts", "/api/academic/cohorts"],
    ["offerings", "/api/academic/offerings"],
    ["teaching assignments", "/api/academic/teaching-assignments"],
    ["enrollments", "/api/academic/enrollments"],
  ] as const) {
    const result = await callApi(path, nctuAdmin.accessToken);
    check(`${label} list succeeds`, result.status === 200, `status ${result.status}`);
    check(`${label} list is paginated`, hasPagination(result.body));
    check(`${label} list contains seeded data`, dataOf(result.body).length > 0);
  }

  const materials = await callApi("/api/materials", nctuAdmin.accessToken);
  check("staff materials list uses the paginated contract", materials.status === 200 && hasPagination(materials.body));

  section("Academic API — role-derived scope");

  const instructorProfile = profileOf(
    (await callApi("/api/auth/profile", instructor.accessToken)).body
  );
  const instructorAssignments = await callApi(
    "/api/academic/teaching-assignments?limit=100",
    instructor.accessToken
  );
  check("instructor assignment list succeeds", instructorAssignments.status === 200);
  check(
    "instructor sees only their own teaching assignments",
    dataOf(instructorAssignments.body).length > 0 &&
      dataOf(instructorAssignments.body).every(
        (row) => row.instructorId === instructorProfile?.id
      )
  );

  const studentProfile = profileOf(
    (await callApi("/api/auth/profile", student.accessToken)).body
  );
  const studentEnrollments = await callApi(
    "/api/academic/enrollments?limit=100",
    student.accessToken
  );
  check("student enrollment list succeeds", studentEnrollments.status === 200);
  check(
    "student sees only their own enrollments",
    dataOf(studentEnrollments.body).length > 0 &&
      dataOf(studentEnrollments.body).every((row) => row.studentId === studentProfile?.id)
  );

  const studentOfferings = await callApi("/api/academic/offerings", student.accessToken);
  check(
    "approved student sees their enrolled offerings",
    studentOfferings.status === 200 && dataOf(studentOfferings.body).length > 0
  );

  section("Academic API — negative tenant, role, and validation boundaries");

  const cuOfferings = await callApi("/api/academic/offerings", cuAdmin.accessToken);
  const foreignOfferingId = dataOf(cuOfferings.body)[0]?.id;
  const foreignRead = await callApi(
    `/api/academic/offerings/${String(foreignOfferingId)}`,
    nctuAdmin.accessToken
  );
  check(
    "another tenant's offering is hidden with safe 404",
    typeof foreignOfferingId === "string" && foreignRead.status === 404,
    `status ${foreignRead.status}`
  );

  const malformed = await callApi("/api/academic/offerings/not-a-uuid", nctuAdmin.accessToken);
  check(
    "malformed resource ids return the validation contract",
    malformed.status === 400 && malformed.code === "VALIDATION_ERROR",
    `status ${malformed.status} code ${malformed.code ?? "none"}`
  );

  const invalidQuery = await callApi("/api/academic/terms?limit=1000", nctuAdmin.accessToken);
  check(
    "out-of-range pagination is rejected",
    invalidQuery.status === 400 && invalidQuery.code === "VALIDATION_ERROR",
    `status ${invalidQuery.status}`
  );

  const studentWrite = await callApi("/api/academic/terms", student.accessToken, {
    method: "POST",
  });
  check("students cannot create academic terms", studentWrite.status === 403);

  const instructorWrite = await callApi("/api/academic/offerings", instructor.accessToken, {
    method: "POST",
  });
  check("instructors cannot create course offerings", instructorWrite.status === 403);

  const pendingRead = await callApi("/api/academic/terms", pending.accessToken);
  check(
    "pending students are blocked from the academic API",
    pendingRead.status === 403 && pendingRead.code === "ACCOUNT_PENDING_APPROVAL"
  );

  finish();
};

main().catch((error) => {
  console.error("\nVERIFICATION ABORTED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
