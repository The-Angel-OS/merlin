#!/usr/bin/env python3
"""
Extract a time range from dashcam clips in F:\\CARDV\\Movie_F using ffmpeg.

Filenames are YYYYMMDDHHMMSS_*.MP4. The dashcam clock may be off by one hour,
so we support both "display" time (e.g. 07:07:27) and "actual" time (06:07:27).

What you might have omitted: the DATE (YYYYMMDD). Set MOVIE_DATE below or pass --date.
"""

import os
import re
import sys
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime, timedelta


def parse_filename_time(name: str) -> datetime | None:
    """Parse YYYYMMDDHHMMSS from start of filename. Returns None if not matched."""
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})", name)
    if not m:
        return None
    y, mo, d, h, mi, s = map(int, m.groups())
    try:
        return datetime(y, mo, d, h, mi, s)
    except ValueError:
        return None


def time_to_seconds(h: int, m: int, s: float) -> float:
    return h * 3600 + m * 60 + s


def main():
    import argparse
    p = argparse.ArgumentParser(description="Extract dashcam segment by timestamp range using ffmpeg.")
    p.add_argument("folder", nargs="?", default=r"F:\CARDV\Movie_F", help="Folder containing YYYYMMDDHHMMSS_*.MP4")
    p.add_argument("--date", default=None, help="Date as YYYYMMDD (you likely omitted this; e.g. 20260209)")
    p.add_argument("--start", default="07:07:27", help="Start time HH:MM:SS (dashcam display or actual)")
    p.add_argument("--end", default="07:25:40", help="End time HH:MM:SS")
    p.add_argument("--hour-off", action="store_true", help="If set, treat start/end as actual time (dashcam is 1hr ahead)")
    p.add_argument("--output", "-o", default=None, help="Output file path (default: folder/segment_START_to_END.mp4)")
    p.add_argument("--dry-run", action="store_true", help="Only list matching files and exit")
    args = p.parse_args()

    folder = Path(args.folder)
    if not folder.is_dir():
        print(f"Folder not found: {folder}")
        return 1

    # Parse start/end times (HH:MM:SS)
    def parse_time(tstr: str):
        parts = tstr.strip().split(":")
        if len(parts) != 3:
            raise ValueError(f"Invalid time {tstr}; use HH:MM:SS")
        return time_to_seconds(int(parts[0]), int(parts[1]), float(parts[2]))

    try:
        start_sec = parse_time(args.start)
        end_sec = parse_time(args.end)
    except ValueError as e:
        print(e)
        return 1

    if start_sec >= end_sec:
        print("Start time must be before end time.")
        return 1

    duration_sec = end_sec - start_sec

    # Resolve date: from --date or from files in folder
    date_str = args.date
    if not date_str:
        # Infer from first file we find that matches any 06/07 hour on same day
        samples = list(folder.glob("*.MP4"))[:200]
        for f in samples:
            dt = parse_filename_time(f.name)
            if dt and dt.hour in (6, 7):
                date_str = dt.strftime("%Y%m%d")
                print(f"Using date from files: {date_str} ({dt.date()})")
                break
        if not date_str:
            date_str = datetime.now().strftime("%Y%m%d")
            print(f"No date given; using today: {date_str} (edit --date if wrong)")

    year = int(date_str[:4])
    month = int(date_str[4:6])
    day = int(date_str[6:8])

    # Target window in seconds-of-day for start/end
    start_sod = start_sec
    end_sod = end_sec

    # Collect all MP4s and their parsed times
    all_files = []
    for f in folder.glob("*.MP4"):
        dt = parse_filename_time(f.name)
        if dt is None:
            continue
        if (dt.year, dt.month, dt.day) != (year, month, day):
            continue
        sod = time_to_seconds(dt.hour, dt.minute, dt.second)
        all_files.append((sod, dt, f))

    all_files.sort(key=lambda x: x[0])

    # Clips are ~1 min; we want files that could contain [start_sod, end_sod].
    # Include any file that starts before end_sod and (start + 70s) after start_sod.
    CLIP_LEN = 70  # seconds per clip
    matching = []
    for sod, dt, f in all_files:
        clip_end = sod + CLIP_LEN
        if clip_end >= start_sod and sod <= end_sod:
            matching.append((sod, dt, f))

    if not matching:
        print("No files found in the given date and time range.")
        print(f"  Date: {date_str}, time range: {args.start} .. {args.end}")
        print("  Tip: if dashcam is 1hr ahead, use --hour-off and 06:07:27 / 06:25:40")
        return 1

    first_sod, first_dt, first_file = matching[0]
    last_sod, last_dt, last_file = matching[-1]

    # Offset into the first clip to reach start_sod
    offset_in_first = max(0.0, start_sod - first_sod)

    if args.dry_run:
        print("Matching files:")
        for sod, dt, f in matching:
            print(f"  {f.name}  ({dt})")
        print(f"\nWould trim: offset {offset_in_first:.1f}s into first file, duration {duration_sec:.1f}s")
        return 0

    # Concat list
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as tf:
        for _, _, f in matching:
            path = str(f.resolve()).replace("\\", "/")
            tf.write(f"file '{path}'\n")
        list_path = tf.name

    try:
        if args.output:
            out_path = Path(args.output)
        else:
            safe_start = args.start.replace(":", "-")
            safe_end = args.end.replace(":", "-")
            out_path = folder / f"segment_{safe_start}_to_{safe_end}.mp4"

        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat", "-safe", "0", "-i", list_path,
            "-ss", str(offset_in_first),
            "-t", str(duration_sec),
            "-c", "copy",
            str(out_path),
        ]
        print("Running:", " ".join(cmd))
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print("FFmpeg stderr:", r.stderr)
            return 1
        print("Done:", out_path)
        return 0
    finally:
        try:
            os.unlink(list_path)
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
