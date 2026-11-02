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
    amount: float = 36.0,
    chroma: float = 0.65,
    seed: int = 7,
) -> Image.Image:
    """Dense multicolored film grain (not mono)."""
    rng = np.random.default_rng(seed)
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = arr.shape
    # luma grain
    mono = rng.normal(0, amount, size=(h, w, 1)).astype(np.float32)
    # chroma grain (RGB jitter)
    chroma_noise = rng.normal(0, amount * chroma, size=(h, w, 3)).astype(np.float32)
    noise = mono + chroma_noise
    # slightly stronger grain in midtones
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mid = 1.0 - np.abs(lum - 128.0) / 128.0
    mid = (0.55 + 0.7 * mid)[..., None]
    out = arr + noise * mid
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def warm_cool_grade(img: Image.Image, warmth: float = 0.18) -> Image.Image:
    """Push highlights warm orange, shadows cool teal/navy."""
    arr = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    shadows = np.clip(1.0 - lum * 1.35, 0, 1)[..., None]
    highlights = np.clip((lum - 0.35) / 0.65, 0, 1)[..., None]

    warm = np.array([1.0, 0.72, 0.42], dtype=np.float32)  # orange
    cool = np.array([0.35, 0.55, 0.85], dtype=np.float32)  # teal-blue

    graded = arr.copy()
    graded = graded * (1 - warmth * highlights) + warm * (warmth * highlights) * np.maximum(arr, 0.15)
    graded = graded * (1 - warmth * 0.85 * shadows) + cool * (warmth * 0.85 * shadows) * np.maximum(arr, 0.08)

    # crush blacks a bit
    graded = np.clip((graded - 0.04) / 0.96, 0, 1)
    return Image.fromarray((graded * 255).astype(np.uint8))


def vignette(img: Image.Image, strength: float = 0.55) -> Image.Image:
    w, h = img.size
    y, x = np.ogrid[:h, :w]
    cx, cy = (w - 1) / 2, (h - 1) / 2
    rx, ry = w * 0.72, h * 0.72
    r = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    mask = np.clip(1.0 - strength * np.clip(r - 0.15, 0, None) ** 1.35, 0.15, 1.0)
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    out = arr * mask[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def slight_ca(img: Image.Image, shift: int = 2) -> Image.Image:
    """Tiny chromatic aberration fringing."""
    r, g, b = img.convert("RGB").split()
    w, h = img.size
    r = ImageOps.expand(r, border=(shift, 0, 0, 0), fill=0).crop((0, 0, w, h))
    b = ImageOps.expand(b, border=(0, 0, shift, 0), fill=0).crop((shift, 0, w + shift, h))
    return Image.merge("RGB", (r, g, b))


def apply_textrnr_filter(
    img: Image.Image,
    *,
    strength: float = 1.0,
    blur: float = 14.0,
    grain: float = 38.0,
    bloom_strength: float = 0.62,
    warmth: float = 0.2,
    vignette_strength: float = 0.58,
    seed: int = 7,
) -> Image.Image:
    s = max(0.1, strength)
    work = img.convert("RGB")

    # 1) soft focus
    work = soft_blur(work, blur * s)

    # 2) bloom / halation
    work = bloom(work, strength=bloom_strength * s)

    # 3) another soft pass so bloom stays dreamy
    work = work.filter(ImageFilter.GaussianBlur(radius=2.2 * s))

    # 4) grade
    work = warm_cool_grade(work, warmth=warmth * s)

    # 5) contrast / saturation nudge
    work = ImageEnhance.Contrast(work).enhance(1.08 + 0.08 * s)
    work = ImageEnhance.Color(work).enhance(1.12 + 0.1 * s)
    work = ImageEnhance.Brightness(work).enhance(0.96)

    # 6) chromatic aberration
    work = slight_ca(work, shift=max(1, int(round(2 * s))))

    # 7) vignette
    work = vignette(work, strength=vignette_strength * min(s, 1.4))

    # 8) grain last so it stays crisp on top of blur
    work = colored_grain(work, amount=grain * s, chroma=0.7, seed=seed)

    return work


def main() -> None:
    p = argparse.ArgumentParser(description="Apply textrnr-style lo-fi night filter")
    p.add_argument("input", type=Path)
    p.add_argument("-o", "--output", type=Path, default=None)
    p.add_argument("--strength", type=float, default=1.0)
    p.add_argument("--blur", type=float, default=14.0)
    p.add_argument("--grain", type=float, default=38.0)
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
