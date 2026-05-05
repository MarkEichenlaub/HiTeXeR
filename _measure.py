from PIL import Image
import numpy as np

def analyze(path, label):
    im = Image.open(path).convert('RGB')
    a = np.array(im)
    h, w = a.shape[:2]
    print(f"\n=== {label}: {w}x{h} (aspect {w/h:.3f}) ===")
    gray = a.mean(axis=2)

    # Use lower threshold to catch faint gridlines
    threshold = 240
    dark = (gray < threshold).astype(int)

    col_dark = dark.sum(axis=0)
    row_dark = dark.sum(axis=1)

    # Find vertical/horizontal gridlines via local maxima of column/row counts
    # The plot area is bounded by where gridlines appear consistently.

    # More robust: find columns with high gridline density
    # First find where horizontal gridlines exist (rows with darkness > 30% of width)
    grid_rows = [y for y in range(h) if row_dark[y] > w * 0.30]
    grid_cols = [x for x in range(w) if col_dark[x] > h * 0.30]

    if grid_rows and grid_cols:
        plot_top = grid_rows[0]
        plot_bot = grid_rows[-1]
        plot_lft = grid_cols[0]
        plot_rgt = grid_cols[-1]
        plot_w = plot_rgt - plot_lft
        plot_h = plot_bot - plot_top
        print(f"  plot bbox: x=[{plot_lft},{plot_rgt}] y=[{plot_top},{plot_bot}]")
        print(f"  plot area: {plot_w} x {plot_h} (aspect {plot_w/plot_h:.3f})")
        # 10 horizontal cells (0-1000 step 100), 11 vertical (0-1.1e8 step 1e7) approx
        # Actually: x goes 0 to 1000 (11 lines, 10 cells); y goes 0 to ~1.2e8 (12-13 lines)
        cw10 = plot_w / 10
        ch11 = plot_h / 11
        ch12 = plot_h / 12
        print(f"  cell (10x11): {cw10:.1f} x {ch11:.1f} (aspect {cw10/ch11:.3f})")
        print(f"  cell (10x12): {cw10:.1f} x {ch12:.1f} (aspect {cw10/ch12:.3f})")

analyze('comparison/texer_pngs/03900.png', 'TEXER')
analyze('_t3900.png', 'HITEXER')
