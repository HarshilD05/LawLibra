# Auth & Users API

Base path: `/api/auth`

---

## Endpoints

| Method | Endpoint | Auth | Role |
| :--- | :--- | :--- | :--- |
| POST | [`/register`](#1-post-register) | None | — |
| POST | [`/login`](#2-post-login) | None | — |
| GET | [`/me`](#3-get-me) | JWT | Any |
| PATCH | [`/change-password`](#4-patch-change-password) | JWT | Any |
| GET | [`/users`](#5-get-users) | JWT | Admin |
| DELETE | [`/users/:id`](#6-delete-usersid) | JWT | Admin |

---

## 1. `POST /register`

Creates a new user account. In production this should be called only by an authenticated Admin.

### Request Body

```json
{
  "name": "Arjun Mehta",
  "email": "arjun@firm.com",
  "password": "securepassword",
  "role": "LAWYER"
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `name` | string | Yes | Display name |
| `email` | string | Yes | Must be unique |
| `password` | string | Yes | Plaintext; hashed server-side |
| `role` | string | No | `LAWYER` (default) or `ADMIN` |

### Success Response — `201 Created`

```json
{
  "user": {
    "id": "a1b2c3d4-...",
    "name": "Arjun Mehta",
    "email": "arjun@firm.com",
    "role": "LAWYER",
    "createdAt": "2026-02-23T10:00:00.000Z"
  },
  "token": "<jwt>"
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `Name, email, and password are required.` | Missing required field |
| `409` | `An account with this email already exists.` | Duplicate email |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 2. `POST /login`

Authenticates a user and returns a JWT.

### Request Body

```json
{
  "email": "arjun@firm.com",
  "password": "securepassword"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| `email` | string | Yes |
| `password` | string | Yes |

### Success Response — `200 OK`

```json
{
  "user": {
    "id": "a1b2c3d4-...",
    "name": "Arjun Mehta",
    "email": "arjun@firm.com",
    "role": "LAWYER",
    "createdAt": "2026-02-23T10:00:00.000Z"
  },
  "token": "<jwt>"
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `Email and password are required.` | Missing field |
| `401` | `Invalid email or password.` | Wrong credentials or user not found |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 3. `GET /me`

Returns the authenticated user"s own profile.

### Headers

```
Authorization: Bearer <jwt>
```

### Success Response — `200 OK`

```json
{
  "user": {
    "id": "a1b2c3d4-...",
    "name": "Arjun Mehta",
    "email": "arjun@firm.com",
    "role": "LAWYER",
    "createdAt": "2026-02-23T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `404` | `User not found.` | User deleted after token was issued |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 4. `PATCH /change-password`

Allows an authenticated user to change their own password. Requires confirmation of the current password.

### Headers

```
Authorization: Bearer <jwt>
```

### Request Body

```json
{
  "currentPassword": "securepassword",
  "newPassword": "evenmoresecure123"
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `currentPassword` | string | Yes | Must match the stored hash |
| `newPassword` | string | Yes | Minimum 8 characters |

### Success Response — `200 OK`

```json
{
  "message": "Password updated successfully."
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `currentPassword and newPassword are required.` | Missing field |
| `400` | `New password must be at least 8 characters.` | Too short |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Current password is incorrect.` | Wrong current password |
| `404` | `User not found.` | User no longer exists |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 5. `GET /users`

Paginated list of all users. **Admin only.**

### Headers

```
Authorization: Bearer <jwt>
```

### Query Parameters

| Parameter | Type | Default | Max | Description |
| :--- | :--- | :--- | :--- | :--- |
| `limit` | number | `20` | `100` | Records per page |
| `offset` | number | `0` | — | Records to skip |

### Success Response — `200 OK`

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "name": "Arjun Mehta",
      "email": "arjun@firm.com",
      "role": "LAWYER",
      "createdAt": "2026-02-23T10:00:00.000Z"
    }
  ],
  "total": 12,
  "limit": 20,
  "offset": 0
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `403` | `Forbidden. Admin access required.` | Caller is not an Admin |
| `500` | `Internal server error.` | Unexpected server failure |

---

## 6. `DELETE /users/:id`

Permanently deletes a user account. **Admin only.**

### Headers

```
Authorization: Bearer <jwt>
```

### URL Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID string | ID of the user to delete |

### Success Response — `200 OK`

```json
{
  "message": "User deleted successfully."
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `You cannot delete your own account.` | Admin tried to self-delete |
| `401` | `Unauthorized. No token provided.` | Missing JWT |
| `401` | `Invalid or expired token.` | Bad or expired JWT |
| `403` | `Forbidden. Admin access required.` | Caller is not an Admin |
| `404` | `User not found.` | No user with the given ID |
| `500` | `Internal server error.` | Unexpected server failure |
