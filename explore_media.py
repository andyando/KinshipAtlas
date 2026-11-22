import os, json, re, sys

BASE = r"G:\Kinship Atlas - Copy\tree-app"

# Check selections json
sel_path = os.path.join(BASE, "kinship-selections.json")
with open(sel_path, "r", encoding="utf-8") as f:
    sel = json.load(f)
print("app:", sel["app"], "version:", sel["version"])
for k, v in sel["selections"].items():
    if isinstance(v, dict):
        print(f"\nselections.{k}: dict with {len(v)} entries")
        keys = list(v.keys())
        for kk in keys[:3]:
            print(f"   [{kk}] = {json.dumps(v[kk], ensure_ascii=False)[:300]}")
    elif isinstance(v, list):
        print(f"\nselections.{k}: list with {len(v)} items")
        for item in v[:3]:
            print("   ", json.dumps(item, ensure_ascii=False)[:300])
    else:
        print(f"\nselections.{k}: {type(v).__name__} = {str(v)[:200]}")


