"""Android 런처 아이콘 생성 스크립트.

원본 아이콘(assets/icon/icon.png, 1024x1024 권장)을 읽어서
android/app/src/main/res/mipmap-*/ic_launcher.png 5개를 자동 생성한다.

실행:
    python mobile/scripts/generate_launcher_icons.py

요구 패키지:
    pip install Pillow
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow가 설치되어 있지 않습니다. 'pip install Pillow'로 설치하세요.")
    sys.exit(1)


# Android 표준 런처 아이콘 사이즈
MIPMAP_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def main() -> int:
    mobile_dir = Path(__file__).resolve().parent.parent
    src = mobile_dir / "assets" / "icon" / "icon.png"
    res_base = mobile_dir / "android" / "app" / "src" / "main" / "res"

    if not src.exists():
        print(f"ERROR: 원본 아이콘이 없습니다: {src}")
        print("  1024x1024 PNG를 해당 경로에 저장한 뒤 다시 실행하세요.")
        return 1

    im = Image.open(src).convert("RGBA")
    print(f"원본: {src} ({im.size[0]}x{im.size[1]})")
    print("-" * 60)

    for folder, px in MIPMAP_SIZES.items():
        out_dir = res_base / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / "ic_launcher.png"
        resized = im.resize((px, px), Image.LANCZOS)
        resized.save(out, format="PNG", optimize=True)
        size = os.path.getsize(out)
        print(f"[OK] {folder}/ic_launcher.png  ({px}x{px}, {size} bytes)")

    print("-" * 60)
    print("완료. 앱을 다시 빌드(flutter build apk)하면 새 아이콘이 반영됩니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
