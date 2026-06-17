from pathlib import Path
from datetime import datetime

src = Path(r"F:\CARDV\Movie_F")
clips = sorted(
    [f for f in src.iterdir() if f.is_file() and f.suffix.upper() == ".MP4"],
    key=lambda p: p.name,
)

total_gb = sum(f.stat().st_size for f in clips) / (1024**3)
print(f"Total: {len(clips)} clips, {total_gb:.1f} GB")


def parse_ts(name):
    return datetime.strptime(name.split("_")[0], "%Y%m%d%H%M%S")


first_ts = parse_ts(clips[0].name)
last_ts = parse_ts(clips[-1].name)
print(f"Range: {first_ts} to {last_ts}")
print()

segments = [[clips[0]]]
for prev, curr in zip(clips, clips[1:]):
    gap = (parse_ts(curr.name) - parse_ts(prev.name)).total_seconds()
    if gap > 120:
        t1 = parse_ts(prev.name).strftime("%Y-%m-%d %H:%M")
        t2 = parse_ts(curr.name).strftime("%Y-%m-%d %H:%M")
        print(f"  GAP: {t1} -> {t2} ({gap:.0f}s = {gap/60:.1f} min)")
        segments.append([])
    segments[-1].append(curr)

print(f"\n{len(segments)} segment(s):")
for i, seg in enumerate(segments):
    t0 = parse_ts(seg[0].name)
    t1 = parse_ts(seg[-1].name)
    gb = sum(f.stat().st_size for f in seg) / (1024**3)
    fmt0 = t0.strftime("%m/%d %H:%M")
    fmt1 = t1.strftime("%m/%d %H:%M")
    print(f"  [{i+1}] {fmt0} - {fmt1}  ({len(seg)} clips, {gb:.1f} GB)")

print()
print("By calendar date:")
by_date = {}
for c in clips:
    d = parse_ts(c.name).strftime("%Y%m%d")
    by_date.setdefault(d, []).append(c)
for d, cs in sorted(by_date.items()):
    gb = sum(f.stat().st_size for f in cs) / (1024**3)
    t0 = parse_ts(cs[0].name).strftime("%H:%M")
    t1 = parse_ts(cs[-1].name).strftime("%H:%M")
    print(f"  {d}: {len(cs)} clips, {gb:.1f} GB  ({t0} - {t1})")
