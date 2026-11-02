#!/usr/bin/env python3
"""
textrnr-style lo-fi night filter
--------------------------------
Soft focus + bloom + colored film grain + warm/cool grade + vignette.

Usage:
  python textrnr_filter.py input.jpg
  python textrnr_filter.py input.jpg -o out.png
  python textrnr_filter.py input.jpg --strength 1.2 --blur 18 --grain 42
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def _to_rgba(img: Image.Image) -> Image.Image:
    if img.mode != "RGBA":
        return img.convert("RGBA")
    return img


def soft_blur(img: Image.Image, radius: float) -> Image.Image:
    # Two-pass for smoother dreamy blur than a single gaussian
    a = img.filter(ImageFilter.GaussianBlur(radius=radius * 0.55))
    return a.filter(ImageFilter.GaussianBlur(radius=radius * 0.75))


def bloom(img: Image.Image, strength: float = 0.55, threshold: int = 150) -> Image.Image:
    """Halation: bright areas bleed into neighbors."""
    rgb = img.convert("RGB")
    arr = np.asarray(rgb).astype(np.float32)
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mask = np.clip((lum - threshold) / (255 - threshold + 1e-6), 0, 1)[..., None]
    bright = arr * mask
    bright_img = Image.fromarray(np.clip(bright, 0, 255).astype(np.uint8))
    bright_img = bright_img.filter(ImageFilter.GaussianBlur(radius=22))
    bright_img = bright_img.filter(ImageFilter.GaussianBlur(radius=14))
    bloom_arr = np.asarray(bright_img).astype(np.float32)
    out = arr + bloom_arr * strength
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def colored_grain(
    img: Image.Image,
    amount: float = 12.0,
    chroma: float = 0.22,
    seed: int = 7,
) -> Image.Image:
    """Fine luma-led film grain (subtle chroma)."""
    rng = np.random.default_rng(seed)
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = arr.shape
    scale = max(0.55, min(1.15, 900 / max(w, h)))
    amp = amount * scale
    mono = rng.normal(0, amp, size=(h, w, 1)).astype(np.float32)
    chroma_noise = rng.normal(0, amp * chroma, size=(h, w, 3)).astype(np.float32)
    noise = mono + chroma_noise
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mid = 1.0 - np.abs(lum - 128.0) / 128.0
    mid = (0.4 + 0.6 * mid)[..., None]
    out = arr + noise * mid
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def warm_cool_grade(img: Image.Image, warmth: float = 0.12) -> Image.Image:
    """Gentle warm highlights / cool shadows."""
    arr = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    shadows = np.clip(1.0 - lum * 1.25, 0, 1)[..., None]
    highlights = np.clip((lum - 0.42) / 0.58, 0, 1)[..., None]

    warm = np.array([1.0, 0.78, 0.55], dtype=np.float32)
    cool = np.array([0.42, 0.58, 0.78], dtype=np.float32)

    graded = arr.copy()
    wh = warmth * 0.72
    graded = graded * (1 - wh * highlights) + warm * (wh * highlights) * np.maximum(arr, 0.2)
    ws = warmth * 0.55
    graded = graded * (1 - ws * shadows) + cool * (ws * shadows) * np.maximum(arr, 0.1)

    graded = np.clip((graded - 0.02) / 0.98, 0, 1)
    return Image.fromarray((graded * 255).astype(np.uint8))


def vignette(img: Image.Image, strength: float = 0.34) -> Image.Image:
    w, h = img.size
    y, x = np.ogrid[:h, :w]
    cx, cy = (w - 1) / 2, (h - 1) / 2
    rx, ry = w * 0.82, h * 0.82
    r = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    mask = np.clip(1.0 - strength * np.clip(r - 0.28, 0, None) ** 1.5, 0.42, 1.0)
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    out = arr * mask[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def slight_ca(img: Image.Image, shift: int = 1) -> Image.Image:
    """Soft chromatic aberration — blended, not hard RGB split."""
    if shift <= 0:
        return img.convert("RGB")
    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    w, h = rgb.size
    r2 = ImageOps.expand(r, border=(shift, 0, 0, 0), fill=0).crop((0, 0, w, h))
    b2 = ImageOps.expand(b, border=(0, 0, shift, 0), fill=0).crop((shift, 0, w + shift, h))
    ra = np.asarray(r).astype(np.float32)
    ba = np.asarray(b).astype(np.float32)
    r_out = Image.fromarray(np.clip(ra * 0.35 + np.asarray(r2) * 0.65, 0, 255).astype(np.uint8))
    b_out = Image.fromarray(np.clip(ba * 0.35 + np.asarray(b2) * 0.65, 0, 255).astype(np.uint8))
    return Image.merge("RGB", (r_out, g, b_out))


def apply_textrnr_filter(
    img: Image.Image,
    *,
    strength: float = 1.0,
    blur: float = 9.0,
    grain: float = 12.0,
    bloom_strength: float = 0.36,
    warmth: float = 0.12,
    vignette_strength: float = 0.34,
    seed: int = 7,
) -> Image.Image:
    s = max(0.1, strength)
    original = img.convert("RGB")

    # 1) soft focus mixed with structure
    soft = soft_blur(original, blur * s)
    work = Image.blend(original, soft, alpha=min(0.62, 0.42 + 0.12 * min(s, 1.2)))

    # 2) bloom / halation
    work = bloom(work, strength=bloom_strength * s, threshold=168)

    # 3) micro soft mix
    micro = work.filter(ImageFilter.GaussianBlur(radius=max(0.4, 0.9 * s)))
    work = Image.blend(work, micro, alpha=0.35)

    # 4) grade
    work = warm_cool_grade(work, warmth=warmth * s)

    # 5) gentle contrast / saturation
    work = ImageEnhance.Contrast(work).enhance(1.04 + 0.04 * s)
    work = ImageEnhance.Color(work).enhance(1.04 + 0.05 * s)
    work = ImageEnhance.Brightness(work).enhance(0.985)

    # 6) light CA
    work = slight_ca(work, shift=1 if s > 0.85 else 0)

    # 7) vignette
    work = vignette(work, strength=vignette_strength * min(s, 1.2))

    # 8) fine grain
    work = colored_grain(work, amount=grain * s, chroma=0.2, seed=seed)

    return work


def main() -> None:
    p = argparse.ArgumentParser(description="Apply textrnr-style lo-fi night filter")
    p.add_argument("input", type=Path)
    p.add_argument("-o", "--output", type=Path, default=None)
    p.add_argument("--strength", type=float, default=1.0)
    p.add_argument("--blur", type=float, default=9.0)
    p.add_argument("--grain", type=float, default=12.0)
    p.add_argument("--seed", type=int, default=7)
    args = p.parse_args()

    img = Image.open(args.input)
    out = apply_textrnr_filter(
        img,
        strength=args.strength,
        blur=args.blur,
        grain=args.grain,
        seed=args.seed,
    )
    dest = args.output or args.input.with_name(args.input.stem + "-textrnr.png")
    out.save(dest)
    print(f"wrote {dest}")


if __name__ == "__main__":
    main()
