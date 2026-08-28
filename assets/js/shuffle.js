/* ==========================================================================
   SHUFFLE — перебор букв в заголовке первого экрана

   Порт эффекта Shuffle из reactbits: собственная реализация, без React
   и без их исходника. Каждая буква живёт в своей ячейке с обрезкой; внутри
   ячейки лежат две буквы — случайная и настоящая. Ячейка едет влево ровно
   на свою ширину, поэтому случайная уходит за левый край, а настоящая
   въезжает справа. Ширины букв берутся из метрик шрифта, так что слово
   остаётся ровно тем же и по-прежнему упирается в края сетки.

   Параметры соответствуют запрошенным: direction right, duration 0.35,
   evenodd, shuffleTimes 1, power3.out, stagger 0.03, threshold 0.1,
   triggerOnce, triggerOnHover, respectReducedMotion.
   ========================================================================== */
(function () {
  var NS = 'http://www.w3.org/2000/svg';

  var host = document.querySelector('[data-shuffle]');
  if (!host) return;
  var svg = host.tagName.toLowerCase() === 'svg' ? host : host.querySelector('svg');
  var src = svg && svg.querySelector('text');
  if (!svg || !src) return;

  var WORD     = src.textContent.trim();
  var DURATION = 350;    /* мс на букву */
  var STAGGER  = 30;     /* мс между буквами */
  var POOL     = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;    /* respectReducedMotion: слово просто стоит на месте */

  var fontSize = parseFloat(getComputedStyle(src).fontSize) || 254;
  var weight   = getComputedStyle(src).fontWeight || '600';
  var family   = getComputedStyle(src).fontFamily || 'Geist';
  var baseline = parseFloat(src.getAttribute('y')) || 0;
  var startX   = parseFloat(src.getAttribute('x')) || 0;

  /* Ширины букв меряем на канвасе: getBBox у <text> в браузерах отдаёт
     габарит строки, а не отдельного глифа. */
  var ctx = document.createElement('canvas').getContext('2d');
  ctx.font = weight + ' ' + fontSize + 'px ' + family;

  var cells = [];
  function build() {
    cells.length = 0;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);

    /* Область обрезки берём с запасом по вертикали: буквы выше и ниже
       базовой линии не должны срезаться собственной ячейкой. */
    var top = baseline - fontSize * 1.1;
    var height = fontSize * 1.5;

    var x = startX;
    for (var i = 0; i < WORD.length; i++) {
      var ch = WORD[i];
      var w = ctx.measureText(ch).width;
      var id = 'shuffle-cell-' + i;

      var clip = document.createElementNS(NS, 'clipPath');
      clip.setAttribute('id', id);
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', top);
      rect.setAttribute('width', w);
      rect.setAttribute('height', height);
      clip.appendChild(rect);
      defs.appendChild(clip);

      var g = document.createElementNS(NS, 'g');
      g.setAttribute('clip-path', 'url(#' + id + ')');

      var ghost = document.createElementNS(NS, 'text');
      ghost.setAttribute('x', x - w);
      ghost.setAttribute('y', baseline);
      ghost.textContent = POOL[(Math.random() * POOL.length) | 0];

      var real = document.createElementNS(NS, 'text');
      real.setAttribute('x', x);
      real.setAttribute('y', baseline);
      real.textContent = ch;

      g.appendChild(ghost);
      g.appendChild(real);
      svg.appendChild(g);

      cells.push({ g: g, ghost: ghost, w: w });
      x += w;
    }
  }

  /* evenodd: сначала едут чётные буквы, следом нечётные. Одна общая волна
     слева направо выглядит как бегущая строка, а не как перебор. */
  function delayFor(i, n) {
    var evens = Math.ceil(n / 2);
    return (i % 2 === 0 ? i / 2 : evens + (i - 1) / 2) * STAGGER;
  }

  function easeOut(t) { var u = 1 - t; return 1 - u * u * u; }   /* power3.out */

  var running = false;
  var guard = null;

  /* Финал схлопываем обратно в одну строку: ячейки с обрезкой нужны только
     на время анимации. Вызов идемпотентен — его дёргает и последний кадр,
     и страховочный таймер. */
  function finish() {
    if (!running) return;
    if (guard) { clearTimeout(guard); guard = null; }
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.appendChild(src);
    running = false;
  }

  function play() {
    if (running) return;
    running = true;
    build();

    var n = cells.length;
    var t0 = performance.now();
    var total = DURATION + delayFor(n - 1, n);

    /* Страховка на случай, когда кадры не приходят вовсе: во вкладке,
       открытой в фоне, requestAnimationFrame не вызывается, и без этого
       таймера заголовок навсегда остался бы набором случайных букв. */
    guard = setTimeout(finish, total + 400);

    (function tick(now) {
      if (!running) return;
      var el = now - t0;
      for (var i = 0; i < n; i++) {
        var c = cells[i];
        var p = (el - delayFor(i, n)) / DURATION;
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        c.g.setAttribute('transform', 'translate(' + (c.w * (1 - easeOut(p))) + ' 0)');
      }
      if (el < total) { requestAnimationFrame(tick); return; }
      finish();
    })(t0);
  }

  /* triggerOnce по появлению в кадре + повтор по наведению. */
  var fired = false;
  function once() { if (!fired) { fired = true; play(); } }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      once();
    }, { threshold: 0.1 });
    io.observe(svg);
  } else {
    once();
  }

  host.addEventListener('pointerenter', play);
})();
