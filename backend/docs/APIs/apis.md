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
