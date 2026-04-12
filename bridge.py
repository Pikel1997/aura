#!/usr/bin/env python3
"""
Aura bridge — local HTTP server that lets the Aura web app control your
Philips WiZ smart bulb.

The bulb is a LAN device that only speaks UDP on port 38899 — browsers
can't speak UDP, and serverless functions can't reach your home network.
This bridge solves both: it runs locally on your machine, accepts simple
HTTP requests from the Aura web app, and forwards them to your bulb.

Usage:
    python bridge.py

Then open the Aura web app in your browser. The web app talks to
http://127.0.0.1:8787 — make sure that port is free.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import subprocess
import sys


# ── Bootstrap dependencies ─────────────────────────────────────────────
# Auto-install pywizlight on first run so users don't have to think
# about venvs / requirements.txt. Single dependency, single prompt.
def _ensure_deps():
    try:
        import pywizlight  # noqa: F401
        return
    except ImportError:
        pass

    print()
    print("  Aura needs one Python package to talk to your bulb:")
    print()
    print("      pywizlight  (https://pypi.org/project/pywizlight/)")
    print()
    if os.environ.get("AURA_AUTO_INSTALL") == "1":
        answer = "y"
    else:
        try:
            answer = input("  Install it now? [Y/n] ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            answer = "n"
    if answer not in ("", "y", "yes"):
        print()
        print("  OK — install it manually and re-run:")
        print()
        print("      pip3 install pywizlight")
        print("      python3 bridge.py")
        print()
        sys.exit(1)

    print()
    print("  Installing pywizlight…")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install",
             "--quiet", "--disable-pip-version-check", "pywizlight"]
        )
    except subprocess.CalledProcessError:
        print()
        print("  ✗ pip install failed. On macOS you may need:")
        print()
        print("      python3 -m venv venv")
        print("      source venv/bin/activate")
        print("      pip install pywizlight")
        print("      python bridge.py")
        print()
        sys.exit(1)
    print("  ✓ Installed.")


_ensure_deps()

from wiz_ambient.bulb import BulbController  # noqa: E402

PORT = 8787
VERSION = "1.1.0"

bulb = BulbController()
state = {"discovered": [], "last_color": (0, 0, 0), "last_bri": 0}


def _ok(data=None):
    return 200, data or {"ok": True}


def _err(msg, code=400):
    return code, {"ok": False, "error": msg}


class Handler(BaseHTTPRequestHandler):
    server_version = f"AuraBridge/{VERSION}"

    # ── CORS ────────────────────────────────────────────────────────────
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods",
                         "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def _json(self, code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self._send_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── Routing ─────────────────────────────────────────────────────────
    def do_GET(self):
        try:
            if self.path == "/" or self.path == "/health":
                code, data = _ok({
                    "service": "aura-bridge",
                    "version": VERSION,
                    "connected": bulb.connected,
                    "ip": bulb.bulb_ip,
                })
            elif self.path == "/discover":
                state["discovered"] = bulb.discover()
                code, data = _ok({"bulbs": state["discovered"]})
            elif self.path == "/status":
                code, data = _ok({
                    "connected": bulb.connected,
                    "ip": bulb.bulb_ip,
                    "last_color": list(state["last_color"]),
                    "last_bri": state["last_bri"],
                })
            elif self.path == "/model":
                if not bulb.connected or not bulb.bulb:
                    code, data = _err("bulb not connected", 409)
                else:
                    import asyncio
                    async def _get_model():
                        try:
                            cfg = await bulb.bulb.getModelConfig()
                            r = cfg.get("result", cfg) if isinstance(cfg, dict) else {}
                            return {
                                "moduleName": r.get("moduleName", "unknown"),
                                "fwVersion": r.get("fwVersion", "unknown"),
                            }
                        except Exception as e:
                            return {"moduleName": "unknown", "error": str(e)}
                    try:
                        model = bulb._run_async(_get_model())
                        code, data = _ok(model)
                    except Exception:
                        code, data = _ok({"moduleName": "unknown"})
            else:
                code, data = _err("not found", 404)
        except Exception as e:
            code, data = _err(str(e), 500)
        self._json(code, data)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b""
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            self._json(400, {"ok": False, "error": "invalid JSON"})
            return

        try:
            if self.path == "/connect":
                ip = body.get("ip")
                if not ip:
                    code, data = _err("missing 'ip'")
                else:
                    ok = bulb.connect(ip)
                    code, data = _ok({"ok": ok, "ip": ip if ok else None})

            elif self.path == "/color":
                if not bulb.connected:
                    code, data = _err("bulb not connected", 409)
                else:
                    r = max(0, min(255, int(body.get("r", 0))))
                    g = max(0, min(255, int(body.get("g", 0))))
                    b = max(0, min(255, int(body.get("b", 0))))
                    bri = max(0, min(255, int(body.get("bri", 255))))
                    bulb.set_color(r, g, b, bri)
                    state["last_color"] = (r, g, b)
                    state["last_bri"] = bri
                    code, data = _ok()

            elif self.path == "/off":
                if not bulb.connected:
                    code, data = _err("bulb not connected", 409)
                else:
                    bulb.set_color(0, 0, 0, 0, force=True)
                    state["last_color"] = (0, 0, 0)
                    state["last_bri"] = 0
                    code, data = _ok()

            else:
                code, data = _err("not found", 404)
        except Exception as e:
            code, data = _err(str(e), 500)
        self._json(code, data)

    # Quiet the noisy default access log
    def log_message(self, format, *args):
        return


def banner():
    print()
    print("  ╭─────────────────────────────────────────────╮")
    print("  │                                             │")
    print(f"  │   Aura bridge v{VERSION}                          │")
    print("  │                                             │")
    print(f"  │   Listening on http://127.0.0.1:{PORT}        │")
    print("  │                                             │")
    print("  │   Open the Aura web app in your browser     │")
    print("  │   and click Start. Keep this window open.   │")
    print("  │                                             │")
    print("  ╰─────────────────────────────────────────────╯")
    print()
    print("  Auto-discovering bulbs on your network…")
    bulbs = bulb.discover()
    if bulbs:
        ip = bulbs[0]["ip"]
        print(f"  ✓ Found bulb at {ip}, connecting…")
        if bulb.connect(ip):
            print(f"  ✓ Connected.")
        else:
            print(f"  ✗ Connection failed. Use the web app to retry.")
    else:
        print("  ⚠ No bulbs found. Make sure your bulb is on the same Wi-Fi")
        print("    as this Mac and set up in the Philips WiZ app.")
    print()
    print("  Ctrl+C to stop.")
    print()


def main():
    banner()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down…")
        try:
            bulb.set_color(0, 0, 0, 0, force=True)
            bulb.shutdown()
        except Exception:
            pass
        sys.exit(0)


if __name__ == "__main__":
    main()
