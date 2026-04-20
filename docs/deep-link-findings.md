# Google Maps deep-link validation

Results of tapping each URL at `/debug/links` on real devices. Update the status cells when tested. If any case fails, capture the actual behavior in "notes" and we'll adjust `src/lib/deepLinks.ts` + `deepLinks.test.ts`.

## URL format under test

`https://www.google.com/maps/dir/?api=1&origin=<url-encoded>&destination=<url-encoded>&travelmode=<mode>`

Travel modes used:
- `bicycling` (not `bike` or `biking`)
- `transit`
- `walking` (not `walk`)

## Test cases

| # | Case | Mode | iOS (Google Maps installed) | iOS (Google Maps NOT installed) | Android (Google Maps default) | Notes |
|---|------|------|---|---|---|---|
| 1 | address → named station | bicycling | ⬜ | ⬜ | ⬜ |   |
| 2 | lat/lng → lat/lng | bicycling | ⬜ | ⬜ | ⬜ |   |
| 3 | address → named place | transit | ⬜ | ⬜ | ⬜ |   |
| 4 | short walk hop | walking | ⬜ | ⬜ | ⬜ |   |
| 5 | place names with spaces / slashes | bicycling | ⬜ | ⬜ | ⬜ |   |

**Status legend:** ✅ opens Google Maps directly in the expected mode · ⚠️ opens but wrong mode / requires manual mode tap · ❌ does not open or opens wrong app · ⬜ not tested yet

## What to watch for

1. **Does it open the Google Maps app or the web version?** On iOS, the `https://` URL should open the app if installed; if it falls back to Safari without offering to open in the app, users will see the web version.
2. **Is the correct travel mode preselected?** Some older Google Maps versions ignored `travelmode` for transit and defaulted to driving. Verify the mode toggle at the top shows the right one.
3. **Are special characters handled?** Case 5 (slashes, spaces) is the canary — if it fails, we have an encoding bug.
4. **Does lat/lng work without needing geocoding?** Case 2 — useful when we have coordinates from the Routes API and want to skip an extra Places lookup.

## If a case fails

Document:
- Which device + OS version
- Whether Google Maps app is installed
- What happened (wrong mode, wrong app, error dialog, etc.)
- Screenshot if useful

Then update `src/lib/deepLinks.ts` and re-run the test to lock in the fix.
