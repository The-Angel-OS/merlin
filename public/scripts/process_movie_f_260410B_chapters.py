"""YouTube chapter list for 260410B clips from Apr 10 Maps Timeline (ffprobe + wall-clock map)."""
from datetime import datetime, timedelta
from pathlib import Path
import subprocess

FOLDER = Path(r"C:\Users\kenne\Videos\Daily\260410B_Movie_F")
TRIP_DATE = datetime(2026, 4, 10).date()
MIN_GAP = 10


def parse_ts(name: str) -> datetime:
    return datetime.strptime(name.split("_")[0], "%Y%m%d%H%M%S")


def ffprobe_dur(p: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
            "-of", "csv=p=0", str(p),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return float(r.stdout.strip() or 0)


def offset_at(clips: list[Path], durs: list[float], target: datetime) -> float:
    if not clips:
        return 0.0
    fs = parse_ts(clips[0].name)
    if target <= fs:
        return 0.0
    t = 0.0
    for c, dur in zip(clips, durs):
        st = parse_ts(c.name)
        en = st + timedelta(seconds=dur)
        if target < st:
            return t
        if target <= en:
            return t + (target - st).total_seconds()
        t += dur
    return t


def fmt(sec: float) -> str:
    s = int(round(sec))
    h, m, s = s // 3600, (s % 3600) // 60, s % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def main():
    clips = sorted(
        [p for p in FOLDER.iterdir() if p.suffix.upper() == ".MP4"],
        key=lambda p: p.name.upper(),
    )
    durs = [ffprobe_dur(c) for c in clips]
    total = sum(durs)
    d = TRIP_DATE
    milestones = [
        (datetime.combine(d, datetime.min.time()).replace(hour=14, minute=21), "Leave home area — driving (Harn Blvd)"),
        (datetime.combine(d, datetime.min.time()).replace(hour=14, minute=35), "Arrive Southpaw Spa — 2114 Drew St, Clearwater"),
        (datetime.combine(d, datetime.min.time()).replace(hour=14, minute=48), "Leave Southpaw — driving"),
        (datetime.combine(d, datetime.min.time()).replace(hour=14, minute=58), "Arrive Enterprise Dog Park — 2655 Enterprise Rd E"),
        (datetime.combine(d, datetime.min.time()).replace(hour=15, minute=34), "Leave Enterprise Dog Park"),
        (datetime.combine(d, datetime.min.time()).replace(hour=15, minute=44), "Arrive Southpaw Spa (return) — Drew St"),
        (datetime.combine(d, datetime.min.time()).replace(hour=16, minute=13), "Leave Southpaw — local / slow segment"),
    ]
    first_label = f"Recording start — {parse_ts(clips[0].name).strftime('%b %d %I:%M %p')}"
    raw = [(0.0, first_label)]
    for when, lab in milestones:
        off = offset_at(clips, durs, when)
        if off <= total:
            raw.append((off, lab))
    raw.sort(key=lambda x: x[0])
    out = [raw[0]]
    for off, lab in raw[1:]:
        if off - out[-1][0] < MIN_GAP:
            continue
        out.append((off, lab))
    lines = [
        "260410B — April 10, 2026 (afternoon — Maps Timeline)",
        "Maps: home until 2:21 PM; first dash clip ~2:23 PM (chapter 0).",
        "",
        "--- Chapters (YouTube description) ---",
        "",
    ]
    for off, lab in out:
        lines.append(f"{fmt(off)} {lab}")
    lines.extend(["", f"Total runtime: {fmt(total)}", ""])
    print("\n".join(lines))
    out_path = FOLDER.parent / "260410B_Movie_F_YouTube_chapters_description.txt"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
