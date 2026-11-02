#!/usr/bin/env python3
"""
textrnr-style lo-fi night filter
--------------------------------
Calibrated to the original night posts: heavy soft focus, amber bloom,
cool crushed shadows, fine grain.

Usage:
  python textrnr_filter.py input.jpg
  python textrnr_filter.py input.jpg -o out.png
  python textrnr_filter.py input.jpg --strength 1.05 --blur 22 --grain 24
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def soft_blur(img: Image.Image, radius: float) -> Image.Image:
    a = img.filter(ImageFilter.GaussianBlur(radius=radius * 0.45))
    a = a.filter(ImageFilter.GaussianBlur(radius=radius * 0.7))
    return a.filter(ImageFilter.GaussianBlur(radius=radius * 0.95))


def dream_soft_focus(img: Image.Image, radius: float, mix: float = 0.84) -> Image.Image:
    """Orton-ish soft focus: mostly blur + screen light bleed."""
    blurred = soft_blur(img, radius)
    base = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    soft = np.asarray(blurred.convert("RGB")).astype(np.float32) / 255.0
    m = float(np.clip(mix, 0, 1))
    lerped = base * (1 - m) + soft * m
    screened = 1.0 - (1.0 - lerped) * (1.0 - soft * 0.35)
    return Image.fromarray(np.clip(screened * 255, 0, 255).astype(np.uint8))


def bloom(img: Image.Image, strength: float = 0.88, threshold: int = 118) -> Image.Image:
    """Amber-tinted halation on bright areas."""
    rgb = img.convert("RGB")
    arr = np.asarray(rgb).astype(np.float32)
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mask = np.clip((lum - threshold) / (255 - threshold + 1e-6), 0, 1)[..., None]
    bright = arr * mask
    bright[..., 0] *= 1.2
    bright[..., 1] *= 0.82
    bright[..., 2] *= 0.48
    bright_img = Image.fromarray(np.clip(bright, 0, 255).astype(np.uint8))
    bright_img = bright_img.filter(ImageFilter.GaussianBlur(radius=28))
    bright_img = bright_img.filter(ImageFilter.GaussianBlur(radius=18))
    bloom_arr = np.asarray(bright_img).astype(np.float32)
    out = arr + bloom_arr * strength
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def colored_grain(
    img: Image.Image,
    amount: float = 24.0,
    chroma: float = 0.45,
    seed: int = 7,
) -> Image.Image:
    rng = np.random.default_rng(seed)
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = arr.shape
    mono = rng.normal(0, amount, size=(h, w, 1)).astype(np.float32)
    chroma_noise = rng.normal(0, amount * chroma, size=(h, w, 3)).astype(np.float32)
    noise = mono + chroma_noise
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mid = 1.0 - np.abs(lum - 128.0) / 128.0
    mid = (0.5 + 0.75 * mid)[..., None]
    out = arr + noise * mid
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def warm_cool_grade(img: Image.Image, warmth: float = 0.28) -> Image.Image:
    arr = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    lum = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    shadows = np.clip(1.0 - lum * 1.45, 0, 1)[..., None]
    highlights = np.clip((lum - 0.28) / 0.72, 0, 1)[..., None]

    warm = np.array([1.0, 0.68, 0.32], dtype=np.float32)
    cool = np.array([0.28, 0.48, 0.92], dtype=np.float32)

    graded = arr.copy()
    graded = graded * (1 - warmth * highlights) + warm * (warmth * highlights) * np.maximum(arr, 0.12)
    graded = graded * (1 - warmth * 1.05 * shadows) + cool * (warmth * 1.05 * shadows) * np.maximum(arr, 0.06)
    graded = np.clip((graded - 0.055) / 0.92, 0, 1)
    return Image.fromarray((graded * 255).astype(np.uint8))


def vignette(img: Image.Image, strength: float = 0.64) -> Image.Image:
    w, h = img.size
    y, x = np.ogrid[:h, :w]
    cx, cy = (w - 1) / 2, (h - 1) / 2
    rx, ry = w * 0.68, h * 0.68
    r = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    mask = np.clip(1.0 - strength * np.clip(r - 0.12, 0, None) ** 1.4, 0.1, 1.0)
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    out = arr * mask[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def slight_ca(img: Image.Image, shift: int = 2) -> Image.Image:
    r, g, b = img.convert("RGB").split()
    w, h = img.size
    r = ImageOps.expand(r, border=(shift, 0, 0, 0), fill=0).crop((0, 0, w, h))
    b = ImageOps.expand(b, border=(0, 0, shift, 0), fill=0).crop((shift, 0, w + shift, h))
    return Image.merge("RGB", (r, g, b))


def apply_textrnr_filter(
    img: Image.Image,
    *,
    strength: float = 1.05,
    blur: float = 22.0,
    grain: float = 24.0,
    bloom_strength: float = 0.88,
    warmth: float = 0.28,
    vignette_strength: float = 0.64,
    seed: int = 7,
) -> Image.Image:
    s = max(0.1, strength)
    work = img.convert("RGB")

    work = dream_soft_focus(work, blur * s, mix=0.84)
    work = bloom(work, strength=bloom_strength * s)
    work = work.filter(ImageFilter.GaussianBlur(radius=3.4 * s))
    work = warm_cool_grade(work, warmth=warmth * s)
    work = ImageEnhance.Contrast(work).enhance(1.14 + 0.1 * s)
    work = ImageEnhance.Color(work).enhance(1.22 + 0.12 * s)
    work = ImageEnhance.Brightness(work).enhance(0.93)
    work = slight_ca(work, shift=max(1, int(round(2.5 * s))))
    work = vignette(work, strength=vignette_strength * min(s, 1.35))
    work = colored_grain(work, amount=grain * s, chroma=0.45, seed=seed)
    return work


def main() -> None:
    p = argparse.ArgumentParser(description="Apply textrnr-style lo-fi night filter")
    p.add_argument("input", type=Path)
    p.add_argument("-o", "--output", type=Path, default=None)
    p.add_argument("--strength", type=float, default=1.05)
    p.add_argument("--blur", type=float, default=22.0)
    p.add_argument("--grain", type=float, default=24.0)
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
