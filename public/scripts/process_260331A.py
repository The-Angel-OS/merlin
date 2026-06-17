#!/usr/bin/env python3
"""Process E:\DCIM\Daily\260331A into segments + full day."""

import subprocess
import time
from pathlib import Path
from datetime import datetime

SOURCE = Path(r"E:\DCIM\Daily\260331A")
OUTPUT = Path(r"C:\Users\kenne\Videos\Daily")
PREFIX = "260331A"

SEGMENT_NAMES = {
    0: "01_Morning",
    1: "02_Afternoon",
}


def parse_ts(name: str) -> datetime:
    ts_str = name.split("_")[0]
    return datetime.strptime(ts_str, "%Y%m%d%H%M%S")


def format_size(nbytes):
    return f"{nbytes / (1024**3):.2f} GB"


def format_duration(seconds):
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h {m:02d}m {s:02d}s"
    return f"{m}m {s:02d}s"


def concat_videos(clips, out_path, label):
    total = sum(f.stat().st_size for f in clips)
    print(f"  {len(clips)} clips, {format_size(total)} total")
    print(f"  -> {out_path.name}")

    list_file = out_path.with_suffix(".filelist.txt")
    list_file.write_text(
        "\n".join(f"file '{c}'" for c in clips), encoding="utf-8"
    )

    t0 = time.time()
    r = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "warning", "-stats",
            "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-c", "copy", "-avoid_negative_ts", "make_zero",
            "-movflags", "+faststart", str(out_path),
        ],
        capture_output=True, text=True,
    )
    elapsed = time.time() - t0
    list_file.unlink(missing_ok=True)

    if r.returncode == 0:
        sz = out_path.stat().st_size
        print(f"  Done in {format_duration(elapsed)} -> {format_size(sz)}")
        return True
    else:
        print(f"  FAILED (exit code {r.returncode})")
        if r.stderr:
            for line in r.stderr.strip().splitlines()[-5:]:
                print(f"    {line}")
        return False


def main():
    videos = sorted(
        [f for f in SOURCE.iterdir() if f.is_file() and f.suffix.upper() == ".MP4"],
        key=lambda p: p.name,
    )
    print(f"Found {len(videos)} clips in {SOURCE}")

    segments: list[list[Path]] = [[videos[0]]]
    for prev, curr in zip(videos, videos[1:]):
        gap = (parse_ts(curr.name) - parse_ts(prev.name)).total_seconds()
        if gap > 120:
            t1 = parse_ts(prev.name).strftime("%H:%M")
            t2 = parse_ts(curr.name).strftime("%H:%M")
            print(f"  Gap: {t1} -> {t2} ({gap:.0f}s)")
            segments.append([])
        segments[-1].append(curr)

    print(f"\n{len(segments)} segment(s):")
    for i, seg in enumerate(segments):
        t0 = parse_ts(seg[0].name).strftime("%H:%M")
        t1 = parse_ts(seg[-1].name).strftime("%H:%M")
        name = SEGMENT_NAMES.get(i, f"Segment_{i+1}")
        print(f"  [{i+1}] {t0}-{t1} ({len(seg)} clips) - {name}")
    print()

    OUTPUT.mkdir(parents=True, exist_ok=True)
    results = []

    for i, seg in enumerate(segments):
        name = SEGMENT_NAMES.get(i, f"Segment_{i+1}")
        out_path = OUTPUT / f"{PREFIX}_{name}.mp4"
        print(f"[{name}]")
        ok = concat_videos(seg, out_path, name)
        results.append((name, ok, len(seg)))
        print()

    out_path = OUTPUT / f"{PREFIX}_Full_Day.mp4"
    print("[Full Day]")
    ok = concat_videos(videos, out_path, f"All {len(videos)} clips")
    results.append(("Full Day", ok, len(videos)))
    print()

    print("=" * 60)
    print("  Summary")
    print("=" * 60)
    for name, ok, count in results:
        status = "OK" if ok else "FAILED"
        print(f"  [{status:6s}] {name} ({count} clips)")
    print()


if __name__ == "__main__":
    main()
