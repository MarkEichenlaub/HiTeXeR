"""Clean the seed vocab from build-vocab.py:

  - Drop administrivia / lesson-id slugs that aren't real concepts.
  - Merge near-duplicates into a canonical slug.
  - Add well-known concepts that don't appear in lesson titles.

Idempotent: reads library/vocab.json, writes the same file. Safe to re-run.
A backup is written to library/vocab.json.seed once.
"""
import json
import os
import shutil


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB_PATH = os.path.join(REPO_ROOT, 'library', 'vocab.json')
SEED_BACKUP = os.path.join(REPO_ROOT, 'library', 'vocab.json.seed')


# Slugs to drop entirely (administrivia, lesson identifiers, course codes,
# generic catch-alls).
DROP = {
    # generic catch-alls
    'geometry', 'problems', 'problem_solving', 'building', 'using_models',
    'measurement', 'continued', 'introduction', 'orientation',
    'communication_in_physics', 'data_analysis', 'general',
    # raw "More X" titles
    'more_problems', 'more_analytic_geometry', 'more_quadrilaterals',
    'more_functional_equations', 'more_derivative_applications',
    'more_geometry_with_trigonometry',
    # course IDs / lesson identifiers that leaked through cleaning
    'wl17_3d_geometry_part_1', 'lesson_6_aw', 'day_2', 'dw_l16_extra_material',
    'week_12_ec', 'ec', 'tstatic_equilibria',
    'practice_usapho_3_discussion', 'welcome_to_silver',
    # course review / final / etc
    'fundamentals_continued', 'construction_introduction', 'review',
    'course_review', 'final', 'midterm', 'mock_exam', 'mock_test',
    'getting_started', 'project',
    # cs-course specific lesson chapters that aren't math concepts per se
    'concurrency_problems', 'data_structures_i_stacks',
    'binary_search_i_the_technique', 'data_structures_ii_queues',
    'trees_i_arrays', 'trees_i_per_moo_tations', 'special_trees',
    'dynamic_programming_iii_on_graphs', 'standard_graphs',
    'linked_lists', 'queues', 'big_o',
    'complete_search', 'basic_recursion',
    # over-granular / mistyped
    'wrestling_with_the_unfamilar', 'fields',
}

# slug → canonical slug. When the source slug appears in the seed, its
# count rolls into the target and its row is dropped. Pre-existing target
# slugs survive with merged counts.
ALIAS = {
    # 3D Geometry vs 3-D Geometry
    '3_d_geometry': '3d_geometry',
    # "Introduction to X" → X
    'introduction_to_complex_numbers': 'complex_numbers',
    'introduction_to_3d_vectors': 'vectors_3d',
    # "Fundamentals: Similar Triangles" → similar_triangles
    'fundamentals_similar_triangles': 'similar_triangles',
    # Trig variants
    'graphing_trig': 'graphing_trig_functions',
    # Statics
    'tstatic_equilibria': 'static_equilibrium',
    'static_equilibria': 'static_equilibrium',
    # quadratic
    'graphing_parabolas': 'parabolas',
    # Conservation laws variants
    'conservation_laws': 'conservation_of_energy',
}

# Slugs to ADD that are well-known concepts likely missing from lesson titles.
# Each adds with count=0 so Haiku can still pick them.
ADDITIONS_CONCEPT = [
    # Geometry — triangle centers and related
    ("circumcenter", "Circumcenter"),
    ("incenter", "Incenter"),
    ("centroid", "Centroid"),
    ("orthocenter", "Orthocenter"),
    ("euler_line", "Euler Line"),
    ("nine_point_circle", "Nine-Point Circle"),
    ("radical_axis", "Radical Axis"),
    ("homothety", "Homothety"),
    ("inversion_geometry", "Inversion (Geometry)"),
    ("ptolemy_theorem", "Ptolemy's Theorem"),
    ("stewart_theorem", "Stewart's Theorem"),
    ("menelaus_theorem", "Menelaus's Theorem"),
    ("ceva_theorem", "Ceva's Theorem"),
    ("apollonius_circle", "Apollonius Circle"),
    ("morley_theorem", "Morley's Theorem"),
    ("simson_line", "Simson Line"),
    ("vectors_3d", "3D Vectors"),
    # Calculus
    ("riemann_sum", "Riemann Sum"),
    ("epsilon_delta_definition", "Epsilon-Delta Definition"),
    ("mean_value_theorem", "Mean Value Theorem"),
    ("integration_by_parts", "Integration by Parts"),
    ("u_substitution", "u-Substitution"),
    ("trapezoidal_rule", "Trapezoidal Rule"),
    ("simpsons_rule", "Simpson's Rule"),
    ("newtons_method", "Newton's Method"),
    ("partial_derivative", "Partial Derivative"),
    ("gradient_vector_field", "Gradient Vector Field"),
    ("level_curve", "Level Curve"),
    # Physics — mechanics
    ("free_body_diagram", "Free-Body Diagram"),
    ("friction", "Friction"),
    ("inclined_plane_problem", "Inclined-Plane Problem"),
    ("projectile_motion", "Projectile Motion"),
    ("simple_harmonic_motion", "Simple Harmonic Motion"),
    ("pendulum_motion", "Pendulum Motion"),
    ("rolling_motion", "Rolling Motion"),
    ("center_of_mass", "Center of Mass"),
    ("moment_of_inertia", "Moment of Inertia"),
    ("torque", "Torque"),
    ("normal_force", "Normal Force"),
    ("tension", "Tension"),
    # Physics — energy / momentum
    ("conservation_of_energy", "Conservation of Energy"),
    ("conservation_of_momentum", "Conservation of Momentum"),
    ("elastic_collision", "Elastic Collision"),
    ("inelastic_collision", "Inelastic Collision"),
    # Physics — fields / EM / optics
    ("electric_field", "Electric Field"),
    ("magnetic_field", "Magnetic Field"),
    ("electric_potential", "Electric Potential"),
    ("circuit_kirchhoff", "Kirchhoff Circuit"),
    ("ray_optics", "Ray Optics"),
    ("lens_equation", "Lens Equation"),
    ("snells_law", "Snell's Law"),
    ("interference_pattern", "Interference Pattern"),
    ("phasor_diagram", "Phasor Diagram"),
    # Physics — waves / thermo / relativity
    ("standing_wave", "Standing Wave"),
    ("doppler_effect", "Doppler Effect"),
    ("carnot_cycle", "Carnot Cycle"),
    ("pv_diagram", "PV Diagram"),
    ("spacetime_diagram", "Spacetime Diagram"),
    # Number theory
    ("chinese_remainder_theorem", "Chinese Remainder Theorem"),
    ("fermats_little_theorem", "Fermat's Little Theorem"),
    ("euler_totient", "Euler's Totient Function"),
    ("quadratic_residue", "Quadratic Residue"),
    ("modular_arithmetic", "Modular Arithmetic"),
    # Combinatorics
    ("inclusion_exclusion", "Inclusion-Exclusion"),
    ("bijection_argument", "Bijection Argument"),
    ("recurrence_relation", "Recurrence Relation"),
    # Algebra
    ("vieta_formulas", "Vieta's Formulas"),
    ("partial_fractions", "Partial Fractions"),
    ("synthetic_division", "Synthetic Division"),
    # Graph theory specifics
    ("eulerian_circuit", "Eulerian Circuit"),
    ("hamiltonian_path", "Hamiltonian Path"),
    ("planar_graph", "Planar Graph"),
    ("spanning_tree", "Spanning Tree"),
    # Shape/structure slugs that legitimately belong in both vocabs. The 50-
    # record sample showed Haiku judging these as concepts as well as features
    # (e.g. "lattice_points" is a real combinatorial concept). Adding them to
    # concept_tags eliminates cross-bucket false-positive hallucinations.
    ("rectangle", "Rectangle"),
    ("hexagon", "Hexagon"),
    ("pentagon", "Pentagon"),
    ("trapezoid", "Trapezoid"),
    ("parallelogram", "Parallelogram"),
    ("rhombus", "Rhombus"),
    ("ellipse", "Ellipse"),
    ("lattice_points", "Lattice Points"),
    ("tree_structure", "Tree Structure"),
    ("directed_graph", "Directed Graph"),
    ("bipartite_graph", "Bipartite Graph"),
    ("weighted_graph", "Weighted Graph"),
]


def main():
    with open(VOCAB_PATH, 'r', encoding='utf-8') as f:
        vocab = json.load(f)

    if not os.path.exists(SEED_BACKUP):
        shutil.copy2(VOCAB_PATH, SEED_BACKUP)
        print(f"Backed up seed vocab to {SEED_BACKUP}")

    seed_count = len(vocab['concept_tags'])

    # Build a map slug -> entry from the existing tags
    by_slug = {t['slug']: dict(t) for t in vocab['concept_tags']}

    # 1) Apply aliases: roll counts into canonical, drop the source.
    n_merged = 0
    for src, dst in ALIAS.items():
        if src not in by_slug:
            continue
        src_entry = by_slug.pop(src)
        if dst not in by_slug:
            # The target doesn't exist yet: create it using source's label/count.
            by_slug[dst] = {
                'slug': dst,
                'label': src_entry.get('label', dst.replace('_', ' ').title()),
                'count': src_entry.get('count', 0),
            }
        else:
            by_slug[dst]['count'] = (
                by_slug[dst].get('count', 0) + src_entry.get('count', 0)
            )
        n_merged += 1

    # 2) Drop blacklist
    n_dropped = 0
    for slug in list(by_slug):
        if slug in DROP:
            by_slug.pop(slug)
            n_dropped += 1

    # 3) Add missing well-known concepts (count=0 — Haiku can still pick them)
    n_added = 0
    for slug, label in ADDITIONS_CONCEPT:
        if slug not in by_slug:
            by_slug[slug] = {'slug': slug, 'label': label, 'count': 0}
            n_added += 1

    # 4) Sort by descending count, then slug
    kept = sorted(by_slug.values(),
                  key=lambda t: (-t.get('count', 0), t['slug']))

    vocab['concept_tags'] = kept
    vocab['_meta']['version'] = 1
    vocab['_meta']['cleaned'] = True

    with open(VOCAB_PATH, 'w', encoding='utf-8') as f:
        json.dump(vocab, f, indent=2, ensure_ascii=False)

    print(f"\nVocab cleanup")
    print(f"  seed concept count:  {seed_count}")
    print(f"  merged:              {n_merged} aliases")
    print(f"  dropped:             {n_dropped} blacklisted")
    print(f"  added:               {n_added} new concepts")
    print(f"  final concept count: {len(kept)}")
    print(f"  feature count:       {len(vocab['feature_tags'])}")


if __name__ == '__main__':
    main()
