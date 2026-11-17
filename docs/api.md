# API Reference (Summary)

This document summarizes the Task Management API. For copy/paste curl examples, see the root `README.md`.

## Base URL

- Backend default: `http://localhost:8080`
- Base path: `/api/tasks`

## Authentication

All `/api/tasks/**` endpoints require **HTTP Basic authentication**.

- Credentials come from environment variables:
  - `TASKAPI_USERNAME`
  - `TASKAPI_PASSWORD`

On authentication failure:
- HTTP status: `401`
- Header: `WWW-Authenticate: Basic realm="task-management-api"`

## Public vs protected endpoints

Public:
- Swagger UI: `/swagger-ui/**` and `/swagger-ui.html` (redirect)
- OpenAPI JSON: `/v3/api-docs`

Protected:
- OpenAPI YAML: `/v3/api-docs.yaml`
- All task endpoints: `/api/tasks/**`

## Task model

A task response contains:

- `id` (number)
- `title` (string, required, not blank, max 255)
- `description` (string or `null`, optional, max 2000)
- `status` (enum: `TODO`, `IN_PROGRESS`, `DONE`)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

## Endpoints

### Create
- `POST /api/tasks`
- Returns: `201 Created`
- Notes:
  - Returns an **absolute** `Location` header pointing to `/api/tasks/{id}`.
  - `status` is optional; when omitted it defaults to `TODO`.
  - Explicit `"status": null` is rejected with `400`.

### Get one
- `GET /api/tasks/{id}`
- Returns: `200` or `404`

### List (paged)
- `GET /api/tasks?page={page}&size={size}`
- Returns: `200`
- Ordering: by `id` ascending
- Paging rules:
  - `page`: default `0`, minimum `0`
  - `size`: default `20`, minimum `1`, maximum `100` (size > 100 => `400`)

Response envelope:

```json
{
  "content": [],
  "page": 0,
  "size": 20,
  "totalElements": 0,
  "totalPages": 0
}
```

### Replace
- `PUT /api/tasks/{id}`
- Returns: `200` or `404`
- Notes:
  - `title` and `status` are required.
  - `status` missing or null => `400`.
  - Omitted `description` clears it.

### Partial update
- `PATCH /api/tasks/{id}`
- Returns: `200` or `404`

Field behavior is three-state:
- Property omitted: unchanged
- Property set to a value: updated
- Property set to JSON null:
  - allowed only for `description` (clears it)
  - `title: null` or `status: null` => `400`

Empty PATCH body (e.g. `{}` or a body containing none of `title|description|status`) returns `400` and is validated **before** task lookup.

### Delete
- `DELETE /api/tasks/{id}`
- Returns: `204 No Content` or `404`

## Timestamps

- `createdAt` is set once when the task is created.
- `updatedAt` is set at creation and changes only when the task is actually modified.
- A PUT/PATCH that results in no effective changes does **not** change `updatedAt`.

## Errors (RFC7807)

Errors use Problem Details with content type `application/problem+json`. Validation errors may include an `errors` array with `{field, message}` entries.
