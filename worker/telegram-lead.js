/* ==========================================================================
   Приём заявок с сайта в Telegram.

   Зачем отдельный воркер, а не запрос к api.telegram.org прямо со страницы:
   для отправки нужен токен бота. Токен, положенный в клиентский JS, виден
   любому — им можно писать от имени бота, читать входящие и перевесить
   webhook. Поэтому токен живёт здесь, в секретах воркера, а страница знает
   только адрес воркера.

   Развёртывание — Cloudflare Workers, бесплатного тарифа хватает с запасом:

     npm i -g wrangler
     wrangler login
     wrangler deploy worker/telegram-lead.js --name crypto-8-weeks-leads
     wrangler secret put BOT_TOKEN   --name crypto-8-weeks-leads
     wrangler secret put CHAT_ID     --name crypto-8-weeks-leads

   BOT_TOKEN — то, что выдал @BotFather.
   CHAT_ID   — куда слать. Свой id можно узнать у @userinfobot.

   Полученный адрес вида https://crypto-8-weeks-leads.<ваш>.workers.dev
   впишите в LEAD_ENDPOINT в assets/js/main.js.
   ========================================================================== */

const ALLOWED_ORIGIN = 'https://malboro790.github.io';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* Telegram разбирает HTML в сообщениях, поэтому пользовательский текст
   экранируем — иначе имя с «<» уронит отправку, а то и подставит разметку. */
const esc = (s) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response('Bad JSON', { status: 400, headers: cors });
    }

    const name = String(data.name || '').trim().slice(0, 80);
    const telegram = String(data.telegram || '').trim().slice(0, 80);
    if (name.length < 2 || !telegram) {
      return new Response('Bad payload', { status: 400, headers: cors });
    }

    /* Приманка для ботов: поле honeypot в форме скрыто, человек его не
       заполнит. Отвечаем 200, чтобы спамер не понял, что его отсекли. */
    if (data.website) return new Response('OK', { headers: cors });

    const lines = [
      '<b>Заявка с сайта</b>',
      '',
      `Имя: ${esc(name)}`,
      `Telegram: ${esc(telegram)}`,
    ];
    if (data.package) lines.push(`Пакет: ${esc(data.package)}`);
    if (data.page) lines.push(`Страница: ${esc(data.page)}`);

    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      /* Тело ответа Telegram наружу не отдаём: в нём бывает часть токена. */
      return new Response('Upstream error', { status: 502, headers: cors });
    }
    return new Response('OK', { headers: cors });
  },
};
