# Cases & Assignments API

Base path: `/api/cases`

All endpoints require a valid JWT (`Authorization: Bearer <token>`).

---

## Endpoints

| Method | Endpoint | Role | Description |
| :--- | :--- | :--- | :--- |
| POST | [`/`](#1-post-) | Admin | Create a new case |
| GET | [`/`](#2-get-) | Admin / Lawyer | List cases |
| GET | [`/:id`](#3-get-id) | Admin / Assigned Lawyer | Get a single case |
| PATCH | [`/:id`](#4-patch-id) | Admin / Lawyer (EDIT\|ADMIN) | Update a case |
| DELETE | [`/:id`](#5-delete-id) | Admin | Delete a case |
| POST | [`/:id/assignments`](#6-post-idassignments) | Admin | Assign a lawyer to a case |
| DELETE | [`/:id/assignments/:lawyerId`](#7-delete-idassignmentslawyerid) | Admin | Remove a lawyer from a case |
| GET | [`/:id/assignments`](#8-get-idassignments) | Admin | List all assignments for a case |

---

## 1. `POST /`

Creates a new case. **Admin only.**

### Request Body

```json
{
  "title": "State vs. Sharma 2026",
  "status": "OPEN",
  "clientName": "Rajesh Sharma",
  "courtName": "Delhi High Court",
  "caseNumber": "DHC/2026/1234",
  "metadata": {
    "judge": "Hon. Justice Kapoor",
    "nextHearing": "2026-03-15"
  }
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `title` | string | Yes | Human-readable case name |
| `status` | string | No | `OPEN` (default), `CLOSED`, or `ARCHIVED` |
| `clientName` | string | No | Name of the firm's client |
| `courtName` | string | No | Court where the case is filed |
| `caseNumber` | string | No | Official court-assigned number |
| `metadata` | object | No | Any additional key-value data |

### Success Response — `201 Created`

```json
{
  "case": {
    "id": "c1d2e3f4-...",
    "title": "State vs. Sharma 2026",
    "status": "OPEN",
    "clientName": "Rajesh Sharma",
    "courtName": "Delhi High Court",
    "caseNumber": "DHC/2026/1234",
    "metadata": { "judge": "Hon. Justice Kapoor", "nextHearing": "2026-03-15" },
    "createdBy": "a1b2c3d4-...",
    "createdAt": "2026-02-23T10:00:00.000Z",
    "updatedAt": "2026-02-23T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `Case title is required.` | Missing `title` field |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `403` | `Forbidden. Admin access required.` | Caller is not an Admin |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 2. `GET /`

Returns a paginated list of cases.
- **Admin:** sees all cases in the system.
- **Lawyer:** sees only cases they are assigned to.

### Query Parameters

| Parameter | Type | Default | Max | Description |
| :--- | :--- | :--- | :--- | :--- |
| `limit` | number | `20` | `100` | Records per page |
| `offset` | number | `0` | — | Records to skip |
| `status` | string | — | — | Filter by `OPEN`, `CLOSED`, or `ARCHIVED` |

### Success Response — `200 OK`

```json
{
  "data": [
    {
      "id": "c1d2e3f4-...",
      "title": "State vs. Sharma 2026",
      "status": "OPEN",
      "clientName": "Rajesh Sharma",
      "courtName": "Delhi High Court",
      "caseNumber": "DHC/2026/1234",
      "metadata": {},
      "createdBy": "a1b2c3d4-...",
      "createdAt": "2026-02-23T10:00:00.000Z",
      "updatedAt": "2026-02-23T10:00:00.000Z"
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 3. `GET /:id`

Returns a single case by its UUID.
- **Admin:** always has access.
- **Lawyer:** must be assigned to the case (any access level).

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Case ID |

### Success Response — `200 OK`

```json
{
  "case": {
    "id": "c1d2e3f4-...",
    "title": "State vs. Sharma 2026",
    "status": "OPEN",
    "clientName": "Rajesh Sharma",
    "courtName": "Delhi High Court",
    "caseNumber": "DHC/2026/1234",
    "metadata": {},
    "createdBy": "a1b2c3d4-...",
    "createdAt": "2026-02-23T10:00:00.000Z",
    "updatedAt": "2026-02-23T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `404` | `Case not found or access denied.` | Case does not exist or Lawyer is not assigned |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 4. `PATCH /:id`

Updates one or more fields on a case. All body fields are optional.
- **Admin:** always has access.
- **Lawyer:** must have `EDIT` or `ADMIN` access level on the case.

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Case ID |

### Request Body *(all fields optional)*

```json
{
  "title": "Updated Title",
  "status": "CLOSED",
  "clientName": "New Client Name",
  "courtName": "Supreme Court of India",
  "caseNumber": "SCI/2026/999",
  "metadata": { "judge": "New Judge" }
}
```

### Success Response — `200 OK`

```json
{
  "case": {
    "id": "c1d2e3f4-...",
    "title": "Updated Title",
    "status": "CLOSED",
    ...
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `No valid fields provided for update.` | All body fields were undefined |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `403` | `Case not found or insufficient access.` | Not found, or Lawyer only has `VIEW` access |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 5. `DELETE /:id`

Permanently deletes a case and all its associated data (assignments, folders, documents, chunks, threads, messages). **Admin only.**

> ⚠️ This action is irreversible. All cascaded records are deleted.

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Case ID |

### Success Response — `200 OK`

```json
{
  "message": "Case deleted successfully."
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `403` | `Forbidden. Admin access required.` | Caller is not an Admin |
| `404` | `Case not found.` | No case with the given ID |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 6. `POST /:id/assignments`

Assigns a lawyer to a case with a specific access level. If the lawyer is already assigned, their access level is updated (upsert). **Admin only.**

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Case ID |

### Request Body

```json
{
  "lawyerId": "a1b2c3d4-...",
  "accessLevel": "EDIT"
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `lawyerId` | UUID string | Yes | Must be an existing user |
| `accessLevel` | string | Yes | `VIEW`, `EDIT`, or `ADMIN` |

**Access Level meanings:**

| Level | Permissions |
| :--- | :--- |
| `VIEW` | Read case, documents, and chat threads |
| `EDIT` | View + upload documents, create folders, chat with AI, update case fields |
| `ADMIN` | Edit + manage assignments for this case |

### Success Response — `200 OK`

```json
{
  "assignment": {
    "lawyer_id": "a1b2c3d4-...",
    "case_id": "c1d2e3f4-...",
    "access_level": "EDIT",
    "assigned_at": "2026-02-23T10:05:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `lawyerId and accessLevel are required.` | Missing field |
| `400` | `accessLevel must be one of: VIEW, EDIT, ADMIN.` | Invalid value |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `403` | `Forbidden. Admin access required.` | Caller is not an Admin |
| `404` | `Case not found.` | No case with the given ID |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 7. `DELETE /:id/assignments/:lawyerId`

Removes a lawyer's assignment from a case. **Admin only.**

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Case ID |
| `lawyerId` | UUID string | User ID of the lawyer to remove |

### Success Response — `200 OK`

```json
{
  "message": "Lawyer removed from case successfully."
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `403` | `Forbidden. Admin access required.` | Caller is not an Admin |
| `404` | `Assignment not found.` | The lawyer was not assigned to this case |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 8. `GET /:id/assignments`

Lists all lawyers currently assigned to a case along with their access levels. **Admin only.**

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | Case ID |

### Success Response — `200 OK`

```json
{
  "assignments": [
    {
      "lawyerId": "a1b2c3d4-...",
      "name": "Arjun Mehta",
      "email": "arjun@firm.com",
      "accessLevel": "EDIT",
      "assignedAt": "2026-02-23T10:05:00.000Z"
    }
  ]
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `403` | `Forbidden. Admin access required.` | Caller is not an Admin |
| `404` | `Case not found.` | No case with the given ID |
| `500` | `Internal server error.` | Unexpected server failure |
