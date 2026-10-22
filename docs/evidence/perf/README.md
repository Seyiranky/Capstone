# Performance and compatibility evidence (22 Oct 2026)

Two measurements, each taken before and after the changes, with the tools in `client/perf/`:

- `api-latency.mjs`: response times of the standard API endpoints (NFR-2: within 500 ms).
- `page-metrics.mjs`: page loads from a cold cache in Chromium, on a desktop and on a
  **low-end phone** profile (Lighthouse's mobile throttling: CPU 4x slower, 1.6 Mb/s down,
  750 kb/s up, 150 ms round trip, 360 x 740 screen). Median of 3 loads each.

Raw results are in the JSON files next to this page.

## 1. What was slow, and why

The web app was **one JavaScript file of 3,632 KB (1,111 KB compressed)**: every page, the charts
library and the map library, downloaded before anything appeared. On the low-end phone profile the
sign-in page showed nothing for **6.6 s** (local build) and **6.9 s** (live site).

The API sent JSON **uncompressed**: `/gigs` was 54 to 68 KB and `/matches` 35 to 101 KB, about a
quarter of a second each on slow mobile data.

## 2. What was changed

| Change | Where |
|---|---|
| Every page except sign-in and sign-up loads when first opened (`React.lazy`), with a loading state; the sidebar stays while a page arrives | `client/src/App.tsx`, `components/Layout/AppLayout.tsx` |
| The dashboard's earnings chart loads after the rest of the dashboard | `components/Dashboard/Dashboard.tsx` |
| React, Ant Design and translations in files of their own, cached apart from Isoko's code; the charts and map arrive only with the pages that use them | `client/vite.config.ts` |
| API responses over 1 KB are gzip-compressed | `server/src/app.ts` (`compression`) |

Found on the way: forcing the charts library into a named file made the build move helpers it
shares with Ant Design into that file, so the first page still pulled in all 1.4 MB of charts.
The charts and map are therefore left to the build, which already splits them off because only
on-demand pages import them.

## 3. Results

### Download size (production build)

| | Before | After |
|---|---|---|
| JavaScript files | 1 | 84 |
| JavaScript needed for the sign-in page | 3,632 KB (1,111 KB compressed) | 1,724 KB (**558 KB compressed, -50%**) |
| Charts library | in the first download | only with pages that draw charts (425 KB compressed) |

### Page load, local production build (median of 3 cold loads)

| Profile | Page | First paint before | First paint after | Change |
|---|---|---|---|---|
| Low-end phone | Sign-in | 6,584 ms | **3,492 ms** | **-47%** |
| Low-end phone | Dashboard | 6,928 ms | **3,712 ms** | **-46%** |
| Desktop | Sign-in | 276 ms | 132 ms | -52% |
| Desktop | Dashboard | 328 ms | 160 ms | -51% |

On the dashboard the chart now follows the rest of the page: its largest paint is later than its
first paint (4,388 ms against 3,712 ms on the low-end phone), which is the intended order.

### API response times (NFR-2: within 500 ms)

**Local** (200 requests per endpoint): every endpoint is within 500 ms at the 95th percentile at
1, 10 and 25 concurrent requests. The slowest is `GET /matches` with 25 at once: p95 156 ms. No errors.

**Live** (Render free tier, Frankfurt; 50 requests per endpoint, measured from the developer's own connection): a bare
`GET /health`, which does no work, takes **286 ms**, which is the network round trip itself. Subtracting
it gives the server's own time at one request at a time:

| Endpoint | Live p50 | Server's own time |
|---|---|---|
| `GET /users/me` | 292 ms | ~6 ms |
| `GET /notifications` | 296 ms | ~10 ms |
| `GET /gig-applications` | 298 ms | ~12 ms |
| `GET /gigs` | 312 ms | ~26 ms |
| `GET /matches` | 341 ms | ~55 ms |
| `GET /users/directory` | 398 ms | ~112 ms |

So the server meets NFR-2 with room to spare; most of what a user far from Frankfurt waits for is the
distance to Frankfurt. With five requests at once, the heavier lists exceed 500 ms at p95 on the
free tier (`/users/directory` 1,205 ms, `/gigs` 893 ms), because a free Render instance has a
fraction of one CPU. A paid instance, or a region closer to Kigali, would remove most of that.

Compression, measured locally: `/gigs` **68 KB to 5.8 KB**, `/matches` **101 KB to 9.8 KB** (-91%).

## 4. Still open

- `GET /users/directory` is small (3 KB) but the slowest to compute (about 112 ms of server time):
  its cost is in the database queries, not the size. Future work.
- Ant Design is the largest part of the first download (369 KB compressed). Loading it per
  component, or a lighter sign-in page, would shrink the first download further.
- Measured in Chromium only here; other browsers are covered by the end-to-end tests (Phase 6).
