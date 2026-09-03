# DataMatrix - REST API Documentation & OpenAPI Specification

DataMatrix exposes a complete asynchronous REST API built with FastAPI, adhering to OpenAPI 3.0 standards and secured via Bearer JWT tokens.

Interactive documentation:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

---

## 1. Authentication Endpoints (`/api/v1/auth`)

| Method | Endpoint | Description | Permission Required |
|---|---|---|---|
| `POST` | `/auth/login` | Authenticate with username and password. Returns JWT token. | Public |
| `GET` | `/auth/me` | Fetch currently authenticated user profile and permissions. | Authenticated |
| `POST` | `/auth/change-password` | Update current user password. | Authenticated |
| `GET` | `/auth/sessions` | List active sessions for current user. | Authenticated |
| `DELETE` | `/auth/sessions/{id}` | Terminate specific user session. | Authenticated |
| `POST` | `/auth/logout` | Revoke current session. | Authenticated |

---

## 2. Dynamic Table Endpoints (`/api/v1/tables`)

| Method | Endpoint | Description | Permission Required |
|---|---|---|---|
| `GET` | `/tables` | List dynamic tables (supports search, favorites filter, pagination). | `tables:view` |
| `POST` | `/tables` | Create a new dynamic table and columns schema. | `tables:create` |
| `GET` | `/tables/{id}` | Get table schema, columns, and permission details. | `tables:view` |
| `PUT` | `/tables/{id}` | Update table metadata (display name, description, favorite). | `tables:edit` |
| `DELETE` | `/tables/{id}` | Delete table and all associated records. | `tables:delete` |
| `GET` | `/tables/{id}/history` | Get structural schema modification history for table. | `tables:view` |
| `POST` | `/tables/{id}/permissions` | Assign table access permissions to a role. | `tables:manage_permissions` |

---

## 3. Dynamic Column Endpoints (`/api/v1/columns`)

| Method | Endpoint | Description | Permission Required |
|---|---|---|---|
| `POST` | `/tables/{table_id}/columns` | Add a new column to a dynamic table. | `tables:manage_columns` |
| `PUT` | `/columns/{id}` | Modify column definition (display name, required, sensitivity). | `tables:manage_columns` |
| `DELETE` | `/columns/{id}` | Delete a column from a dynamic table. | `tables:manage_columns` |
| `POST` | `/columns/{id}/check-type` | Analyze compatibility before changing column data type. | `tables:manage_columns` |
| `POST` | `/tables/{table_id}/columns/reorder` | Reorder columns for grid display. | `tables:manage_columns` |
| `POST` | `/columns/{id}/permissions` | Set column permission level for a role (`DENIED`, `VIEW`, `VIEW_EDIT`). | `tables:manage_permissions` |

---

## 4. Dynamic Record Endpoints (`/api/v1/records`)

| Method | Endpoint | Description | Permission Required |
|---|---|---|---|
| `GET` | `/tables/{table_id}/records` | List records with server-side search, filtering, sorting, pagination. | `records:view` |
| `POST` | `/tables/{table_id}/records` | Create a new record in a dynamic table. | `records:create` |
| `GET` | `/records/{id}` | Get specific record details. | `records:view` |
| `PUT` | `/records/{id}` | Update a record (creates point-in-time version snapshot and delta diff). | `records:edit` |
| `DELETE` | `/records/{id}` | Delete a record. | `records:delete` |
| `POST` | `/tables/{table_id}/records/bulk-delete` | Bulk delete multiple selected records. | `records:delete` |
| `GET` | `/records/{id}/history` | Retrieve full version history and field diffs for a record. | `records:view` |
| `POST` | `/records/{id}/restore/{version}` | Restore a record to a previous version snapshot. | `records:restore` |
| `POST` | `/tables/{table_id}/records/{record_id}/columns/{column_id}/reveal-secret` | Decrypt and reveal AES-256 secret. Logs `PASSWORD_VIEWED`. | `secrets:reveal` |

---

## 5. Import & Export Endpoints

| Method | Endpoint | Description | Permission Required |
|---|---|---|---|
| `POST` | `/imports/upload` | Upload Excel workbook and discover worksheets/headers. | `import:execute` |
| `POST` | `/imports/validate` | Dry-run validate spreadsheet rows against column rules. | `import:execute` |
| `POST` | `/imports/execute` | Transactionally import spreadsheet into new or existing table. | `import:execute` |
| `GET` | `/imports/history` | List spreadsheet import history logs. | `import:view_history` |
| `POST` | `/exports/generate` | Generate formatted `.xlsx` or `.csv` export file with column security. | `export:execute` |
| `GET` | `/exports/history` | List data export history logs. | `export:view_history` |

---

## 6. Security, Users, Roles, Audit & Dashboard

| Method | Endpoint | Description | Permission Required |
|---|---|---|---|
| `GET` | `/users` | List users. | `users:manage` |
| `POST` | `/users` | Create user account. | `users:manage` |
| `PUT` | `/users/{id}` | Update user profile, roles, or password. | `users:manage` |
| `DELETE` | `/users/{id}` | Delete user account. | `users:manage` |
| `GET` | `/roles` | List roles and granted permissions. | `roles:manage` |
| `POST` | `/roles` | Create custom role. | `roles:manage` |
| `PUT` | `/roles/{id}` | Update role permissions matrix. | `roles:manage` |
| `GET` | `/permissions` | List all 22 system permissions. | `roles:manage` |
| `GET` | `/audit/logs` | Query append-only audit trail with filtering. | `audit:view` |
| `GET` | `/dashboard/metrics` | Live statistics directly calculated from PostgreSQL. | Authenticated |
| `GET` | `/settings` | Get system security settings and LDAP configuration. | `settings:manage` |
| `POST` | `/settings/test-ldap` | Test Active Directory / LDAP connection. | `settings:manage` |
