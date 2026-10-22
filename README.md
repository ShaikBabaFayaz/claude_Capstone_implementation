# Task Management API

A small REST API for managing tasks (create, read, list, replace, partially update, delete), built with Java 21, Spring Boot 3.5 and Maven. Data is stored in an in-memory H2 database.

## Prerequisites

- JDK 21
- Maven 3.x (`mvn`). The repository also contains a Maven wrapper (`./mvnw`, `mvnw.cmd`, Maven 3.10.0). On Windows, `.\mvnw.cmd -B test` was verified to work (the wrapper may download Maven 3.10.0 on first use, which needs network access to repo.maven.apache.org). The Unix `./mvnw` script has not been run in this environment and is unverified. The documented commands use the installed `mvn`.

## Required environment variables

All `/api/tasks` endpoints use HTTP Basic authentication with a single user whose credentials come from the environment. The only public paths are Swagger UI (`/swagger-ui/**` and the `/swagger-ui.html` redirect) and `/v3/api-docs`; `/v3/api-docs.yaml` requires authentication (see "API documentation"):

| Variable | Meaning |
|---|---|
| `TASKAPI_USERNAME` | Basic auth user name |
| `TASKAPI_PASSWORD` | Basic auth password |

**The application fails to start if either variable is missing, blank, or left as an unresolved `${...}` placeholder.** There are no default credentials. Do not commit real values.

```sh
export TASKAPI_USERNAME='<your-username>'
export TASKAPI_PASSWORD='<your-password>'
```

## Run

```sh
mvn spring-boot:run
```

The server listens on port 8080 (the Spring Boot default; the project does not change it).

## Test

```sh
mvn -B test
```

Most tests use a `test` profile with throwaway credentials, so the variables above are not needed to run them. The credential startup tests (`MissingCredentialsStartupTest`, `FullContextCredentialsStartupTest`) deliberately run with the real `application.yml` and without that profile. Both require `TASKAPI_USERNAME` and `TASKAPI_PASSWORD` to be unset in the environment running the tests; unset them if the tests fail on that guard.

## API

Base path: `/api/tasks`. JSON only. Every `/api/tasks` request needs Basic auth. The examples assume:

```sh
export TASKAPI_USERNAME='<your-username>'
export TASKAPI_PASSWORD='<your-password>'
```

The examples are written for POSIX shells (`export`, `$VAR`, single quotes). In PowerShell, set the variables with `$env:TASKAPI_USERNAME='<your-username>'` and `$env:TASKAPI_PASSWORD='<your-password>'`, use `curl.exe` instead of `curl` (`curl` is an alias for `Invoke-WebRequest`), and read the variables as `$env:TASKAPI_USERNAME`. The single-quote JSON quoting shown here does not carry over; the easiest way to send a JSON body from PowerShell is to save it to a file and use `--data-binary @body.json`.

A task looks like this (timestamps are ISO-8601 instants):

```json
{
  "id": 1,
  "title": "Write docs",
  "description": "README first",
  "status": "TODO",
  "createdAt": "2026-10-21T10:00:00Z",
  "updatedAt": "2026-10-21T10:00:00Z"
}
```

`status` is one of `TODO`, `IN_PROGRESS`, `DONE`. `title` is required, not blank, max 255 characters. `description` is optional, max 2000 characters.

### Create: `POST /api/tasks`

Returns `201 Created` with an absolute `Location` header URL (for example `http://localhost:8080/api/tasks/{id}`, built from the request's scheme and host) and the created task.

```sh
curl -i -u "$TASKAPI_USERNAME:$TASKAPI_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Write docs","description":"README first"}' \
  http://localhost:8080/api/tasks
```

`status` is optional on POST: if omitted it defaults to `TODO`. An explicit `"status": null` is rejected with 400.

### Get one: `GET /api/tasks/{id}`

Returns `200` with the task, or `404` if it does not exist.

```sh
curl -i -u "$TASKAPI_USERNAME:$TASKAPI_PASSWORD" http://localhost:8080/api/tasks/1
```

### List: `GET /api/tasks`

Returns `200` with a page envelope, ordered by `id` ascending.

```sh
curl -i -u "$TASKAPI_USERNAME:$TASKAPI_PASSWORD" 'http://localhost:8080/api/tasks?page=0&size=20'
```

```json
{
  "content": [ { "id": 1, "title": "Write docs", "...": "..." } ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

Paging parameters:

- `page`: zero-based, default `0`, minimum `0`.
- `size`: default `20`, minimum `1`, maximum `100`. A value above 100 (for example `size=101`) returns `400`.

### Replace: `PUT /api/tasks/{id}`

Replaces the whole task. Returns `200` with the updated task, `404` if missing. `title` and `status` are both required; `status` absent or null returns `400`. An omitted `description` clears it.

```sh
curl -i -u "$TASKAPI_USERNAME:$TASKAPI_PASSWORD" -X PUT \
  -H 'Content-Type: application/json' \
  -d '{"title":"Write docs","description":"Done soon","status":"IN_PROGRESS"}' \
  http://localhost:8080/api/tasks/1
```

### Partial update: `PATCH /api/tasks/{id}`

Returns `200` with the updated task, `404` if missing. Each of `title`, `description`, `status` is three-state:

- property omitted: left unchanged;
- property set to a value: updated;
- property set to JSON `null`: allowed only for `description`, which clears it. `null` for `title` or `status` returns `400`.

A body with none of the three properties (for example `{}`) returns `400`; this check happens before the task lookup, so `{}` on a missing id also gives `400`.

```sh
# change status only
curl -i -u "$TASKAPI_USERNAME:$TASKAPI_PASSWORD" -X PATCH \
  -H 'Content-Type: application/json' \
  -d '{"status":"DONE"}' \
  http://localhost:8080/api/tasks/1

# clear the description
curl -i -u "$TASKAPI_USERNAME:$TASKAPI_PASSWORD" -X PATCH \
  -H 'Content-Type: application/json' \
  -d '{"description":null}' \
  http://localhost:8080/api/tasks/1
```

### Delete: `DELETE /api/tasks/{id}`

Returns `204 No Content`, or `404` if missing.

```sh
curl -i -u "$TASKAPI_USERNAME:$TASKAPI_PASSWORD" -X DELETE http://localhost:8080/api/tasks/1
```

### Timestamps

`createdAt` is set once when the task is created. `updatedAt` is set at creation and changes only when the task is actually modified. A PUT or PATCH that leaves every field with its current value does not change `updatedAt`.

Timestamps have microsecond precision (the ISO-8601 formatter prints the fraction as 0, 3 or 6 digits, for example `...:13.549938Z` or `...:13.500Z`). The `createdAt` and `updatedAt` values in POST, PUT and PATCH responses are exactly the values stored and later returned by `GET`.

## Errors

Errors use RFC 7807 problem details with content type `application/problem+json`. No stack traces or exception text are returned; error `detail` values are fixed messages, except that an unknown path returns the framework's own short message (for example `No static resource ...`).

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Validation failed.",
  "instance": "/api/tasks",
  "errors": [
    { "field": "title", "message": "must not be blank" }
  ]
}
```

The `errors` list (with `field` and `message`) is present on validation failures, including invalid `page` / `size`. Other errors have the same shape without `errors`:

| Status | When |
|---|---|
| 400 | Validation failure, malformed or missing body, invalid enum value, wrong parameter type, empty PATCH |
| 401 | Missing or wrong credentials (includes `WWW-Authenticate: Basic realm="task-management-api"`) |
| 404 | Task not found, or unknown path (when authenticated) |
| 500 | Unexpected error (details are logged server-side only) |

## API documentation

- Swagger UI: `http://localhost:8080/swagger-ui.html` returns a `302` redirect to `/swagger-ui/index.html`; both are public, no credentials
- OpenAPI JSON: `http://localhost:8080/v3/api-docs` (public, no credentials)
- OpenAPI YAML: `http://localhost:8080/v3/api-docs.yaml` requires authentication

## Security notes

- HTTP Basic sends the password on every request. Use TLS (HTTPS) for anything other than local development; the application itself does not terminate TLS.
- There is no rate limiting or brute-force protection.
- The application never logs the configured password during normal operation. The startup failure report for a rejected credential (blank, or starting with `${`) prints the rejected value, so never put a real secret in a value that may be rejected.
- The H2 console is disabled.
- There is a single configured user; there is no user management.

## Data storage

The database is in-memory H2 and the schema is created at startup and dropped at shutdown. All data is lost when the application restarts.


