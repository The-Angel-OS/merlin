import os

daily = r'E:\DCIM\Daily'
results = []
for name in sorted(os.listdir(daily)):
    p = os.path.join(daily, name)
    if not os.path.isdir(p):
        continue
    root_clips = [f for f in os.listdir(p) if f.lower().endswith('.mp4')]
    all_clips = []
    subs = []
    for root, dirs, files in os.walk(p):
        for f in files:
            if f.lower().endswith('.mp4'):
                all_clips.append(os.path.join(root, f))
        if root == p:
            subs = dirs[:]
    total_bytes = sum(os.path.getsize(c) for c in all_clips)
    results.append({
        'folder': name,
        'root_clips': len(root_clips),
        'total_clips': len(all_clips),
        'subfolders': len(subs),
        'sub_names': subs[:5],
        'size_gb': round(total_bytes / (1024**3), 1)
    })
    print(f"{name:65s} | root:{len(root_clips):4d}  total:{len(all_clips):4d}  subs:{len(subs):2d}  size:{round(total_bytes/(1024**3),1):6.1f} GB")

print()
print("--- TOTALS ---")
total_clips = sum(r['total_clips'] for r in results)
total_gb = sum(r['size_gb'] for r in results)
print(f"Folders: {len(results)}")
print(f"Total clips: {total_clips}")
print(f"Total size: {total_gb:.1f} GB")
