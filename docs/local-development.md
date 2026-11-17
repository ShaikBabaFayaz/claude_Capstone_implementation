# Local Development

This guide describes how to run the backend and frontend on your machine.

## Prerequisites

Backend:
- JDK 21
- Maven 3.x (or use the Maven wrapper `mvnw` / `mvnw.cmd`)

Frontend:
- Node.js (active LTS recommended) and npm

## Required environment variables

The backend requires Basic Auth credentials supplied via environment variables:

- `TASKAPI_USERNAME`
- `TASKAPI_PASSWORD`

The application fails to start if either variable is missing, blank, or left as an unresolved `${...}` placeholder.

### PowerShell

```powershell
$env:TASKAPI_USERNAME = "<your-username>"
$env:TASKAPI_PASSWORD = "<your-password>"
```

### POSIX shells

```sh
export TASKAPI_USERNAME='<your-username>'
export TASKAPI_PASSWORD='<your-password>'
```

## Run backend

From the repository root:

```sh
mvn spring-boot:run
```

Backend URL:
- `http://localhost:8080`

## Run frontend (dev server)

In a separate terminal:

```sh
cd frontend
npm ci
npm run dev
```

Frontend URL (Vite default):
- `http://localhost:5173`

## `/api` proxy behavior

During local development, the Vite dev server proxies requests under `/api` to `http://localhost:8080` (see `frontend/vite.config.ts`).

- This avoids CORS configuration for local dev.
- If the backend is not running, the proxy responds with `502` and the UI shows a generic error message.

## Useful URLs

Backend:
- Swagger UI: `http://localhost:8080/swagger-ui/index.html` (public)
- OpenAPI JSON: `http://localhost:8080/v3/api-docs` (public)
- OpenAPI YAML: `http://localhost:8080/v3/api-docs.yaml` (requires auth)

Frontend:
- UI: `http://localhost:5173`
