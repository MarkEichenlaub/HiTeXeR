"""Host an image on AoPS so a HiTeXeR diagram can embed it with graphic().

Asymptote's graphic() reads a file from the machine that runs asy.  For AoPS
TeXeR that machine is the AoPS server, so the only images a TeXeR diagram can
embed are ones already living in an AoPS collection's files/ directory:

    graphic("/var/www/cdn/school/crypt/00400-<hash>/files/<name>.eps", "width=3cm")

This module takes an arbitrary image (pasted, dropped, or picked from disk),
converts it to EPS, uploads it to the file-hosting collection (400), and
returns that /var/www/cdn path plus a rasterised preview so HiTeXeR can draw the
diagram immediately without waiting for the CDN.

Upload transport is a direct multipart POST to AoPS's ajax.php (the same call
the File Upload page makes), authenticated with session cookies.  Cookies are
cached in ~/.hitexer/aops-cookies.json; when they go stale we borrow a live
session from EigenNode's persistent AoPS Chrome profile and re-cache.
"""

import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Collection 400 is where all of Mark's scripts upload files as of 2026-09-23.
# HiTeXeR used 540 (the collection the mario.eps / ice_cream.eps corpus diagrams
# point at) until that one filled up and started refusing uploads.
COLLECTION_ID = int(os.environ.get('HITEXER_AOPS_COLLECTION', '400'))
AJAX_URL = 'https://artofproblemsolving.com/m/crypt/ajax.php'
UPLOAD_PAGE = f'https://artofproblemsolving.com/crypt/collection/{COLLECTION_ID}/file-upload'

AOPS_CDN_LOCAL = '/var/www/cdn'
AOPS_CDN_HOSTS = ('cdn.artofproblemsolving.com', 'artofproblemsolving.com')

COOKIE_CACHE = Path.home() / '.hitexer' / 'aops-cookies.json'
BASE_URL_CACHE = Path.home() / '.hitexer' / 'aops-collection-base.json'
EIGENNODE_SCRIPTS = Path.home() / 'github' / 'EigenNode' / 'scripts'

# Where each collection's files are served from.  AoPS's own "list the files in
# this collection" call (get_collection_files) currently returns
# E_EXCEPTION "Unexpected key 'Marker' found in params" -- it is broken
# server-side, which is also why the File Upload page renders empty.  The upload
# itself works fine, but the reply that would have carried the new file's URL is
# lost to the same exception, so we rebuild the URL from this base and then
# confirm over HTTP that the file really is there.  If AoPS ever fixes the
# listing, a good reply overwrites this cache and the hard-coded seed stops
# mattering.
KNOWN_COLLECTION_BASES = {
    400: ('http://cdn.artofproblemsolving.com/school/crypt/'
          '00400-6ef848956f9c0207478f8f59ae54411efc0ce3f2/files'),
    540: ('http://cdn.artofproblemsolving.com/school/crypt/'
          '00540-e12599cedadfdc40445dca22ddd227e6417975d2/files'),
}

# Long side of the stored raster.  At the 3 cm default placement that is still
# ~850 dpi, and it keeps a phone photo from becoming a 20 MB EPS.
MAX_PX = 1000
# Default on-page size of a freshly inserted image, in centimetres.
DEFAULT_SIZE_CM = 3.0

RASTER_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff'}


class UploadError(Exception):
    """Something went wrong that the user needs to hear about verbatim."""


# ── image → EPS ───────────────────────────────────────────────────────────

def _find_magick():
    exe = shutil.which('magick')
    if exe:
        return exe
    import glob
    for pat in (r'C:\Program Files\ImageMagick-*\magick.exe',
                r'C:\Program Files (x86)\ImageMagick-*\magick.exe'):
        hits = sorted(glob.glob(pat))
        if hits:
            return hits[-1]
    return None


def _find_ghostscript():
    """Reuse server.py's locator when we're imported alongside it."""
    try:
        from server import GS_EXE  # type: ignore
        if GS_EXE:
            return GS_EXE
    except Exception:
        pass
    import glob
    cands = glob.glob(r'C:\Program Files\gs\gs*\bin\gswin64c.exe')
    cands += glob.glob(r'C:\Program Files (x86)\gs\gs*\bin\gswin32c.exe')
    cands += [p for p in (shutil.which('gs'), shutil.which('gswin64c')) if p]
    return sorted(cands)[-1] if cands else None


def _normalise_raster(data):
    """Flatten onto white, drop animation frames, and cap the long side.

    EPS has no alpha channel, so transparency has to be resolved here rather
    than silently turning black further down the pipeline.
    """
    from PIL import Image
    img = Image.open(io.BytesIO(data))
    try:
        img.seek(0)
    except Exception:
        pass

    if img.mode in ('RGBA', 'LA', 'P', 'PA'):
        img = img.convert('RGBA')
        flat = Image.new('RGB', img.size, (255, 255, 255))
        flat.paste(img, mask=img.split()[-1])
        img = flat
    else:
        img = img.convert('RGB')

    w, h = img.size
    if max(w, h) > MAX_PX:
        scale = MAX_PX / float(max(w, h))
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))),
                         Image.Resampling.LANCZOS)

    out = io.BytesIO()
    img.save(out, format='PNG')
    return out.getvalue(), img.size


def _eps_boundingbox(eps_bytes):
    """Width/height in PostScript points, preferring %%HiResBoundingBox."""
    head = eps_bytes[:16384].decode('latin1', errors='replace')
    box = None
    for line in head.split('\n')[:100]:
        hires = line.startswith('%%HiResBoundingBox:')
        if not hires and not line.startswith('%%BoundingBox:'):
            continue
        rest = line.split(':', 1)[1].strip()
        if rest.startswith('(atend)'):
            continue
        parts = rest.split()
        if len(parts) < 4:
            continue
        try:
            llx, lly, urx, ury = (float(x) for x in parts[:4])
        except ValueError:
            continue
        box = (urx - llx, ury - lly)
        if hires:
            break
    return box or (100.0, 100.0)


def to_eps(data, filename):
    """Convert arbitrary image bytes to EPS.  Returns (eps_bytes, w_bp, h_bp).

    ImageMagick's EPS3 writer is strongly preferred: it Flate-compresses the
    raster, which is roughly 70x smaller than PIL's ASCII-hex EPS for a typical
    screenshot.  PIL is the fallback for machines without ImageMagick.
    """
    ext = os.path.splitext(filename or '')[1].lower()

    if ext in ('.eps', '.ps'):
        return data, *_eps_boundingbox(data)

    if ext == '.pdf':
        gs = _find_ghostscript()
        if not gs:
            raise UploadError('Converting a PDF needs Ghostscript, which was not found.')
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, 'in.pdf')
            dst = os.path.join(tmp, 'out.eps')
            with open(src, 'wb') as f:
                f.write(data)
            r = subprocess.run([gs, '-dNOPAUSE', '-dBATCH', '-dSAFER',
                                '-sDEVICE=eps2write', '-dEPSCrop',
                                f'-sOutputFile={dst}', src],
                               capture_output=True, timeout=120)
            if r.returncode != 0 or not os.path.exists(dst):
                raise UploadError('Ghostscript could not convert that PDF: '
                                  + r.stderr.decode('latin1', 'replace')[:200])
            eps = open(dst, 'rb').read()
        return eps, *_eps_boundingbox(eps)

    magick = _find_magick()

    # SVG and anything else exotic goes straight to ImageMagick, which knows
    # more formats than PIL does.
    if ext not in RASTER_EXTS and magick:
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, 'in' + (ext or '.img'))
            dst = os.path.join(tmp, 'out.eps')
            with open(src, 'wb') as f:
                f.write(data)
            r = subprocess.run([magick, src, '-background', 'white',
                                '-alpha', 'remove', '-alpha', 'off',
                                '-resize', f'{MAX_PX}x{MAX_PX}>',
                                'eps3:' + dst], capture_output=True, timeout=120)
            if r.returncode == 0 and os.path.exists(dst):
                eps = open(dst, 'rb').read()
                return eps, *_eps_boundingbox(eps)
        raise UploadError(f'Could not convert a {ext or "?"} file to EPS.')

    png, _size = _normalise_raster(data)

    if magick:
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, 'in.png')
            dst = os.path.join(tmp, 'out.eps')
            with open(src, 'wb') as f:
                f.write(png)
            r = subprocess.run([magick, src, 'eps3:' + dst],
                               capture_output=True, timeout=120)
            if r.returncode == 0 and os.path.exists(dst):
                eps = open(dst, 'rb').read()
                return eps, *_eps_boundingbox(eps)

    from PIL import Image
    buf = io.BytesIO()
    Image.open(io.BytesIO(png)).save(buf, format='EPS')
    eps = buf.getvalue()
    return eps, *_eps_boundingbox(eps)


# ── AoPS session cookies ──────────────────────────────────────────────────

def _load_cached_cookies():
    try:
        with open(COOKIE_CACHE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        cookies = data.get('cookies') or {}
        return '; '.join(f'{k}={v}' for k, v in cookies.items()) if cookies else None
    except Exception:
        return None


def _save_cached_cookies(cookies):
    try:
        COOKIE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        with open(COOKIE_CACHE, 'w', encoding='utf-8') as f:
            json.dump({'saved': time.time(), 'cookies': cookies}, f)
        try:
            os.chmod(COOKIE_CACHE, 0o600)
        except Exception:
            pass
    except Exception:
        pass


def _cookies_from_browser():
    """Borrow a live AoPS session from EigenNode's persistent Chrome profile.

    That profile stays signed in between runs, so this usually reconnects to an
    already-open Chrome and costs nothing.  When the session really has expired
    the window is left open on the sign-in page and we report back rather than
    blocking on input() the way EigenNode's interactive helper does.
    """
    if not EIGENNODE_SCRIPTS.exists():
        raise UploadError(
            'Not signed in to AoPS, and EigenNode (which holds the signed-in '
            f'browser profile) was not found at {EIGENNODE_SCRIPTS}.')

    for p in (str(EIGENNODE_SCRIPTS), str(EIGENNODE_SCRIPTS / 'lib')):
        if p not in sys.path:
            sys.path.insert(0, p)

    try:
        from browser_manager import get_browser       # type: ignore
        from authentication import is_logged_in       # type: ignore
    except Exception as e:
        raise UploadError(f'Could not load the AoPS browser helper: {e}')

    driver, _wait = get_browser(headless=False)
    if driver is None:
        raise UploadError('Could not start a browser to sign in to AoPS.')

    if UPLOAD_PAGE not in (driver.current_url or ''):
        driver.get(UPLOAD_PAGE)
        time.sleep(2)

    if not is_logged_in(driver):
        raise UploadError(
            'Not signed in to AoPS. A browser window is open on the sign-in '
            'page — sign in there, then try the upload again.')

    cookies = {c['name']: c['value'] for c in driver.get_cookies()}
    if not cookies:
        raise UploadError('AoPS returned no session cookies.')
    _save_cached_cookies(cookies)
    return '; '.join(f'{k}={v}' for k, v in cookies.items())


# ── upload ────────────────────────────────────────────────────────────────

def _collection_base():
    """Base URL of this collection's files/ directory."""
    try:
        with open(BASE_URL_CACHE, 'r', encoding='utf-8') as f:
            cached = json.load(f).get(str(COLLECTION_ID))
        if cached:
            return cached.rstrip('/')
    except Exception:
        pass
    known = KNOWN_COLLECTION_BASES.get(COLLECTION_ID)
    if known:
        return known.rstrip('/')
    raise UploadError(
        f"The file went up, but AoPS's broken file listing means we can't tell "
        f"where collection {COLLECTION_ID} serves it from. Upload one file "
        f"through the AoPS File Upload page, then put its URL's directory in "
        f'{BASE_URL_CACHE} as {{"{COLLECTION_ID}": "<url>"}}.')


def _remember_collection_base(url, filename):
    """Learn the base directory from a reply that did carry a URL."""
    if not url.endswith('/' + filename):
        return
    base = url[: -len('/' + filename)]
    try:
        data = {}
        if BASE_URL_CACHE.exists():
            with open(BASE_URL_CACHE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        if data.get(str(COLLECTION_ID)) == base:
            return
        data[str(COLLECTION_ID)] = base
        BASE_URL_CACHE.parent.mkdir(parents=True, exist_ok=True)
        with open(BASE_URL_CACHE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


def _confirm_uploaded(filename, expected_size):
    """Is the file actually being served, at the size we sent?"""
    import requests
    url = _collection_base() + '/' + filename
    for delay in (0, 1.5, 3):
        if delay:
            time.sleep(delay)
        try:
            r = requests.get(url, timeout=30)
        except Exception:
            continue
        if r.status_code == 200 and len(r.content) == expected_size:
            return url
    return None


def _post_upload(cookie_header, filename, eps_bytes, content_type='application/postscript'):
    """One multipart POST.  Returns (cdn_url, status) where status is one of
    'ok', 'auth' (session stale), or 'exists'."""
    import requests
    resp = requests.post(
        AJAX_URL,
        headers={'Cookie': cookie_header},
        files={'file': (filename, eps_bytes, content_type)},
        data={'a': 'upload_collection_file', 'collection_id': str(COLLECTION_ID)},
        timeout=120,
    )
    try:
        result = resp.json()
    except ValueError:
        # A sign-in page (or any HTML) comes back when the session has lapsed.
        return None, 'auth'

    code = result.get('error_code', '')
    if code and code not in (0, '0'):
        msg = str(result.get('error_msg', ''))
        low = msg.lower()
        if 'exist' in low or 'duplicate' in low or 'overwrite' in low:
            return None, 'exists'
        if 'log' in low or 'permission' in low or 'auth' in low:
            return None, 'auth'
        # AoPS's own file listing throws after a perfectly good upload, so an
        # exception here says nothing about whether the file went up. Ask the
        # CDN instead of believing the error.
        url = _confirm_uploaded(filename, len(eps_bytes))
        if url:
            return url, 'ok'
        raise UploadError(f'AoPS refused the upload: {msg or code}')

    files = (result.get('response') or {}).get('files')
    url = None
    if isinstance(files, dict) and 'url' in files:
        url = files['url'].rstrip('/') + '/' + filename
    elif isinstance(files, list) and files:
        url = files[0].get('url') or files[0].get('src')
    elif isinstance(files, dict):
        first = next(iter(files.values()), {})
        if isinstance(first, dict):
            url = first.get('url') or first.get('src')

    if not url:
        url = _confirm_uploaded(filename, len(eps_bytes))
        if not url:
            return None, 'auth'
        return url, 'ok'

    if url.startswith('//'):
        url = 'https:' + url
    _remember_collection_base(url, filename)
    return url, 'ok'


def _asy_path_from_url(url):
    """CDN URL -> the server-side path asy needs.

    http://cdn.artofproblemsolving.com/school/crypt/00540-<hash>/files/x.eps
      ->  /var/www/cdn/school/crypt/00540-<hash>/files/x.eps
    """
    m = re.match(r'https?://([^/]+)(/.*)$', url)
    if not m:
        raise UploadError(f'Unrecognised upload URL from AoPS: {url}')
    host, path = m.group(1), m.group(2)
    if not any(host.endswith(h) for h in AOPS_CDN_HOSTS):
        raise UploadError(f'Upload URL is not on an AoPS host: {url}')
    return AOPS_CDN_LOCAL + path


def _safe_stem(name):
    stem = os.path.splitext(os.path.basename(name or ''))[0]
    stem = re.sub(r'[^A-Za-z0-9_-]+', '_', stem).strip('_')[:32]
    return stem or 'image'


def _prime_eps_cache(asy_path, eps_bytes, project_root):
    """Rasterise the EPS into comparison/eps_cache/ under the path we just
    created, so the very next render draws the image without a CDN round-trip
    (the CDN can lag a freshly uploaded file by a few seconds)."""
    import hashlib
    gs = _find_ghostscript()
    if not gs:
        return
    cache_dir = os.path.join(project_root, 'comparison', 'eps_cache')
    index_file = os.path.join(cache_dir, 'index.json')
    os.makedirs(cache_dir, exist_ok=True)

    digest = hashlib.sha1(asy_path.encode('utf-8')).hexdigest()[:12]
    base = re.sub(r'[^A-Za-z0-9_-]', '_',
                  os.path.splitext(os.path.basename(asy_path))[0])[:40] or 'eps'
    fname = f'{digest}__{base}.png'

    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'in.eps')
        with open(src, 'wb') as f:
            f.write(eps_bytes)
        png_path = os.path.join(cache_dir, fname)
        r = subprocess.run([gs, '-dNOPAUSE', '-dBATCH', '-dSAFER',
                            '-sDEVICE=png16m', '-r150', '-dEPSCrop',
                            f'-sOutputFile={png_path}', src],
                           capture_output=True, timeout=60)
        if r.returncode != 0 or not os.path.exists(png_path):
            return

    w_bp, h_bp = _eps_boundingbox(eps_bytes)
    try:
        with open(index_file, 'r', encoding='utf-8') as f:
            index = json.load(f)
    except Exception:
        index = {}
    index[asy_path] = {'fname': fname, 'width_bp': w_bp, 'height_bp': h_bp}
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump({k: index[k] for k in sorted(index)}, f, indent=2)

    with open(os.path.join(cache_dir, fname), 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def graphic_line(asy_path, w_bp, h_bp, size_cm=DEFAULT_SIZE_CM):
    """The line HiTeXeR drops into the editor.

    An explicit width/height keeps a 1000 px photo from arriving 1000 bp wide;
    constraining the *longer* side means portrait and landscape images both land
    at a comparable visual size.  The user edits (0,0) to move it.
    """
    dim = 'width' if w_bp >= h_bp else 'height'
    cm = ('%g' % round(size_cm, 3))
    return f'label(graphic("{asy_path}", "{dim}={cm}cm"), (0,0));'


def upload_image(data, filename, project_root=None):
    """Convert, upload, and describe the result.

    Returns {path, url, filename, width_bp, height_bp, png_b64, asy}.
    """
    if not data:
        raise UploadError('No image data received.')

    eps, w_bp, h_bp = to_eps(data, filename)

    # The collection also holds real course files, and an upload silently
    # overwrites a same-named one. With AoPS's file listing broken we can't ask
    # what's already there, so the name carries an htx_ prefix, a timestamp and
    # random bytes and simply never collides.
    stamp = time.strftime('%Y%m%d-%H%M%S')
    tag = base64.b32encode(os.urandom(5)).decode('ascii').rstrip('=').lower()
    upload_name = f'htx_{stamp}_{tag}_{_safe_stem(filename)}.eps'

    cookie_header = _load_cached_cookies()
    url = status = None
    if cookie_header:
        url, status = _post_upload(cookie_header, upload_name, eps)
    if status != 'ok':
        cookie_header = _cookies_from_browser()
        url, status = _post_upload(cookie_header, upload_name, eps)
    if status == 'exists':
        upload_name = f'htx_{stamp}_{tag}x_{_safe_stem(filename)}.eps'
        url, status = _post_upload(cookie_header, upload_name, eps)
    if status != 'ok' or not url:
        raise UploadError('AoPS did not accept the upload.')

    asy_path = _asy_path_from_url(url)

    # A PNG copy next to the EPS lets the hosted HiTeXeR page, which has no
    # server to rasterize EPS, show the picture (see htx-aops-upload.js).
    if os.path.splitext(filename or '')[1].lower() in RASTER_EXTS | {'.svg'}:
        try:
            png, _size = _normalise_raster(data)
            _post_upload(cookie_header, upload_name[:-4] + '.png', png, 'image/png')
        except Exception:
            pass

    png_b64 = None
    if project_root:
        try:
            png_b64 = _prime_eps_cache(asy_path, eps, project_root)
        except Exception:
            png_b64 = None

    return {
        'path': asy_path,
        'url': url,
        'filename': upload_name,
        'width_bp': w_bp,
        'height_bp': h_bp,
        'png_b64': png_b64,
        'asy': graphic_line(asy_path, w_bp, h_bp),
    }


if __name__ == '__main__':
    # CLI form, also used by fix-server.js so the :7842 editor can upload
    # without server.py running:
    #     python aops_upload.py <image-file> [--with-png] [--name <original>]
    args = [a for a in sys.argv[1:]]
    if not args:
        print('usage: python aops_upload.py <image-file> [--with-png] [--name <original-name>]')
        raise SystemExit(2)

    with_png = '--with-png' in args
    args = [a for a in args if a != '--with-png']
    name = None
    if '--name' in args:
        i = args.index('--name')
        name = args[i + 1] if i + 1 < len(args) else None
        del args[i:i + 2]

    src = args[0]
    with open(src, 'rb') as f:
        blob = f.read()
    try:
        info = upload_image(blob, name or os.path.basename(src),
                            project_root=os.path.dirname(os.path.abspath(__file__)))
    except Exception as e:
        print(json.dumps({'error': str(e) or e.__class__.__name__}))
        raise SystemExit(1)
    if not with_png:
        info = {k: v for k, v in info.items() if k != 'png_b64'}
    print(json.dumps(info, indent=None if with_png else 2))
