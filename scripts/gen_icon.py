from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_PNG = REPO_ROOT / "src" / "assets" / "app-logo-new.png"
DEST_RESOURCES = REPO_ROOT / "resources" / "icon.ico"
DEST_BUILD = REPO_ROOT / "build" / "icon.ico"
DEST_RESOURCES_PNG = REPO_ROOT / "resources" / "icon.png"
DEST_BUILD_PNG = REPO_ROOT / "build" / "icon.png"
DEST_RESOURCES_ICNS = REPO_ROOT / "resources" / "icon.icns"
DEST_BUILD_ICNS = REPO_ROOT / "build" / "icon.icns"
DEST_RESOURCES_APP_LOGO = REPO_ROOT / "resources" / "app-logo.png"

ALL_OUTPUTS = [
    DEST_RESOURCES,
    DEST_BUILD,
    DEST_RESOURCES_PNG,
    DEST_BUILD_PNG,
    DEST_RESOURCES_ICNS,
    DEST_BUILD_ICNS,
    DEST_RESOURCES_APP_LOGO,
]

ICON_SIZE = 512


def process_png_icon(src_png_path: Path) -> Path:
    from PIL import Image

    img = Image.open(src_png_path).convert("RGBA")
    w, h = img.size
    max_dim = max(w, h)

    # Square canvas with transparent padding if needed
    square_img = Image.new("RGBA", (max_dim, max_dim), (0, 0, 0, 0))
    offset = ((max_dim - w) // 2, (max_dim - h) // 2)
    square_img.paste(img, offset)

    # Resample to 512x512 for icon assets
    icon_512 = square_img.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS)
    return icon_512


def save_icons(icon_img) -> None:
    for p in ALL_OUTPUTS:
        p.parent.mkdir(parents=True, exist_ok=True)

    # Save PNG formats
    icon_img.save(DEST_RESOURCES_PNG, format="PNG")
    icon_img.save(DEST_BUILD_PNG, format="PNG")
    icon_img.save(DEST_RESOURCES_APP_LOGO, format="PNG")

    # Save ICO format
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    icon_img.save(DEST_RESOURCES, format="ICO", sizes=ico_sizes)
    icon_img.save(DEST_BUILD, format="ICO", sizes=ico_sizes)

    # Save ICNS format for macOS
    icns_sizes = [(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512)]
    try:
        icon_img.save(DEST_RESOURCES_ICNS, format="ICNS", sizes=icns_sizes)
        icon_img.save(DEST_BUILD_ICNS, format="ICNS", sizes=icns_sizes)
    except Exception as e:
        print(f"Warning: Failed to save ICNS format ({e}). PNG & ICO formats generated successfully.")


def main() -> int:
    try:
        from PIL import Image
    except ImportError:
        print("Warning: Pillow module not found. Install pillow to regenerate icons.")
        missing = [p for p in ALL_OUTPUTS if not p.exists()]
        if missing:
            print("Missing icon files:")
            for p in missing:
                print(f"  ✗ {p}")
            return 1
        return 0

    if not SRC_PNG.exists():
        print(f"Error: Source PNG icon not found at {SRC_PNG}")
        return 1

    icon_512 = process_png_icon(SRC_PNG)
    save_icons(icon_512)

    print(f"✔ icon.png written to {DEST_RESOURCES_PNG}")
    print(f"✔ icon.png written to {DEST_BUILD_PNG}")
    print(f"✔ icon.ico written to {DEST_RESOURCES}")
    print(f"✔ icon.ico written to {DEST_BUILD}")
    print(f"✔ icon.icns written to {DEST_RESOURCES_ICNS}")
    print(f"✔ icon.icns written to {DEST_BUILD_ICNS}")
    print(f"✔ app-logo.png written to {DEST_RESOURCES_APP_LOGO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
