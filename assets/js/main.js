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
  /* A/B hero variants: ?v=a | b | c   (add ?ab=1 for a visible switcher)    */
  /* ---------------------------------------------------------------------- */
  (function heroVariants() {
    var params = new URLSearchParams(location.search);
    var v = (params.get('v') || 'b').toLowerCase();
    if (['a', 'b', 'c'].indexOf(v) < 0) v = 'b';

    function apply(which) {
      $$('[data-cover]').forEach(function (el) {
        el.classList.toggle('is-on', el.getAttribute('data-cover') === which);
      });
      $$('[data-ab]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-ab') === which));
      });
    }
    apply(v);

    if (params.get('ab') === '1') {
      var box = document.createElement('div');
      box.className = 'abswitch';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Варианты первого экрана');
      ['a', 'b', 'c'].forEach(function (k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-ab', k);
        b.textContent = k.toUpperCase();
        b.addEventListener('click', function () { apply(k); });
        box.appendChild(b);
      });
      document.body.appendChild(box);
      apply(v);
    }
  })();

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
  /* Risk field: hairlines from the centre out to each failure mode         */
  /* ---------------------------------------------------------------------- */
  (function riskField() {
    var field = $('#riskfield');
    if (!field) return;
    var svg = $('.riskfield__svg', field);
    var risks = $$('.risk', field);

    var core = $('.riskfield__core', field);

    /* Раньше координаты брались из инлайновых --x/--y, поэтому на мобильной
       раскладке, где положение задаётся из CSS, лучи было нечем построить —
       и схема там вырождалась в список. Теперь позиции измеряются по факту:
       одна логика на все ширины. */
    function draw() {
      svg.innerHTML = '';
      var fr = field.getBoundingClientRect();
      if (!fr.width || !fr.height) return;
      var cr = core.getBoundingClientRect();
      var cx = (cr.left + cr.width / 2 - fr.left) / fr.width * 100;
      var cy = (cr.top + cr.height / 2 - fr.top) / fr.height * 100;

      risks.forEach(function (r) {
        var rr = r.getBoundingClientRect();
        if (!rr.width) return;
        var x = (rr.left + rr.width / 2 - fr.left) / fr.width * 100;
        var y = (rr.top + rr.height / 2 - fr.top) / fr.height * 100;
        var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ln.setAttribute('x1', cx.toFixed(2)); ln.setAttribute('y1', cy.toFixed(2));
        ln.setAttribute('x2', x.toFixed(2));  ln.setAttribute('y2', y.toFixed(2));
        svg.appendChild(ln);
      });
    }
    draw();
    window.addEventListener('resize', draw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
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
    $$('.week__head').forEach(function (head) {
      var body = document.getElementById(head.getAttribute('aria-controls'));
      if (!body) return;
      head.addEventListener('click', function () {
        var open = head.getAttribute('aria-expanded') === 'true';
        head.setAttribute('aria-expanded', String(!open));
        body.classList.toggle('is-open', !open);
      });
    });
  })();

  /* ---------------------------------------------------------------------- */
  /* Outcome: capabilities check in sequence                                */
  /* ---------------------------------------------------------------------- */
  (function outcome() {
    var list = $('#outcome');
    if (!list) return;
    var items = $$('li', list);
    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(function (li) { li.classList.add('is-on'); });
      return;
    }
    var oo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        oo.disconnect();
        items.forEach(function (li, i) {
          setTimeout(function () { li.classList.add('is-on'); }, 90 * i);
        });
      });
    }, { threshold: 0.2 });
    oo.observe(list);
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
