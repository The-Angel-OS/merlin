"""Analyze 20260403 Camera clips - check formats and find trip legs."""

import subprocess
import json
from pathlib import Path
from datetime import datetime

src = Path(r"E:\DCIM\Camera")
clips = sorted(
    [f for f in src.iterdir() if f.is_file() and f.suffix.lower() == ".mp4" and f.name.startswith("20260403")],
    key=lambda p: p.name,
)

print(f"Found {len(clips)} MP4 clips from 20260403\n")


def get_info(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", str(path)],
        capture_output=True, text=True,
    )
    return json.loads(r.stdout)


def parse_ts(name):
    base = name.split(".")[0]
    if "~" in base:
        base = base.split("~")[0]
    ts_part = base[:15]
    return datetime.strptime(ts_part, "%Y%m%d_%H%M%S")


formats = {}
for c in clips:
    info = get_info(c)
    dur = float(info["format"].get("duration", 0))
    vs = [s for s in info["streams"] if s["codec_type"] == "video"]
    aus = [s for s in info["streams"] if s["codec_type"] == "audio"]
    v = vs[0] if vs else None
    a = aus[0] if aus else None

    ts = parse_ts(c.name)
    res = f"{v['width']}x{v['height']}" if v else "?"
    fps = v.get("r_frame_rate", "?") if v else "?"
    codec = v.get("codec_name", "?") if v else "?"
    a_rate = a.get("sample_rate", "?") if a else "none"
    a_codec = a.get("codec_name", "?") if a else "none"

    fmt_key = f"{res} {codec} {fps} {a_codec} {a_rate}"
    formats.setdefault(fmt_key, []).append(c)

    dm = int(dur // 60)
    ds = int(dur % 60)
    dur_str = f"{dm}m{ds:02d}s" if dm else f"{ds}s"
    sz = c.stat().st_size / (1024**2)
    print(f"  {ts.strftime('%H:%M:%S')}  {dur_str:>7s}  {sz:8.1f}MB  {res:>10s} {fps:>6s}  {c.name}")

print(f"\n{'='*60}")
print(f"Format groups ({len(formats)}):")
for fmt, files in formats.items():
    print(f"\n  [{fmt}] - {len(files)} clips")
    for f in files:
        print(f"    {f.name}")

# Identify trip legs via timestamp gaps
print(f"\n{'='*60}")
print("Trip legs (gaps > 5 min):\n")

segments = [[clips[0]]]
for prev, curr in zip(clips, clips[1:]):
    gap = (parse_ts(curr.name) - parse_ts(prev.name)).total_seconds()
    prev_dur = float(get_info(prev)["format"].get("duration", 60))
    actual_gap = gap - prev_dur
    if actual_gap > 300:
        t1 = parse_ts(prev.name).strftime("%H:%M")
        t2 = parse_ts(curr.name).strftime("%H:%M")
        print(f"  GAP: {t1} -> {t2} ({actual_gap/60:.0f} min)")
        segments.append([])
    segments[-1].append(curr)

print(f"\n{len(segments)} leg(s):")
for i, seg in enumerate(segments):
    t0 = parse_ts(seg[0].name).strftime("%H:%M")
    t1 = parse_ts(seg[-1].name).strftime("%H:%M")
    total_dur = sum(float(get_info(f)["format"].get("duration", 0)) for f in seg)
    gb = sum(f.stat().st_size for f in seg) / (1024**3)
    dm = int(total_dur // 60)
    ds = int(total_dur % 60)
    print(f"  [{i+1}] {t0}-{t1}  {len(seg)} clips  {dm}m{ds:02d}s  {gb:.1f}GB")
