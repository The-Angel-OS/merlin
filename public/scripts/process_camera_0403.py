"""Concat all 20260403 Camera clips into one video with timestamps."""

import subprocess
import json
import time
from pathlib import Path
from datetime import datetime

SOURCE = Path(r"E:\DCIM\Camera")
OUTPUT = Path(r"C:\Users\kenne\Videos\Daily")
PREFIX = "260403"


def get_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
        capture_output=True, text=True,
    )
    return float(json.loads(r.stdout)["format"].get("duration", 0))


def parse_ts(name):
    base = name.split(".")[0]
    if "~" in base:
        base = base.split("~")[0]
    return datetime.strptime(base[:15], "%Y%m%d_%H%M%S")


def format_ts(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h}:{m:02d}:{s:02d}"


def main():
    clips = sorted(
        [f for f in SOURCE.iterdir()
         if f.is_file() and f.suffix.lower() == ".mp4" and f.name.startswith("20260403")],
        key=lambda p: p.name,
    )
    print(f"Found {len(clips)} clips")

    durations = []
    for c in clips:
        dur = get_duration(c)
        durations.append(dur)

    # Build timestamps description
    lines = [
        f"{PREFIX} Ken & Tyler S23 Camera Clips - April 3, 2026",
        "",
    ]
    cumulative = 0.0
    for c, dur in zip(clips, durations):
        ts = parse_ts(c.name)
        rec_time = ts.strftime("%H:%M:%S")
        dm = int(dur // 60)
        ds = int(dur % 60)
        dur_str = f"{dm}m {ds:02d}s" if dm else f"{ds}s"
        lines.append(f"{format_ts(cumulative)} - Clip recorded at {rec_time} ({dur_str})")
        cumulative += dur

    total_m = int(cumulative // 60)
    total_s = int(cumulative % 60)
    lines.append("")
    lines.append(f"Total duration: {total_m}m {total_s:02d}s")

    desc_path = OUTPUT / f"{PREFIX} Ken and Tyler S23 Camera Clips.txt"
    desc_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Timestamps saved to {desc_path.name}")
    print()
    for line in lines:
        print(f"  {line}")
    print()

    # Concat
    out_path = OUTPUT / f"{PREFIX} Ken and Tyler S23 Camera Clips.mp4"
    list_file = out_path.with_suffix(".filelist.txt")
    list_file.write_text(
        "\n".join(f"file '{c}'" for c in clips), encoding="utf-8"
    )

    print(f"Concatenating {len(clips)} clips -> {out_path.name}")
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
        sz = out_path.stat().st_size / (1024**3)
        print(f"Done in {int(elapsed)}s -> {sz:.2f} GB")
    else:
        print(f"FAILED (exit code {r.returncode})")
        if r.stderr:
            for line in r.stderr.strip().splitlines()[-5:]:
                print(f"  {line}")


if __name__ == "__main__":
    main()
