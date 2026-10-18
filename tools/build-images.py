#!/usr/bin/env python3
"""
build-images.py —— Kysoul 站点图片派生脚本

用途
  从站外的原始大图（默认 ../_materials/originals）生成站点实际会发布的
  响应式图片（AVIF / WebP / JPEG 回退），原始文件不进入发布目录。

为什么原件放在站外
  本站以 GitHub Pages 的“分支根目录”方式发布，仓库根目录下的任何文件都会
  被当作静态资源对外提供。91.6 MB 的原始背景图因此不能再留在仓库工作树里，
  否则即使页面不引用它，它也仍然是一个可被直接下载的公开资源。
  原件被移动到 ../_materials/originals 并在基线提交 5cee5de 中永久保留。

依赖
  Pillow >= 11.3（需要 AVIF 写入支持）。用系统 python3 即可：
    python3 -c "import PIL, PIL.features; print(PIL.__version__, PIL.features.check('avif'))"

用法
  python3 tools/build-images.py            # 生成到 assets/
  python3 tools/build-images.py --report   # 只打印尺寸清单，不写文件
"""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import sys
from pathlib import Path

try:
    from PIL import Image, features
except ImportError:  # pragma: no cover
    sys.exit("缺少 Pillow：python3 -m pip install --user Pillow")

REPO = Path(__file__).resolve().parent.parent
MATERIALS = Path(os.environ.get("KYSOUL_MATERIALS", REPO.parent / "_materials" / "originals"))

# ---------------------------------------------------------------- 输出规格
# (输出名, 源文件, 目标宽度, {格式: 编码参数})
PHOTO_SPECS = [
    ("fujim-960",  "fujim.original.png", 960),
    ("fujim-1600", "fujim.original.png", 1600),
    ("fujim-2400", "fujim.original.png", 2400),
]
RESUME_SPECS = [
    # 文档类图片多给一档 1200：移动端 3x DPR 下正好落在这一档，
    # 不必为了 1077px 的需求去取 1400 那张（省约 120 KB）。
    ("kysoul-resume-900",  "ytf-resume-1.original.png", 900),
    ("kysoul-resume-1200", "ytf-resume-1.original.png", 1200),
    ("kysoul-resume-1400", "ytf-resume-1.original.png", 1400),
]

# 编码参数：照片用较低质量的 AVIF（视觉无损域），文档图适当提高
ENCODERS = {
    "photo": {
        "avif": dict(quality=58, speed=4),
        "webp": dict(quality=76, method=6),
        "jpg":  dict(quality=80, optimize=True, progressive=True),
    },
    "doc": {
        "avif": dict(quality=68, speed=4),
        "webp": dict(quality=84, method=6),
        "jpg":  dict(quality=86, optimize=True, progressive=True),
    },
}

OUT = {
    "photo": (REPO / "assets" / "photos", "photo"),
    "doc": (REPO / "assets" / "resume", "doc"),
}

OG_SIZE = (1200, 630)


PILLOW_FORMAT = {"avif": "AVIF", "webp": "WEBP", "jpg": "JPEG"}


def encode(img: Image.Image, kind: str) -> dict[str, bytes]:
    """把一张已经缩放好的图编码成各格式字节。AVIF 不可用时自动跳过。"""
    encoders = ENCODERS[kind]
    out: dict[str, bytes] = {}
    for ext, params in encoders.items():
        if ext == "avif" and not features.check("avif"):
            continue
        buf = io.BytesIO()
        try:
            img.save(buf, PILLOW_FORMAT[ext], **params)
        except Exception as exc:  # 编码器缺失时降级，而不是整体失败
            print(f"  ! {ext} 编码失败，跳过：{exc}", file=sys.stderr)
            continue
        out[ext] = buf.getvalue()
    return out


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="只打印源图尺寸与计划输出，不写文件")
    args = ap.parse_args()

    if not MATERIALS.is_dir():
        sys.exit(f"找不到原始素材目录：{MATERIALS}")
    print(f"原始素材目录：{MATERIALS}")

    sources: dict[str, Image.Image] = {}
    rows: list[tuple[str, str, int, int, int]] = []

    def load(name: str) -> Image.Image:
        if name not in sources:
            path = MATERIALS / name
            if not path.is_file():
                sys.exit(f"缺少源文件：{path}")
            img = Image.open(path)
            print(f"  源 {name}: {img.size[0]}x{img.size[1]} {img.mode} {path.stat().st_size/1048576:.1f} MB")
            # 统一去 alpha（本站图片均为不透明），JPEG 编码也依赖这一点
            sources[name] = img.convert("RGB")
        return sources[name]

    for group, specs in (("photo", PHOTO_SPECS), ("doc", RESUME_SPECS)):
        outdir, kind = OUT[group]
        for stem, src, width in specs:
            src_img = load(src)
            height = round(src_img.height * width / src_img.width)
            rows.append((kind, stem, width, height, 0))
            if args.report:
                continue
            resized = src_img.resize((width, height), Image.LANCZOS)
            outdir.mkdir(parents=True, exist_ok=True)
            for ext, data in encode(resized, kind).items():
                target = outdir / f"{stem}.{ext}"
                target.write_bytes(data)
                print(f"  + {target.relative_to(REPO)}  {len(data)/1024:.0f} KB  {width}x{height}")

    # Open Graph 封面：从全景中间裁一块 1200x630
    if not args.report:
        fujim = load("fujim.original.png")
        target_w, target_h = OG_SIZE
        scale = max(target_w / fujim.width, target_h / fujim.height)
        resized = fujim.resize((round(fujim.width * scale), round(fujim.height * scale)), Image.LANCZOS)
        left = (resized.width - target_w) // 2
        top = round((resized.height - target_h) * 0.42)
        cover = resized.crop((left, top, left + target_w, top + target_h))
        outdir = REPO / "assets" / "photos"
        for ext, data in encode(cover, "photo").items():
            p = outdir / f"kysoul-cover.{ext}"
            p.write_bytes(data)
            print(f"  + {p.relative_to(REPO)}  {len(data)/1024:.0f} KB  {target_w}x{target_h}")

    print("\n计划/实际尺寸清单：")
    for kind, stem, w, h, _ in rows:
        print(f"  {kind:5s} {stem:22s} {w}x{h}")
    print("\n完成。" if not args.report else "\n（--report 模式，未写任何文件）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
