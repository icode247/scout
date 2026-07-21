# Scout Chrome extension

The Scout extension sends a job from the active browser tab to a member’s assigned Human Assistant. It uses a persistent Chrome side panel and never auto-submits an application.

## Run locally

1. Start Scout with `npm run dev`.
2. Run `npm run extension:build`.
3. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
4. Select `extension/dist`.
5. Open Scout’s extension menu, expand **Developer settings**, set the website to `http://localhost:4321`, and connect.

The extension ID must remain stable while testing because Chrome uses it in the protected sign-in callback. Pin the unpacked extension in Chrome for easy access.

The open side panel automatically re-detects after a full reload, active-tab switch, browser back/forward navigation, or a single-page job-site route change. Salary and employment type are included when the source page publishes them.

Apply `supabase/migrations/202607190001_job_details.sql` before deploying this version so Scout can store the extracted salary and employment type.

For production, set `PUBLIC_CHROME_EXTENSION_ID` in Scout’s deployment environment to the ID assigned by Chrome Web Store. Scout rejects every other extension callback.

## Production package

Run `npm run extension:check && npm run extension:build`, then zip the contents of `extension/dist` for Chrome Web Store submission. The production Scout origin is `https://getscout.app`.

## Permissions

- Site access: installs an idle bridge on public HTTP and HTTPS pages; it reads and returns job fields only when the member opens Scout.
- `activeTab` and `scripting`: provide a one-time fallback on a page opened before the extension was installed or updated.
- `sidePanel`: keep the review form visible beside the job.
- `identity`: complete Scout sign-in through Chrome’s protected callback.
- `storage`: retain the session and the selected profile for each job website.
- `tabs`: identify the active page and its original URL.

No remote code is loaded. Job details are editable before they are sent.
