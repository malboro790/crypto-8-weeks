/* ==========================================================================
   SILK — тканевый фон первого экрана

   Порт фона Silk из библиотеки reactbits: собственная реализация того же
   эффекта на голом WebGL, без React и без их исходника. Смысл шейдера
   простой: развёрнутые по повороту координаты прогоняются через двойной
   синус, один внутри другого, — получается интерференция, которая читается
   как складки ткани. Поверх ложится дешёвый детерминированный шум, он
   убирает бандинг на плавных переходах.

   Параметры вынесены в data-атрибуты, чтобы менять их в разметке, а не тут.
   ========================================================================== */
(function () {
  var canvas = document.querySelector('[data-silk]');
  if (!canvas) return;

  var gl = canvas.getContext('webgl', { antialias: false, alpha: true,
                                        premultipliedAlpha: false,
                                        powerPreference: 'low-power' });
  /* Без WebGL просто ничего не рисуем: под канвасом лежит чёрный фон секции,
     и первый экран остаётся рабочим. */
  if (!gl) return;

  var num = function (name, fallback) {
    var v = parseFloat(canvas.getAttribute(name));
    return isNaN(v) ? fallback : v;
  };
  var SPEED     = num('data-speed', 5);
  var SCALE     = num('data-scale', 1);
  var NOISE     = num('data-noise', 1.5);
  var ROTATION  = num('data-rotation', 0);
  var hex       = (canvas.getAttribute('data-color') || '#7B7481').replace('#', '');
  var COLOR = [
    parseInt(hex.substr(0, 2), 16) / 255,
    parseInt(hex.substr(2, 2), 16) / 255,
    parseInt(hex.substr(4, 2), 16) / 255
  ];

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform float uTime;',
    'uniform float uSpeed;',
    'uniform float uScale;',
    'uniform float uNoise;',
    'uniform float uRotation;',
    'uniform vec3  uColor;',
    'uniform vec2  uRes;',

    /* Дешёвый шум без текстур: две синусоиды на несоизмеримых частотах,
       от их произведения берётся дробная часть. Для дизеринга этого хватает. */
    'float grain(vec2 p) {',
    '  const float G = 2.718281828;',
    '  vec2 r = G * sin(G * p);',
    '  return fract(r.x * r.y * (1.0 + p.x));',
    '}',

    'vec2 rotate(vec2 uv, float a) {',
    '  float c = cos(a), s = sin(a);',
    '  return vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);',
    '}',

    'void main() {',
    /* Координаты выправляем по пропорциям окна, иначе складки растягивает
       вместе с ним. */
    '  vec2 uv = vUv;',
    '  uv.x *= uRes.x / max(uRes.y, 1.0);',
    '  uv = rotate(uv, uRotation) * uScale;',

    '  float t = uTime * uSpeed;',
    /* Лёгкая поперечная волна: без неё складки идут строго по диагонали
       и выглядят напечатанными, а не тканью. */
    '  uv.y += 0.03 * sin(8.0 * uv.x - t * 0.1);',

    '  float pattern = 0.6 + 0.4 * sin(',
    '      5.0 * (uv.x + uv.y + cos(3.0 * uv.x + 5.0 * uv.y) + 0.02 * t)',
    '      + sin(20.0 * (uv.x + uv.y - 0.1 * t)));',

    '  float g = grain(gl_FragCoord.xy);',
    '  vec3 col = uColor * pattern - g / 15.0 * uNoise;',
    '  gl_FragColor = vec4(max(col, 0.0), 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ['uTime', 'uSpeed', 'uScale', 'uNoise', 'uRotation', 'uColor', 'uRes'].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });
  gl.uniform1f(U.uSpeed, SPEED);
  gl.uniform1f(U.uScale, SCALE);
  gl.uniform1f(U.uNoise, NOISE);
  gl.uniform1f(U.uRotation, ROTATION);
  gl.uniform3f(U.uColor, COLOR[0], COLOR[1], COLOR[2]);

  /* Пиксельная плотность ограничена: на ретине полноэкранный шейдер в честном
     dpr съедает заметно больше батареи, а складки настолько плавные, что
     разницы не видно. */
  var MAX_DPR = 1.5;
  function resize() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now();
  var raf = null;
  var visible = true;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    resize();
    gl.uniform1f(U.uTime, (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function start() { if (!raf && visible && !reduce) raf = requestAnimationFrame(frame); }
  function stop()  { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  /* Один кадр рисуем всегда — в том числе при выключенной анимации:
     статичная ткань лучше пустого прямоугольника. */
  gl.uniform1f(U.uTime, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      visible ? start() : stop();
    }, { threshold: 0 }).observe(canvas);
  } else {
    start();
  }
  document.addEventListener('visibilitychange', function () {
    document.hidden ? stop() : start();
  });
})();
