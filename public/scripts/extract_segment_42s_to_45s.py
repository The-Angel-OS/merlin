#!/usr/bin/env python3
"""
Extract segment: 42s into 20260210190652_004203F.MP4 through first 45s of 20260210192452_004221F.MP4.
Then create a 1-minute version by time-compressing (same 4K 30fps, shortened with ffmpeg setpts).
"""

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def find_files(folder: Path, start_id: int, end_id: int) -> list[tuple[int, Path]]:
    """Find *_00XXXXF.MP4 in folder where XXXX is between start_id and end_id inclusive. Returns [(id, path), ...] sorted."""
    pattern = re.compile(r"^(\d{14})_0*(\d+)F\.MP4$", re.I)
    found = []
    for f in folder.glob("*.MP4"):
        m = pattern.match(f.name)
        if not m:
            continue
        num = int(m.group(2))
        if start_id <= num <= end_id:
            found.append((num, f))
    found.sort(key=lambda x: x[0])
    return found


def get_duration_seconds(path: Path) -> float:
    """Return duration in seconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path)
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {r.stderr}")
    return float(r.stdout.strip())


def run_ffmpeg(args: list, description: str) -> bool:
    print("Running:", " ".join(args[:8]), "..." if len(args) > 8 else "")
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        print("FFmpeg stderr:", r.stderr)
        return False
    return True


def main():
    folder = Path(r"F:\CARDV\Movie_F")
    first_id = 4203
    last_id = 4221
    start_offset_sec = 42
    end_first_sec = 45

    # Optional: parse folder from argv
    if len(sys.argv) > 1:
        folder = Path(sys.argv[1])

    if not folder.is_dir():
        print("Folder not found:", folder)
        return 1

    files = find_files(folder, first_id, last_id)
    if not files:
        print("No matching files found in", folder)
        return 1

    ids = [x[0] for x in files]
    if ids[0] != first_id or ids[-1] != last_id:
        print("Expected files 004203F..004221F; found:", [f"{x:06d}" for x in ids])
        return 1

    n = len(files)
    inputs = [str(f.resolve()) for _, f in files]
    filter_parts = []
    for i in range(n):
        if i == 0:
            # from 42s to end of first file
            filter_parts.append(
                f"[0:v]trim=start={start_offset_sec},setpts=PTS-STARTPTS[v{i}];"
                f"[0:a]atrim=start={start_offset_sec},asetpts=PTS-STARTPTS[a{i}]"
            )
        elif i == n - 1:
            # first 45s of last file
            filter_parts.append(
                f"[{i}:v]trim=end={end_first_sec},setpts=PTS-STARTPTS[v{i}];"
                f"[{i}:a]atrim=end={end_first_sec},asetpts=PTS-STARTPTS[a{i}]"
            )
        else:
            filter_parts.append(
                f"[{i}:v]setpts=PTS-STARTPTS[v{i}];[{i}:a]asetpts=PTS-STARTPTS[a{i}]"
            )
    concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(n))
    filter_complex = ";".join(filter_parts) + f";{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]"

    full_out = folder / "segment_42s_to_45s_full.mp4"
    cmd = ["ffmpeg", "-y"]
    for inp in inputs:
        cmd.extend(["-i", inp])
    cmd.extend(["-filter_complex", filter_complex, "-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", str(full_out)])

    if not run_ffmpeg(cmd, "Full segment"):
        return 1
    print("Created:", full_out)

    duration = get_duration_seconds(full_out)
    print("Duration: {:.1f}s".format(duration))

    # 1-minute version: scale timeline so full content fits in 60s. atempo only accepts 0.5..2, so chain.
    one_min_out = folder / "segment_42s_to_45s_1min.mp4"
    speed = duration / 60.0  # e.g. 18 -> 18x speedup
    atempo_chain = []
    r = speed
    while r > 2.0:
        atempo_chain.append("2.0")
        r /= 2.0
    while r < 0.5:
        atempo_chain.append("0.5")
        r /= 0.5
    atempo_chain.append(f"{r:.4f}")
    atempo_str = ",".join(f"atempo={t}" for t in atempo_chain)
    filter_1min = f"[0:v]setpts=PTS*{60.0/duration}[v];[0:a]{atempo_str}[a]"
    cmd1min = [
        "ffmpeg", "-y", "-i", str(full_out),
        "-filter_complex", filter_1min, "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-r", "30",
        "-c:a", "aac", str(one_min_out)
    ]
    if not run_ffmpeg(cmd1min, "1-minute version"):
        return 1
    print("Created:", one_min_out, "(1 min, 4K 30fps)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
