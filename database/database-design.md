User
----------------
id
full_name
email
password_hash
role
created_at
updated_at


Student
----------------
id
user_id
student_code
department
level
section


Admin
----------------
id
user_id
job_title
face_enabled


Robot
----------------
id
name
building
status
tablet_serial
esp32_serial


Course
----------------
id
course_code
course_name
semester


Session
----------------
id
course_id
robot_id
created_by
qr_token
status
start_time
end_time


Attendance
----------------
id
student_id
session_id
scan_time
status


RobotEvent
----------------
id
robot_id
event_type
payload
status
created_at


NavigationRequest
----------------
id
user_id
destination
start_time


FaceProfile
----------------
id
admin_id
encoding
created_at

User
 │
 ├──────────────┐
 │              │
 ▼              ▼
Student      Admin
 │              │
 │              ▼
 │         FaceProfile
 │
 ▼
Attendance
 ▲
 │
Session
 ▲
 │
Course

Session
 │
 ▼
Robot

Robot
 │
 ▼
RobotEvent