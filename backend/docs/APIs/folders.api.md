# Folders API

Base path: `/api/folders`

All endpoints require a valid JWT (`Authorization: Bearer <token>`).

**Access levels** referenced below are per-case assignment levels (`VIEW`, `EDIT`, `ADMIN`). System Admins bypass all assignment checks.

---

## Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| POST | [`/`](#1-post-) | EDIT \| ADMIN | Create a folder |
| GET | [`/tree?caseId=`](#2-get-treecaseid) | VIEW+ | Full nested folder tree for a case |
| GET | [`/:id`](#3-get-id) | VIEW+ | Get a single folder |
| PATCH | [`/:id`](#4-patch-id) | EDIT \| ADMIN | Rename a folder |
| DELETE | [`/:id`](#5-delete-id) | EDIT \| ADMIN | Delete folder + descendants + their files |

---

## 1. `POST /`

Creates a new folder inside a case. Optionally nest it under an existing folder via `parentFolderId`.

A physical directory (`data/<caseId>/<newFolderId>/`) is created on disk immediately so documents can be uploaded into it right away.

### Request Body

```json
{
  "caseId": "c1d2e3f4-...",
  "name": "Affidavits",
  "parentFolderId": "f9e8d7c6-..."
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `caseId` | string (UUID) | Yes | Case this folder belongs to |
| `name` | string | Yes | Display name of the folder |
| `parentFolderId` | string (UUID) | No | Omit (or `null`) for a top-level folder |

### Success Response — `201 Created`

```json
{
  "folder": {
    "id": "a1b2c3d4-...",
    "caseId": "c1d2e3f4-...",
    "parentFolderId": "f9e8d7c6-...",
    "name": "Affidavits",
    "createdBy": "u9u8u7u6-...",
    "createdAt": "2026-02-25T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `caseId is required.` | Missing `caseId` |
| `400` | `Folder name is required.` | Missing `name` |
| `400` | `parentFolderId does not belong to this case.` | Parent folder exists in a different case |
| `403` | `VIEW access is insufficient to create folders.` | Requester only has VIEW on this case |
| `404` | `Case not found or access denied.` | Case does not exist or requester has no assignment |
| `500` | `Internal server error.` | Unexpected failure |

---

## 2. `GET /tree?caseId=`

Returns the complete nested folder tree for a case in a single request.

The implicit **Root** level (documents with no folder assigned) is **not** included in this tree — clients should render it as a fixed top node alongside the returned tree.

### Query Parameters

| Parameter | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `caseId` | string (UUID) | Yes | |

### Success Response — `200 OK`

```json
{
  "tree": [
    {
      "id": "f1000000-...",
      "caseId": "c1d2e3f4-...",
      "parentFolderId": null,
      "name": "Evidence",
      "createdBy": "u9u8u7u6-...",
      "createdAt": "2026-02-25T10:00:00.000Z",
      "depth": 0,
      "children": [
        {
          "id": "f2000000-...",
          "parentFolderId": "f1000000-...",
          "name": "Photographs",
          "depth": 1,
          "children": []
        }
      ]
    },
    {
      "id": "f3000000-...",
      "parentFolderId": null,
      "name": "Affidavits",
      "depth": 0,
      "children": []
    }
  ]
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `caseId query parameter is required.` | Missing query param |
| `404` | `Case not found or access denied.` | No access or case missing |
| `500` | `Internal server error.` | Unexpected failure |

---

## 3. `GET /:id`

Returns metadata for a single folder.

### Success Response — `200 OK`

```json
{
  "folder": {
    "id": "f1000000-...",
    "caseId": "c1d2e3f4-...",
    "parentFolderId": null,
    "name": "Evidence",
    "createdBy": "u9u8u7u6-...",
    "createdAt": "2026-02-25T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `403` | `Access denied.` | Requester has no assignment on the folder"s case |
| `404` | `Folder not found.` | No folder with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## 4. `PATCH /:id`

Renames a folder. **Moving a folder to a different parent is not supported.**

### Request Body

```json
{
  "name": "Documentary Evidence"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| `name` | string | Yes |

### Success Response — `200 OK`

```json
{
  "folder": {
    "id": "f1000000-...",
    "name": "Documentary Evidence",
    "...": "..."
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `New folder name is required.` | Empty or missing `name` |
| `403` | `VIEW access is insufficient to rename folders.` | Insufficient access level |
| `403` | `Access denied.` | No assignment on this case |
| `404` | `Folder not found.` | No folder with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## 5. `DELETE /:id`

Permanently deletes the folder, all descendant folders, all documents inside them, and their ingestion chunks. Physical files are removed from disk.

**This operation is irreversible.**

### Cascade chain

```
Folder (DB: CASCADE)
  └── Sub-folders (recursively)
       └── Documents (DB: CASCADE)
            └── doc_chunks (DB: CASCADE)
  └── Physical files on disk (unlinked)
  └── Physical directories on disk (removed)
```

### Success Response — `200 OK`

```json
{
  "message": "Folder deleted successfully.",
  "filesRemoved": 12,
  "foldersRemoved": 3
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `403` | `VIEW access is insufficient to delete folders.` | Insufficient access level |
| `403` | `Access denied.` | No assignment on this case |
| `404` | `Folder not found.` | No folder with that ID |
| `500` | `Internal server error.` | Unexpected failure |
