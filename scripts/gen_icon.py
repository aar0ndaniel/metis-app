from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_SVG = REPO_ROOT / "src" / "assets" / "logo-white.svg"
DEST_RESOURCES = REPO_ROOT / "resources" / "icon.ico"
DEST_BUILD = REPO_ROOT / "build" / "icon.ico"
DEST_RESOURCES_PNG = REPO_ROOT / "resources" / "icon.png"
DEST_BUILD_PNG = REPO_ROOT / "build" / "icon.png"
DEST_RESOURCES_ICNS = REPO_ROOT / "resources" / "icon.icns"
DEST_BUILD_ICNS = REPO_ROOT / "build" / "icon.icns"
TEMP_DIR = REPO_ROOT / "build" / ".icon-tmp"
OUTPUT_PNG = TEMP_DIR / "icon-render.png"
ICON_SIZE = 512

ALL_OUTPUTS = [
    DEST_RESOURCES,
    DEST_BUILD,
    DEST_RESOURCES_PNG,
    DEST_BUILD_PNG,
    DEST_RESOURCES_ICNS,
    DEST_BUILD_ICNS,
]


def all_icons_exist() -> bool:
    """Check if all icon output files already exist."""
    return all(p.exists() and p.stat().st_size > 0 for p in ALL_OUTPUTS)


def render_svg_to_png(svg_path: Path, png_path: Path) -> None:
    from PyQt5.QtCore import Qt
    from PyQt5.QtGui import QGuiApplication, QImage, QPainter, QColor, QPen, QBrush
    from PyQt5.QtSvg import QSvgRenderer
    from PyQt5.QtCore import QRectF

    app = QGuiApplication([])

    svg_bytes = svg_path.read_bytes()
    renderer = QSvgRenderer(svg_bytes)
    if not renderer.isValid():
        raise RuntimeError("Invalid SVG source")

    image = QImage(ICON_SIZE, ICON_SIZE, QImage.Format_ARGB32)
    image.fill(Qt.transparent)

    painter = QPainter(image)
    painter.setRenderHint(QPainter.Antialiasing)

    # Draw solid black background
    rect = QRectF(0, 0, ICON_SIZE, ICON_SIZE)

    # Rounded corners for the icon background
    radius = 90

    painter.setPen(Qt.NoPen)
    painter.setBrush(QBrush(QColor("#000000")))
    painter.drawRoundedRect(rect, radius, radius)

    # Render white logo in the center
    # Scale and center the logo
    logo_padding = 80
    logo_rect = QRectF(logo_padding, logo_padding, ICON_SIZE - 2*logo_padding, ICON_SIZE - 2*logo_padding)
    renderer.render(painter, logo_rect)

    painter.end()

    png_path.parent.mkdir(parents=True, exist_ok=True)
    if not image.save(str(png_path)):
        raise RuntimeError("Failed to save PNG")

    app.quit()


def png_to_ico(png_path: Path, ico_path: Path) -> None:
    from PIL import Image
    image = Image.open(png_path).convert("RGBA")
    ico_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


def png_to_icns(png_path: Path, icns_path: Path) -> None:
    from PIL import Image
    image = Image.open(png_path).convert("RGBA")
    icns_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        icns_path,
        format="ICNS",
        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512)],
    )


def main() -> int:
    # Skip regeneration if all icon files already exist
    if all_icons_exist():
        print("All icon files already exist, skipping generation.")
        for p in ALL_OUTPUTS:
            print(f"  ✓ {p}")
        return 0

    # Only import PyQt5 when we actually need to regenerate
    try:
        render_svg_to_png(SRC_SVG, OUTPUT_PNG)
    except ImportError as e:
        print(f"Warning: Cannot regenerate icons ({e}).")
        print("Install PyQt5 to regenerate icons from SVG, or commit pre-built icon files.")
        # Check if at least some outputs exist to allow a partial pass
        missing = [p for p in ALL_OUTPUTS if not p.exists()]
        if missing:
            print("Missing icon files:")
            for p in missing:
                print(f"  ✗ {p}")
            return 1
        print("All icon files exist despite import error, continuing.")
        return 0

    DEST_RESOURCES_PNG.write_bytes(OUTPUT_PNG.read_bytes())
    DEST_BUILD_PNG.write_bytes(OUTPUT_PNG.read_bytes())
    png_to_ico(OUTPUT_PNG, DEST_RESOURCES)
    png_to_ico(OUTPUT_PNG, DEST_BUILD)
    png_to_icns(OUTPUT_PNG, DEST_RESOURCES_ICNS)
    png_to_icns(OUTPUT_PNG, DEST_BUILD_ICNS)
    print(f"icon.png written to {DEST_RESOURCES_PNG}")
    print(f"icon.png written to {DEST_BUILD_PNG}")
    print(f"icon.ico written to {DEST_RESOURCES}")
    print(f"icon.ico written to {DEST_BUILD}")
    print(f"icon.icns written to {DEST_RESOURCES_ICNS}")
    print(f"icon.icns written to {DEST_BUILD_ICNS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
