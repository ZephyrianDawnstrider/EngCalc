"""Isolated end-to-end checks for the built EngCalc PWA release candidate.

Run from the repository root with:
  .venv/Scripts/python -m pytest -q frontend/tests/browser/test_pwa_release.py

Uses the locally installed Chrome binary and a throwaway profile. Evidence is
written outside the repository to the configured delivery output directory.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import tempfile
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from playwright.sync_api import BrowserContext, Download, Page, sync_playwright


REPO = Path(__file__).resolve().parents[3]
DIST = REPO / "frontend" / "dist"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
BASE_URL = os.environ.get("ENGCALC_BASE_URL", "http://127.0.0.1:4173/")
EVIDENCE = Path(os.environ.get(
    "ENGCALC_EVIDENCE_DIR",
    r"C:\Users\DELL\Documents\Codex\2026-10-03\portfolio-arena-tl\outputs\engcalc-pwa",
))
HISTORY_KEY = "engcalc.report-history.v1"


@pytest.fixture(scope="session", autouse=True)
def verify_prerequisites() -> None:
    assert DIST.is_dir(), f"Built preview is missing: {DIST}"
    assert CHROME.is_file(), f"Chrome executable is missing: {CHROME}"
    EVIDENCE.mkdir(parents=True, exist_ok=True)


@contextmanager
def isolated_context(*, width: int = 1440, height: int = 1100):
    with tempfile.TemporaryDirectory(prefix="engcalc-pwa-profile-") as profile:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                user_data_dir=profile,
                executable_path=str(CHROME),
                headless=True,
                viewport={"width": width, "height": height},
                device_scale_factor=1,
                args=["--no-first-run", "--disable-background-networking"],
            )
            try:
                yield context
            finally:
                context.close()


def wait_offline_ready(page: Page) -> None:
    page.get_by_text("Available offline after this visit", exact=True).wait_for(timeout=20000)
    page.evaluate("navigator.serviceWorker.ready")
    if not page.evaluate("Boolean(navigator.serviceWorker.controller)"):
        page.reload(wait_until="networkidle")
    controlled = page.evaluate("Boolean(navigator.serviceWorker.controller)")
    assert controlled, "The page did not become controlled by the generated service worker"


def calculate_example(page: Page) -> str:
    page.get_by_role("button", name="Run example").click()
    page.locator("#report-title").wait_for()
    return page.locator(".report-meta").inner_text().splitlines()[1]


def manifest_receipt(page: Page) -> dict:
    manifest = page.evaluate("""async () => {
      const response = await fetch('/manifest.webmanifest');
      const body = await response.json();
      return {status: response.status, body};
    }""")
    assert manifest["status"] == 200
    body = manifest["body"]
    assert body.get("name") and body.get("short_name")
    assert body.get("start_url") and body.get("display") in {"standalone", "minimal-ui"}
    assert body.get("icons")
    for icon in body["icons"]:
        assert page.evaluate("url => fetch(url).then(r => r.status)", icon["src"]) == 200
    cdp = page.context.new_cdp_session(page)
    app_manifest = cdp.send("Page.getAppManifest")
    assert not app_manifest.get("errors"), json.dumps(app_manifest.get("errors"), indent=2)
    assert app_manifest.get("url", "").endswith("manifest.webmanifest")
    installability = cdp.send("Page.getInstallabilityErrors")
    assert not installability.get("installabilityErrors"), json.dumps(installability, indent=2)
    return {"manifest": body, "cdp": app_manifest, "installability": installability}


def test_installable_desktop_mobile_offline_history_and_exports() -> None:
    receipt: dict = {"base_url": BASE_URL, "checks": []}
    with isolated_context() as context:
        page = context.new_page()
        page_errors: list[str] = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.goto(BASE_URL, wait_until="networkidle")
        assert page.get_by_role("heading", name="Estimate bolt-shank shear yield").is_visible()
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.matches('a,button,input,select')")
        wait_offline_ready(page)
        receipt["manifest"] = manifest_receipt(page)
        report_id = calculate_example(page)
        with page.expect_download() as download_info:
            page.get_by_role("button", name="Download report JSON").click()
        download: Download = download_info.value
        download_path = EVIDENCE / "engcalc-pwa-report.json"
        download.save_as(download_path)
        exported = json.loads(download_path.read_text(encoding="utf-8"))
        assert exported["report_id"] == report_id
        assert exported["calculator_version"] == "1.0.0"
        assert page.get_by_role("heading", name="Saved report history").is_visible()
        assert page.locator(".history-count").inner_text().startswith("1 /")
        receipt["checks"].append("desktop keyboard focus, manifest/icons, service-worker control, example calculation, saved history, JSON export")
        receipt["screenshots"] = []
        desktop = EVIDENCE / "engcalc-pwa-desktop.png"
        page.screenshot(path=str(desktop), full_page=True)
        receipt["screenshots"].append(str(desktop))

        # The page is now controlled and the precache has settled; prove a true
        # offline reload, then calculate/save/export once more without network.
        storage_before = page.evaluate("key => localStorage.getItem(key)", HISTORY_KEY)
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded", timeout=20000)
        assert page.evaluate("Boolean(navigator.serviceWorker.controller)"), "Offline reload was not controlled by the cached worker"
        assert page.locator(".history-count").inner_text().startswith("1 /")
        report_offline = calculate_example(page)
        assert report_offline != report_id
        assert page.locator(".history-count").inner_text().startswith("2 /")
        with page.expect_download() as offline_download_info:
            page.get_by_role("button", name="Download report JSON").click()
        offline_download_info.value.save_as(EVIDENCE / "engcalc-pwa-offline-report.json")
        assert json.loads((EVIDENCE / "engcalc-pwa-offline-report.json").read_text(encoding="utf-8"))["report_id"] == report_offline
        context.set_offline(False)
        receipt["checks"].append("offline reload, calculation, local save, and JSON export")

        page.set_viewport_size({"width": 390, "height": 844})
        page.reload(wait_until="networkidle")
        assert page.evaluate("Boolean(navigator.serviceWorker.controller)")
        page.locator(".history-item").first.wait_for()
        mobile = EVIDENCE / "engcalc-pwa-mobile-390.png"
        page.screenshot(path=str(mobile), full_page=True)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Mobile viewport overflows horizontally"
        receipt["screenshots"].append(str(mobile))
        receipt["checks"].append("390 px viewport layout and saved report history after reload")
        assert not page_errors, f"Browser page errors: {page_errors}"
        receipt["page_errors"] = page_errors
        receipt["storage_before_offline"] = json.loads(storage_before)
    (EVIDENCE / "engcalc-pwa-desktop-offline-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@contextmanager
def scratch_site_with_update_fixture():
    with tempfile.TemporaryDirectory(prefix="engcalc-pwa-sw-fixture-") as scratch_name:
        root = Path(scratch_name)
        shutil.copytree(DIST, root, dirs_exist_ok=True)
        sw = root / "sw.js"
        original = sw.read_bytes()
        assert original, "Generated service worker is empty"
        handler = type("FixtureHandler", (SimpleHTTPRequestHandler,), {"log_message": lambda *_args: None})
        server = ThreadingHTTPServer(("127.0.0.1", _free_port()), partial(handler, directory=str(root)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}/", sw, original
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


def test_accept_waiting_update_keeps_open_report_draft_and_saved_bytes() -> None:
    receipt = {"checks": []}
    with scratch_site_with_update_fixture() as (url, sw_path, original_sw):
        with isolated_context() as context:
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(url, wait_until="networkidle")
            wait_offline_ready(page)
            report_id = calculate_example(page)
            history_before = page.evaluate("key => localStorage.getItem(key)", HISTORY_KEY)
            inputs = page.get_by_label("Applied shear load (N)")
            inputs.fill("12345")
            draft_before = inputs.input_value()

            # Change only a throwaway served copy of sw.js. This makes Chrome
            # observe a waiting update without altering source or built output.
            sw_path.write_bytes(original_sw + b"\n// isolated update acceptance fixture v2\n")
            page.evaluate("navigator.serviceWorker.getRegistration().then(reg => reg.update())")
            page.get_by_role("button", name="Use update on next navigation").wait_for(timeout=30000)
            page.get_by_role("button", name="Use update on next navigation").click()
            page.wait_for_timeout(1500)
            assert page.locator(".report-meta").inner_text().splitlines()[1] == report_id
            assert inputs.input_value() == draft_before
            assert page.evaluate("key => localStorage.getItem(key)", HISTORY_KEY) == history_before
            receipt["checks"].append("accepted waiting service-worker update without reloading or changing the active report, draft, or saved snapshot bytes")

            page.reload(wait_until="networkidle")
            page.get_by_role("heading", name="Saved report history").wait_for()
            saved = page.locator(".history-item").first
            saved.click()
            assert page.locator(".report-meta").inner_text().splitlines()[1] == report_id
            assert page.evaluate("key => localStorage.getItem(key)", HISTORY_KEY) == history_before
            receipt["checks"].append("next navigation uses updated shell and restores the same saved report without recalculation")
            assert not errors, f"Browser page errors: {errors}"
            receipt["page_errors"] = errors
    (EVIDENCE / "engcalc-pwa-update-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
