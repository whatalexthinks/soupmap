# Street View release checks

Run against the existing Vite workflow (`npm run dev`). These full-app checks use
Playwright Chromium at 390×844 with touch enabled and 1440×900 on desktop.
They intentionally stop the unrelated Cesium engine so Street View failures
cannot be confused with 3D tile streaming failures.

```sh
npm run test:streetview
npm run test:streetview:live
```

Both commands run the controlled cases. **A release requires the live command to
pass as well**: the default command alone does not prove Google imagery works.
Controlled cases inject a placeholder into the app's test-only module response,
so they do not require credentials or make real Google SDK/imagery requests.
The live checks use the existing browser-visible Vite key, not a key copied into
tests. Enable Maps JavaScript API, billing and the test origin in the key's website
restrictions. Keep restrictions in place.

The runner defaults to the Replit development origin when available, otherwise
`http://127.0.0.1:5000`. Override with `STREETVIEW_BASE_URL` (origin only; paths,
queries and fragments are discarded). Live checks need a reachable Vite source
server, not `dist` or production: the test observes the native panorama using a
test-only module response interception. No test hook ships in application code.

Set `CHROMIUM_PATH` to a system Chromium binary if necessary. Replit's
`/repl/tools/bin/chromium` is detected automatically; outside Replit, install the
Playwright Chromium browser using your environment's package tooling.

## Checks

For **both** viewports:

- Close with Back to map during a delayed SDK lookup and during renderer loading.
  Resolve the delayed operation, check it does not reopen, and reopen successfully.
- Inject an SDK authorization failure through the real loader's `gm_authFailure`
  handler. Check the actionable API explanation, external Google Maps fallback
  and absence of a stuck loading overlay.
- Inject `ZERO_RESULTS` from the coverage service; assert the 250 m → 500 m
  lookup, no-coverage explanation, fallback and overlay cleanup.
- With `--live`, open street-side Afuri Ebisu and underground Rokurinsha Tokyo
  Station through the real app button and real Google SDK/service/renderer.
  Assert viewport-sized nonzero renderer and loaded imagery elements; inspect a
  central screenshot band for detailed imagery rather than a blank host (a
  center-only patch can legitimately face a plain wall or pillar).
- Assert native links and click-to-go are enabled, tap Google's native navigation
  arrow on phone or click it on desktop, assert the real panorama ID changes and
  imagery stays visible. No SDK `setPano` shortcut or forced click is used. The
  runner hit-tests a painted point on the SVG chevron; its bounding-box center
  can be hollow and legitimately pass input through to the map.
- Hit-test Back to map above the Google renderer, click it, check cleanup and
  keyboard focus restoration. Repeat after connected navigation.

Google may classify underground station passages as outdoor. Do not pin panorama
IDs or assume station imagery shows the exact entrance. Missing connected imagery
is a live-check failure to investigate, not an automatic skip.

## Results and privacy

Only `generated-artifacts/streetview/results.json` and successful live viewer
screenshots are written. That directory is excluded from Git and deployment.
Results contain fixed case names, pass/fail and a fixed stage name only.
Failures may also include a fixed, credential-free assertion description.
Screenshots show the viewport, not browser chrome or network tools.

Do not enable Playwright traces, HAR, video, HTML dumps, raw console/network
logging or automatic failure screenshots. Those can capture API keys, full Google
request URLs or bearer shortlist links. Tests use fixed public shop fragments and
fresh isolated browser contexts, never shared-list links or saved browser state.
The runner intentionally suppresses raw browser exceptions for the same reason.

On failure, use the fixed stage in the summary: check Vite/source interception at
`setup`/`entry`; API restrictions, activation and coverage at `real viewer`; linked
coverage at `connected navigation`; sizing and stacking at `back to map`. Inspect
the app manually without exporting credentials or request URLs.

For a focused rerun, append a fixed case substring, for example:
`npm run test:streetview:live -- --filter=phone-live-afuri`.
