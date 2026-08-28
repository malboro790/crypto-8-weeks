#!/usr/bin/env python3
"""
Bundle the site into one self-contained HTML file.

The Artifact host blocks every external request except Google Fonts, and it
wraps the file in its own <!doctype>/<html>/<head>/<body>. So this script:
  - inlines the three stylesheets and both scripts
  - embeds all 98 coin marks as data URIs and rewires coinpit.js to read them
  - collapses the dark palette onto bare :root, because the site forces dark
    and the artifact cannot carry the data-theme attribute on <html>
  - emits page content only, with no document skeleton of its own
"""
import base64
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'dist', 'index.html')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as fh:
        return fh.read()


# ---------------------------------------------------------------- stylesheets
tokens = read('assets', 'css', 'tokens.css')
styles = read('assets', 'css', 'styles.css')
responsive = read('assets', 'css', 'responsive.css')

# Pull the dark palette out of :root[data-theme="dark"] and make it the default.
m = re.search(r':root\[data-theme="dark"\]\s*\{(.*?)\n\}', tokens, re.S)
if not m:
    sys.exit('dark palette block not found in tokens.css')
dark_body = m.group(1)

def drop_block(text, opener):
    """Remove a CSS block by matching braces — indentation-proof, unlike a regex."""
    i = text.find(opener)
    if i == -1:
        return text
    j = text.index('{', i)
    depth = 0
    for k in range(j, len(text)):
        if text[k] == '{':
            depth += 1
        elif text[k] == '}':
            depth -= 1
            if depth == 0:
                return text[:i] + text[k + 1:]
    sys.exit('unbalanced braces after %r' % opener)


# Drop both conditional blocks; the bundle is dark unconditionally.
tokens = drop_block(tokens, '@media (prefers-color-scheme: dark)')
tokens = drop_block(tokens, ':root[data-theme="dark"]')
tokens = tokens.rstrip() + (
    '\n\n/* The site commits to a single dark world, so the palette that lived\n'
    '   behind prefers-color-scheme is the default here. */\n'
    ':root {' + dark_body + '\n}\n'
)

css = '\n'.join([tokens, styles, responsive])

# --------------------------------------------------------------- hero backdrop
# Optional: embed it if present, otherwise drop the rule so the bundle carries
# no dead reference to a file that will never resolve inside the artifact.
bg_path = None
for ext in ('jpg', 'jpeg', 'png', 'webp'):
    cand = os.path.join(ROOT, 'assets', 'img', 'hero-bg.' + ext)
    if os.path.exists(cand):
        bg_path = cand
        break

if bg_path:
    mime = 'image/jpeg' if bg_path.endswith(('jpg', 'jpeg')) else \
           'image/png' if bg_path.endswith('png') else 'image/webp'
    with open(bg_path, 'rb') as fh:
        bg_uri = 'data:%s;base64,%s' % (mime, base64.b64encode(fh.read()).decode('ascii'))
    css = css.replace('url("../img/hero-bg.jpg")', 'url("%s")' % bg_uri)
    print('hero backdrop embedded: %s (%.2f MB)'
          % (os.path.basename(bg_path), os.path.getsize(bg_path) / 1024 / 1024))
else:
    css = css.replace('url("../img/hero-bg.jpg")', 'none')
    print('hero backdrop: no file at assets/img/hero-bg.* — layer left empty')

# ---------------------------------------------------------------- coin marks
coins_dir = os.path.join(ROOT, 'assets', 'coins')
coin_data = {}
for name in sorted(os.listdir(coins_dir)):
    if not name.endswith('.png'):
        continue
    with open(os.path.join(coins_dir, name), 'rb') as fh:
        b64 = base64.b64encode(fh.read()).decode('ascii')
    coin_data[name[:-4]] = 'data:image/png;base64,' + b64

coin_js = 'var COIN_DATA = {' + ','.join(
    '"%s":"%s"' % (k, v) for k, v in sorted(coin_data.items())
) + '};'

# ---------------------------------------------------------------- scripts
coinpit = read('assets', 'js', 'coinpit.js')
if "img.src = 'assets/coins/' + name + '.png';" not in coinpit:
    sys.exit('coin src line not found in coinpit.js')
coinpit = coinpit.replace(
    "img.src = 'assets/coins/' + name + '.png';",
    "img.src = COIN_DATA[name] || '';"
)
main = read('assets', 'js', 'main.js')

# ---------------------------------------------------------------- page body
html = read('index.html')
body = re.search(r'<body>(.*)</body>', html, re.S)
if not body:
    sys.exit('<body> not found in index.html')
body = body.group(1)
body = re.sub(r'<script[^>]*src=[^>]*></script>', '', body)  # local scripts are inlined below

FONTS = ('https://fonts.googleapis.com/css2?family=Geist:wght@300..700'
         '&family=Geist+Mono:wght@400;500&display=swap')

out = [
    # Not part of the document skeleton, but required: without it a host that
    # serves the file without a charset renders Cyrillic as mojibake.
    '<meta charset="utf-8">',
    '<title>Восемь недель с криптой</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="%s">' % FONTS,
    '<style>\n%s\n</style>' % css,
    body.strip(),
    '<script>\n%s\n%s\n</script>' % (coin_js, coinpit),
    '<script>\n%s\n</script>' % main,
]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(out))

size = os.path.getsize(OUT)
print('written: %s' % OUT)
print('size: %.2f MB (limit 16 MB)' % (size / 1024 / 1024))
print('coins embedded: %d' % len(coin_data))
