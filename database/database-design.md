# Current database design summary

This is a simplified current-state summary, not a historical full ERD.

## Core domains

### Identity and tenancy

- `Organization`
- `User`
- `StudentProfile`
- `AdminProfile`
- `Department`

### Academic structure

- `AcademicTerm`
- `Cohort`
- `Course`
- `CourseOffering`
- `TeachingAssignment`
- `Enrollment`
- `LectureSchedule`

### Attendance and learning

- `Session`
- `Attendance`
- `CourseMaterial`
- `Assignment`
- `AssignmentCohort`
- `AssignmentAttachment`
- `AssignmentGrade`
- `GradeItem`
- `StudentGrade`

### Support tables

- `Notification`
- `DeviceToken`
- `AuditLog`
- `FileAsset`
- `EmailChallenge`

## Important current rule

Legacy billing and robot tables are not part of the active target schema.

If they still exist in a database, they should be removed by the current cleanup migration:

- `20260826183000_remove_billing_and_robot_data`
