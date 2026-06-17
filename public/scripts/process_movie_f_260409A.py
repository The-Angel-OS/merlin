#!/usr/bin/env python3
"""Combine all F:\\CARDV\\Movie_F clips for 2026-04-09 trip + YouTube chapters from Maps Timeline."""

import argparse
import json
import shutil
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

SOURCE = Path(r"F:\CARDV\Movie_F")
OUTPUT = Path(r"C:\Users\kenne\Videos\Daily")
PREFIX = "260409A"
MIN_CHAPTER_GAP_SEC = 10

OUT_MP4 = OUTPUT / f"{PREFIX}_Sams_StrangeCloudz_Dunedin_BurgerKing_Walmart.mp4"
OUT_TXT = OUTPUT / f"{PREFIX}_YouTube_chapters_description.txt"
OUT_PARTIAL = OUTPUT / f"{PREFIX}_Sams_StrangeCloudz_Dunedin_BurgerKing_Walmart.partial.mp4"
TRIP_DATE = datetime(2026, 4, 9).date()


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


def stage_clips(trip: list[Path], stage_dir: Path) -> list[Path]:
    """Copy clips to local disk (same order/names) so ffmpeg reads fast NVMe, not SD/USB."""
    stage_dir.mkdir(parents=True, exist_ok=True)
    total = len(trip)
    total_bytes = sum(p.stat().st_size for p in trip)
    copied = 0
    t0 = time.time()
    for i, src in enumerate(trip, 1):
        dst = stage_dir / src.name
        if dst.is_file() and dst.stat().st_size == src.stat().st_size:
            pass
        else:
            shutil.copy2(src, dst)
        copied += src.stat().st_size
        if i % 25 == 0 or i == total:
            pct = 100.0 * copied / total_bytes
            mb_s = (copied / max(time.time() - t0, 0.001)) / (1024 * 1024)
            print(f"    stage {i}/{total} ({pct:.0f}%) ~{mb_s:.1f} MB/s read+write")
    return [stage_dir / c.name for c in trip]


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
    d = TRIP_DATE
    milestones = [
        (datetime.combine(d, datetime.min.time()).replace(hour=10, minute=47), "Depart home — 2566 Harn Blvd, Clearwater"),
        (datetime.combine(d, datetime.min.time()).replace(hour=10, minute=54), "Arrive Sam's Club / Sam's Club Gas — Gulf to Bay"),
        (datetime.combine(d, datetime.min.time()).replace(hour=11, minute=3), "Leave Sam's — driving"),
        (datetime.combine(d, datetime.min.time()).replace(hour=11, minute=17), "Arrive Strange Cloudz Vape & Kava — Main St, Clearwater"),
        (datetime.combine(d, datetime.min.time()).replace(hour=11, minute=33), "Leave Strange Cloudz — driving"),
        (datetime.combine(d, datetime.min.time()).replace(hour=11, minute=49), "Arrive Edgewater Park / Dunedin Marina — Dunedin"),
        (datetime.combine(d, datetime.min.time()).replace(hour=13, minute=36), "Leave Edgewater / Dunedin area"),
        (datetime.combine(d, datetime.min.time()).replace(hour=13, minute=59), "Arrive Burger King — Gulf to Bay Blvd, Clearwater"),
        (datetime.combine(d, datetime.min.time()).replace(hour=14, minute=16), "Leave Burger King"),
        (datetime.combine(d, datetime.min.time()).replace(hour=14, minute=18), "Arrive Walmart Neighborhood Market — Gulf to Bay"),
        (datetime.combine(d, datetime.min.time()).replace(hour=14, minute=36), "Leave Walmart"),
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
    parser = argparse.ArgumentParser(description="Apr 9 2026 Movie_F → one MP4 + YouTube chapters")
    parser.add_argument(
        "--skip-concat",
        action="store_true",
        help="Only write chapters + metadata (ffprobe all clips; no ffmpeg)",
    )
    parser.add_argument(
        "--stage",
        action="store_true",
        help="Copy clips to SSD under Daily first, then concat (much faster if F: is slow)",
    )
    parser.add_argument(
        "--keep-stage",
        action="store_true",
        help="Do not delete staging folder after a successful concat",
    )
    args = parser.parse_args()

    videos = sorted(
        [f for f in SOURCE.iterdir() if f.is_file() and f.suffix.upper() == ".MP4"],
        key=lambda p: p.name,
    )
    if not videos:
        print(f"No MP4s in {SOURCE}")
        return

    trip = [v for v in videos if parse_ts(v.name).date() == TRIP_DATE]
    if not trip:
        trip = videos
        print(f"No clips dated {TRIP_DATE}; using all {len(trip)} files in folder.")
    else:
        print(f"Using {len(trip)} clips dated {TRIP_DATE} (of {len(videos)} total in folder)")

    t0 = parse_ts(trip[0].name)
    t1 = parse_ts(trip[-1].name)
    print(f"  File time range: {t0} .. {t1}")

    print("Probing durations...")
    durations = [ffprobe_duration(c) for c in trip]
    total_sec = sum(durations)
    print(f"  Concat duration: {format_wall(total_sec)} ({total_sec:.0f}s)")

    OUTPUT.mkdir(parents=True, exist_ok=True)

    chapters = build_chapters(trip, durations, total_sec)
    lines = [
        f"{PREFIX} — April 9, 2026 (dashcam — Maps Timeline milestones)",
        "Paste the chapter block into YouTube description for clickable chapters.",
        "",
        "--- Chapters (copy from next line) ---",
        "",
    ]
    for off, label in chapters:
        lines.append(f"{format_wall(off)} {label}")
    lines.extend([
        "",
        f"Total runtime: {format_wall(total_sec)}",
        f"Source: {SOURCE} ({len(trip)} files, stream copy concat)",
        "",
    ])
    OUT_TXT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_TXT.name}")

    meta = {
        "prefix": PREFIX,
        "trip_date": str(TRIP_DATE),
        "clips": [c.name for c in trip],
        "durations_sec": [round(d, 2) for d in durations],
        "total_sec": round(total_sec, 2),
        "chapters": [{"t_sec": round(o, 1), "label": lb} for o, lb in chapters],
        "output_mp4": str(OUT_MP4),
    }
    (OUTPUT / f"{PREFIX}_trip_metadata.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )

    if args.skip_concat:
        print("Skip concat (--skip-concat).")
        return

    stage_dir = OUTPUT / f"_{PREFIX}_Movie_F_stage"
    concat_sources = trip
    if args.stage:
        need = sum(p.stat().st_size for p in trip) * 2 + (1 << 30)
        free = shutil.disk_usage(OUTPUT).free
        if free < need:
            print(
                f"WARNING: low free space on {OUTPUT.drive} "
                f"({free / (1024**3):.1f} GB); need ~{need / (1024**3):.1f} GB for stage + output."
            )
        print(f"Staging {len(trip)} clips -> {stage_dir} (then concat from SSD)...")
        t_stage = time.time()
        concat_sources = stage_clips(trip, stage_dir)
        print(f"  Staging done in {time.time() - t_stage:.0f}s")

    print("Concatenating (ffmpeg)...")
    t_start = time.time()
    if OUT_PARTIAL.exists():
        OUT_PARTIAL.unlink(missing_ok=True)
    ok = concat_videos(concat_sources, OUT_PARTIAL)
    if ok:
        if OUT_MP4.exists():
            OUT_MP4.unlink(missing_ok=True)
        OUT_PARTIAL.replace(OUT_MP4)
    print(f"Elapsed: {time.time() - t_start:.0f}s")
    if ok:
        print(f"OK -> {OUT_MP4}")
        if args.stage and stage_dir.is_dir() and not args.keep_stage:
            print(f"Removing staging folder {stage_dir.name}...")
            shutil.rmtree(stage_dir, ignore_errors=True)
    else:
        print("Concat failed.")
        if args.stage and stage_dir.is_dir():
            print(f"Staging left in place for retry: {stage_dir}")


if __name__ == "__main__":
    main()
