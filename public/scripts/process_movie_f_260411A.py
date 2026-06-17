#!/usr/bin/env python3
"""Concat F: April 11 2026 clips + YouTube chapters from Maps Timeline."""

import json
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

SOURCE = Path(r"F:\CARDV\Movie_F")  # update if the new drive uses a different path
OUTPUT = Path(r"C:\Users\kenne\Videos\Daily")
PREFIX = "260411A"
GAP_THRESHOLD_SEC = 120

OUT_MP4 = OUTPUT / f"{PREFIX}_Home_Edgewater_Dunedin_Marina.mp4"
OUT_TXT = OUTPUT / f"{PREFIX}_YouTube_chapters_description.txt"
OUT_PARTIAL = OUTPUT / f"{PREFIX}_Home_Edgewater_Dunedin_Marina.partial.mp4"


def parse_ts(name: str) -> datetime:
    return datetime.strptime(name.split("_")[0], "%Y%m%d%H%M%S")


def ffprobe_duration(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
            "-of", "csv=p=0", str(path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return float(r.stdout.strip() or 0)


def format_size(nbytes: float) -> str:
    return f"{nbytes / (1024**3):.2f} GB"


def format_wall(seconds: float) -> str:
    s = int(round(seconds))
    h, m, s = s // 3600, (s % 3600) // 60, s % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def wall_clock_offset_in_concat(
    clips: list[Path], durations: list[float], target: datetime
) -> float:
    if not clips:
        return 0.0
    first_start = parse_ts(clips[0].name)
    if target <= first_start:
        return 0.0
    t = 0.0
    for c, dur in zip(clips, durations):
        start = parse_ts(c.name)
        end = start + timedelta(seconds=dur)
        if target < start:
            return t
        if target <= end:
            return t + (target - start).total_seconds()
        t += dur
    return t


def split_segments(videos: list[Path]) -> list[list[Path]]:
    if not videos:
        return []
    segs: list[list[Path]] = [[videos[0]]]
    for prev, curr in zip(videos, videos[1:]):
        gap = (parse_ts(curr.name) - parse_ts(prev.name)).total_seconds()
        if gap > GAP_THRESHOLD_SEC:
            segs.append([])
        segs[-1].append(curr)
    return segs


def concat_videos(clips: list[Path], out_path: Path) -> bool:
    total = sum(f.stat().st_size for f in clips)
    print(f"  {len(clips)} clips, {format_size(total)} -> {out_path.name}")

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


def build_chapters(
    clips: list[Path], durations: list[float], total_sec: float
) -> list[tuple[float, str]]:
    d = datetime(2026, 4, 11).date()
    milestones = [
        (datetime.combine(d, datetime.min.time()).replace(hour=9, minute=5), "Recording start"),
        (datetime.combine(d, datetime.min.time()).replace(hour=9, minute=11), "Leave home — 2566 Harn Blvd, Clearwater"),
        (datetime.combine(d, datetime.min.time()).replace(hour=9, minute=34), "Arrive Edgewater Park / Dunedin Marina"),
        (datetime.combine(d, datetime.min.time()).replace(hour=11, minute=16), "Leave Edgewater Park / Dunedin Marina"),
    ]

    raw: list[tuple[float, str]] = []
    first_label = f"Recording start — {parse_ts(clips[0].name).strftime('%b %d %I:%M %p')}"
    raw.append((0.0, first_label))

    for when, label in milestones:
        off = wall_clock_offset_in_concat(clips, durations, when)
        if off > total_sec:
            continue
        raw.append((off, label))

    raw.sort(key=lambda x: x[0])
    merged: list[tuple[float, str]] = []
    for off, label in raw:
        if merged and off - merged[-1][0] < 10:
            continue
        merged.append((off, label))

    if not merged or merged[0][0] > 0:
        merged.insert(0, (0.0, first_label))
    merged[0] = (0.0, merged[0][1])

    out: list[tuple[float, str]] = [merged[0]]
    for off, label in merged[1:]:
        if off - out[-1][0] < 10:
            continue
        out.append((off, label))
    return out


def main():
    videos = sorted(
        [f for f in SOURCE.iterdir() if f.is_file() and f.suffix.upper() == ".MP4"],
        key=lambda p: p.name,
    )
    if not videos:
        print(f"No MP4s in {SOURCE}")
        return

    print(f"April 11 segment: {len(videos)} clips")
    t0 = parse_ts(videos[0].name)
    t1 = parse_ts(videos[-1].name)
    print(f"  File time range: {t0} .. {t1}")

    print("Probing durations...")
    durations = [ffprobe_duration(c) for c in videos]
    total_sec = sum(durations)
    print(f"  Concat duration: {format_wall(total_sec)} ({total_sec:.0f}s)")

    OUTPUT.mkdir(parents=True, exist_ok=True)

    chapters = build_chapters(videos, durations, total_sec)
    lines = [
        f"{PREFIX} — April 11, 2026 morning (dashcam — Maps Timeline)",
        "Google Maps Timeline milestones → chapters below (paste into YouTube description for clickable chapters).",
        "",
        "--- Chapters (copy from next line) ---",
        "",
    ]
    for off, label in chapters:
        lines.append(f"{format_wall(off)} {label}")
    lines.extend([
        "",
        f"Total runtime: {format_wall(total_sec)}",
        f"Source: {SOURCE} ({len(videos)} files, stream copy concat)",
        "",
    ])
    OUT_TXT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_TXT.name}")

    meta = {
        "prefix": PREFIX,
        "clips": [c.name for c in videos],
        "durations_sec": [round(d, 2) for d in durations],
        "total_sec": round(total_sec, 2),
        "chapters": [{"t_sec": round(o, 1), "label": lb} for o, lb in chapters],
        "output_mp4": str(OUT_MP4),
    }
    (OUTPUT / f"{PREFIX}_trip_metadata.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )

    print("Concatenating (ffmpeg)...")
    t_start = time.time()
    if OUT_PARTIAL.exists():
        OUT_PARTIAL.unlink(missing_ok=True)
    ok = concat_videos(videos, OUT_PARTIAL)
    if ok:
        if OUT_MP4.exists():
            OUT_MP4.unlink(missing_ok=True)
        OUT_PARTIAL.replace(OUT_MP4)
    print(f"Elapsed: {time.time() - t_start:.0f}s")
    if ok:
        print(f"OK -> {OUT_MP4}")
    else:
        print("Concat failed.")


if __name__ == "__main__":
    main()
