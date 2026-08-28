/* ==========================================================================
   Восемь недель с криптой — site behaviour
   Motion is used to explain, never to decorate. Every interaction degrades
   to readable static content when JS or motion is unavailable.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     CONFIGURATION

     TG_URL — куда ведут все кнопки призыва. Открываем личку в Telegram
     с заранее написанным сообщением, чтобы человеку оставалось только
     нажать «отправить»: форма с полями отсеивала тех, кому проще написать.
     ---------------------------------------------------------------------- */
  var TG_URL = 'https://t.me/Andrey_KERBERagency?text=%D0%94%D0%BE%D0%B1%D1%80%D1%8B%D0%B9%20%D0%B4%D0%B5%D0%BD%D1%8C%21%20%D0%A5%D0%BE%D1%87%D1%83%20%D0%BF%D0%BE%D0%B4%D1%80%D0%BE%D0%B1%D0%BD%D0%B5%D0%B5%20%D1%83%D0%B7%D0%BD%D0%B0%D1%82%D1%8C%20%D0%BF%D1%80%D0%BE%20%D0%BB%D0%B8%D1%87%D0%BD%D0%BE%D0%B5%20%D0%B2%D0%B5%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%BD%D0%B0%202%20%D0%BC%D0%B5%D1%81%D1%8F%D1%86%D0%B0%20%D0%B8%20%D0%B7%D0%B0%D0%BF%D0%B8%D1%81%D0%B0%D1%82%D1%8C%D1%81%D1%8F%20%D0%BD%D0%B0%20%D0%BB%D0%B8%D1%87%D0%BD%D1%8B%D0%B9%20%D0%B7%D0%B2%D0%BE%D0%BD%D0%BE%D0%BA.';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------------------- */
  /* Кнопки призыва ведут в личку                                           */
  /* ---------------------------------------------------------------------- */
  (function ctaLinks() {
    $$('[data-cta]').forEach(function (a) {
      a.setAttribute('href', TG_URL);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  })();

  /* Списки тарифов приходят раскрытыми — так их видят поисковики и читалки,
     и так они работают без JS. На узком экране схлопываем: раскрытая карточка
     иначе занимает полтора экрана. */
  (function collapseTiers() {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    $$('.tier__more').forEach(function (d) { d.removeAttribute('open'); });
  })();

  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------------------- */
  /* Reveal on scroll                                                       */
  /* ---------------------------------------------------------------------- */
  var io = null;
  if ('IntersectionObserver' in window && !reduceMotion) {
    /* threshold 0 — a block reveals the moment any part of it enters the
       viewport. A percentage threshold would keep blocks taller than the
       screen invisible until scrolled deep into, leaving a blank band at the
       top of the viewport that reads as broken layout. */
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });
    $$('[data-reveal]').forEach(function (el) { io.observe(el); });

    /* Safety net: anything at or above the fold is shown without waiting for a
       callback — covers restored scroll positions, in-page anchor jumps and
       very fast scrolling, where a delayed reveal would show an empty section. */
    var settle = function () {
      var limit = window.scrollY + window.innerHeight;
      $$('[data-reveal]').forEach(function (el) {
        if (el.classList.contains('is-in')) return;
        if (el.getBoundingClientRect().top + window.scrollY < limit) {
          el.classList.add('is-in');
          io.unobserve(el);
        }
      });
    };
    window.addEventListener('load', settle);
    window.addEventListener('hashchange', function () { setTimeout(settle, 60); });
    setTimeout(settle, 0);
  } else {
    $$('[data-reveal]').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------------------------------------------------------------------- */
  /* Header: stuck state                                                    */
  /* ---------------------------------------------------------------------- */
  (function chrome() {
    var header = $('#header');
    var ticking = false;

    function update() {
      var y = window.scrollY;
      if (header) header.classList.toggle('is-stuck', y > 24);
      ticking = false;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  })();

  /* ---------------------------------------------------------------------- */
  /* Mobile drawer                                                          */
  /* ---------------------------------------------------------------------- */
  (function drawer() {
    var burger = $('#burger');
    var panel = $('#drawer');
    if (!burger || !panel) return;

    function setOpen(open) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      panel.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
      if (open) { panel.removeAttribute('inert'); }
      else { panel.setAttribute('inert', ''); }
    }

    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        burger.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) setOpen(false);
    });
  })();

  /* ---------------------------------------------------------------------- */
  /* Story: lines light up as they are read                                 */
  /* ---------------------------------------------------------------------- */
  (function story() {
    var lines = $$('[data-story]');
    if (!lines.length) return;
    if (!('IntersectionObserver' in window) || reduceMotion) {
      lines.forEach(function (l) { l.classList.add('is-lit'); });
      return;
    }
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-lit');
          so.unobserve(en.target);
        }
      });
    }, { threshold: 0.6, rootMargin: '0px 0px -12% 0px' });
    lines.forEach(function (l) { so.observe(l); });
  })();

  /* ---------------------------------------------------------------------- */
  /* Ecosystem map                                                          */
  /* ---------------------------------------------------------------------- */
  (function ecosystem() {
    var map = $('#ecoMap');
    if (!map) return;
    var svg = $('#ecoSvg');
    var titleEl = $('#ecoTitle');
    var descEl = $('#ecoDesc');
    var nodes = $$('.eco__node', map);
    var byId = {};
    var lines = [];

    nodes.forEach(function (n) { byId[n.getAttribute('data-id')] = n; });

    function pos(n) {
      return {
        x: parseFloat(n.style.getPropertyValue('--x')),
        y: parseFloat(n.style.getPropertyValue('--y'))
      };
    }

    function draw() {
      svg.innerHTML = '';
      lines = [];
      if (window.innerWidth < 901) return;
      var seen = {};
      nodes.forEach(function (n) {
        var id = n.getAttribute('data-id');
        var links = (n.getAttribute('data-links') || '').split(',').filter(Boolean);
        links.forEach(function (other) {
          var key = [id, other].sort().join('|');
          if (seen[key] || !byId[other]) return;
          seen[key] = true;
          var a = pos(n), b = pos(byId[other]);
          if (isNaN(a.x) || isNaN(b.x)) return;
          var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y);
          ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
          svg.appendChild(ln);
          lines.push({ el: ln, a: id, b: other });
        });
      });
    }

    nodes.forEach(function (n) {
      n.addEventListener('click', function () {
        var id = n.getAttribute('data-id');
        nodes.forEach(function (o) { o.classList.toggle('is-sel', o === n); });
        lines.forEach(function (l) {
          l.el.classList.toggle('is-hot', l.a === id || l.b === id);
        });
        titleEl.textContent = n.textContent.trim();
        descEl.textContent = n.getAttribute('data-def') || '';
      });
    });

    draw();
    window.addEventListener('resize', draw);
  })();

  /* ---------------------------------------------------------------------- */
  /* Program accordion                                                      */
  /* ---------------------------------------------------------------------- */
  (function program() {
    var heads = $$('.week__head');
    if (!heads.length) return;

    var pairs = heads.map(function (head) {
      return { head: head, body: document.getElementById(head.getAttribute('aria-controls')) };
    }).filter(function (p) { return p.body; });

    function setOpen(p, open) {
      p.head.setAttribute('aria-expanded', String(open));
      p.body.classList.toggle('is-open', open);
    }

    /* Раскрыта всегда ровно одна неделя. Восемь одновременно открытых недель
       давали экран сплошного текста, в котором нельзя было сравнить два
       соседних пункта — приходилось листать. */
    pairs.forEach(function (p, i) {
      setOpen(p, i === 0);
      p.head.addEventListener('click', function () {
        var open = p.head.getAttribute('aria-expanded') === 'true';
        /* Повторный клик по раскрытой неделе на десктопе ничего не делает:
           пустой аккордеон оставлял дыру там, где только что был текст.
           На телефоне закрыть можно — там открытая неделя занимает экран. */
        if (open && !window.matchMedia('(max-width: 900px)').matches) return;
        pairs.forEach(function (q) { setOpen(q, q === p && !open); });
      });
    });
  })();

  /* ---------------------------------------------------------------------- */
  /* Секции прилипают к верху, следующая наезжает сверху                    */
  /* ---------------------------------------------------------------------- */
  (function pinSections() {
    var secs = $$('#main > section');
    if (!secs.length) return;

    function bg(el) { return el ? getComputedStyle(el).backgroundColor : ''; }

    /* Прилипает только то, что меняет цвет: приём читается как передача
       цвета, белое наезжает на чёрное. Между двумя одинаково чёрными
       секциями видно лишь то, что текст ни с того ни с сего замер, —
       обычная прокрутка там честнее.

       Дальше два случая.

       Секция размером с окно прилипает верхним краем к нулю. Короткую
       (меньше 92% высоты) не трогаем: под ней осталась бы полоса следующей
       секции, и наезд одной на другую перестал бы читаться.

       Секция выше окна прилипает отрицательным смещением: top равен vh − h,
       поэтому она замирает ровно тогда, когда её нижний край доходит до низа
       окна. Дальше на месте стоит последний экран секции — то же самое, что
       и в первом случае, только для длинного блока. Нулевой top здесь сломал
       бы страницу: секция замерла бы верхним краем, и всё, что ниже сгиба,
       стало бы недостижимым.

       Высота окна решает всё, поэтому пересчёт идёт на каждый ресайз. */
    function apply() {
      var vh = window.innerHeight;
      /* Отрицательное смещение считается от высоты окна, а на телефоне она
         меняется на ходу вместе с адресной строкой: посчитанный top мгновенно
         устаревает, и секция замирает не там, где нужно. Длинные блоки
         прилипают только на широких экранах. */
      var long = window.matchMedia('(min-width: 1025px)').matches;
      secs.forEach(function (s, i) {
        var next = secs[i + 1] || document.querySelector('.footer');
        /* Дробная высота, а не offsetHeight: тот округляет до целого, и при
           смещении на пару десятых пикселя нижний край прилипшей секции
           вставал выше низа окна — по низу экрана проскакивала полоска
           того, что лежит под ней.

           Округление строго вверх плюс запасной пиксель: смещение
           отрицательное, поэтому вверх — это в сторону нуля, и нижний край
           гарантированно уходит за низ окна, а не не доходит до него.
           Переполнение прячется под сгибом и попадает на собственное поле
           секции, так что ничего не срезается. */
        var h = s.getBoundingClientRect().height;
        var tall = h > vh;
        var pin = bg(s) !== bg(next) && (tall ? long : h >= vh * 0.92);
        s.classList.toggle('is-pinned', pin);
        s.style.top = (pin && tall) ? (Math.ceil(vh - h) + 1) + 'px' : '';
      });
    }
    apply();

    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(apply, 120);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
  })();

  /* ---------------------------------------------------------------------- */
  /* Stats: numbers count up once                                           */
  /* ---------------------------------------------------------------------- */
  (function stats() {
    var els = $$('[data-count]');
    if (!els.length || reduceMotion || !('IntersectionObserver' in window)) return;

    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        so.unobserve(el);

        var target = parseInt(el.getAttribute('data-count'), 10);
        var numNode = null;
        Array.prototype.forEach.call(el.childNodes, function (n) {
          if (n.nodeType === 3 && n.textContent.trim()) numNode = n;
        });
        if (!numNode || isNaN(target)) return;

        var start = performance.now();
        var dur = 900;
        (function tick(now) {
          var p = Math.min(1, (now - start) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          numNode.textContent = String(Math.round(target * eased));
          if (p < 1) requestAnimationFrame(tick);
        })(start);
      });
    }, { threshold: 0.6 });

    els.forEach(function (el) { so.observe(el); });
  })();

})();
