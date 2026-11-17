# Testing

## Backend

Run unit/integration tests:

```sh
mvn -B test
```

### Credential startup tests

The repository contains tests that validate startup behavior when credentials are missing or present.

The root `README.md` notes:
- Most tests use a `test` profile with throwaway credentials.
- The credential startup tests deliberately run with the real `application.yml`.
- If your environment already has `TASKAPI_USERNAME` / `TASKAPI_PASSWORD` set, you may need to **unset them** for those specific tests.

## Frontend

From `frontend/`:

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Notes:
- `npm ci` installs exact versions from `package-lock.json`.
- `npm run build` creates `frontend/dist/` but it is **not deployable as-is** because the `/api` proxy is only present in dev.
