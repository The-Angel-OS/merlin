#!/usr/bin/env python3
"""
Download poster JPGs for movies under MOVIES_DIR (default E:\\Movies).

Priority:
  1) TMDB — TMDB_API_KEY (free: https://www.themoviedb.org/settings/api)
  2) OMDb — OMDB_API_KEY (free: http://www.omdbapi.com/apikey.aspx) — returns a poster URL
  3) Optional: --experimental-wikipedia (often wrong; not recommended)
  4) Fallback: ffmpeg frame grab from the video itself (accurate still, not a “studio poster”)

IMDb does not offer a supported public API for bulk poster downloads; scraping IMDb is not used.

Existing .jpg files are skipped unless --force. SRT files are not modified.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

VIDEO_EXT = {".mp4", ".mkv", ".m4v", ".avi"}
UA = "MediaserverPosterFetcher/1.0 (personal library; contact: local)"


def http_json(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def http_bytes(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_title_year(stem: str) -> tuple[str, int | None]:
    """Best-effort title + release year from release filename."""
    year: int | None = None
    m = re.search(r"\((\d{4})\)", stem)
    if m:
        year = int(m.group(1))
    s = stem
    s = re.sub(r"\[[^\]]+\]", " ", s)
    s = re.sub(r"\([^)]*\)", " ", s)
    # Strip release / codec tokens (order: specific patterns before generic years)
    noise_patterns = (
        r"\b\d{3,4}p\b",
        r"\b4K\b",
        r"\bWEB\b",
        r"\bBluRay\b",
        r"\bBrRip\b",
        r"\bx264\b",
        r"\bx265\b",
        r"\bHEVC\b",
        r"\bAV1\b",
        r"\bOpus\b",
        r"\bAAC[\d.]*\b",
        r"\bAC3\b",
        r"\bDTS[\w.-]*\b",
        r"\b10bit\b",
        r"\b5\.1\b",
        r"\b7\.1\b",
        r"\b2\.0\b",
        r"\bEXTENDED\b",
        r"\bREPACK\b",
        r"\bREMASTERED\b",
        r"\bIMAX\b",
        r"\bYIFY\b",
        r"\bYTS\b",
        r"\bMX\b",
        r"\bAM\b",
        r"\bBONE\b",
        r"\bNeoNyx343\b",
        r"-\[YTS[^\]]*",
    )
    for pat in noise_patterns:
        s = re.sub(pat, " ", s, flags=re.I)
    if year is None:
        for m2 in re.finditer(r"\b(19\d{2}|20[0-3]\d)\b", stem):
            y = int(m2.group(1))
            if 1910 <= y <= 2035:
                year = y
                break
    s = re.sub(r"\b(19\d{2}|20[0-3]\d)\b", " ", s)
    s = re.sub(r"\.+", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" -.")
    return s, year


def omdb_poster_url(api_key: str, title: str, year: int | None) -> str | None:
    """OMDb returns a direct Poster URL (requires free API key)."""
    t = urllib.parse.quote(title)
    url = f"https://www.omdbapi.com/?apikey={api_key}&t={t}"
    if year:
        url += f"&y={year}"
    url += "&r=json"
    data = http_json(url)
    if data.get("Response") == "False":
        return None
    poster = (data.get("Poster") or "").strip()
    if not poster or poster.upper() == "N/A":
        return None
    return poster


def tmdb_search_poster(api_key: str, title: str, year: int | None) -> str | None:
    q = urllib.parse.quote(title)
    url = f"https://api.themoviedb.org/3/search/movie?api_key={api_key}&query={q}"
    if year:
        url += f"&year={year}"
    data = http_json(url)
    results = data.get("results") or []
    if not results:
        return None
    path = results[0].get("poster_path")
    if not path:
        return None
    return f"https://image.tmdb.org/t/p/w780{path}"


def ffmpeg_poster_frame(video: Path, jpg: Path, ss: str = "150") -> bool:
    """Write a JPG from one frame of the local video (stream copy decode, single frame)."""
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-ss", ss, "-i", str(video),
        "-map", "0:v:0", "-frames:v", "1",
        "-q:v", "2", str(jpg), "-y",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return False
    return jpg.exists() and jpg.stat().st_size > 2000


def wiki_poster_via_generator_search(title: str, year: int | None) -> str | None:
    """
    One Wikipedia API call: generator=search + pageimages.
    Prefer explicit '(YYYY film)' style queries to avoid unrelated articles.
    """
    queries: list[str] = []
    if year:
        queries.append(f"{title} ({year} film)")
    queries.append(f"{title} (film)")
    queries.append(f"{title} film")
    # e.g. Blade Runner 2049 — title already includes disambiguation
    if title and title[-1].isdigit():
        queries.insert(0, title)
    seen: set[str] = set()
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        gsq = urllib.parse.quote(q)
        url = (
            "https://en.wikipedia.org/w/api.php?action=query&format=json"
            "&generator=search&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=800"
            f"&gsrsearch={gsq}"
        )
        try:
            data = http_json(url)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                raise
            continue
        time.sleep(0.45)
        pages = (data.get("query") or {}).get("pages") or {}
        for _pid, page in pages.items():
            if page.get("missing"):
                continue
            thumb = page.get("thumbnail")
            if thumb and thumb.get("source"):
                return thumb["source"]
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=Path(os.environ.get("MOVIES_DIR", r"E:\Movies")))
    ap.add_argument("--force", action="store_true", help="Overwrite existing .jpg")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--experimental-wikipedia",
        action="store_true",
        help="Try Wikipedia thumbnails if TMDB/OMDb miss (many false positives)",
    )
    ap.add_argument(
        "--ffmpeg-ss",
        default="150",
        help="Seconds into file for ffmpeg fallback poster (default 150)",
    )
    args = ap.parse_args()
    root: Path = args.root
    if not root.is_dir():
        print(f"Not a directory: {root}", file=sys.stderr)
        sys.exit(1)

    tmdb_key = os.environ.get("TMDB_API_KEY", "").strip()
    omdb_key = os.environ.get("OMDB_API_KEY", "").strip()
    if not tmdb_key and not omdb_key:
        print("TMDB_API_KEY / OMDB_API_KEY not set — official posters need a free API key.")
        print("  TMDB: https://www.themoviedb.org/settings/api")
        print("  OMDb: http://www.omdbapi.com/apikey.aspx")
        if not args.experimental_wikipedia:
            print("  Fallback: ffmpeg frame from each video (use --experimental-wikipedia to try Wikipedia).\n")
        else:
            print("  Also using --experimental-wikipedia (unreliable).\n")

    ok = skip = fail = 0
    videos = sorted(
        [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in VIDEO_EXT],
        key=lambda p: str(p).lower(),
    )
    for v in videos:
        jpg = v.with_suffix(".jpg")
        if jpg.exists() and not args.force:
            skip += 1
            continue
        title, year = parse_title_year(v.stem)
        if not title:
            print(f"SKIP (no title): {v.name}")
            fail += 1
            continue
        poster_url: str | None = None
        src = ""
        if tmdb_key:
            try:
                poster_url = tmdb_search_poster(tmdb_key, title, year)
                time.sleep(0.28)
                if poster_url:
                    src = "TMDB"
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                print(f"  TMDB error {v.name}: {e}")
        if not poster_url and omdb_key:
            try:
                poster_url = omdb_poster_url(omdb_key, title, year)
                time.sleep(0.28)
                if poster_url:
                    src = "OMDb"
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                print(f"  OMDb error {v.name}: {e}")
        if not poster_url and args.experimental_wikipedia:
            try:
                poster_url = wiki_poster_via_generator_search(title, year)
                time.sleep(1.4)
                if poster_url:
                    src = "Wikipedia"
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                print(f"  Wiki error {v.name}: {e}")
        if poster_url:
            print(f"{src}: {v.name}")
            if args.dry_run:
                print(f"  -> {poster_url[:80]}...")
                ok += 1
                continue
            try:
                data = http_bytes(poster_url)
                if len(data) < 2000:
                    print(f"  too small ({len(data)} B), skip")
                    fail += 1
                    continue
                tmp = jpg.with_suffix(".jpg.downloading")
                tmp.write_bytes(data)
                tmp.replace(jpg)
                ok += 1
            except OSError as e:
                print(f"  write FAIL: {e}")
                fail += 1
            continue
        # ffmpeg still from local file
        print(f"ffmpeg-frame: {v.name}")
        if args.dry_run:
            ok += 1
            continue
        tmp = jpg.with_suffix(".jpg.downloading")
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        if ffmpeg_poster_frame(v, tmp, args.ffmpeg_ss):
            tmp.replace(jpg)
            ok += 1
        else:
            print(f"  FAIL ffmpeg poster {v.name}")
            fail += 1
    print(f"\nDone. downloaded={ok} skipped_existing={skip} failed={fail} dry_run={args.dry_run}")


if __name__ == "__main__":
    main()
