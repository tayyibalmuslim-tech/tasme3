# Review scheduling checks

Run the dependency-free scheduling, legacy-data and two-client transactional sync tests:

```sh
node --test tests/spaced-review.test.cjs
```

Run the actual application UI at desktop (1366px) and mobile (390px) widths:

```sh
npm install --no-save playwright@1.58.2
npx playwright install chromium
TASME3_BROWSER_EXECUTABLE="$(node -e "process.stdout.write(require('playwright').chromium.executablePath())")" node --test tests/browser.test.cjs
```

The UI tests block external scripts and use disposable local data. The sync tests use a serialized in-memory Firestore transaction double: no production document is read or written. Live Firestore permissions, real phone hardware and old application clients require a separate smoke check. Reload the app on both devices before that check.

Existing records are not migrated or rescheduled on load. Existing positive `repeatDays` is the starting interval; old zero-repeat records remain opt-out. New records default to `scheduleMode: auto`. Attempts store `rating`, incoming/outgoing intervals, actual performance time, success/attempt flags, algorithm version and an append-only change history. Undo removes an unperformed direct successor only; completed descendants stay intact. Concurrent changes to the same record select the latest `updatedAt`, retain both audit histories and reuse the successor's stable ID. Independent record edits merge in a transaction; unsent changes survive local reloads.
