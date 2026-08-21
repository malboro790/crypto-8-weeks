/* ==========================================================================
   Восемь недель с криптой — site behaviour
   Motion is used to explain, never to decorate. Every interaction degrades
   to readable static content when JS or motion is unavailable.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     CONFIGURATION

     LEAD_ENDPOINT — адрес сервиса, который передаёт заявку в Telegram.
     Это не может быть API Telegram напрямую: токен бота оказался бы в этом
     файле, доступном любому, и писать от имени бота смог бы кто угодно.
     Разверните server/ на Render (см. README) и впишите сюда его адрес.

     TG_FALLBACK — ваш Telegram: используется, если адрес не задан или запрос
     не прошёл, чтобы заявка не потерялась.
     ---------------------------------------------------------------------- */
  var LEAD_ENDPOINT = '';
  var TG_FALLBACK   = '';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------------------- */
  /* Lead form                                                              */
  /* ---------------------------------------------------------------------- */
  (function leadForm() {
    var dialog = $('#leadDialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;  /* no <dialog>: links stay links */

    var form   = $('.lead__box', dialog);
    var note   = $('[data-lead-note]', dialog);
    var pack   = $('[data-lead-pack]', dialog);
    var submit = $('.lead__submit', dialog);
    var label  = $('[data-lead-label]', dialog);
    var opener = null;

    function setNote(text, kind) {
      note.textContent = text || '';
      note.className = 'lead__note' + (kind ? ' is-' + kind : '');
    }

    function open(trigger) {
      opener = trigger || null;
      var p = trigger && trigger.getAttribute('data-package');
      pack.textContent = p || '';
      pack.hidden = !p;
      /* Будим сервис приёма заявок заранее: на бесплатном тарифе Render
         инстанс засыпает после простоя и просыпается около минуты. Пока
         посетитель печатает имя, он успевает подняться. Ответ не нужен,
         поэтому и ошибку глотаем молча. */
      if (LEAD_ENDPOINT) {
        try { fetch(LEAD_ENDPOINT, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(function () {}); }
        catch (e) { /* старый браузер без fetch — не страшно */ }
      }
      dialog.showModal();
      /* Focus the first field, not the close button: the visitor came here to
         type, and <dialog> would otherwise land on whatever is first in DOM. */
      var first = $('.field__input', form);
      if (first) first.focus();
    }

    $$('[data-cta]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        open(a);
      });
    });

    $$('[data-lead-close]', dialog).forEach(function (b) {
      b.addEventListener('click', function () { dialog.close(); });
    });

    /* Click on the backdrop closes: the backdrop is part of <dialog>'s own box,
       so a click landing outside the form's rectangle is a click on it. */
    dialog.addEventListener('click', function (e) {
      if (e.target !== dialog) return;
      var r = form.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right &&
                   e.clientY >= r.top  && e.clientY <= r.bottom;
      if (!inside) dialog.close();
    });

    dialog.addEventListener('close', function () {
      form.classList.remove('is-done');
      form.reset();
      $$('.field', form).forEach(function (f) { f.classList.remove('is-bad'); });
      setNote('');
      submit.disabled = false;
      label.textContent = 'Отправить заявку';
      if (opener && opener.focus) opener.focus();   /* return focus where it came from */
    });

    /* --- validation ------------------------------------------------------ */
    var RULES = {
      name: function (v) {
        if (v.length < 2) return 'Напишите, как к вам обращаться.';
        return '';
      },
      telegram: function (v) {
        /* @name, t.me/name, or a bare handle. Telegram handles are 5–32 chars
           of a–z, 0–9 and underscore. A phone number is accepted too — some
           people have no username at all. */
        var handle = v.replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
        if (/^\+?[\d\s()-]{10,20}$/.test(v)) return '';
        if (!/^[a-zA-Z0-9_]{5,32}$/.test(handle)) return 'Похоже на опечатку. Например: @username';
        return '';
      }
    };

    function validate() {
      var ok = true;
      Object.keys(RULES).forEach(function (name) {
        var input = form.elements[name];
        var field = input.closest('.field');
        var msg = RULES[name](input.value.trim());
        field.classList.toggle('is-bad', !!msg);
        $('[data-err-for="' + name + '"]', form).textContent = msg;
        if (msg && ok) { input.focus(); ok = false; }
      });
      return ok;
    }

    $$('.field__input', form).forEach(function (input) {
      input.addEventListener('input', function () {
        var field = input.closest('.field');
        if (field.classList.contains('is-bad')) field.classList.remove('is-bad');
      });
    });

    /* --- submit ---------------------------------------------------------- */
    function tgLink(text) {
      if (!TG_FALLBACK) return null;
      var handle = TG_FALLBACK.replace(/^@/, '');
      return 'https://t.me/' + handle + (text ? '?text=' + encodeURIComponent(text) : '');
    }

    function failed(payload) {
      var link = tgLink('Заявка: ' + payload.name + ', ' + payload.telegram);
      if (link) {
        setNote('Не получилось отправить. ', 'bad');
        var a = document.createElement('a');
        a.href = link; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Напишите мне напрямую в Telegram';
        note.appendChild(a);
      } else {
        setNote('Не получилось отправить. Попробуйте ещё раз через минуту.', 'bad');
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;

      var payload = {
        name:     form.elements.name.value.trim(),
        telegram: form.elements.telegram.value.trim(),
        package:  pack.hidden ? '' : pack.textContent,
        page:     location.href,
        website:  form.elements.website.value
      };

      if (!LEAD_ENDPOINT) { failed(payload); return; }

      submit.disabled = true;
      label.textContent = 'Отправляю…';
      setNote('');

      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r; })
        .then(function () {
          form.classList.add('is-done');
          setNote('Заявка отправлена. Я напишу вам в Telegram в ближайшее время.', 'ok');
        })
        .catch(function () { failed(payload); })
        .then(function () {
          submit.disabled = false;
          label.textContent = 'Отправить заявку';
        });
    });
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
  /* Header: stuck state + sticky mobile CTA                                */
  /* ---------------------------------------------------------------------- */
  (function chrome() {
    var header = $('#header');
    var sticky = $('#stickycta');
    var hero = $('.hero');
    var ticking = false;

    function update() {
      var y = window.scrollY;
      if (header) header.classList.toggle('is-stuck', y > 24);

      if (sticky) {
        var heroBottom = hero ? hero.offsetTop + hero.offsetHeight : 600;
        var docEnd = document.documentElement.scrollHeight - window.innerHeight - 320;
        sticky.classList.toggle('is-on', y > heroBottom && y < docEnd);
      }
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

    function draw() {
      svg.innerHTML = '';
      if (window.innerWidth <= 900) return;
      risks.forEach(function (r) {
        var x = parseFloat(r.style.getPropertyValue('--x'));
        var y = parseFloat(r.style.getPropertyValue('--y'));
        if (isNaN(x) || isNaN(y)) return;
        var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ln.setAttribute('x1', '50'); ln.setAttribute('y1', '50');
        ln.setAttribute('x2', x);    ln.setAttribute('y2', y);
        svg.appendChild(ln);
      });
    }
    draw();
    window.addEventListener('resize', draw);
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
