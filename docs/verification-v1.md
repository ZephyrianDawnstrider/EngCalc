# EngCalc v1 verification record

Verification was run on 2026-10-03 against the v1 source in this repository.

## Focused tests

Command: `python -m pytest -q`
Result: **33 passed**. The suite covers an independent hand calculation, single/double shear, the modeled-yield boundary, positive finite input checks, finite-range overflow, API report persistence/retrieval, retired endpoint behavior, invalid and nonfinite JSON values, overflowing integer input, and local Host/Origin restrictions.

Environment: Python 3.14.6, FastAPI 0.142.2, Pydantic 2.13.5, SQLAlchemy 2.1.3, pytest 8.4.2, httpx 0.28.1. The test run emitted a Starlette deprecation warning that its test client is moving away from httpx; it did not fail the tests. Direct application dependencies are pinned in `requirements.txt`.

API tests set `DATABASE_URL` to a new SQLite file under pytest's temporary directory for each test. The local browser run used the ignored project-local `engcalc.db`, created after confirming that file did not exist, and did not connect to an external database.

## Browser journey

The headless UI journey used Playwright Python 1.63.0 with the installed Chrome binary (154.0.8037.95) and a fresh temporary browser profile. It opened `http://127.0.0.1:8765/ui`, ran the supplied example, checked the displayed capacity and complete input snapshot, downloaded and inspected the versioned JSON report, checked zero-strength rejection, reset while a deliberately delayed request was pending, then re-ran the example at 390 px width. The stale delayed response did not replace the reset screen. The page reported no JavaScript errors, and the mobile document width remained 390 px.

The browser service built into the Codex app was unavailable in this session, so the approved local headless-browser path was used. The screenshots and example report are saved with the delivery evidence outputs as `engcalc-v1-desktop.png`, `engcalc-v1-mobile.png`, and `engcalc-v1-report.json`.
