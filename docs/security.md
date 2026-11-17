# Security

## Authentication model

- All `/api/tasks/**` endpoints require **HTTP Basic authentication**.
- The application supports a **single configured user**.
- Credentials are provided via environment variables:
  - `TASKAPI_USERNAME`
  - `TASKAPI_PASSWORD`

The application fails fast at startup if credentials are missing, blank, or unresolved placeholders.

On authentication failures:
- status: `401`
- header: `WWW-Authenticate: Basic realm="task-management-api"`

## Public vs protected documentation endpoints

Public:
- Swagger UI (`/swagger-ui/**` and `/swagger-ui.html`)
- OpenAPI JSON (`/v3/api-docs`)

Protected:
- OpenAPI YAML (`/v3/api-docs.yaml`)

## Transport security

HTTP Basic sends credentials on every request.

- For anything beyond local development, use **TLS (HTTPS)**.
- This application does not terminate TLS itself; terminate TLS at a reverse proxy/load balancer.

## Frontend credential handling

The frontend is designed for local development only.

- Credentials entered in the UI are stored **in memory only**.
- The app does not write credentials to localStorage, sessionStorage, or cookies.
- Do not introduce `VITE_` environment variables for credentials; Vite embeds them into built assets.
