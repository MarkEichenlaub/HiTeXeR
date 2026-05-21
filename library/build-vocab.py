"""Draft a concept/feature vocabulary for the diagram library.

Phase-2 inputs:
  - library/manifest.json  -> lesson_title (385 unique labels in our corpus)
  - hand-curated FEATURE_TAGS below for visual-style tags Haiku will pick

Outputs library/vocab.json:
  {
    "concept_tags": ["circumcircle", "free_body_diagram", "riemann_sum", ...],
    "feature_tags": ["function_graph", "labeled_point", ...],
    "_meta": {...}
  }

This is a *seed* — it will get refined after a Haiku open-ended sampling
pass. Hand-curate vocab.json after this script writes it; the batch
tagger will pin Haiku to whatever's in vocab.json at run time.
"""

import os
import sys
import re
import json
import collections


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(REPO_ROOT, 'library', 'manifest.json')
OUT_PATH = os.path.join(REPO_ROOT, 'library', 'vocab.json')


# ---------------------------------------------------------------------------
# Title cleaning
# ---------------------------------------------------------------------------

# Strip leading "01:", "Lesson 12:", "WL17:", "Week 3 - X". Require either
# a colon, or space-dash-space; otherwise "3-D Geometry" would lose its "3-"
# and collapse into "D Geometry".
LEADING_NUM_RE = re.compile(
    r'^\s*(?:Lesson|Week|Day|Unit|Chapter|WL|MCH|PW\d*|FMA|MS\d*|I2P|REL|SP)?'
    r'\s*\d+(?:\.\d+)?(?:\s*:\s*|\s+-\s+|\s+–\s+)',
    re.IGNORECASE,
)

# Strip trailing "(New)", "(new)", "(Old)", "(v2)", "(Part 2)", etc.
TRAILING_PAREN_RE = re.compile(
    r'\s*\((?:new|old|v\d+|part \d+|continued|cont\.?|revised|updated)\)\s*$',
    re.IGNORECASE,
)

# Throwaway/utility titles to skip entirely
SKIP_PATTERNS = [
    re.compile(r'^(Course\s+Review|Review|Extra\s+Problems(?:\s+Day)?|EC|'
               r'Week\s+\d+\s+EC|Some\s+Harder\s+Problems|Practice\s+Day|'
               r'Final|Midterm)\s*$', re.IGNORECASE),
]


def clean_title(t):
    if not t:
        return None
    s = t.strip()
    s = LEADING_NUM_RE.sub('', s)
    s = TRAILING_PAREN_RE.sub('', s)
    s = s.strip(' :.-')
    if not s:
        return None
    for rx in SKIP_PATTERNS:
        if rx.match(s):
            return None
    return s


# ---------------------------------------------------------------------------
# Split compound titles into atomic concepts
# ---------------------------------------------------------------------------

# Split on commas and " and " — but be careful with phrases like "Chain Rule
# and Implicit Differentiation" where both halves are real concepts. After
# split, normalize and let the user prune.
# Order matters: longer alternatives ", and " must come before ", " so the
# leftmost match picks them up.
SPLIT_RE = re.compile(
    r'\s*,\s*and\s+|\s*,\s*or\s+|\s*,\s*|\s+and\s+|\s+&\s+',
    re.IGNORECASE,
)

# Lesson-title fragments that aren't actual concepts (administrivia,
# generic catch-alls). Filtered from the concept_tags output.
NOISE_SLUGS = {
    'more_problems', 'problems', 'sandbox', 'reading_summary',
    'course_review', 'review', 'final', 'midterm', 'practice', 'practice_day',
    'extra_problems', 'extra_problems_day', 'final_exam', 'project',
    'mock_exam', 'mock_test', 'discussion', 'discussion_day',
    'wrap_up', 'wrap-up', 'wrap', 'recap', 'summary',
    'introduction', 'intro', 'getting_started',
    'more_geometry_with_trigonometry',
    'more_derivative_applications',
    'some_harder_problems',
    'wrestling_with_the_unfamilar',
    'week_12_ec', 'ec',
}

# Lowercase + remove non-alphanumeric for the slug (used as the tag key)
def slugify(s):
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", '_', s)
    s = s.strip('_')
    return s


def split_to_concepts(title):
    """Yield (slug, label) pairs for each atomic concept in a title."""
    if not title:
        return
    parts = SPLIT_RE.split(title)
    for p in parts:
        p = p.strip()
        if not p:
            continue
        # Drop the leading "the/a/an"
        p2 = re.sub(r'^(the|a|an)\s+', '', p, flags=re.IGNORECASE)
        slug = slugify(p2)
        if not slug or len(slug) > 50:
            continue
        yield (slug, p2)


# ---------------------------------------------------------------------------
# Hand-curated visual feature tags (Haiku picks from this list for visual
# style, not for math concept). These are NOT derivable from lesson titles
# and are the same across the whole corpus.
# ---------------------------------------------------------------------------

FEATURE_TAGS = [
    # Geometric shapes that show up as drawings
    "triangle", "quadrilateral", "rectangle", "square", "trapezoid",
    "parallelogram", "rhombus", "polygon", "regular_polygon", "pentagon",
    "hexagon", "circle", "ellipse", "sector", "annulus", "arc",
    "line_segment", "ray", "line", "angle_mark",

    # Drawing decorations
    "labeled_point", "labeled_segment", "labeled_angle", "right_angle_mark",
    "tick_mark", "dashed_line", "dotted_line", "shaded_region",
    "fill_region", "hatched_region",

    # Plot styles
    "function_graph", "parametric_curve", "polar_curve", "slope_field",
    "vector_field", "contour_plot", "histogram", "bar_chart",
    "number_line", "coordinate_grid", "lattice_points",

    # Vectors / arrows
    "arrow_vector", "directed_arrow", "double_arrow", "tangent_vector",

    # Axes
    "axes_with_arrows", "ticked_axes", "single_axis",

    # Physics-specific visuals
    "free_body_diagram", "force_arrow", "velocity_arrow",
    "spring", "pulley", "inclined_plane", "block_on_surface",
    "circuit_diagram", "ray_diagram_optics", "lens_or_mirror",
    "pendulum", "rotational_axis",

    # 3D
    "3d_axes", "wireframe_solid", "shaded_solid", "surface_plot",
    "prism", "pyramid", "sphere", "cylinder", "cone", "torus",

    # Graph theory
    "graph_nodes_edges", "tree_structure", "directed_graph",
    "weighted_graph", "bipartite_graph",

    # Composite / picture
    "side_by_side_panels", "before_after_diagram",
    "table_or_grid_layout",

    # Style notes
    "monochrome", "multi_color", "uses_external_image",
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not os.path.exists(MANIFEST_PATH):
        sys.exit(f"ERROR: {MANIFEST_PATH} not found")

    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    concept_counts = collections.Counter()
    concept_labels = {}     # slug -> canonical label (longest seen)
    raw_titles = collections.Counter()

    for r in manifest['records']:
        cleaned = clean_title(r.get('lesson_title'))
        if not cleaned:
            continue
        raw_titles[cleaned] += 1
        for slug, label in split_to_concepts(cleaned):
            concept_counts[slug] += 1
            if slug not in concept_labels or len(label) > len(concept_labels[slug]):
                concept_labels[slug] = label

    # Filter: keep concepts that appear in at least 3 records (signal) and
    # aren't in the administrivia blacklist.
    MIN_COUNT = 3
    kept = [(slug, concept_labels[slug], concept_counts[slug])
            for slug in concept_counts
            if concept_counts[slug] >= MIN_COUNT
            and slug not in NOISE_SLUGS]
    kept.sort(key=lambda x: (-x[2], x[0]))

    concept_tags = [{
        "slug": slug,
        "label": label,
        "count": n,  # how many records this concept hits via its lesson title
    } for slug, label, n in kept]

    vocab = {
        "_meta": {
            "version": 0,
            "source": "draft from lesson titles + hand-curated visual list",
            "min_count_threshold": MIN_COUNT,
            "n_unique_cleaned_titles": len(raw_titles),
            "n_records_with_title": sum(raw_titles.values()),
            "notes": (
                "Concept tags are seeded from AoPS lesson titles and need "
                "manual curation: merge near-duplicates, prune noise, add "
                "missing concepts that don't appear in titles "
                "(e.g. circumcenter, power_of_a_point, riemann_sum). "
                "Feature tags are the curated visual-style list and should "
                "be modified directly in build-vocab.py."
            ),
        },
        "concept_tags": concept_tags,
        "feature_tags": FEATURE_TAGS,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(vocab, f, indent=2, ensure_ascii=False)

    print(f"Wrote {OUT_PATH}")
    print(f"  concept_tags: {len(concept_tags)} (>= {MIN_COUNT} records)")
    print(f"  feature_tags: {len(FEATURE_TAGS)}")
    print(f"\nTop 30 concept candidates:")
    for slug, label, n in kept[:30]:
        print(f"  {n:5d}  {slug:35s}  {label}")
    print(f"\nLast 15 (low-count tail, candidates for pruning):")
    for slug, label, n in kept[-15:]:
        print(f"  {n:5d}  {slug:35s}  {label}")


if __name__ == '__main__':
    main()
