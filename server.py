"""HiTeXeR local compilation server.

Compiles Asymptote code to SVG via: asy -> PDF -> dvisvgm -> SVG
Serves the web frontend and handles compilation requests.
AI features use Claude CLI for code generation and analysis.
"""

import base64
import http.server
import json
import os
import re
import struct
import subprocess
import tempfile
import traceback
import urllib.request
import uuid
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

def _find_ghostscript() -> str | None:
    """Locate gswin64c.exe or gs in common paths."""
    candidates = [
        r"C:\Program Files\gs\gs10.06.0\bin\gswin64c.exe",
        r"C:\Program Files\gs\gs10.05.0\bin\gswin64c.exe",
        r"C:\Program Files\gs\gs10.04.0\bin\gswin64c.exe",
    ]
    import glob
    candidates += glob.glob(r"C:\Program Files\gs\gs*\bin\gswin64c.exe")
    candidates += glob.glob(r"C:\Program Files (x86)\gs\gs*\bin\gswin32c.exe")
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

GS_EXE = _find_ghostscript()

AOPS_PREAMBLE = ""

_AOPS_CDN_LOCAL = '/var/www/cdn'
_AOPS_CDN_URL   = 'http://cdn.artofproblemsolving.com'
_AOPS_PATH_RE   = re.compile(r'/var/www/cdn/[^\s"\'\\)]+')


def _eps_boundingbox(eps_path: str) -> tuple[float, float]:
    """Parse %%BoundingBox / %%HiResBoundingBox from an EPS file.

    Returns (width_bp, height_bp).  Prefers HiResBoundingBox (float) when
    available; falls back to integer BoundingBox.
    """
    llx = lly = urx = ury = 0.0
    found = False
    hires = False
    with open(eps_path, 'r', errors='replace') as f:
        for i, line in enumerate(f):
            if i > 100:
                break
            if line.startswith('%%HiResBoundingBox:'):
                parts = line.split(':',1)[1].split()
                if len(parts) >= 4:
                    llx, lly, urx, ury = (float(x) for x in parts[:4])
                    hires = True
                    found = True
            elif line.startswith('%%BoundingBox:') and not hires:
                parts = line.split(':',1)[1].split()
                if len(parts) >= 4 and parts[0] != '(atend)':
                    llx, lly, urx, ury = (float(x) for x in parts[:4])
                    found = True
    if not found:
        return (100.0, 100.0)  # fallback
    return (urx - llx, ury - lly)


_eps_cache: dict[str, dict] = {}  # keyed by AoPS path string


def _convert_eps_for_client(aops_path: str) -> dict:
    """Download, parse, and convert an AoPS EPS file to base64 PNG.

    Returns {png_b64, width_bp, height_bp} on success,
    or {error: str} on failure.  Results are cached in _eps_cache.
    """
    if aops_path in _eps_cache:
        return _eps_cache[aops_path]

    public_url = _AOPS_CDN_URL + aops_path[len(_AOPS_CDN_LOCAL):]
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            stem = os.path.splitext(os.path.basename(aops_path))[0]
            eps_path = os.path.join(tmpdir, stem + '.eps')
            urllib.request.urlretrieve(public_url, eps_path)

            width_bp, height_bp = _eps_boundingbox(eps_path)

            png_path = os.path.join(tmpdir, stem + '.png')
            if not _eps_to_png(eps_path, png_path):
                result = {'error': f'Ghostscript conversion failed for {aops_path}'}
                _eps_cache[aops_path] = result
                return result

            with open(png_path, 'rb') as f:
                png_b64 = base64.b64encode(f.read()).decode('ascii')

            result = {'png_b64': png_b64, 'width_bp': width_bp, 'height_bp': height_bp}
            _eps_cache[aops_path] = result
            return result
    except Exception as e:
        result = {'error': str(e)}
        _eps_cache[aops_path] = result
        return result


def _eps_to_png(eps_path: str, png_path: str) -> bool:
    """Convert an EPS file to PNG using Ghostscript. Returns True on success."""
    if not GS_EXE:
        return False
    try:
        result = subprocess.run(
            [GS_EXE, '-dNOPAUSE', '-dBATCH', '-dSAFER',
             '-sDEVICE=png16m', '-r150', '-dEPSCrop',
             f'-sOutputFile={png_path}', eps_path],
            capture_output=True, timeout=30,
        )
        return result.returncode == 0 and os.path.exists(png_path)
    except Exception:
        return False


def _eps_to_pdf(eps_path: str, pdf_path: str) -> bool:
    """Convert an EPS file to a cropped PDF using Ghostscript. Returns True on success.

    Uses -dEPSCrop so the PDF page size matches the EPS BoundingBox exactly,
    which lets pdflatex embed it cleanly without coordinate corruption.
    """
    if not GS_EXE:
        return False
    try:
        result = subprocess.run(
            [GS_EXE, '-dNOPAUSE', '-dBATCH', '-dSAFER',
             '-sDEVICE=pdfwrite', '-dEPSCrop',
             f'-sOutputFile={pdf_path}', eps_path],
            capture_output=True, timeout=30,
        )
        return result.returncode == 0 and os.path.exists(pdf_path)
    except Exception:
        return False


def resolve_aops_eps_paths(code: str, tmpdir: str) -> tuple[str, bool]:
    """Download AoPS-local EPS paths (/var/www/cdn/...) to tmpdir and rewrite them.

    AoPS stores assets at /var/www/cdn/... on their servers.  The same files
    are publicly reachable at http://cdn.artofproblemsolving.com/... (strip the
    /var/www/cdn prefix).  We download each unique path to tmpdir and replace
    the original path with the local absolute path so Asymptote/LaTeX can find
    the file.

    EPS files are converted to PDF via Ghostscript (preferred, preserves vector
    quality) or PNG (fallback) so that pdflatex can embed them natively.
    Using -dEPSCrop avoids the coordinate-system corruption that occurs when
    pdflatex invokes its internal epstopdf on raw EPS files.

    Returns (updated_code, needs_pdflatex).  needs_pdflatex is True when any
    image was converted — those files require the pdflatex engine;
    latex (DVI mode) cannot embed them.
    """
    needs_pdflatex = False
    matches = list(set(_AOPS_PATH_RE.findall(code)))
    for aops_path in matches:
        public_url = _AOPS_CDN_URL + aops_path[len(_AOPS_CDN_LOCAL):]
        stem = os.path.splitext(os.path.basename(aops_path))[0]
        eps_path = os.path.join(tmpdir, stem + '.eps')
        try:
            urllib.request.urlretrieve(public_url, eps_path)
        except Exception:
            continue  # Leave path unchanged; asy will report its own error

        # Prefer EPS -> PDF (vector-quality, exact BoundingBox crop)
        pdf_path = os.path.join(tmpdir, stem + '.pdf')
        if _eps_to_pdf(eps_path, pdf_path):
            local_path = pdf_path
            needs_pdflatex = True
        else:
            # Fall back to EPS -> PNG
            png_path = os.path.join(tmpdir, stem + '.png')
            if _eps_to_png(eps_path, png_path):
                local_path = png_path
                needs_pdflatex = True
            else:
                local_path = eps_path  # Fall back to raw EPS

        # Asymptote/LaTeX expect forward slashes even on Windows
        code = code.replace(aops_path, local_path.replace('\\', '/'))
    return code, needs_pdflatex


STYLE_GUIDE_PROMPT = """You are an expert educator with deep Asymptote experience. Follow the style guide at:
https://docs.google.com/document/d/1D-VA4w4_fPGEvp8CJQnTJLaULzKBzl2cToYSbmM6x-0/edit

Code organization: Structure in clear sections with comments (Define objects / Assign values / Draw / Label). This lets me quickly find what to modify.

Make it tweakable: Use descriptive variable names, parameterize key values at the top, add brief inline comments for calculations, and group related commands together.

Begin with a clearly marked section defining all "magic numbers" as variables (e.g., real radius = 3;, pen primaryColor = heavyblue;). Do not bury constants in drawing commands.

Use boolean variables at the top (e.g., bool showLabels = true;) to control optional elements like labels, construction lines, or solution highlights.

Add a brief comment explaining your choice of origin (0,0) and scale.

Prioritize code readability. Use comments to explain the physics or geometry intent, not just the drawing command.

If the diagram is complex, define functions (e.g., drawPulley()) rather than listing linear commands.

Before providing code, verify: all objects defined before use, labels don't overlap, diagram matches description, proper scaling.

Common pitfalls: Watch for N/E/S/W overwrites, sequence() nuances, importing markers, fill-then-draw order."""


CLAUDE_CLI = os.path.join(os.environ.get("APPDATA", ""), "npm", "claude.cmd")
if not os.path.exists(CLAUDE_CLI):
    CLAUDE_CLI = "claude"  # fallback to PATH


def call_claude(prompt, model="claude-opus-4-6", max_tokens=16000):
    """Call Claude CLI and return the response text. Pipes prompt via stdin."""
    try:
        result = subprocess.run(
            [CLAUDE_CLI, "-p", "--model", model, "--max-turns", "1"],
            input=prompt,
            capture_output=True, text=True, timeout=120,
            cwd=tempfile.gettempdir(), shell=True,
        )
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return "Error: Claude CLI timed out"
    except FileNotFoundError:
        return "Error: Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
    except Exception as e:
        return f"Error: {e}"


def call_claude_vision(prompt, image_b64, media_type="image/png", model="claude-sonnet-4-6"):
    """Call Claude with an image by saving it to a temp file for the CLI's Read tool.

    The Claude CLI supports reading image files natively (multimodal Read tool),
    so we write the image to disk and instruct Claude to read it.
    We write to the project directory (where the server runs) so Claude CLI
    has file access without needing --add-dir flags.
    """
    ext_map = {"image/png": ".png", "image/jpeg": ".jpg",
               "image/gif": ".gif", "image/webp": ".webp"}
    ext = ext_map.get(media_type, ".png")

    # Write into the project directory so Claude CLI can read it without --add-dir
    project_dir = os.path.dirname(os.path.abspath(__file__))
    tmp_filename = f"_vision_tmp_{uuid.uuid4().hex}{ext}"
    tmp_path = os.path.join(project_dir, tmp_filename)

    try:
        with open(tmp_path, "wb") as f:
            f.write(base64.b64decode(image_b64))

        img_prompt = (
            prompt
            + f"\n\nIMPORTANT: The user has attached an image file at `{tmp_path}`. "
            "Use the Read tool on that path to view the image before responding."
        )

        result = subprocess.run(
            [CLAUDE_CLI, "-p", "--model", model, "--max-turns", "3"],
            input=img_prompt,
            capture_output=True, text=True, timeout=180,
            cwd=project_dir, shell=True,
        )
        return result.stdout.strip() or result.stderr.strip() or "No response"
    except Exception as e:
        return f"Error: {e}"
    finally:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def compile_to_png(code, tmpdir=None):
    """Compile Asymptote code to PNG and return the file path."""
    cleanup = False
    if tmpdir is None:
        tmpdir = tempfile.mkdtemp()
        cleanup = False  # caller manages
    asy_file = os.path.join(tmpdir, "diagram.asy")
    png_file = os.path.join(tmpdir, "diagram.png")

    # Strip [asy]/[/asy]
    code = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
    code = re.sub(r'\n?\s*\[/asy\]\s*$', '', code)

    code, _ = resolve_aops_eps_paths(code, tmpdir)
    with open(asy_file, "w") as f:
        f.write(AOPS_PREAMBLE + auto_import(code))

    result = subprocess.run(
        [ASY_EXE, "-f", "png", "-noView", "-render", "4", "-o", "diagram", "diagram.asy"],
        cwd=tmpdir, capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        return None
    if os.path.exists(png_file):
        return png_file
    return None


def images_match(png1_path, png2_path):
    """Compare two PNG images pixel by pixel. Returns True if identical."""
    try:
        with open(png1_path, "rb") as f1, open(png2_path, "rb") as f2:
            return f1.read() == f2.read()
    except Exception:
        return False


def extract_asy_code(text):
    """Extract Asymptote code from Claude's response."""
    # Look for code blocks
    m = re.search(r'```(?:asy|asymptote)?\s*\n(.*?)```', text, re.DOTALL)
    if m:
        code = m.group(1).strip()
        # Remove [asy]/[/asy] wrappers if present
        code = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
        code = re.sub(r'\n?\s*\[/asy\]\s*$', '', code)
        return code
    # If no code block, try to find code-like content
    lines = text.strip().split('\n')
    code_lines = []
    in_code = False
    for line in lines:
        if re.match(r'^\s*(import|unitsize|size|draw|fill|filldraw|label|dot|pair|real|int|pen|path)', line):
            in_code = True
        if in_code:
            code_lines.append(line)
    if code_lines:
        return '\n'.join(code_lines)
    return text.strip()


# Identifiers from the olympiad package that aren't in the base language or geometry.
# If any of these appear as a word boundary match, we auto-inject "import olympiad;".
OLYMPIAD_IDENTIFIERS = {
    'anglemark', 'rightanglemark', 'pathticks', 'markscalefactor',
    'circumcenter', 'circumradius', 'circumcircle',
    'foot', 'bisectorpoint', 'centroid', 'orthocenter',
}

# Identifiers from the cse5 package (abbreviated drawing helpers).
CSE5_IDENTIFIERS = {
    'MP', 'MC', 'MA', 'DPA', 'IP', 'OP', 'IPs', 'WP', 'CR', 'CP', 'CC',
    'MarkPoint', 'MarkCurve', 'MarkAngle', 'Drawing', 'DrawPathArray',
    'IntersectionPoint', 'OtherPoint', 'IntersectionPoints', 'WayPoint',
    'CirclebyRadius', 'CirclebyPoint', 'CopyClean',
}


def auto_import(code: str) -> str:
    """Auto-inject 'import olympiad;' and/or 'import cse5;' when code uses
    identifiers from those packages but doesn't already import them.
    This matches AoPS behaviour where these packages are implicitly available."""
    imports_to_add = []

    if not re.search(r'^\s*import\s+olympiad\b', code, re.MULTILINE):
        for ident in OLYMPIAD_IDENTIFIERS:
            if re.search(r'\b' + ident + r'\b', code):
                imports_to_add.append('import olympiad;')
                break

    if not re.search(r'^\s*import\s+cse5\b', code, re.MULTILINE):
        for ident in CSE5_IDENTIFIERS:
            if re.search(r'\b' + ident + r'\b', code):
                imports_to_add.append('import cse5;')
                break

    if imports_to_add:
        return '\n'.join(imports_to_add) + '\n' + code
    return code


class HiTeXeRHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/eigennode-read":
            from urllib.parse import parse_qs
            params = parse_qs(parsed.query)
            filepath = params.get("path", [None])[0]
            if filepath and os.path.exists(filepath):
                code = Path(filepath).read_text(encoding="utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(code.encode("utf-8"))
            else:
                self.send_error(404, "File not found")
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/compile":
            self.handle_compile()
        elif self.path == "/texer":
            self.handle_texer()
        elif self.path == "/ai":
            self.handle_ai()
        elif self.path == "/eigennode-write":
            self.handle_eigennode_write()
        elif self.path == "/render-gif":
            self.handle_render_gif()
        elif self.path == "/convert-eps":
            self.handle_convert_eps()
        else:
            self.send_error(404)

    def handle_eigennode_write(self):
        content_length = int(self.headers["Content-Length"])
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body)
            filepath = data["path"]
            code = data["code"]
            node_id = data.get("nodeId", "")
            # Write atomically via rename so file-watchers reliably see each update
            content = json.dumps({"code": code, "nodeId": node_id})
            tmp_path = filepath + ".tmp." + uuid.uuid4().hex[:8]
            try:
                Path(tmp_path).write_text(content, encoding="utf-8")
                os.replace(tmp_path, filepath)
            except Exception:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                raise
            self.send_json(200, {"ok": True})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_render_gif(self):
        """Render Asymptote code to an animated GIF using asy.exe -f gif."""
        content_length = int(self.headers["Content-Length"])
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return

        code = data.get("code", "")
        # gif_settings passed for reference but asy code controls output directly
        if not code.strip():
            self.send_json(400, {"error": "No code provided"})
            return

        # Strip [asy]/[/asy] wrappers
        code = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
        code = re.sub(r'\n?\s*\[/asy\]\s*$', '', code)

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                asy_file = os.path.join(tmpdir, "anim.asy")

                code, _ = resolve_aops_eps_paths(code, tmpdir)
                with open(asy_file, "w") as f:
                    f.write(AOPS_PREAMBLE + auto_import(code))

                result = subprocess.run(
                    [ASY_EXE, "-f", "gif", "-noView", "-o", "anim", "anim.asy"],
                    cwd=tmpdir, capture_output=True, text=True, timeout=120,
                )

                if result.returncode != 0:
                    error_msg = result.stderr.strip() or result.stdout.strip() or f"asy exited with code {result.returncode}"
                    self.send_json(200, {"success": False, "error": error_msg})
                    return

                # asy may produce anim.gif or anim0.gif, anim1.gif, ... for animations
                gif_file = os.path.join(tmpdir, "anim.gif")
                if not os.path.exists(gif_file):
                    gif_files = sorted(f for f in os.listdir(tmpdir) if f.endswith('.gif'))
                    if not gif_files:
                        self.send_json(200, {"success": False, "error": "asy produced no GIF output (ImageMagick may be required for animation)"})
                        return
                    gif_file = os.path.join(tmpdir, gif_files[0])

                with open(gif_file, "rb") as f:
                    gif_b64 = base64.b64encode(f.read()).decode()

                self.send_json(200, {"success": True, "gifBase64": gif_b64})
        except subprocess.TimeoutExpired:
            self.send_json(200, {"success": False, "error": "GIF compilation timed out"})
        except Exception as e:
            self.send_json(500, {"success": False, "error": str(e)})

    def handle_convert_eps(self):
        """Convert AoPS EPS images to base64 PNG for the JS interpreter."""
        content_length = int(self.headers["Content-Length"])
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return

        paths = data.get("paths", [])
        if not isinstance(paths, list) or not paths:
            self.send_json(400, {"error": "No paths provided"})
            return

        images = {}
        for p in paths:
            if not isinstance(p, str) or not _AOPS_PATH_RE.fullmatch(p):
                images[p] = {"error": "Invalid path"}
                continue
            images[p] = _convert_eps_for_client(p)

        self.send_json(200, {"images": images})

    def handle_compile(self):
        content_length = int(self.headers["Content-Length"])
        body = self.requestfile.read(content_length) if hasattr(self, 'requestfile') else self.rfile.read(content_length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return

        code = data.get("code", "")
        code = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
        code = re.sub(r'\n?\s*\[/asy\]\s*$', '', code)

        if not code.strip():
            self.send_json(400, {"error": "No code provided"})
            return

        full_code = AOPS_PREAMBLE + auto_import(code)

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
        if not parsed.scheme and not parsed.netloc:
            url = "https://artofproblemsolving.com/texer/" + url.lstrip("/")
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
                code = re.sub(r"^\s*\[asy\]\s*\n?", "", code)
                code = re.sub(r"\n?\s*\[/asy\]\s*$", "", code)
                self.send_json(200, {"code": code})
            else:
                self.send_json(200, {"error": "No Asymptote code found on that page (may be private)"})
        except Exception as e:
            self.send_json(200, {"error": f"Failed to fetch TeXeR page: {e}"})

    def handle_ai(self):
        content_length = int(self.headers["Content-Length"])
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return

        action = data.get("action", "")
        code = data.get("code", "")

        try:
            if action == "refactor":
                self._handle_refactor(code)
            elif action == "edit":
                self._handle_edit(code, data.get("prompt", ""), data.get("image"))
            elif action == "learn":
                self._handle_learn(code)
            elif action == "chat":
                self._handle_chat(code, data.get("prompt", ""), data.get("options", {}), data.get("history", []), data.get("image"))
            elif action == "lint":
                self._handle_lint(code)
            elif action == "fix":
                self._handle_fix(code, data.get("line", 0), data.get("message", ""))
            elif action == "autocomplete":
                self._handle_autocomplete(code, data.get("cursor", 0), data.get("prefix", ""))
            else:
                self.send_json(400, {"error": f"Unknown AI action: {action}"})
        except Exception as e:
            traceback.print_exc()
            self.send_json(500, {"error": f"Server error: {e}"})

    def _handle_refactor(self, code):
        """AI Refactor: refactor code while keeping identical output."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Compile original to PNG
            orig_png = compile_to_png(code, tmpdir)
            if not orig_png:
                self.send_json(200, {"error": "Original code failed to compile"})
                return

            prompt = (
                f"{STYLE_GUIDE_PROMPT}\n\n"
                f"Here is the Asymptote code:\n```asy\n{code}\n```\n\n"
                "Refactor this drawing to meet the Asymptote style guide, making sure it's easy to edit "
                "and maintain and well-commented. Strict requirement: the code must compile to give "
                "exactly the same image. You are only refactoring the code's style, not the image it creates.\n\n"
                "Return ONLY the refactored Asymptote code in a code block. No explanation outside the code block."
            )

            best_code = None
            for attempt in range(5):
                if attempt == 0:
                    response = call_claude(prompt)
                else:
                    response = call_claude(
                        f"{prompt}\n\nYour previous refactoring attempt #{attempt} produced a different image. "
                        "Try again, being more careful to preserve exact visual output. "
                        "Do not change any coordinates, sizes, colors, or pen properties. "
                        "Only reorganize, rename variables, and add comments."
                    )

                new_code = extract_asy_code(response)
                if not new_code:
                    continue

                # Compile new code and compare
                new_tmpdir = os.path.join(tmpdir, f"attempt_{attempt}")
                os.makedirs(new_tmpdir, exist_ok=True)
                new_png = compile_to_png(new_code, new_tmpdir)
                if not new_png:
                    continue

                best_code = new_code
                if images_match(orig_png, new_png):
                    wrapped = f"[asy]\n{new_code}\n[/asy]"
                    self.send_json(200, {"code": wrapped, "imageMatch": True, "attempts": attempt + 1})
                    return

            # Failed to match after 5 attempts
            if best_code:
                wrapped = f"[asy]\n{best_code}\n[/asy]"
                self.send_json(200, {
                    "code": wrapped,
                    "imageMatch": False,
                    "message": "Perfect refactoring failed after 5 attempts. The images differ slightly. Accept approximate refactoring or revert?",
                })
            else:
                self.send_json(200, {"error": "AI refactoring failed - could not generate valid code"})

    def _handle_edit(self, code, prompt, image_data=None):
        """AI Edit: create or modify Asymptote code based on text/image instructions."""
        edit_prompt = f"{STYLE_GUIDE_PROMPT}\n\n"

        if code.strip() and code.strip() not in ("[asy]\n\n[/asy]", "[asy]\n[/asy]"):
            edit_prompt += f"Here is the current Asymptote code:\n```asy\n{code}\n```\n\n"

        if image_data:
            edit_prompt += "(An image has been provided as reference. Recreate it as accurately as possible in Asymptote.)\n\n"

        if prompt:
            edit_prompt += f"User request: {prompt}\n\n"
        elif image_data:
            edit_prompt += "Recreate this image as accurately as possible in Asymptote code.\n\n"

        edit_prompt += (
            "Return ONLY the Asymptote code in a code block. No explanation outside the code block. "
            "The code should be complete and compilable."
        )

        # First pass: generate code
        response = call_claude(edit_prompt)
        new_code = extract_asy_code(response)
        if not new_code:
            self.send_json(200, {"error": "AI failed to generate code"})
            return

        # Compile to verify it works
        with tempfile.TemporaryDirectory() as tmpdir:
            png = compile_to_png(new_code, tmpdir)
            if not png:
                # Try to fix compilation errors
                fix_prompt = (
                    f"This Asymptote code failed to compile:\n```asy\n{new_code}\n```\n\n"
                    "Fix the compilation errors. Return ONLY the corrected code in a code block."
                )
                response = call_claude(fix_prompt)
                new_code = extract_asy_code(response) or new_code

        # Critic loop (up to 5 rounds)
        with tempfile.TemporaryDirectory() as tmpdir:
            for round_num in range(5):
                png_path = compile_to_png(new_code, tmpdir)
                if not png_path:
                    break

                # Encode PNG for critic
                with open(png_path, "rb") as f:
                    png_b64 = base64.b64encode(f.read()).decode()

                critic_prompt = (
                    f"You are reviewing an Asymptote diagram.\n\n"
                    f"Original request: {prompt or 'Recreate the provided image'}\n\n"
                    f"The generated code:\n```asy\n{new_code}\n```\n\n"
                    "Does this code fully meet all the requirements? "
                    "If yes, respond with exactly: APPROVED\n"
                    "If no, respond with specific notes for improvement."
                )

                critic_response = call_claude(critic_prompt, model="claude-sonnet-4-6")

                if "APPROVED" in critic_response.upper()[:50]:
                    break

                # Send notes back to generator
                revision_prompt = (
                    f"{STYLE_GUIDE_PROMPT}\n\n"
                    f"Original request: {prompt or 'Recreate the provided image'}\n\n"
                    f"Current code:\n```asy\n{new_code}\n```\n\n"
                    f"Critic feedback:\n{critic_response}\n\n"
                    "Revise the code to address the feedback. Return ONLY the revised code in a code block."
                )
                response = call_claude(revision_prompt)
                revised = extract_asy_code(response)
                if revised:
                    new_code = revised

                # New tmpdir for next compile
                sub = os.path.join(tmpdir, f"rev_{round_num}")
                os.makedirs(sub, exist_ok=True)

        wrapped = f"[asy]\n{new_code}\n[/asy]"
        self.send_json(200, {"code": wrapped, "message": "AI edit complete."})

    def _handle_learn(self, code):
        """Learning mode: generate line-by-line explanations."""
        # Strip wrappers
        clean = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
        clean = re.sub(r'\n?\s*\[/asy\]\s*$', '', clean)

        prompt = (
            f"Here is Asymptote code for a diagram:\n```asy\n{clean}\n```\n\n"
            "For each non-empty, non-comment line of code, provide a brief (1-2 sentence) explanation "
            "of what that line does. Try to understand the overall context (is this a geometry diagram, "
            "physics illustration, etc.) and explain in those terms.\n\n"
            "Format your response as JSON: a single object where each key is a line number (0-indexed from "
            "the start of the FULL code including [asy] wrapper) and each value is the explanation string. "
            "Only include lines that have meaningful code. Skip blank lines and pure comment lines.\n\n"
            "Example format:\n{\"1\": \"Imports the geometry module...\", \"2\": \"Sets scale...\"}\n\n"
            "Return ONLY the JSON object, no markdown formatting."
        )

        response = call_claude(prompt, model="claude-sonnet-4-6")

        # Parse JSON from response
        try:
            # Try to find JSON in the response
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
            if json_match:
                explanations = json.loads(json_match.group())
            else:
                explanations = json.loads(response)
            self.send_json(200, {"explanations": explanations})
        except (json.JSONDecodeError, AttributeError):
            self.send_json(200, {"error": "Failed to parse AI explanation", "raw": response[:500]})

    def _handle_chat(self, code, prompt, options, history, image=None):
        """AI Chat: conversational interaction about the code."""
        system = (
            "You are an expert Asymptote programmer and educator. "
            "You are helping the user with their Asymptote diagram code.\n\n"
        )

        if options.get("refactor"):
            system += f"\n{STYLE_GUIDE_PROMPT}\n\n"

        constraints = []
        no_edits = options.get("noEdits", False)
        if no_edits:
            constraints.append("Do NOT modify the code. Only provide explanations and advice.")
        if options.get("noVisibleChanges"):
            constraints.append("Any code changes must produce the EXACT same visual output.")
        if options.get("commentsOnly"):
            constraints.append("Only add or improve comments. Do not change any executable code.")

        if constraints:
            system += "CONSTRAINTS:\n" + "\n".join(f"- {c}" for c in constraints) + "\n\n"

        # Build conversation text (system + history + current prompt)
        messages = system
        if code.strip():
            messages += f"Current Asymptote code:\n```asy\n{code}\n```\n\n"

        for msg in history[-10:]:  # Keep last 10 messages for context
            role = msg.get("role", "user")
            messages += f"{'User' if role == 'user' else 'Assistant'}: {msg.get('content', '')}\n\n"

        user_text = f"User: {prompt}\n\nProvide your response. "
        if not no_edits:
            user_text += (
                "If you suggest code changes, include the COMPLETE updated code in a single "
                "```asy``` code block. If no code changes are needed, just explain."
            )
        messages += user_text

        if image:
            # Use vision API when an image is attached
            image_b64 = image.get("data", "")
            media_type = image.get("type", "image/png")
            response = call_claude_vision(messages, image_b64, media_type)
        else:
            response = call_claude(messages, model="claude-sonnet-4-6")

        # Extract code if present
        result_code = None
        if not no_edits:
            m = re.search(r'```(?:asy|asymptote)?\s*\n(.*?)```', response, re.DOTALL)
            if m:
                result_code = m.group(1).strip()
                # Wrap if needed
                if not result_code.startswith('[asy]'):
                    result_code = f"[asy]\n{result_code}\n[/asy]"

        # Clean up response for display (remove code blocks for the message text)
        display_msg = re.sub(r'```(?:asy|asymptote)?\s*\n.*?```', '[code provided above]', response, flags=re.DOTALL).strip()

        result = {"message": display_msg}
        if result_code:
            result["code"] = result_code
        self.send_json(200, result)

    def _handle_lint(self, code):
        """Lint: compile with Asymptote and parse errors."""
        # Strip wrappers
        clean = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
        clean = re.sub(r'\n?\s*\[/asy\]\s*$', '', clean)

        full_code = AOPS_PREAMBLE + auto_import(clean)

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                asy_file = os.path.join(tmpdir, "diagram.asy")
                with open(asy_file, "w") as f:
                    f.write(full_code)

                result = subprocess.run(
                    [ASY_EXE, "-f", "pdf", "-noView", "-o", "diagram", "diagram.asy"],
                    cwd=tmpdir, capture_output=True, text=True, timeout=30,
                )

                errors = []
                if result.returncode != 0:
                    stderr = result.stderr + result.stdout
                    # Parse error lines: "diagram.asy: 5.10: error message"
                    for m in re.finditer(r'.*?\.asy:\s*(\d+)\.\d+:\s*(.*)', stderr):
                        line_num = int(m.group(1))
                        message = m.group(2).strip()
                        severity = "warning" if "warning" in message.lower() else "error"
                        errors.append({"line": line_num, "message": message, "severity": severity})

                self.send_json(200, {"errors": errors})
        except subprocess.TimeoutExpired:
            self.send_json(200, {"errors": [{"line": 1, "message": "Compilation timed out", "severity": "error"}]})
        except Exception as e:
            self.send_json(200, {"errors": [{"line": 1, "message": str(e), "severity": "error"}]})

    def _handle_fix(self, code, line, message):
        """AI Fix: suggest a fix for an error on a specific line."""
        clean = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
        clean = re.sub(r'\n?\s*\[/asy\]\s*$', '', clean)
        lines = clean.split('\n')
        error_line = lines[line - 1] if 0 < line <= len(lines) else ""

        prompt = (
            f"The following Asymptote code has an error on line {line}:\n"
            f"```asy\n{clean}\n```\n\n"
            f"Error on line {line}: {message}\n"
            f"The line is: `{error_line}`\n\n"
            "Provide ONLY the corrected version of that single line. "
            "Return just the fixed line of code, nothing else."
        )

        response = call_claude(prompt, model="claude-sonnet-4-6")
        # Clean up: take first non-empty line, strip markdown
        fixed = response.strip()
        fixed = re.sub(r'^```\w*\s*', '', fixed)
        fixed = re.sub(r'\s*```$', '', fixed)
        fixed = fixed.strip().split('\n')[0].strip()

        self.send_json(200, {"fixedLine": fixed})

    def _handle_autocomplete(self, code, cursor, prefix):
        """AI Autocomplete: suggest completions based on context."""
        clean = re.sub(r'^\s*\[asy\]\s*\n?', '', code)
        clean = re.sub(r'\n?\s*\[/asy\]\s*$', '', clean)

        prompt = (
            f"You are an Asymptote code autocomplete engine.\n"
            f"The user is typing code and the cursor is at position {cursor}.\n"
            f"Current prefix being typed: \"{prefix}\"\n\n"
            f"Code context:\n```asy\n{clean}\n```\n\n"
            f"Suggest exactly 5 completions for \"{prefix}\" that make sense in this context. "
            f"Return ONLY a JSON array of 5 strings, like [\"completion1\", \"completion2\", ...]. "
            f"Each completion should be the FULL word/identifier (not just the suffix after the prefix)."
        )

        response = call_claude(prompt, model="claude-sonnet-4-6", max_tokens=500)

        try:
            # Extract JSON array from response
            m = re.search(r'\[.*?\]', response, re.DOTALL)
            if m:
                completions = json.loads(m.group())
            else:
                completions = []
        except (json.JSONDecodeError, AttributeError):
            completions = []

        self.send_json(200, {"completions": completions})

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
        # Prevent browser from caching served files so edits take effect immediately
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class CompilationError(Exception):
    pass


def _png_dimensions(png_path: str) -> tuple[int, int]:
    """Read width and height from the PNG IHDR chunk."""
    with open(png_path, 'rb') as f:
        f.read(8)   # PNG signature
        f.read(4)   # IHDR length
        f.read(4)   # "IHDR"
        w = struct.unpack('>I', f.read(4))[0]
        h = struct.unpack('>I', f.read(4))[0]
    return w, h


def _png_as_svg(png_path: str) -> str:
    """Wrap a PNG file in a minimal SVG <image> element (base64-encoded)."""
    w, h = _png_dimensions(png_path)
    with open(png_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    return (
        f"<svg xmlns='http://www.w3.org/2000/svg' "
        f"xmlns:xlink='http://www.w3.org/1999/xlink' "
        f"width='{w}pt' height='{h}pt' viewBox='0 0 {w} {h}'>"
        f"<image width='{w}' height='{h}' "
        f"xlink:href='data:image/png;base64,{b64}'/>"
        f"</svg>"
    )


def compile_asy_to_svg(code: str) -> str:
    """Compile Asymptote code to SVG string."""
    with tempfile.TemporaryDirectory() as tmpdir:
        asy_file = os.path.join(tmpdir, "diagram.asy")
        pdf_file = os.path.join(tmpdir, "diagram.pdf")
        svg_file = os.path.join(tmpdir, "diagram.svg")

        code, needs_pdflatex = resolve_aops_eps_paths(code, tmpdir)
        with open(asy_file, "w") as f:
            f.write(code)

        if needs_pdflatex:
            # Step 1: compile with pdflatex engine to PDF
            result = subprocess.run(
                [ASY_EXE, "-tex", "pdflatex", "-f", "pdf", "-noView",
                 "-o", "diagram", "diagram.asy"],
                cwd=tmpdir, capture_output=True, text=True, timeout=60,
            )
            if result.returncode != 0:
                error_msg = result.stderr.strip() or result.stdout.strip()
                raise CompilationError(f"Asymptote error:\n{error_msg}")
            if not os.path.exists(pdf_file):
                raise CompilationError("Asymptote produced no output")

            # Step 2: try dvisvgm on the PDF for a proper vector SVG with
            # tight bounding box.  This works when GS can extract the embedded
            # images; fall back to PNG wrapping when it cannot.
            dvi_result = subprocess.run(
                [DVISVGM, "--pdf", "--no-fonts", "--exact-bbox",
                 pdf_file, "-o", svg_file],
                cwd=tmpdir, capture_output=True, text=True, timeout=30,
            )
            if dvi_result.returncode == 0 and os.path.exists(svg_file):
                with open(svg_file, "r") as f:
                    svg = f.read()
                # dvisvgm sometimes silently drops embedded raster images.
                # Verify images are present; fall back to PNG if they were lost.
                if '<image' in svg:
                    return fix_svg_opacity(svg)

            # dvisvgm couldn't handle the embedded images — re-compile to PNG
            png_file = os.path.join(tmpdir, "diagram.png")
            result = subprocess.run(
                [ASY_EXE, "-tex", "pdflatex", "-f", "png", "-noView",
                 "-o", "diagram", "diagram.asy"],
                cwd=tmpdir, capture_output=True, text=True, timeout=60,
            )
            if result.returncode != 0:
                error_msg = result.stderr.strip() or result.stdout.strip()
                raise CompilationError(f"Asymptote error:\n{error_msg}")
            if not os.path.exists(png_file):
                raise CompilationError("Asymptote produced no output")
            return _png_as_svg(png_file)

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
    import socket as _socket
    os.chdir(Path(__file__).parent)
    # Create socket with SO_REUSEADDR before binding to survive TIME_WAIT on Windows
    sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
    sock.setsockopt(_socket.SOL_SOCKET, _socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", PORT))
    sock.listen(5)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), HiTeXeRHandler, bind_and_activate=False)
    server.socket = sock
    print(f"HiTeXeR server running at http://127.0.0.1:{PORT}")
    print("Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
