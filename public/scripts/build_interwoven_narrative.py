#!/usr/bin/env python3
"""
Build a wall-clock interwoven index: Google Maps anchors + dashcam file + Camera clips.
Writes: C:\\Users\\kenne\\Videos\\Daily\\{YYMMDD} Interwoven Narrative.txt
"""
import glob
import re
from datetime import datetime
from pathlib import Path

OUT_DIR = Path(r"C:\Users\kenne\Videos\Daily")
CAMERA = Path(r"E:\DCIM\Camera")
CARDV = Path(r"F:\CARDV\Movie_F")


def parse_camera_name(name: str) -> datetime | None:
    m = re.match(r"(20\d{6})_(\d{6})\.mp4$", name, re.I)
    if not m:
        return None
    d, t = m.group(1), m.group(2)
    return datetime(
        int(d[:4]), int(d[4:6]), int(d[6:8]),
        int(t[:2]), int(t[2:4]), int(t[4:6]),
    )


def parse_cardv(name: str) -> datetime | None:
    m = re.match(r"(20\d{14})_", name)
    if not m:
        return None
    s = m.group(1)
    return datetime(
        int(s[:4]), int(s[4:6]), int(s[6:8]),
        int(s[8:10]), int(s[10:12]), int(s[12:14]),
    )


def main():
    tag = "20260405"
    prefix = "260405"
    y, mo, d = 2026, 4, 5

    dash = sorted(glob.glob(str(CARDV / f"{tag}*.MP4")), key=lambda p: Path(p).name.upper())
    cams = sorted(CAMERA.glob(f"{tag}_*.mp4"), key=lambda p: p.name.upper())

    events: list[tuple[datetime, str, str]] = []

    for p in dash:
        ts = parse_cardv(Path(p).name)
        if ts:
            events.append((ts, "DASHCAM", Path(p).name))

    # Rotation: probe would be slow; embed landscape vs portrait from filenames list
    # We re-use same rule as splitter by quick json probe only for classification lines
    import json
    import subprocess

    def rot_of(path: Path) -> str:
        r = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_streams", str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        data = json.loads(r.stdout)
        v = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
        for sd in v.get("side_data_list") or []:
            if sd.get("rotation") not in (None, 0):
                return "PORTRAIT (5th Element)"
        return "LANDSCAPE (Ken)"

    for p in cams:
        ts = parse_camera_name(p.name)
        if ts:
            events.append((ts, rot_of(p), p.name))

    events.sort(key=lambda x: x[0])

    dash_out = OUT_DIR / (
        f"{prefix} St Alfreds Dunedin McDonalds Edgewater Strange Cloudz Wawa Walmart "
        "Soul Quest.mp4"
    )
    land_out = OUT_DIR / f"{prefix} Camera Ken Landscape.mp4"
    port_out = OUT_DIR / f"{prefix} Camera 5th Element Portrait.mp4"

    lines = [
        f"{prefix} Interwoven narrative (wall clock)",
        f"{y}-{mo:02d}-{d:02d} | ~5:11 PM home | Google Maps Timeline + CARDV + S23",
        "",
        "Compiled outputs (open in editor / resolve / YouTube):",
        f"  Dashcam day: {dash_out}",
        f"  Ken landscape: {land_out}",
        f"  5th Element portrait: {port_out}",
        "",
        "Sidecars: same stems with .txt (chapters) and _clips.srt (per-source-file boundaries).",
        "YouTube: paste chapter block from each .txt; upload matching .srt as subtitles if desired.",
        "",
        "--- Timeline anchors (from your Maps screenshots) ---",
        "",
        "09:37  Leave Home — 2566 Harn Blvd, Clearwater",
        "09:56  St. Alfred’s Episcopal Church — 1601 Curlew Rd, Palm Harbor (to ~11:59)",
        "11:59  Drive — 1.4 mi / ~4 min",
        "12:03  McDonald’s — 2618 Bayshore Blvd, Dunedin (Timeline label; ~8 min)",
        "12:11  Drive — 3.3 mi / ~12 min",
        "12:23  Edgewater Park / Dunedin Marina — 51 Main St, Dunedin (to ~1:11 PM)",
        "13:11  Drive — 5.8 mi / ~22 min",
        "13:33  Strange Cloudz — 2222 Main St, Clearwater (to ~1:58 PM)",
        "13:58  Drive — 1.8 mi / ~8 min",
        "14:06  Walking — ~1 hr 2 min / 0.7 mi",
        "15:09  Drive — 0.6 mi / ~4 min",
        "15:12  Wawa — 26508 US Hwy 19 N (to ~3:20 PM)",
        "15:20  Drive — 2.2 mi / ~8 min",
        "15:28  Walmart Supercenter — 23106 US Hwy 19 N (to ~4:09 PM)",
        "16:09+ Homeward crawl (timeline ~19 min / ~100 ft segment)",
        "",
        f"--- Merged clock index: {len(events)} markers (dashcam files + camera files) ---",
        "",
    ]

    for ts, kind, label in events:
        lines.append(f"{ts.strftime('%H:%M:%S')}  [{kind}]  {label}")

    out = OUT_DIR / f"{prefix} Interwoven Narrative.txt"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("Wrote", out, "lines", len(lines))


if __name__ == "__main__":
    main()
