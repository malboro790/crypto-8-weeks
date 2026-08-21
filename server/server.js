/* ==========================================================================
   Приём заявок с сайта в Telegram. Render Web Service.

   Зачем отдельный сервис, а не запрос к api.telegram.org прямо со страницы:
   для отправки нужен токен бота. Токен в клиентском JS виден любому — им можно
   писать от имени бота, читать входящие и перевесить webhook. Здесь он живёт
   в переменных окружения Render, а страница знает только адрес сервиса.

   Зависимостей нет: голый http и встроенный fetch. npm install отрабатывает
   мгновенно, обновлять нечего, дыр в чужих пакетах не появляется.
   ========================================================================== */
'use strict';

const http = require('http');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

/* Кто имеет право слать заявки. Через запятую, если адресов несколько. */
const ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://8weekscrypto.com,https://www.8weekscrypto.com,https://malboro790.github.io')
  .split(',').map((s) => s.trim()).filter(Boolean);

/* Telegram разбирает HTML в тексте сообщения, поэтому пользовательские данные
   экранируем: иначе имя с «<» уронит отправку, а то и подставит разметку. */
const esc = (v) =>
  String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cors(res, origin) {
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function readBody(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* Грубое ограничение частоты по адресу: на бесплатном тарифе процесс один,
   так что памяти достаточно. Спасает не от распределённого спама, а от того,
   кто нашёл endpoint и решил постучаться в него в цикле. */
const hits = new Map();
function tooOften(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();      /* не даём карте расти бесконечно */
  return list.length > 5;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  cors(res, origin);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  /* Render пингует сервис, и страница будит его при открытии формы:
     на бесплатном тарифе инстанс засыпает без нагрузки. */
  if (req.method === 'GET') {
    /* Значения не отдаём — только факт наличия, чтобы можно было проверить
       настройку, не заходя в панель. */
    return send(res, 200, BOT_TOKEN && CHAT_ID ? 'ok' : 'ok (no credentials)');
  }

  if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
  /* Origin проверяем до всего остального: иначе посторонний узнаёт по ответу,
     настроен сервис или нет. */
  if (origin && !ORIGINS.includes(origin)) return send(res, 403, 'Forbidden');
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('BOT_TOKEN или CHAT_ID не заданы в окружении');
    return send(res, 500, 'Not configured');
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             req.socket.remoteAddress || 'unknown';
  if (tooOften(ip)) return send(res, 429, 'Too many requests');

  let data;
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, 'Bad JSON');
  }

  /* Приманка для ботов: поле скрыто, человек его не заполняет. Отвечаем 200,
     чтобы отправитель не понял, что его отсекли, и не стал искать обход. */
  if (data.website) return send(res, 200, 'ok');

  const name = String(data.name || '').trim().slice(0, 80);
  const telegram = String(data.telegram || '').trim().slice(0, 80);
  if (name.length < 2 || !telegram) return send(res, 400, 'Bad payload');

  const lines = ['<b>Заявка с сайта</b>', '', `Имя: ${esc(name)}`, `Telegram: ${esc(telegram)}`];
  if (data.package) lines.push(`Пакет: ${esc(String(data.package).slice(0, 120))}`);
  if (data.page) lines.push(`Страница: ${esc(String(data.page).slice(0, 300))}`);

  try {
    const tg = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!tg.ok) {
      /* Ответ Telegram наружу не отдаём: в нём встречается часть токена. */
      console.error('telegram responded', tg.status);
      return send(res, 502, 'Upstream error');
    }
  } catch (e) {
    console.error('telegram request failed', e.message);
    return send(res, 502, 'Upstream error');
  }

  return send(res, 200, 'ok');
});

server.listen(PORT, () => console.log('lead service on', PORT));
