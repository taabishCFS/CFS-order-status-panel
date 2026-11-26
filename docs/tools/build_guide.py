import markdown, sys, subprocess
root = "C:/Users/Admin/Documents/Shopify Custom Apps/cfs-order-status-panel/docs/"
import os
sp = os.path.join(os.environ.get("TEMP", "."), "cfs-guide-build") + "/"
os.makedirs(sp, exist_ok=True)
md = open(root + "guide.md", encoding="utf8").read()
body = markdown.markdown(md, extensions=["tables", "sane_lists"])
css = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: "Segoe UI", Arial, sans-serif; color:#1f2933; font-size:10.5pt; line-height:1.5; }
h1 { font-size:22pt; color:#4d403a; margin:0 0 10px; }
h2 { font-size:14pt; color:#fff; background:#4d403a; padding:6px 10px; border-radius:4px; margin:22px 0 10px; break-after:avoid; }
h3 { font-size:11.5pt; color:#4d403a; margin:14px 0 4px; break-after:avoid; }
p, li { margin:4px 0; } ul, ol { padding-left:22px; }
table { border-collapse:collapse; width:100%; margin:8px 0; break-inside:avoid; font-size:10pt; }
th, td { border:1px solid #c5ccd3; padding:4px 8px; text-align:left; vertical-align:top; }
th { background:#efe9e5; }
code { background:#f1f3f5; padding:1px 4px; border-radius:3px; font-size:9.5pt; }
img { max-width:100%; border:1px solid #c5ccd3; border-radius:4px; margin:8px 0; break-inside:avoid; }
hr { border:0; border-top:1px solid #c5ccd3; margin:14px 0; }
"""
html = f'<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><base href="file:///{root}"><title>CFS Order Panel Staff Guide</title><style>{css}</style></head><body>{body}</body></html>'
open(sp + "guide.html", "w", encoding="utf8").write(html)
subprocess.run(["C:/Program Files/Google/Chrome/Application/chrome.exe", "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={root}guide.pdf", "file:///" + sp + "guide.html"], capture_output=True)
print("ok")
