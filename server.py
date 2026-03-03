"""HiTeXeR local compilation server.

Compiles Asymptote code to SVG via: asy -> PDF -> dvisvgm -> SVG
Serves the web frontend and handles compilation requests.
"""

import http.server
import json
import os
import re
import subprocess
import tempfile
import traceback
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

PORT = 8080
ASY_EXE = r"C:\Program Files\Asymptote\asy.exe"
DVISVGM = "dvisvgm"

# Asymptote packages that AoPS TeXeR supports
AOPS_PREAMBLE = ""


class HiTeXeRHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/compile":
            self.handle_compile()
        elif self.path == "/texer":
            self.handle_texer()
        else:
            self.send_error(404)

    def handle_compile(self):
        content_length = int(self.headers["Content-Length"])
        body = self.requestfile.read(content_length) if hasattr(self, 'requestfile') else self.rfile.read(content_length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return

        code = data.get("code", "")
        # Strip [asy] / [/asy] delimiters if present
        code = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
        code = re.sub(r'\n?\s*\[/asy\]\s*$', '', code)

        if not code.strip():
            self.send_json(400, {"error": "No code provided"})
            return

        full_code = AOPS_PREAMBLE + code

        try:
            svg = compile_asy_to_svg(full_code)
            self.send_json(200, {"svg": svg})
        except CompilationError as e:
            self.send_json(200, {"error": str(e)})
        except Exception as e:
            traceback.print_exc()
            self.send_json(500, {"error": f"Server error: {e}"})

    def handle_texer(self):
        content_length = int(self.headers["Content-Length"])
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return

        url = data.get("url", "").strip()
        if not url:
            self.send_json(400, {"error": "No URL provided"})
            return

        parsed = urlparse(url)
        if "artofproblemsolving.com" not in parsed.netloc:
            self.send_json(400, {"error": "URL must be from artofproblemsolving.com"})
            return

        if not HAS_REQUESTS:
            self.send_json(500, {"error": "Server missing 'requests' and 'beautifulsoup4' packages. Install with: pip install requests beautifulsoup4"})
            return

        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            textarea = soup.find("textarea", id="boomer")
            if textarea and textarea.text.strip():
                code = textarea.text.strip()
                # Strip [asy]/[/asy] if present
                code = re.sub(r"^\s*\[asy\]\s*\n?", "", code)
                code = re.sub(r"\n?\s*\[/asy\]\s*$", "", code)
                self.send_json(200, {"code": code})
            else:
                self.send_json(200, {"error": "No Asymptote code found on that page (may be private)"})
        except Exception as e:
            self.send_json(200, {"error": f"Failed to fetch TeXeR page: {e}"})

    def send_json(self, status, obj):
        response = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(response))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


class CompilationError(Exception):
    pass


def compile_asy_to_svg(code: str) -> str:
    """Compile Asymptote code to SVG string."""
    with tempfile.TemporaryDirectory() as tmpdir:
        asy_file = os.path.join(tmpdir, "diagram.asy")
        pdf_file = os.path.join(tmpdir, "diagram.pdf")
        svg_file = os.path.join(tmpdir, "diagram.svg")

        with open(asy_file, "w") as f:
            f.write(code)

        # Step 1: Asymptote -> PDF
        result = subprocess.run(
            [ASY_EXE, "-f", "pdf", "-noView", "-o", "diagram", "diagram.asy"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            error_msg = result.stderr.strip() or result.stdout.strip()
            raise CompilationError(f"Asymptote error:\n{error_msg}")

        if not os.path.exists(pdf_file):
            raise CompilationError("Asymptote produced no output")

        # Step 2: PDF -> SVG via dvisvgm
        result = subprocess.run(
            [DVISVGM, "--pdf", "--no-fonts", "--exact-bbox", pdf_file, "-o", svg_file],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            error_msg = result.stderr.strip() or result.stdout.strip()
            raise CompilationError(f"SVG conversion error:\n{error_msg}")

        if not os.path.exists(svg_file):
            raise CompilationError("SVG conversion produced no output")

        with open(svg_file, "r") as f:
            svg = f.read()

        # Post-process: fix opacity artifacts from PDF conversion
        svg = fix_svg_opacity(svg)
        return svg


def fix_svg_opacity(svg: str) -> str:
    """Remove erroneous opacity='0' attributes added by dvisvgm."""
    svg = svg.replace(" stroke-opacity='0'", "")
    svg = svg.replace(" fill-opacity='0'", "")
    svg = svg.replace(' stroke-opacity="0"', "")
    svg = svg.replace(' fill-opacity="0"', "")
    return svg


def main():
    os.chdir(Path(__file__).parent)
    server = http.server.HTTPServer(("127.0.0.1", PORT), HiTeXeRHandler)
    print(f"HiTeXeR server running at http://127.0.0.1:{PORT}")
    print("Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
