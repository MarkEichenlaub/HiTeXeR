"""Batch-tag the diagram library via the Anthropic Messages Batches API.

For each record in library/manifest.json, this sends Haiku 4.5 a multimodal
request: the WebP thumbnail + the .asy source + surrounding context.
Haiku replies with strict-JSON tags drawn from library/vocab.json.

Modes:
  prepare   Build batch_requests.jsonl and print a cost estimate. No API call.
  estimate  Same as prepare but doesn't write the JSONL (dry-run).
  submit    Submit the prepared JSONL to the Batches API; save the batch_id.
  poll      Print live status of the submitted batch.
  merge     Once the batch is finished, pull results and merge tags into
            manifest.json (under record.tags).

State is persisted in library/.batch_state.json so submit/poll/merge can
be invoked across sessions without losing the batch id.

Pricing model used for the cost estimate (Haiku 4.5, with 50% batch discount):
  fresh input    $0.50 / MTok
  cache read     $0.05 / MTok
  cache write    $0.625 / MTok  (5-min ephemeral)
  output         $2.50 / MTok

Env: ANTHROPIC_API_KEY
"""
import argparse
import base64
import concurrent.futures
import json
import os
import subprocess
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB_DIR = os.path.join(REPO_ROOT, 'library')
MANIFEST_PATH = os.path.join(LIB_DIR, 'manifest.json')
VOCAB_PATH = os.path.join(LIB_DIR, 'vocab.json')
JSONL_PATH = os.path.join(LIB_DIR, 'batch_requests.jsonl')
STATE_PATH = os.path.join(LIB_DIR, '.batch_state.json')

MODEL = 'claude-haiku-4-5-20251001'

# Cap the .asy source we send so a runaway 1000-line script doesn't blow up
# the per-request token budget. 99% of corpus is under 60 lines.
ASY_MAX_CHARS = 4000


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def make_system_block(vocab):
    """The cacheable system message: task description + the full tag vocab."""
    concept_lines = '\n'.join(
        f"  {t['slug']}: {t['label']}"
        for t in vocab['concept_tags']
    )
    feature_lines = '\n'.join(f"  {t}" for t in vocab['feature_tags'])

    text = (
        "You are tagging Asymptote diagrams from the Art of Problem Solving "
        "curriculum. You will be given a rendered image, the Asymptote source, "
        "and a brief snippet of surrounding course text. Your job is to assign "
        "tags so students and authors can search the library.\n\n"
        "RULES\n"
        "  - concept_tags MUST be slugs drawn from the CONCEPT VOCAB below.\n"
        "  - feature_tags MUST be slugs drawn from the FEATURE VOCAB below.\n"
        "  - Pick up to 5 concept_tags (the mathematical/physics ideas the "
        "diagram illustrates). Fewer is fine; do not pad.\n"
        "  - Pick up to 6 feature_tags (visual / structural features actually "
        "visible in the image). Fewer is fine.\n"
        "  - subject_line: one short factual sentence describing the diagram "
        "(e.g. \"Right triangle ABC with circumscribed circle and labeled "
        "vertices.\"). Under 25 words.\n"
        "  - confidence: a number in [0,1] reflecting how confident you are.\n"
        "  - If the image is missing, illegible, or unrelated to the source, "
        "set confidence below 0.3 and tag what you can from source alone.\n"
        "  - Respond with ONLY a valid JSON object. No prose, no markdown, no "
        "code fences.\n\n"
        "CONCEPT VOCAB (use these exact slugs):\n" + concept_lines + "\n\n"
        "FEATURE VOCAB (use these exact slugs):\n" + feature_lines + "\n\n"
        "Required JSON schema:\n"
        "{\n"
        '  "concept_tags": [string, ...],\n'
        '  "feature_tags": [string, ...],\n'
        '  "subject_line": string,\n'
        '  "confidence": number\n'
        "}"
    )
    return {
        "type": "text",
        "text": text,
        "cache_control": {"type": "ephemeral"},
    }


def _resolve_thumb_path(rec):
    """Return absolute thumb path or None. Falls back to id-based path so the
    script works mid-pipeline before make-thumbs has rewritten manifest.json."""
    p = rec.get('thumb_path')
    if p:
        abs_p = os.path.join(REPO_ROOT, p)
        if os.path.exists(abs_p):
            return abs_p
    # Fallback: try library/thumbs/<id>.webp directly
    fallback = os.path.join(REPO_ROOT, 'library', 'thumbs', rec['id'] + '.webp')
    if os.path.exists(fallback):
        return fallback
    return None


def load_image_b64(rec):
    """Return (media_type, base64-string) for the record's thumbnail, or None."""
    abs_p = _resolve_thumb_path(rec)
    if not abs_p:
        return None
    with open(abs_p, 'rb') as f:
        data = f.read()
    return ('image/webp', base64.standard_b64encode(data).decode('ascii'))


def load_asy_source(rec):
    abs_p = os.path.join(REPO_ROOT, rec['asy_path'])
    if not os.path.exists(abs_p):
        return None
    try:
        with open(abs_p, 'r', encoding='utf-8', errors='replace') as f:
            src = f.read()
    except OSError:
        return None
    if len(src) > ASY_MAX_CHARS:
        src = src[:ASY_MAX_CHARS] + '\n... [truncated]'
    return src


def make_user_content(rec):
    """Build the per-record user-message content (image + source + context)."""
    parts = []
    img = load_image_b64(rec)
    if img:
        media_type, data = img
        parts.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": data,
            },
        })

    asy = load_asy_source(rec) or '(source not on disk)'
    ctx_before = (rec.get('context_before') or '').strip()
    ctx_after = (rec.get('context_after') or '').strip()
    course = rec.get('collection_name') or f"Collection {rec.get('collection_id')}"
    lesson = rec.get('lesson_title') or '(no lesson title)'

    text = (
        f"Course: {course}\n"
        f"Lesson: {lesson}\n"
        f"\nSurrounding course text (before):\n{ctx_before or '(none)'}\n"
        f"\nSurrounding course text (after):\n{ctx_after or '(none)'}\n"
        f"\nAsymptote source:\n{asy}"
    )
    parts.append({"type": "text", "text": text})
    return parts


def make_request_for_record(rec, system_block, max_tokens):
    """Return one Batches request item: {custom_id, params}."""
    return {
        "custom_id": rec['id'],
        "params": {
            "model": MODEL,
            "max_tokens": max_tokens,
            "system": [system_block],
            "messages": [
                {"role": "user", "content": make_user_content(rec)},
            ],
        },
    }


# ---------------------------------------------------------------------------
# Token / cost estimation
# ---------------------------------------------------------------------------

# Rough token estimates — good enough for budgeting, not for billing.
def approx_text_tokens(s):
    return max(1, len(s) // 4)


def approx_image_tokens(media_type, byte_count):
    # Anthropic charges by image area; a 320 px WebP averages ~1.2 KB; the
    # Messages API token approximation is roughly (W*H)/750. Our thumbs are
    # at most 320x320 = 102400 px / 750 ≈ 140 tokens for full square. Real
    # images are smaller. Use a flat 200-token estimate per image.
    del media_type, byte_count
    return 200


def estimate_per_record_tokens(rec, system_text):
    fresh = 0
    fresh += approx_text_tokens(
        (rec.get('context_before') or '') + (rec.get('context_after') or '')
    )
    asy = load_asy_source(rec)
    if asy:
        fresh += approx_text_tokens(asy)
    fresh += approx_text_tokens((rec.get('collection_name') or '') + (rec.get('lesson_title') or ''))
    fresh += 80  # user wrapper boilerplate
    img = load_image_b64(rec)
    if img:
        fresh += approx_image_tokens(*img)
    cached = approx_text_tokens(system_text)
    return cached, fresh


def cost_estimate(records, vocab):
    """Return a dict with token totals and dollar cost in batch mode."""
    sysblock = make_system_block(vocab)
    sys_text = sysblock['text']
    cached_tok = approx_text_tokens(sys_text)

    n = len(records)
    fresh_total = 0
    img_count = 0
    for r in records:
        _, fresh = estimate_per_record_tokens(r, sys_text)
        fresh_total += fresh
        if _resolve_thumb_path(r):
            img_count += 1

    avg_output = 100

    # Pricing (batch, USD per MTok)
    P_FRESH = 0.50
    P_CACHE_READ = 0.05
    P_CACHE_WRITE = 0.625
    P_OUT = 2.50

    cache_write_cost = cached_tok * P_CACHE_WRITE / 1e6
    cache_read_cost = n * cached_tok * P_CACHE_READ / 1e6
    fresh_cost = fresh_total * P_FRESH / 1e6
    output_cost = n * avg_output * P_OUT / 1e6
    total = cache_write_cost + cache_read_cost + fresh_cost + output_cost

    return {
        "n_records": n,
        "n_with_image": img_count,
        "cached_tokens_per_request": cached_tok,
        "fresh_tokens_total": fresh_total,
        "fresh_tokens_avg": fresh_total / max(1, n),
        "estimated_output_tokens_avg": avg_output,
        "cost_breakdown_usd": {
            "cache_write": round(cache_write_cost, 4),
            "cache_read": round(cache_read_cost, 4),
            "fresh_input": round(fresh_cost, 4),
            "output": round(output_cost, 4),
            "total": round(total, 2),
        },
    }


# ---------------------------------------------------------------------------
# Mode handlers
# ---------------------------------------------------------------------------

def _load_data():
    if not os.path.exists(MANIFEST_PATH):
        sys.exit(f"ERROR: {MANIFEST_PATH} not found. Run build-manifest.py.")
    if not os.path.exists(VOCAB_PATH):
        sys.exit(f"ERROR: {VOCAB_PATH} not found. Run build-vocab.py.")
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    with open(VOCAB_PATH, 'r', encoding='utf-8') as f:
        vocab = json.load(f)
    return manifest, vocab


def cmd_prepare(args, write_jsonl=True):
    manifest, vocab = _load_data()
    records = manifest['records']
    if args.limit:
        records = records[:args.limit]
        print(f"NOTE: --limit {args.limit} applied; only first {len(records)} records.")

    sysblock = make_system_block(vocab)
    print(f"\nConcept vocab: {len(vocab['concept_tags'])} tags")
    print(f"Feature vocab: {len(vocab['feature_tags'])} tags")

    if write_jsonl:
        with open(JSONL_PATH, 'w', encoding='utf-8') as f:
            written = 0
            skipped_no_asy = 0
            for r in records:
                if not load_asy_source(r):
                    skipped_no_asy += 1
                    continue
                req = make_request_for_record(r, sysblock, args.max_tokens)
                f.write(json.dumps(req, ensure_ascii=False) + '\n')
                written += 1
        print(f"\nWrote {written} requests to {JSONL_PATH}")
        if skipped_no_asy:
            print(f"  (skipped {skipped_no_asy} records with no .asy file)")

    print("\n--- Cost estimate (batch, Haiku 4.5) ---")
    est = cost_estimate(
        [r for r in records if load_asy_source(r)], vocab
    )
    print(json.dumps(est, indent=2))


def cmd_estimate(args):
    cmd_prepare(args, write_jsonl=False)


def cmd_submit(args):
    if not os.path.exists(JSONL_PATH):
        sys.exit(f"ERROR: {JSONL_PATH} not found. Run prepare first.")
    if not os.environ.get('ANTHROPIC_API_KEY'):
        sys.exit("ERROR: ANTHROPIC_API_KEY not set in env.")
    import anthropic
    client = anthropic.Anthropic()

    print(f"Loading requests from {JSONL_PATH}...")
    requests_data = []
    with open(JSONL_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                requests_data.append(json.loads(line))
    print(f"  {len(requests_data)} requests")

    if args.dry:
        print("Dry submit — not calling the API.")
        return

    print("Submitting to Anthropic Batches API...")
    batch = client.messages.batches.create(requests=requests_data)
    print(f"  batch id: {batch.id}")
    print(f"  status:   {batch.processing_status}")

    state = {
        "batch_id": batch.id,
        "submitted_at": time.time(),
        "n_requests": len(requests_data),
        "model": MODEL,
    }
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2)
    print(f"\nWrote {STATE_PATH}")


def _load_state():
    if not os.path.exists(STATE_PATH):
        sys.exit(f"ERROR: {STATE_PATH} not found. Run submit first.")
    with open(STATE_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def cmd_poll(args):
    state = _load_state()
    import anthropic
    client = anthropic.Anthropic()
    batch = client.messages.batches.retrieve(state['batch_id'])
    print(f"batch id: {batch.id}")
    print(f"status:   {batch.processing_status}")
    rc = batch.request_counts
    print(f"counts:   processing={rc.processing}  succeeded={rc.succeeded}  "
          f"errored={rc.errored}  canceled={rc.canceled}  expired={rc.expired}")
    if hasattr(batch, 'expires_at'):
        print(f"expires:  {batch.expires_at}")
    if hasattr(batch, 'ended_at') and batch.ended_at:
        print(f"ended:    {batch.ended_at}")


def cmd_merge(args):
    state = _load_state()
    import anthropic
    client = anthropic.Anthropic()
    batch = client.messages.batches.retrieve(state['batch_id'])
    if batch.processing_status != 'ended':
        sys.exit(f"Batch is not ended yet (status: {batch.processing_status}). "
                 f"Wait, then re-run merge.")

    print("Streaming results...")
    manifest, _ = _load_data()
    by_id = {r['id']: r for r in manifest['records']}

    n_ok = 0
    n_parse_fail = 0
    n_err = 0
    for result in client.messages.batches.results(state['batch_id']):
        cid = result.custom_id
        rec = by_id.get(cid)
        if not rec:
            continue
        if result.result.type != 'succeeded':
            rec['tags'] = {"_error": result.result.type}
            n_err += 1
            continue
        msg = result.result.message
        text = ''.join(c.text for c in msg.content if c.type == 'text')
        try:
            tags = json.loads(text)
            rec['tags'] = tags
            n_ok += 1
        except json.JSONDecodeError:
            rec['tags'] = {"_error": "json_parse", "_raw": text[:300]}
            n_parse_fail += 1

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"\nMerged into {MANIFEST_PATH}")
    print(f"  succeeded:    {n_ok}")
    print(f"  json failures: {n_parse_fail}")
    print(f"  api errors:   {n_err}")


def cmd_status(args):
    if not os.path.exists(STATE_PATH):
        print("No batch_state.json yet.")
        return
    with open(STATE_PATH, 'r', encoding='utf-8') as f:
        print(f.read())


# ---------------------------------------------------------------------------
# CLI mode — invoke `claude` subprocess per record. Bills against the user's
# Claude Code subscription instead of the Anthropic API key.
# ---------------------------------------------------------------------------

def _resolve_claude_cli():
    """Find the claude CLI binary the way server.py does."""
    candidates = [
        os.path.join(os.environ.get('APPDATA', ''), 'npm', 'claude.cmd'),
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'npm', 'claude.cmd'),
        'claude',
    ]
    for c in candidates:
        if c == 'claude':
            return c
        if c and os.path.exists(c):
            return c
    return 'claude'


def _build_cli_prompt(rec, vocab):
    """A self-contained prompt for one record. Claude Code is expected to
    Read the image at the absolute path, then output JSON."""
    img_abs = _resolve_thumb_path(rec) or ''
    asy = load_asy_source(rec) or '(source missing on disk)'

    concept_lines = '\n'.join(
        f"  {t['slug']}: {t['label']}" for t in vocab['concept_tags']
    )
    feature_lines = '\n'.join(f"  {t}" for t in vocab['feature_tags'])

    course = rec.get('collection_name') or f"Collection {rec.get('collection_id')}"
    lesson = rec.get('lesson_title') or '(no lesson title)'
    ctx_before = (rec.get('context_before') or '(none)').strip()
    ctx_after = (rec.get('context_after') or '(none)').strip()

    img_section = (
        f"Read the rendered diagram image at: {img_abs}\n"
        if img_abs else
        "(No rendered image is available for this record. Tag from source alone.)\n"
    )

    return (
        "You are tagging an Asymptote diagram from the Art of Problem Solving "
        "curriculum. Pick tags strictly from the vocabularies below and "
        "respond with ONLY a JSON object — no prose, no markdown, no code "
        "fences.\n\n"
        f"{img_section}"
        f"\nCourse: {course}\n"
        f"Lesson: {lesson}\n"
        f"\nSurrounding course text (before the diagram):\n{ctx_before}\n"
        f"\nSurrounding course text (after the diagram):\n{ctx_after}\n"
        f"\nAsymptote source:\n{asy}\n"
        f"\nCONCEPT VOCABULARY (use these exact slugs for concept_tags):\n"
        f"{concept_lines}\n"
        f"\nFEATURE VOCABULARY (use these exact slugs for feature_tags):\n"
        f"{feature_lines}\n"
        "\nRespond with EXACTLY a JSON object matching this schema:\n"
        "{\n"
        '  "concept_tags": [up to 5 concept-vocab slugs that the diagram '
        'illustrates],\n'
        '  "feature_tags": [up to 6 feature-vocab slugs visible in the image],\n'
        '  "subject_line": "one short factual sentence under 25 words",\n'
        '  "confidence": number in [0,1]\n'
        "}\n"
    )


def _run_one_cli(rec, vocab, claude_bin, max_turns, timeout):
    """Run the CLI for one record. Returns (rec_id, tags_dict_or_error)."""
    prompt = _build_cli_prompt(rec, vocab)
    try:
        proc = subprocess.run(
            [claude_bin, '-p', '--output-format', 'text',
             '--max-turns', str(max_turns)],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding='utf-8',
            errors='replace',
            cwd=REPO_ROOT,
        )
    except subprocess.TimeoutExpired:
        return rec['id'], {"_error": "timeout"}
    except OSError as e:
        return rec['id'], {"_error": f"spawn_failed: {e}"}

    if proc.returncode != 0:
        return rec['id'], {"_error": "nonzero_exit",
                           "_returncode": proc.returncode,
                           "_stderr": (proc.stderr or '')[:500]}

    out = (proc.stdout or '').strip()
    # Strip common wrappers Claude sometimes adds despite instructions
    if out.startswith('```'):
        # remove leading ```json / ``` and trailing ```
        out = out.split('\n', 1)[1] if '\n' in out else out
        if out.endswith('```'):
            out = out[:-3]
        out = out.strip()
    try:
        return rec['id'], json.loads(out)
    except json.JSONDecodeError as e:
        return rec['id'], {"_error": "json_parse",
                           "_msg": str(e),
                           "_raw": out[:500]}


def cmd_cli(args):
    manifest, vocab = _load_data()
    records = manifest['records']
    if args.skip_tagged:
        records = [r for r in records
                   if not (r.get('tags') and '_error' not in r['tags'])]
    if args.limit:
        records = records[:args.limit]
    print(f"Tagging {len(records)} records via Claude CLI "
          f"({args.workers} workers)...")

    claude_bin = _resolve_claude_cli()
    print(f"  claude binary: {claude_bin}")

    by_id = {r['id']: r for r in manifest['records']}
    done = 0
    save_every = max(10, args.workers * 2)
    t0 = time.time()

    consecutive_failures = 0
    aborted = False
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {
            ex.submit(_run_one_cli, r, vocab, claude_bin,
                      args.max_turns, args.timeout): r['id']
            for r in records
        }
        for fut in concurrent.futures.as_completed(futures):
            if aborted:
                # Don't process more results — but DON'T mutate the rec
                # with the error result either, so the next pass (with
                # --skip-tagged) will retry it.
                fut.cancel()
                continue
            rec_id, result = fut.result()
            rec = by_id.get(rec_id)
            ok = '_error' not in result
            if ok and rec is not None:
                rec['tags'] = result
                consecutive_failures = 0
            else:
                # Skip writing the error onto the record — we want to be
                # able to retry it next run. Just count the failure.
                consecutive_failures += 1
            done += 1
            elapsed = time.time() - t0
            rate = done / max(0.001, elapsed)
            mark = '+' if ok else 'x'
            print(f"  [{done:4d}/{len(records)}]  {mark}  {rec_id}  "
                  f"({rate:.2f}/s, elapsed {elapsed:.0f}s)")
            if done % save_every == 0:
                _write_manifest(manifest)
            # Circuit breaker: if N requests in a row fail, we're most
            # likely rate-limited / auth-broken. Stop spending time on
            # the rest of the queue instead of burning through it.
            if consecutive_failures >= args.fail_threshold:
                print(f"\nCIRCUIT BREAKER: {consecutive_failures} consecutive "
                      f"failures — aborting run. Re-run with --skip-tagged "
                      f"once the rate limit resets.")
                aborted = True
                # Cancel queued futures we haven't started yet.
                for f2 in futures:
                    if not f2.done():
                        f2.cancel()

    _write_manifest(manifest)

    n_ok = sum(1 for r in records if r.get('tags') and '_error' not in r['tags'])
    status = "ABORTED" if aborted else "Done."
    print(f"\n{status} {n_ok}/{len(records)} succeeded. "
          f"Manifest saved to {MANIFEST_PATH}")


def _write_manifest(manifest):
    """Atomic write: write to .tmp then os.replace so a crash mid-dump
    cannot truncate the canonical file. The earlier non-atomic version
    burned a full run when the python process died mid-write."""
    tmp = MANIFEST_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    os.replace(tmp, MANIFEST_PATH)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('command',
                    choices=['prepare', 'estimate', 'submit', 'poll',
                             'merge', 'status', 'cli'])
    ap.add_argument('--limit', type=int, default=0,
                    help='Cap request count (for smoke tests)')
    ap.add_argument('--max-tokens', type=int, default=400,
                    help='max_tokens passed to the model (API mode)')
    ap.add_argument('--dry', action='store_true',
                    help='submit without calling the API')
    ap.add_argument('--workers', type=int, default=4,
                    help='parallel claude.cmd processes for cli mode')
    ap.add_argument('--timeout', type=int, default=180,
                    help='per-request timeout in seconds (cli mode)')
    ap.add_argument('--max-turns', type=int, default=3,
                    help='max-turns flag to pass to claude (cli mode)')
    ap.add_argument('--skip-tagged', action='store_true',
                    help='skip records that already have non-error tags')
    ap.add_argument('--fail-threshold', type=int, default=30,
                    help='abort the run after this many consecutive CLI '
                         'failures (likely rate-limit/auth) instead of '
                         'burning through the rest of the queue')
    args = ap.parse_args()

    fn = {
        'prepare': cmd_prepare,
        'estimate': cmd_estimate,
        'submit': cmd_submit,
        'poll': cmd_poll,
        'merge': cmd_merge,
        'status': cmd_status,
        'cli': cmd_cli,
    }[args.command]
    fn(args)


if __name__ == '__main__':
    main()
