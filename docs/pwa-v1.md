# EngCalc browser app and PWA v0.1.0

The React/TypeScript browser app is version `0.1.0`; the calculator model and saved report schema remain `1.0.0` and `1.0`. Calculations run in the browser. Inputs and saved reports are not sent to the FastAPI API, and history remains in this browser on this device.

The production build generates a Workbox service worker with an app-versioned shell cache. It precaches the built HTML, hashed JavaScript/CSS, manifest, and app icons, then removes outdated Workbox caches. It uses no runtime or arbitrary remote caches. Calculation, local report history, and JSON export are available offline after a successful visit has cached the shell; external formula-source links still need a network connection.

The manifest requests standalone display and supplies 192px and 512px PNG icons. Install UI appears only when the browser emits `beforeinstallprompt`; browser installability evidence does not establish installation on a physical phone. Waiting updates are explicit: accepting an update does not reload the open page or mutate saved reports. Existing loaded code and report snapshots stay in the current session; the next navigation uses the new shell.

## Local checks

From `frontend/` run `npm ci`, `npm run test:core`, `npm run test:history`, and `npm run build`. Browser acceptance is run against the built static output and is recorded below.

## Static hosting

The root `render.yaml` describes a static site using the pinned frontend lockfile build. It disables automatic deploys and omits previews; its headers keep the shell, manifest, and service worker revalidatable while allowing long caching for hashed assets. Adding the Blueprint does not itself create a hosted service. A direct Render connector create operation also does not automatically import Blueprint headers or routes; those settings must be checked on the service before relying on them.

## Acceptance evidence

Local acceptance on 2026-10-03 used the production build from this source tree and installed Chrome 154.0.8037.95. `npm run check` passed TypeScript plus 18 Vitest tests across calculator parity and history. `npm run build` passed with Vite 8.3.2; the generated worker used the `engcalc-shell-v0.1.0` cache namespace and precached the built shell.

Two isolated Playwright/Chrome browser checks passed: manifest/installability metadata, registered and controlling service worker, keyboard operation, online calculation/save/export, true offline reload with a new calculation/save/export, history persistence after reload, and 390 px mobile layout without horizontal overflow; then a waiting-worker update was accepted while preserving the active report ID, unsaved form value, and byte-for-byte local-storage snapshot without reloading. The same saved report remained available after the next navigation. No physical-phone installation was tested.

The desktop/mobile screenshots and machine-readable browser receipts are retained in the local delivery output bundle, outside this repository. Hosted-service behavior is recorded separately after deployment.

To run the Playwright checks, install `playwright==1.63.0` with `python -m pip install playwright==1.63.0` and use an installed Chrome browser. The checks do not download a browser binary.
