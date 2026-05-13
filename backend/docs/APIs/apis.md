# API Reference

Base URL: `http://localhost:3000/api`

All protected endpoints require a `Bearer` token in the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

---

## Modules

| Module | File | Description |
| :--- | :--- | :--- |
| Authentication & Users | [auth.api.md](auth.api.md) | Register, login, profile, password, user management |
| Cases & Assignments | [cases.api.md](cases.api.md) | Case CRUD and lawyer assignment management |
| Folders | [folders.api.md](folders.api.md) | Virtual folder tree within a case |
| Documents | [documents.api.md](documents.api.md) | Upload, list, status polling, delete + ingestion pipeline |
| Chat | [chat.api.md](chat.api.md) | AI chat threads and messages within a case |
| Events | [events.api.md](events.api.md) | Personal lawyer calendar — create, list, update, delete |
| Notifications | [notifications.api.md](notifications.api.md) | Per-user notification feed — read, mark-read, delete |
