"""
url_transcribe.py
-----------------
Paste a URL -> download audio (yt-dlp) -> transcribe (Whisper) -> transcript files.

Usage:  python url_transcribe.py <URL|ID> [OUT_DIR]
Outputs (named after the video title):
    <title>.txt   plain full transcript
    <title>.srt   subtitles with timestamps
    <title>.m4a   the downloaded audio (kept; delete if you don't want it)
Jobs are logged in transcribe.db (SQLite) next to OUT_DIR, deduped by video id:
paste the same url/id twice and it skips instead of re-downloading.
"""
import subprocess, sys, sqlite3
from pathlib import Path

def db_open(out_dir):
    con = sqlite3.connect(out_dir / "transcribe.db")
    con.execute("""CREATE TABLE IF NOT EXISTS jobs(
        id TEXT PRIMARY KEY, url TEXT, title TEXT,
        txt TEXT, srt TEXT, audio TEXT, done_at TEXT)""")
    return con

def probe(url):
    # one yt-dlp call: id + the filename it WILL produce (no download)
    tmpl = "%(id)s\t%(title)s"
    out = subprocess.run(
        ["yt-dlp", "--no-playlist", "--print", tmpl, url],
        check=True, capture_output=True, text=True).stdout.strip()
    vid, title = out.split("\t", 1)
    return vid, title

def download_audio(url, out_dir):
    tmpl = str(out_dir / "%(title)s.%(ext)s")
    subprocess.run(
        ["yt-dlp", "-f", "bestaudio", "-x", "--audio-format", "m4a",
         "-o", tmpl, "--no-playlist", url],
        check=True)
    name = subprocess.run(
        ["yt-dlp", "--no-playlist", "--print", "filename",
         "-x", "--audio-format", "m4a", "-o", tmpl, url],
        check=True, capture_output=True, text=True).stdout.strip()
    # --print filename gives the pre-extraction name (.webm); -x converts to .m4a
    return Path(name).with_suffix(".m4a")

def srt_ts(t):
    h, m = divmod(int(t), 3600); m, s = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d},{int((t % 1) * 1000):03d}"

def transcribe(audio, out_dir):
    import whisper, torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
        model_size = "medium" if vram >= 6 else "small"
    else:
        model_size = "small"
    print(f"[whisper] model={model_size} device={device}")
    model = whisper.load_model(model_size, device=device)
    result = model.transcribe(str(audio), verbose=False)

    stem = audio.with_suffix("")
    Path(f"{stem}.txt").write_text(result["text"].strip() + "\n", encoding="utf-8")
    with open(f"{stem}.srt", "w", encoding="utf-8") as f:
        for i, seg in enumerate(result["segments"], 1):
            f.write(f"{i}\n{srt_ts(seg['start'])} --> {srt_ts(seg['end'])}\n"
                    f"{seg['text'].strip()}\n\n")
    return Path(f"{stem}.txt"), Path(f"{stem}.srt")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python url_transcribe.py <URL|ID> [OUT_DIR]")
    url = sys.argv[1]
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path.cwd()
    out_dir.mkdir(parents=True, exist_ok=True)
    con = db_open(out_dir)

    vid, title = probe(url)
    row = con.execute("SELECT txt FROM jobs WHERE id=?", (vid,)).fetchone()
    if row and Path(row[0]).exists():
        print(f"[skip] {vid} already transcribed -> {row[0]}")
        sys.exit(0)

    print(f"[download] {vid}  {title}")
    audio = download_audio(url, out_dir)
    print(f"[download] -> {audio.name}")
    txt, srt = transcribe(audio, out_dir)
    con.execute(
        "INSERT OR REPLACE INTO jobs VALUES (?,?,?,?,?,?,datetime('now'))",
        (vid, url, title, str(txt), str(srt), str(audio)))
    con.commit()
    print(f"[done] {txt}\n       {srt}")
