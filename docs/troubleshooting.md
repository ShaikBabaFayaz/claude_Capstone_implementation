# Troubleshooting

## Backend fails to start: missing credentials

Symptom:
- Application exits early with a message indicating missing/blank/unresolved credentials.

Fix:
- Ensure both environment variables are set:
  - `TASKAPI_USERNAME`
  - `TASKAPI_PASSWORD`

## 401 Unauthorized from `/api/tasks`

Symptom:
- Requests to `/api/tasks` return `401`.

Fix:
- Confirm you are sending an `Authorization: Basic ...` header.
- Confirm the username/password matches the configured env vars.

Expected behavior:
- Response includes `WWW-Authenticate: Basic realm="task-management-api"`.

## Frontend shows a 502 / “service unavailable”

Symptom:
- The UI shows a generic error.
- Network tab shows a `502`.

Cause:
- The Vite dev server proxies `/api` calls to `http://localhost:8080`. If the backend is not running, the proxy returns 502.

Fix:
- Start the backend (`mvn spring-boot:run`) before using the UI.

## Data disappears after restart

Symptom:
- Tasks created earlier are gone after restarting the backend.

Cause:
- The database is an **in-memory H2** instance. Data is intentionally ephemeral.

## Paging validation errors

Symptom:
- Listing tasks returns `400 Bad Request`.

Causes:
- `page < 0`
- `size < 1` or `size > 100`

Fix:
- Use valid paging parameters, for example: `?page=0&size=20`.
