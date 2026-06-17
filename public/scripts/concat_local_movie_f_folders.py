#!/usr/bin/env python3
"""Concat all MP4s in each local Movie_F folder into one file in Daily (stream copy, SSD-safe partial rename)."""

import argparse
import subprocess
import time
from pathlib import Path

VIDEO_EXTS = {".mp4", ".m4v", ".mov", ".avi", ".mkv"}


def get_clips(folder: Path) -> list[Path]:
    clips = [
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.upper() in {e.upper() for e in VIDEO_EXTS}
    ]
    clips.sort(key=lambda p: p.name.upper())
    return clips


def concat_videos(clips: list[Path], out_path: Path) -> bool:
    if not clips:
        return False
    total = sum(f.stat().st_size for f in clips)
    gb = total / (1024**3)
    print(f"  {len(clips)} clips, {gb:.2f} GB -> {out_path.name}")

    list_file = out_path.with_suffix(".concat_list.txt")
    try:
        with open(list_file, "w", encoding="utf-8") as f:
            for c in clips:
                escaped = str(c.resolve()).replace("'", "'\\''")
                f.write(f"file '{escaped}'\n")
        r = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "warning", "-stats",
                "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-c", "copy", "-avoid_negative_ts", "make_zero",
                "-movflags", "+faststart", str(out_path), "-y",
            ],
            text=True,
        )
        return r.returncode == 0 and out_path.exists()
    finally:
        list_file.unlink(missing_ok=True)


def process_folder(folder: Path, out_dir: Path) -> bool:
    if not folder.is_dir():
        print(f"SKIP (not a dir): {folder}")
        return False
    clips = get_clips(folder)
    if not clips:
        print(f"SKIP (no videos): {folder}")
        return False

    base = folder.name
    out_final = out_dir / f"{base}_full.mp4"
    out_partial = out_dir / f"{base}_full.partial.mp4"

    print(f"\n{'='*60}\n{folder.name}\n{'='*60}")
    if out_partial.exists():
        out_partial.unlink(missing_ok=True)
    t0 = time.time()
    ok = concat_videos(clips, out_partial)
    if ok:
        if out_final.exists():
            out_final.unlink(missing_ok=True)
        out_partial.replace(out_final)
        print(f"  OK in {time.time() - t0:.0f}s -> {out_final}")
    else:
        print(f"  FAILED (partial may exist: {out_partial.name})")
    return ok


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "folders",
        nargs="*",
        type=Path,
        default=[
            Path(r"C:\Users\kenne\Videos\Daily\260409A_Movie_F"),
            Path(r"C:\Users\kenne\Videos\Daily\260410A_Movie_F"),
        ],
        help="Folders containing MP4 clips (default: 260409A + 260410A Movie_F under Daily)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(r"C:\Users\kenne\Videos\Daily"),
        help="Output directory for *_full.mp4",
    )
    args = parser.parse_args()
    out_dir = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    ok_all = True
    for folder in args.folders:
        if not process_folder(folder.resolve(), out_dir):
            ok_all = False
    raise SystemExit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
