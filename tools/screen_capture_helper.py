"""
Local screen-capture helper for the Trading Journal (Session Log and Add Trade).

Run this on your trading PC. While it's running, any "Capture All Screens"
button in the app screenshots every connected monitor and uploads them
straight to Supabase — no browser share-screen dialogs. The monitor
currently showing the journal app itself is excluded automatically (the
browser tells the helper where its window is via x/y query params).

Setup (once):
    pip install -r requirements.txt

Run:
    python screen_capture_helper.py

Leave the window open while you trade. Ctrl+C to stop.
"""
import json
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

import mss
import mss.tools
import requests

PORT = 8933

# Same public anon key already committed in js/config.js — the "screenshots"
# storage bucket accepts anon uploads, so no extra secret is needed here.
SUPABASE_URL = "https://rmooksnngqyzqraeicvr.supabase.co"
SUPABASE_KEY = "sb_publishable_4m_fZwCfwVTBD5eAJhl1LQ_D63Pe2U_"
BUCKET = "screenshots"


def upload_screenshot(png_bytes):
    filename = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}.png"
    resp = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{filename}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "image/png",
        },
        data=png_bytes,
        timeout=30,
    )
    resp.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{filename}"


def _point_in_monitor(point, monitor):
    x, y = point
    return (
        monitor["left"] <= x < monitor["left"] + monitor["width"]
        and monitor["top"] <= y < monitor["top"] + monitor["height"]
    )


def capture_all_monitors(exclude_point=None):
    urls = []
    with mss.mss() as sct:
        # monitors[0] is the union of every display; grab each one individually instead
        for monitor in sct.monitors[1:]:
            if exclude_point and _point_in_monitor(exclude_point, monitor):
                continue
            shot = sct.grab(monitor)
            png_bytes = mss.tools.to_png(shot.rgb, shot.size)
            urls.append(upload_screenshot(png_bytes))
    return urls


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/health":
            self._json(200, {"ok": True})
            return
        if parsed.path == "/capture":
            try:
                qs = parse_qs(parsed.query)
                exclude_point = None
                if "x" in qs and "y" in qs:
                    exclude_point = (int(float(qs["x"][0])), int(float(qs["y"][0])))
                urls = capture_all_monitors(exclude_point)
                self._json(200, {"ok": True, "urls": urls})
            except Exception as exc:
                self._json(500, {"ok": False, "error": str(exc)})
            return
        self._json(404, {"ok": False, "error": "not found"})

    def log_message(self, format, *args):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Screen capture helper running at http://127.0.0.1:{PORT}")
    print("Leave this window open while you trade. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
