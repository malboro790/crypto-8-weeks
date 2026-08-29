#!/usr/bin/env python3
"""Локальный сервер для v3.

Отдаёт /personal, /business, /contacts и /privacy без расширения — так же,
как это делают Railway и GitHub Pages на проде. Обычный http.server такие
адреса не понимает и вернул бы 404, из-за чего половина ссылок в меню
не работала бы при просмотре.
"""
import http.server, socketserver, os

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and not p.endswith(('/', '.html')):
            if os.path.exists(p + '.html'):
                return p + '.html'
        return p
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', 4175), H) as s:
    print('v3: http://localhost:4175/')
    s.serve_forever()
