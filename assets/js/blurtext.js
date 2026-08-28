/* ==========================================================================
   BLUR TEXT — появление заголовка первого экрана

   Порт эффекта BlurText из reactbits: собственная реализация, без React
   и без их исходника. Слово разбирается на буквы, каждая появляется из
   размытия со сдвигом сверху, с задержкой относительно предыдущей.

   Буквы расставляются по метрикам шрифта, а не автоматическим потоком:
   слово должно упираться в края сетки ровно так же, как до разбора,
   иначе на первом экране поедет вся композиция.
   ========================================================================== */
(function () {
  var NS = 'http://www.w3.org/2000/svg';

  var host = document.querySelector('[data-blurtext]');
  if (!host) return;
  var svg = host.tagName.toLowerCase() === 'svg' ? host : host.querySelector('svg');
  var src = svg && svg.querySelector('text');
  if (!svg || !src) return;

  var DURATION = 700;   /* мс на букву */
  var STAGGER  = 90;    /* мс между буквами */
  var BLUR     = 14;    /* стартовое размытие, px */
  var RISE     = 22;    /* стартовый сдвиг сверху, в единицах viewBox */

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var WORD     = src.textContent.trim();
  var cs       = getComputedStyle(src);
  var fontSize = parseFloat(cs.fontSize) || 254;
  var baseline = parseFloat(src.getAttribute('y')) || 0;
  var startX   = parseFloat(src.getAttribute('x')) || 0;

  /* Ширины букв меряем на канвасе: getBBox у <text> отдаёт габарит строки,
     а не отдельного глифа. */
  var ctx = document.createElement('canvas').getContext('2d');
  ctx.font = (cs.fontWeight || '600') + ' ' + fontSize + 'px ' + (cs.fontFamily || 'Geist');

  var letters = [];
  function build() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    letters.length = 0;
    var x = startX;
    for (var i = 0; i < WORD.length; i++) {
      var ch = WORD[i];
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x);
      t.setAttribute('y', baseline);
      t.textContent = ch;
      t.style.opacity = '0';
      svg.appendChild(t);
      letters.push(t);
      x += ctx.measureText(ch).width;
    }
  }

  function easeOut(t) { var u = 1 - t; return 1 - u * u * u; }

  var done = false;
  function finish() {
    if (done) return;
    done = true;
    if (guard) { clearTimeout(guard); guard = null; }
    /* Возвращаем одну строку: шесть отдельных букв нужны только на время
       появления, дальше это лишние узлы. */
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.appendChild(src);
  }

  var guard = null;
  function play() {
    build();
    var n = letters.length;
    var total = DURATION + STAGGER * (n - 1);

    /* Страховка: во вкладке, открытой в фоне, requestAnimationFrame не
       вызывается вовсе — без таймера заголовок остался бы невидимым. */
    guard = setTimeout(finish, total + 400);

    var t0 = performance.now();
    (function tick(now) {
      if (done) return;
      var el = now - t0;
      for (var i = 0; i < n; i++) {
        var p = (el - i * STAGGER) / DURATION;
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        var e = easeOut(p);
        var s = letters[i].style;
        s.opacity = e;
        s.filter = p < 1 ? 'blur(' + (BLUR * (1 - e)).toFixed(2) + 'px)' : 'none';
        letters[i].setAttribute('transform', 'translate(0 ' + (-RISE * (1 - e)).toFixed(2) + ')');
      }
      if (el < total) { requestAnimationFrame(tick); return; }
      finish();
    })(t0);
  }

  /* triggerOnce по появлению в кадре. */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      play();
    }, { threshold: 0.1 });
    io.observe(svg);
  } else {
    play();
  }
})();
