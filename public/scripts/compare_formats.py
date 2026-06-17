import json, os

for label, path in [("UHD (iJoy)", os.path.join(os.environ["TEMP"], "probe_uhd.json")),
                    ("1080p (ijoy1920)", os.path.join(os.environ["TEMP"], "probe_1080.json"))]:
    with open(path) as f:
        data = json.load(f)
    print(f"=== {label} ===")
    for s in data["streams"]:
        if s["codec_type"] == "video":
            print(f"  Video: {s['width']}x{s['height']} {s['codec_name']} profile={s.get('profile','?')} fps={s.get('r_frame_rate','?')} pix_fmt={s.get('pix_fmt','?')}")
        elif s["codec_type"] == "audio":
            print(f"  Audio: {s['codec_name']} {s.get('sample_rate','?')}Hz {s.get('channels','?')}ch")
    print()
