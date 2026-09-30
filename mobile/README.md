# Scout mobile

The React Native client for Scout's swipe-to-review application desk. It is an Expo SDK 57 app that uses the same Supabase project, user records, job profiles, entitlements, and application APIs as the web product.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Copy the values of `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the web environment into their `EXPO_PUBLIC_...` equivalents.
3. Set `EXPO_PUBLIC_API_URL` to the running Astro app (for example, your machine's LAN address) or `https://applyscout.app`.
4. Start the client:

```sh
npm install
npm run ios
# or npm run android / npm run web
```

The sign-in screen exposes a fixture-backed preview in development, so the full deck and application tracker can be reviewed without changing live data.

## Auth configuration

The app uses Supabase PKCE OAuth and magic links with the custom URI scheme `scout://`.

Add this redirect allow-list entry in Supabase Authentication → URL Configuration:

```text
scout://**
```

Google and Apple must be enabled as Supabase providers for their buttons to succeed. iOS uses Apple's native system sign-in and exchanges its verified ID token with Supabase; register `com.applyscout.mobile` as an Apple Client ID in Supabase and enable Sign in with Apple for that App ID. If testing through Expo Go, also register `host.exp.Exponent`. Web keeps the existing Apple OAuth flow, so its Services ID should remain first when both Client IDs are configured. Email OTP uses the project's existing passwordless email flow. Sessions are split into encrypted chunks and persisted with Keychain/Keystore through `expo-secure-store`.

## Backend contract

Native requests send the verified Supabase access token as a bearer token. The Astro middleware authenticates that token before setting `locals.user`; browser requests continue to use cookies and same-origin CSRF checks.

- `GET /api/app/mobile` — profile, job profiles, quota, jobs, applications, and evidence metadata.
- `GET /api/app/job-search` — the existing live board search.
- `POST /api/app/ai-jobs` — AI application handoff.
- `PATCH /api/app/jobs` — Human Assistant handoff and saved jobs.
- `POST /api/app/resumes` and `POST /api/app/onboarding` — native onboarding.
- `GET /api/app/evidence/:id?format=json` — short-lived signed evidence URL.

Row-level security remains authoritative for every user-owned database row.

## Product behavior

- Swipe left to pass; undo remains local to the current deck.
- Swipe right opens a review checkpoint. Nothing billable happens until the user confirms.
- The application timeline surfaces preparation, requested input, submission proof, and interviews.
- Plan and profile management hand off to the existing web surfaces until native billing/profile editing is introduced.

## Checks and builds

```sh
npm run typecheck
npm run lint
npx expo-doctor
eas build --profile preview --platform all
```

Set the public variables in the corresponding EAS environment before producing a store build. Do not add server secrets or the Supabase service-role key to any `EXPO_PUBLIC_` variable.
