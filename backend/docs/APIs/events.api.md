# Events API

Base path: `/api/events`

All endpoints require a valid JWT (`Authorization: Bearer <token>`).

Events are **personal** — each user only ever sees and manages their own events. There is no admin override; ownership is enforced at the database level.

---

## Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | [`/`](#1-post-) | Create a new personal event |
| GET | [`/`](#2-get-) | List own events (date-range filterable) |
| GET | [`/:id`](#3-get-id) | Get a single event |
| PATCH | [`/:id`](#4-patch-id) | Update an event |
| DELETE | [`/:id`](#5-delete-id) | Delete an event |

---

## Event Object

```json
{
  "id": "e1f2a3b4-...",
  "userId": "a1b2c3d4-...",
  "type": "HEARING",
  "name": "Bail Hearing — State vs. Sharma",
  "description": "Represented by Arjun Mehta. Bring cause-list.",
  "startTime": "2026-05-10T10:30:00.000Z",
  "endTime": "2026-05-10T12:00:00.000Z",
  "allDay": false,
  "remindBeforeMinutes": 60,
  "createdAt": "2026-05-04T11:00:00.000Z",
  "updatedAt": "2026-05-04T11:00:00.000Z"
}
```

**`type` values:**

| Value | Meaning |
| :--- | :--- |
| `HEARING` | Court appearance |
| `DEADLINE` | Filing or submission deadline |
| `MEETING` | Client or team meeting |
| `REMINDER` | Personal follow-up |

**`remindBeforeMinutes` common values:**

| Value | Meaning |
| :--- | :--- |
| `null` | No reminder (default) |
| `15` | 15 minutes before |
| `60` | 1 hour before |
| `1440` | 1 day before |

---

## 1. `POST /`

Creates a new personal calendar event for the authenticated user.

### Request Body

```json
{
  "type": "HEARING",
  "name": "Bail Hearing — State vs. Sharma",
  "startTime": "2026-05-10T10:30:00.000Z",
  "endTime": "2026-05-10T12:00:00.000Z",
  "description": "Represented by Arjun Mehta. Bring cause-list.",
  "allDay": false,
  "remindBeforeMinutes": 60
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `type` | string | **Yes** | One of `HEARING`, `DEADLINE`, `MEETING`, `REMINDER` |
| `name` | string | **Yes** | Short event title |
| `startTime` | ISO 8601 string | **Yes** | Timezone-aware datetime |
| `endTime` | ISO 8601 string | No | Must be after `startTime` if provided |
| `description` | string | No | Longer notes |
| `allDay` | boolean | No | `false` by default |
| `remindBeforeMinutes` | integer | No | Minutes before `startTime` to send an `EVENT_REMINDER` notification. `null` = no reminder |

### Success Response — `201 Created`

```json
{
  "event": {
    "id": "e1f2a3b4-...",
    "userId": "a1b2c3d4-...",
    "type": "HEARING",
    "name": "Bail Hearing — State vs. Sharma",
    "description": "Represented by Arjun Mehta. Bring cause-list.",
    "startTime": "2026-05-10T10:30:00.000Z",
    "endTime": "2026-05-10T12:00:00.000Z",
    "allDay": false,
    "remindBeforeMinutes": 60,
    "createdAt": "2026-05-04T11:00:00.000Z",
    "updatedAt": "2026-05-04T11:00:00.000Z"
  }
}
```

> If `remindBeforeMinutes` is set, a delayed BullMQ job is enqueued. At `startTime − remindBeforeMinutes`, an `EVENT_REMINDER` notification is inserted for the user. If the reminder time has already passed by the time the event is created, it is silently skipped.

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `type, name, and startTime are required.` | A required field is missing |
| `400` | `type must be one of: HEARING, DEADLINE, MEETING, REMINDER.` | Invalid `type` value |
| `400` | `endTime must be after startTime.` | Time window is invalid |
| `400` | `remindBeforeMinutes must be a positive integer.` | Value is ≤ 0 or not an integer |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 2. `GET /`

Returns a paginated list of the authenticated user's events. Optionally filtered to a date range using `from` and `to` — these bound the `start_time` of the event.

### Query Parameters

| Parameter | Type | Default | Max | Description |
| :--- | :--- | :--- | :--- | :--- |
| `from` | ISO 8601 string | — | — | Lower bound (inclusive) on `startTime` |
| `to` | ISO 8601 string | — | — | Upper bound (exclusive) on `startTime` |
| `limit` | number | `50` | `200` | Records per page |
| `offset` | number | `0` | — | Records to skip |

**Example — fetch all events for May 2026:**
```
GET /api/events?from=2026-05-01T00:00:00Z&to=2026-06-01T00:00:00Z
```

### Success Response — `200 OK`

```json
{
  "data": [
    {
      "id": "e1f2a3b4-...",
      "userId": "a1b2c3d4-...",
      "type": "HEARING",
      "name": "Bail Hearing — State vs. Sharma",
      "description": null,
      "startTime": "2026-05-10T10:30:00.000Z",
      "endTime": "2026-05-10T12:00:00.000Z",
      "allDay": false,
      "remindBeforeMinutes": 60,
      "createdAt": "2026-05-04T11:00:00.000Z",
      "updatedAt": "2026-05-04T11:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

Results are ordered by `startTime ASC`.

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 3. `GET /:id`

Returns a single event by its UUID. Only the owner of the event can access it.

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Event ID |

### Success Response — `200 OK`

```json
{
  "event": {
    "id": "e1f2a3b4-...",
    "userId": "a1b2c3d4-...",
    "type": "DEADLINE",
    "name": "File Written Submissions",
    "description": "Supreme Court — Case No. SCI/2026/999",
    "startTime": "2026-05-15T09:00:00.000Z",
    "endTime": null,
    "allDay": true,
    "remindBeforeMinutes": 1440,
    "createdAt": "2026-05-04T11:00:00.000Z",
    "updatedAt": "2026-05-04T11:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `404` | `Event not found.` | Event does not exist or belongs to another user |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 4. `PATCH /:id`

Updates one or more fields on an event. All body fields are optional. Only the owner of the event can update it.

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Event ID |

### Request Body *(all fields optional)*

```json
{
  "type": "MEETING",
  "name": "Client Consultation — Updated",
  "description": "Moved to 3 PM.",
  "startTime": "2026-05-10T15:00:00.000Z",
  "endTime": "2026-05-10T16:00:00.000Z",
  "allDay": false,
  "remindBeforeMinutes": 15
}
```

> **Partial time updates are safe.** If you only send `startTime`, the server validates against the existing `endTime` already stored (and vice versa).

> **Updating `remindBeforeMinutes`** overwrites the previously scheduled reminder job. Set to `null` to cancel a pending reminder.

### Success Response — `200 OK`

```json
{
  "event": {
    "id": "e1f2a3b4-...",
    "userId": "a1b2c3d4-...",
    "type": "MEETING",
    "name": "Client Consultation — Updated",
    "description": "Moved to 3 PM.",
    "startTime": "2026-05-10T15:00:00.000Z",
    "endTime": "2026-05-10T16:00:00.000Z",
    "allDay": false,
    "remindBeforeMinutes": 15,
    "createdAt": "2026-05-04T11:00:00.000Z",
    "updatedAt": "2026-05-04T11:20:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `type must be one of: HEARING, DEADLINE, MEETING, REMINDER.` | Invalid `type` value |
| `400` | `endTime must be after startTime.` | Time window is invalid |
| `400` | `remindBeforeMinutes must be a positive integer.` | Value is ≤ 0 or not an integer |
| `400` | `No valid fields provided for update.` | Request body was empty or contained no recognised fields |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `404` | `Event not found.` | Event does not exist or belongs to another user |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 5. `DELETE /:id`

Permanently deletes an event. Only the owner of the event can delete it.

> This is the intended way to handle cancelled or irrelevant events — there is no `status` field.

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Event ID |

### Success Response — `200 OK`

```json
{
  "message": "Event deleted successfully."
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `404` | `Event not found.` | Event does not exist or belongs to another user |
| `500` | `Internal server error.` | Unexpected server failure |
