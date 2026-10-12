#!/usr/bin/env python3
"""Gera artifact.html: o app inteiro (CSS + scripts) em um único arquivo HTML, para publicar como artifact."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'www'
html = (root / 'index.html').read_text(encoding='utf-8')
html = re.sub(r'<link rel="(?:manifest|icon|apple-touch-icon)"[^>]*>\n?', '', html)
html = re.sub(r'<link rel="stylesheet" href="style\.css">', lambda m: '<style>\n' + (root / 'style.css').read_text(encoding='utf-8') + '\n</style>', html)
def inline(m):
    js = (root / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return '<script>\n' + js + '\n</script>'
html = re.sub(r'<script src="([^"]+\.js)"></script>', inline, html)
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'artifact.html')
out.write_text(html, encoding='utf-8')
print(out, len(html) // 1024, 'KB')
