# Architecture Decision Records (ADR)

## ADR-001
Only the Backend can access the database directly.

## ADR-002
The ESP32 is responsible only for hardware control, not business logic.

## ADR-003: Tablet as the Robot Intelligence Hub

### Decision

The tablet will handle high-level robot intelligence functions including:

- User interface
- QR attendance interface
- Campus map display
- Face recognition processing
- Voice interaction management

The ESP32-S3 will only handle low-level hardware control.

### Reason

The tablet has much higher processing power compared to ESP32-S3, making it more suitable for:

- Face recognition
- UI rendering
- AI models
- Data processing

This keeps the ESP32 firmware simple and reliable.

---

## ADR-004: ESP32-S3 Communication with Tablet

### Decision

The tablet and ESP32-S3 will communicate using Wi-Fi.

Communication protocols may include:

- HTTP API
- WebSocket

### Reason

Wi-Fi provides:

- Flexible hardware placement
- No dependency on USB compatibility
- Easier future expansion
- Support for multiple devices

---

## ADR-005: Event-Based Robot Control

### Decision

The Backend and Tablet will send high-level events instead of direct hardware commands.

Example:

Good:

{
"event":"attendance_success",
"student":"Ahmed"
}

Bad:

{
"servo1":90,
"servo2":45
}

### Reason

The ESP32 should control hardware behavior only.

Hardware details should not affect the software architecture.