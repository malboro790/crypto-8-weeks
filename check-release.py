#!/usr/bin/env python3
"""Проверка перед выкаткой.

Падает, если в видимом тексте страниц осталось то, чего посетитель видеть
не должен: пометки для владельца, рыба, незаполненные реквизиты. Комментарии
в разметке не считаются — они посетителю не видны и нужны как раз для того,
чтобы владелец знал, что дозаполнить.

Запуск:  python3 check-release.py
Код 1 — есть находки, деплоить нельзя.
"""
import re, sys, glob

MARKERS = r'ПОДТВЕРДИТЬ|УТОЧНИТЬ|ПРОВЕРИТЬ|TODO|FIXME|Lorem ipsum|XXX'
FILL_CLASS = r'class="fill"'

def visible(html: str) -> str:
    """Текст без комментариев, скриптов и стилей — то, что реально видит человек."""
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    html = re.sub(r'<script\b.*?</script>', '', html, flags=re.S)
    html = re.sub(r'<style\b.*?</style>', '', html, flags=re.S)
    return html

def main() -> int:
    problems = []
    pages = sorted(glob.glob('*.html'))
    for f in pages:
        raw = open(f, encoding='utf-8').read()
        vis = visible(raw)
        for m in re.finditer(MARKERS, vis):
            line = vis[:m.start()].count('\n') + 1
            problems.append(f'{f}:{line}  маркер «{m.group(0)}» в видимом тексте')
        for m in re.finditer(FILL_CLASS, vis):
            line = vis[:m.start()].count('\n') + 1
            problems.append(f'{f}:{line}  незаполненное поле .fill')

    print(f'Проверено страниц: {len(pages)}')
    if problems:
        print(f'НАЙДЕНО ПРОБЛЕМ: {len(problems)}\n')
        for p in problems:
            print('  ' + p)
        print('\nДеплоить нельзя: посетитель увидит служебные пометки.')
        return 1
    print('Чисто: служебных пометок и незаполненных полей в видимом тексте нет.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
