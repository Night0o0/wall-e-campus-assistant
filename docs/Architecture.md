                                 WALL-E Campus Assistant

                                       Internet / Wi-Fi
                                             │
                                             ▼
                               ┌─────────────────────────┐
                               │       Backend API       │
                               │     (Node.js/Express)   │
                               └─────────────────────────┘
                                   │        │        │
                 ┌─────────────────┘        │        └──────────────────┐
                 │                          │                           │
                 ▼                          ▼                           ▼
        PostgreSQL Database         Robot Events Engine         Face Recognition Service
                 │                          │
                 │                          ▼
                 │                   Robot Command Queue
                 │                          │
                 └──────────────────────────┘
                                            │
                         ┌──────────────────┼──────────────────┐
                         │                  │                  │
                         ▼                  ▼                  ▼
                  Student Mobile      Robot Tablet        ESP32-S3
                  (Flutter)           (Flutter)      (Eyes / Servos / Audio)
                         │                  │                  │
                         └──────────────────┴──────────────────┘
                                      WALL-E Robot

## for the student 
Student App

↓

Backend

↓

Attendance Saved

↓

Backend

↓

Robot API

↓

ESP32

↓

Move Eyes

↓

Play Audio