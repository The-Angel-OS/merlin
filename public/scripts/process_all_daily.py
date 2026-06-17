#!/usr/bin/env python3
"""
Universal Daily folder processor.

For every folder in E:\\DCIM\\Daily that contains MP4 clips:
  1. Concatenate root clips -> Full_Day.mp4  (ffmpeg stream copy)
  2. Concatenate each subfolder -> [prefix]_[subfolder].mp4
  3. Get duration of each source clip via ffprobe
  4. Generate YouTube-style timestamp description (.txt)
  5. Generate corrected SRT subtitle file (.srt) with clip boundaries
  6. Transcribe via Whisper -> _transcript.txt + _whisper.srt
  7. Write metadata JSON for corpus building

Usage:
  python process_all_daily.py                    # process all folders
  python process_all_daily.py --folder 260323A   # process one folder
  python process_all_daily.py --skip-transcribe  # skip Whisper (fast pass)
  python process_all_daily.py --dry-run          # just show what would happen
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

DAILY_ROOT = Path(r"E:\DCIM\Daily")
OUTPUT_ROOT = Path(r"E:\DCIM\Daily\Output")
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".m4v"}
SKIP_DIRS = {"Output"}


def get_clips(folder: Path) -> list[Path]:
    """Get video files in a folder (non-recursive), sorted by name."""
    clips = [
        f for f in folder.iterdir()
        if f.is_file() and f.suffix.upper() in {e.upper() for e in VIDEO_EXTS}
    ]
    clips.sort(key=lambda p: p.name.upper())
    return clips


def ffprobe_duration(path: Path) -> float:
    """Get duration of a video file in seconds via ffprobe."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=30
        )
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def ffprobe_meta(path: Path) -> dict:
    """Get basic video metadata via ffprobe."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=30
        )
        data = json.loads(r.stdout)
        fmt = data.get("format", {})
        vstream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
        return {
            "duration": float(fmt.get("duration", 0)),
            "size_bytes": int(fmt.get("size", 0)),
            "width": int(vstream.get("width", 0)),
            "height": int(vstream.get("height", 0)),
            "codec": vstream.get("codec_name", ""),
            "fps": vstream.get("r_frame_rate", ""),
        }
    except Exception:
        return {}


def format_ts(seconds: float) -> str:
    """Format seconds as H:MM:SS for YouTube timestamps."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h}:{m:02d}:{s:02d}"


def format_srt_ts(seconds: float) -> str:
    """Format seconds as HH:MM:SS,mmm for SRT."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_size(nbytes: int) -> str:
    if nbytes >= 1 << 30:
        return f"{nbytes / (1 << 30):.1f} GB"
    return f"{nbytes / (1 << 20):.0f} MB"


def format_dur_human(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h:
        return f"{h}h {m:02d}m {s:02d}s"
    return f"{m}m {s:02d}s"


def parse_clip_timestamp(filename: str) -> datetime | None:
    """Try to extract a datetime from common dashcam/phone naming patterns."""
    patterns = [
        # Dashcam: 20260323095802_000010F.MP4
        r"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_\d+",
        # Phone: 20250517_141811.mp4
        r"(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})",
        # Short: 250307_065634.mp4
        r"(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})",
        # iJoy: VID_20250607_142828.mp4
        r"VID_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})",
    ]
    stem = Path(filename).stem
    for pat in patterns:
        m = re.search(pat, stem)
        if m:
            groups = m.groups()
            try:
                if len(groups[0]) == 2:
                    y = 2000 + int(groups[0])
                else:
                    y = int(groups[0])
                mo = int(groups[1])
                d = int(groups[2])
                h = int(groups[3])
                mi = int(groups[4])
                s = int(groups[5])
                return datetime(y, mo, d, h, mi, s)
            except (ValueError, IndexError):
                continue
    return None


def detect_gaps(clips: list[Path], threshold_sec: float = 120) -> list[dict]:
    """Detect timestamp gaps between consecutive clips.
    Returns list of segments, each with 'clips' list and 'gap_before' in seconds."""
    if not clips:
        return []

    timestamps = []
    for c in clips:
        ts = parse_clip_timestamp(c.name)
        timestamps.append(ts)

    segments = [{"clips": [clips[0]], "start_ts": timestamps[0], "gap_before": 0}]
    for i in range(1, len(clips)):
        gap = 0
        if timestamps[i] and timestamps[i - 1]:
            gap = (timestamps[i] - timestamps[i - 1]).total_seconds()
        if gap > threshold_sec:
            segments.append({"clips": [clips[i]], "start_ts": timestamps[i], "gap_before": gap})
        else:
            segments[-1]["clips"].append(clips[i])
    return segments


def concat_videos(clips: list[Path], output: Path, label: str) -> bool:
    """Concatenate clips into output using ffmpeg concat demuxer (stream copy)."""
    if output.exists():
        print(f"    SKIP (exists): {output.name}")
        return True

    total_size = sum(c.stat().st_size for c in clips)
    print(f"    {label}: {len(clips)} clips, {format_size(total_size)}")
    print(f"    -> {output.name}")

    filelist = output.parent / f".filelist_{output.stem}.txt"
    try:
        with open(filelist, "w", encoding="utf-8") as f:
            for c in clips:
                escaped = str(c).replace("'", "'\\''")
                f.write(f"file '{escaped}'\n")

        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "warning", "-stats",
            "-f", "concat", "-safe", "0",
            "-i", str(filelist),
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            "-movflags", "+faststart",
            str(output), "-y",
        ]
        t0 = time.time()
        subprocess.run(cmd, text=True)
        elapsed = time.time() - t0

        if output.exists():
            print(f"    Done in {format_dur_human(elapsed)} -> {format_size(output.stat().st_size)}")
            return True
        else:
            print(f"    FAILED")
            return False
    finally:
        if filelist.exists():
            filelist.unlink()


def get_clip_durations(clips: list[Path]) -> list[float]:
    """Get durations for a list of clips. Batched ffprobe calls."""
    durations = []
    for c in clips:
        d = ffprobe_duration(c)
        durations.append(d)
    return durations


def generate_timestamps_txt(clips: list[Path], durations: list[float],
                            output: Path, title: str, folder_name: str):
    """Generate YouTube-style timestamp description file."""
    lines = [title, f"Source: {folder_name}", ""]
    lines.append("--- CHAPTERS ---")
    lines.append("")
    offset = 0.0
    for clip, dur in zip(clips, durations):
        ts = parse_clip_timestamp(clip.name)
        label = clip.stem
        if ts:
            label = ts.strftime("%H:%M:%S") + " " + clip.stem
        lines.append(f"{format_ts(offset)} - {label}")
        offset += dur
    lines.append("")
    lines.append(f"Total duration: {format_dur_human(offset)}")
    lines.append(f"Total clips: {len(clips)}")
    output.write_text("\n".join(lines), encoding="utf-8")
    print(f"    Timestamps: {output.name}")


def generate_srt(clips: list[Path], durations: list[float], output: Path):
    """Generate a proper SRT subtitle file with clip boundaries."""
    lines = []
    offset = 0.0
    for i, (clip, dur) in enumerate(zip(clips, durations), 1):
        start = offset
        end = offset + dur
        ts = parse_clip_timestamp(clip.name)
        label = clip.stem
        if ts:
            label = ts.strftime("%Y-%m-%d %H:%M:%S") + " | " + clip.stem

        lines.append(str(i))
        lines.append(f"{format_srt_ts(start)} --> {format_srt_ts(end)}")
        lines.append(label)
        lines.append("")
        offset = end

    output.write_text("\n".join(lines), encoding="utf-8")
    print(f"    SRT: {output.name}")


def whisper_transcribe(video_path: Path, out_txt: Path, out_srt: Path):
    """Transcribe video with Whisper, outputting both .txt and proper .srt."""
    if out_txt.exists() and out_srt.exists():
        print(f"    SKIP transcription (exists): {out_txt.name}")
        return

    try:
        import whisper as w
        import torch
    except ImportError:
        print("    SKIP transcription (whisper not installed)")
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
        model_size = "medium" if vram >= 6 else "small"
        print(f"    Whisper: {model_size} model on GPU ({vram:.0f} GB VRAM)")
    else:
        model_size = "small"
        print(f"    Whisper: {model_size} model on CPU")

    model = w.load_model(model_size, device=device)
    print(f"    Transcribing: {video_path.name}...")
    t0 = time.time()
    result = model.transcribe(str(video_path), verbose=False, language="en")
    elapsed = time.time() - t0
    print(f"    Transcribed in {format_dur_human(elapsed)} ({len(result['segments'])} segments)")

    # Write plain text transcript
    with open(out_txt, "w", encoding="utf-8") as f:
        for seg in result["segments"]:
            start, end = seg["start"], seg["end"]
            text = seg["text"].strip()
            f.write(f"[{format_ts(start)} -> {format_ts(end)}] {text}\n")
        f.write("\n--- FULL TRANSCRIPT ---\n\n")
        f.write(result["text"])

    # Write corrected SRT
    with open(out_srt, "w", encoding="utf-8") as f:
        for i, seg in enumerate(result["segments"], 1):
            f.write(f"{i}\n")
            f.write(f"{format_srt_ts(seg['start'])} --> {format_srt_ts(seg['end'])}\n")
            f.write(f"{seg['text'].strip()}\n")
            f.write("\n")

    print(f"    Transcript: {out_txt.name}")
    print(f"    Whisper SRT: {out_srt.name}")


def build_metadata(folder_name: str, clips: list[Path], durations: list[float],
                   output_files: dict, output_path: Path):
    """Write metadata JSON for corpus building."""
    clip_meta = []
    for clip, dur in zip(clips, durations):
        ts = parse_clip_timestamp(clip.name)
        clip_meta.append({
            "filename": clip.name,
            "path": str(clip),
            "duration_sec": round(dur, 2),
            "size_bytes": clip.stat().st_size if clip.exists() else 0,
            "timestamp": ts.isoformat() if ts else None,
        })

    meta = {
        "folder": folder_name,
        "source_path": str(DAILY_ROOT / folder_name),
        "processed_at": datetime.now().isoformat(),
        "total_clips": len(clips),
        "total_duration_sec": round(sum(durations), 2),
        "total_size_bytes": sum(c.get("size_bytes", 0) for c in clip_meta),
        "time_range": {
            "earliest": clip_meta[0]["timestamp"] if clip_meta and clip_meta[0]["timestamp"] else None,
            "latest": clip_meta[-1]["timestamp"] if clip_meta and clip_meta[-1]["timestamp"] else None,
        },
        "outputs": output_files,
        "clips": clip_meta,
    }

    output_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"    Metadata: {output_path.name}")
    return meta


def process_folder(folder: Path, output_dir: Path,
                   skip_transcribe: bool = False, dry_run: bool = False):
    """Process a single Daily folder end-to-end."""
    folder_name = folder.name
    prefix = re.sub(r"[^\w]", "_", folder_name.split(" ")[0].split("-")[0].strip("_"))

    root_clips = get_clips(folder)
    subfolders = sorted([d for d in folder.iterdir() if d.is_dir()], key=lambda d: d.name)
    sub_clip_sets = [(sf, get_clips(sf)) for sf in subfolders if get_clips(sf)]

    total_clips = len(root_clips) + sum(len(clips) for _, clips in sub_clip_sets)
    if total_clips == 0:
        print(f"  [{folder_name}] empty, skipping")
        return

    print(f"\n{'='*70}")
    print(f"  {folder_name}")
    print(f"  {total_clips} clips | {len(sub_clip_sets)} subfolders")
    print(f"{'='*70}")

    if dry_run:
        print(f"  DRY RUN - would process {total_clips} clips")
        if root_clips:
            print(f"    Full_Day: {len(root_clips)} root clips")
        for sf, clips in sub_clip_sets:
            print(f"    {sf.name}: {len(clips)} clips")
        return

    folder_out = output_dir / folder_name
    folder_out.mkdir(parents=True, exist_ok=True)
    output_files = {}
    all_durations_cache = {}

    # Process subfolders first
    for sf, clips in sub_clip_sets:
        safe = re.sub(r"[^\w]", "_", sf.name)
        out_mp4 = folder_out / f"{prefix}_{safe}.mp4"
        print(f"\n  [{sf.name}]")

        ok = concat_videos(clips, out_mp4, sf.name)
        if ok:
            durations = get_clip_durations(clips)
            for c, d in zip(clips, durations):
                all_durations_cache[c] = d

            out_txt = out_mp4.with_suffix(".txt")
            out_srt = out_mp4.with_name(out_mp4.stem + "_clips.srt")

            if not out_txt.exists():
                generate_timestamps_txt(clips, durations, out_txt, sf.name, folder_name)
            if not out_srt.exists():
                generate_srt(clips, durations, out_srt)

            output_files[sf.name] = {
                "video": str(out_mp4),
                "timestamps": str(out_txt),
                "srt": str(out_srt),
            }

            if not skip_transcribe:
                whisper_txt = out_mp4.with_name(out_mp4.stem + "_transcript.txt")
                whisper_srt = out_mp4.with_name(out_mp4.stem + "_whisper.srt")
                whisper_transcribe(out_mp4, whisper_txt, whisper_srt)
                output_files[sf.name]["transcript"] = str(whisper_txt)
                output_files[sf.name]["whisper_srt"] = str(whisper_srt)

    # Process root clips (Full_Day)
    if root_clips:
        out_mp4 = folder_out / f"{prefix}_Full_Day.mp4"
        print(f"\n  [Full Day]")

        ok = concat_videos(root_clips, out_mp4, "Full Day")
        if ok:
            durations = []
            for c in root_clips:
                if c in all_durations_cache:
                    durations.append(all_durations_cache[c])
                else:
                    d = ffprobe_duration(c)
                    durations.append(d)

            out_txt = out_mp4.with_suffix(".txt")
            out_srt = out_mp4.with_name(out_mp4.stem + "_clips.srt")

            if not out_txt.exists():
                generate_timestamps_txt(root_clips, durations, out_txt, "Full Day", folder_name)
            if not out_srt.exists():
                generate_srt(root_clips, durations, out_srt)

            output_files["Full_Day"] = {
                "video": str(out_mp4),
                "timestamps": str(out_txt),
                "srt": str(out_srt),
            }

            if not skip_transcribe:
                whisper_txt = out_mp4.with_name(out_mp4.stem + "_transcript.txt")
                whisper_srt = out_mp4.with_name(out_mp4.stem + "_whisper.srt")
                whisper_transcribe(out_mp4, whisper_txt, whisper_srt)
                output_files["Full_Day"]["transcript"] = str(whisper_txt)
                output_files["Full_Day"]["whisper_srt"] = str(whisper_srt)

    # Build metadata JSON
    all_clips = root_clips + [c for _, clips in sub_clip_sets for c in clips]
    all_durs = []
    for c in all_clips:
        if c in all_durations_cache:
            all_durs.append(all_durations_cache[c])
        else:
            all_durs.append(ffprobe_duration(c))

    meta_path = folder_out / f"{prefix}_metadata.json"
    if not meta_path.exists():
        build_metadata(folder_name, all_clips, all_durs, output_files, meta_path)

    print(f"\n  [{folder_name}] COMPLETE")
    print(f"  Output: {folder_out}")


def main():
    parser = argparse.ArgumentParser(description="Universal Daily folder processor")
    parser.add_argument("--folder", type=str, default=None,
                        help="Process a single folder by name (e.g. 260323A)")
    parser.add_argument("--output", type=Path, default=OUTPUT_ROOT,
                        help=f"Output root (default: {OUTPUT_ROOT})")
    parser.add_argument("--skip-transcribe", action="store_true",
                        help="Skip Whisper transcription (fast concat-only pass)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be processed without doing anything")
    args = parser.parse_args()

    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.folder:
        folder = DAILY_ROOT / args.folder
        if not folder.is_dir():
            print(f"ERROR: {folder} is not a directory")
            sys.exit(1)
        process_folder(folder, output_dir, args.skip_transcribe, args.dry_run)
    else:
        folders = sorted([
            d for d in DAILY_ROOT.iterdir()
            if d.is_dir() and d.name not in SKIP_DIRS
        ], key=lambda d: d.name)

        print(f"Processing {len(folders)} Daily folders")
        print(f"Output to: {output_dir}")
        if args.skip_transcribe:
            print("Whisper transcription: SKIPPED")
        print()

        for folder in folders:
            process_folder(folder, output_dir, args.skip_transcribe, args.dry_run)

    # Write corpus index
    corpus_path = output_dir / "_corpus_index.json"
    corpus = []
    for d in sorted(output_dir.iterdir()):
        if d.is_dir():
            meta_files = list(d.glob("*_metadata.json"))
            for mf in meta_files:
                try:
                    meta = json.loads(mf.read_text(encoding="utf-8"))
                    corpus.append({
                        "folder": meta["folder"],
                        "total_clips": meta["total_clips"],
                        "total_duration_sec": meta["total_duration_sec"],
                        "time_range": meta["time_range"],
                        "outputs": list(meta["outputs"].keys()),
                    })
                except Exception:
                    pass
    if corpus:
        corpus_path.write_text(json.dumps(corpus, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nCorpus index: {corpus_path} ({len(corpus)} entries)")

    print("\nAll done.")


if __name__ == "__main__":
    main()
