#!/usr/bin/env python3
"""Combine F:\\CARDV\\Movie_F April 8 evening segment into one MP4 + YouTube chapter description."""

import json
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

SOURCE = Path(r"F:\CARDV\Movie_F")
OUTPUT = Path(r"C:\Users\kenne\Videos\Daily")
PREFIX = "260408A"
GAP_THRESHOLD_SEC = 120
MIN_CHAPTER_GAP_SEC = 10  # YouTube-style chapters: keep markers apart

OUT_MP4 = OUTPUT / f"{PREFIX}_Evening_DogPark_Dunedin_Tides_Publix.mp4"
OUT_TXT = OUTPUT / f"{PREFIX}_YouTube_chapters_description.txt"
OUT_PARTIAL = OUTPUT / f"{PREFIX}_Evening_DogPark_Dunedin_Tides_Publix.partial.mp4"


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
    """Seconds into the concatenated file for a wall-clock moment (from clip filenames + durations)."""
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
    d = datetime(2026, 4, 8).date()
    milestones = [
        (datetime.combine(d, datetime.min.time()).replace(hour=17, minute=24), "Depart home — 2566 Harn Blvd, Clearwater"),
        (datetime.combine(d, datetime.min.time()).replace(hour=17, minute=36), "Arrive Enterprise Dog Park"),
        (datetime.combine(d, datetime.min.time()).replace(hour=18, minute=27), "Leave Enterprise Dog Park"),
        (datetime.combine(d, datetime.min.time()).replace(hour=18, minute=50), "Arrive Edgewater Park / Dunedin Marina"),
        (datetime.combine(d, datetime.min.time()).replace(hour=19, minute=24), "Leave Dunedin / Edgewater area"),
        (datetime.combine(d, datetime.min.time()).replace(hour=19, minute=31), "Arrive Clearwater Tides Marina"),
        (datetime.combine(d, datetime.min.time()).replace(hour=19, minute=41), "Leave Clearwater Tides Marina"),
        (datetime.combine(d, datetime.min.time()).replace(hour=19, minute=56), "Arrive Publix — Gulf to Bay Plaza"),
        (datetime.combine(d, datetime.min.time()).replace(hour=20, minute=14), "Leave Publix"),
        (datetime.combine(d, datetime.min.time()).replace(hour=20, minute=29), "Arrive home — Harn Blvd"),
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
        if merged and off - merged[-1][0] < MIN_CHAPTER_GAP_SEC:
            continue
        merged.append((off, label))

    if not merged or merged[0][0] > 0:
        merged.insert(0, (0.0, first_label))
    merged[0] = (0.0, merged[0][1])

    out: list[tuple[float, str]] = [merged[0]]
    for off, label in merged[1:]:
        if off - out[-1][0] < MIN_CHAPTER_GAP_SEC:
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

    segments = split_segments(videos)
    evening = None
    for seg in segments:
        if seg and parse_ts(seg[0].name).date() == datetime(2026, 4, 8).date():
            evening = seg
            break
    if evening is None:
        evening = segments[-1]
        print("Using last gap segment (no Apr 8 start found by date).")

    print(f"April 8 evening segment: {len(evening)} clips")
    t0 = parse_ts(evening[0].name)
    t1 = parse_ts(evening[-1].name)
    print(f"  File time range: {t0} .. {t1}")

    print("Probing durations...")
    durations = []
    for c in evening:
        durations.append(ffprobe_duration(c))
    total_sec = sum(durations)
    print(f"  Concat duration: {format_wall(total_sec)} ({total_sec:.0f}s)")

    OUTPUT.mkdir(parents=True, exist_ok=True)

    chapters = build_chapters(evening, durations, total_sec)
    lines = [
        f"{PREFIX} — April 8, 2026 evening (dashcam)",
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
        f"Source: {SOURCE} ({len(evening)} files, stream copy concat)",
        "",
    ])
    OUT_TXT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_TXT.name}")

    meta = {
        "prefix": PREFIX,
        "clips": [c.name for c in evening],
        "durations_sec": [round(d, 2) for d in durations],
        "total_sec": round(total_sec, 2),
        "chapters": [{"t_sec": round(o, 1), "label": lb} for o, lb in chapters],
        "output_mp4": str(OUT_MP4),
    }
    (OUTPUT / f"{PREFIX}_evening_metadata.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )

    print("Concatenating (ffmpeg)...")
    t_start = time.time()
    # Write to a partial name first; only finalize when ffmpeg completes.
    if OUT_PARTIAL.exists():
        OUT_PARTIAL.unlink(missing_ok=True)
    ok = concat_videos(evening, OUT_PARTIAL)
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
