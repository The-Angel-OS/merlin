"""Probe E:\\DCIM\\Camera 20260404 clips for orientation hints."""
import json
import subprocess
from pathlib import Path

CAM = Path(r"E:\DCIM\Camera")
clips = sorted(CAM.glob("20260404_*.mp4"), key=lambda p: p.name)

for p in clips:
    r = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", str(p),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    data = json.loads(r.stdout)
    fmt = data.get("format", {})
    tags = fmt.get("tags", {}) or {}
    v = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    w, h = v.get("width"), v.get("height")
    vt = v.get("tags", {}) or {}
    side = v.get("side_data_list") or []
    rot = None
    for sd in side:
        if sd.get("side_data_type") == "Display Matrix":
            rot = sd.get("rotation")
        if "rotation" in sd:
            rot = sd.get("rotation")
    print(f"{p.name}  {w}x{h}  rot={rot}  handler={vt.get('handler_name','')!r}  make={tags.get('com.android.manufacturer','')!r} model={tags.get('com.android.model','')!r}")
