# SecondRing Frontend

React/Vite dashboard for salon missed-call recovery, callback progress, and bookings.

**Every missed call isn't a customer lost.**

This is the standalone frontend from the SecondRing Replit project. It includes the current application source, styles, public assets, and regression tests, without unrelated workspace services or generated files.

The FastAPI backend is maintained separately at [Ace-g-ops/second_ring](https://github.com/Ace-g-ops/second_ring).

## Run locally

Use Node.js 22.12 or newer and pnpm 10.26.1.

```sh
pnpm install
cp .env.example .env
```

Set `VITE_BASE_URL` in `.env` to your deployed backend origin, without a trailing `/api`:

```dotenv
VITE_BASE_URL=https://your-render-backend-url.onrender.com
```

`VITE_API_BASE_URL` is also supported and takes precedence when set.

```sh
pnpm dev
```

Open the local URL printed by Vite. The development port defaults to 5173; set `PORT` to override it.

## Tests and production build

```sh
pnpm test
pnpm build
pnpm preview
```

Deploy the generated `dist/` directory to a static host. Configure SPA fallback to `index.html` so direct links to `/dashboard`, `/dashboard/missed-calls`, `/dashboard/bookings`, and `/dashboard/calls/:id` work.

The backend must allow the frontend's exact origin in its CORS configuration. Vite variables are embedded at build time: rebuild after changing the API URL.

## Backend contract

- `GET /api/missed_calls`
- `GET /api/bookings`
- `GET /api/callback/{missed_call_id}/result`
- `POST /api/callback/{missed_call_id}/trigger`

Callback actions can place real phone calls; use them only for authorized recipients. Reading or refreshing dashboard data does not initiate a callback.

The dashboard prefers `customer_phone_masked` and safely masks legacy phone fields to show only the last four digits. Frontend display masking does not secure an API that returns raw phone numbers.

## Secrets

Only a public API base URL belongs in frontend configuration. Never add database URLs, Bimpe credentials, `PHONE_ENCRYPTION_KEY`, or `PHONE_HASH_SECRET` to browser code or any `VITE_*` variable. Phone encryption and hashing belong in the separately hosted backend.

Real environment files, credentials, customer data, dependencies, build outputs, and Replit agent/session files are excluded from this repository.
