#!/usr/bin/env python3
"""
For each .mp4 / .mkv under a root (default E:\\Movies), ensure same-stem .jpg and .srt exist.
- Missing .jpg: ffmpeg frame grab at --ss (default 150s).
- Missing .srt: minimal valid placeholder (replace with real subs later).
"""

import argparse
import subprocess
import sys
from pathlib import Path

VIDEO_EXT = {".mp4", ".mkv", ".m4v", ".avi"}
PLACEHOLDER_SRT = """1
00:00:00,000 --> 00:00:02,000
(placeholder — replace with real subtitles if available)

"""


def extract_poster(video: Path, jpg: Path, ss: str) -> bool:
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-ss", ss, "-i", str(video),
        "-map", "0:v:0", "-frames:v", "1",
        "-q:v", "2", str(jpg), "-y",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ffmpeg jpg FAIL {video.name}: {r.stderr[:400] if r.stderr else r}")
        return False
    return jpg.exists() and jpg.stat().st_size > 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=Path(r"E:\Movies"))
    ap.add_argument("--ss", default="150", help="ffmpeg -ss seconds (before -i) for poster grab")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    root: Path = args.root
    if not root.is_dir():
        print(f"Not a directory: {root}", file=sys.stderr)
        sys.exit(1)

    videos = sorted(
        [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in VIDEO_EXT],
        key=lambda p: str(p).lower(),
    )
    jpg_n = srt_n = 0
    for v in videos:
        jpg = v.with_suffix(".jpg")
        srt = v.with_suffix(".srt")
        if not jpg.exists():
            print(f"+ jpg <- {v.name}")
            if not args.dry_run:
                if extract_poster(v, jpg, args.ss):
                    jpg_n += 1
                else:
                    print(f"  (skip jpg after failure)")
        if not srt.exists():
            print(f"+ srt <- {v.name}")
            if not args.dry_run:
                srt.write_text(PLACEHOLDER_SRT, encoding="utf-8")
                srt_n += 1
    print(f"\nDone. New posters: {jpg_n}, new SRT: {srt_n} (dry_run={args.dry_run})")


if __name__ == "__main__":
    main()
