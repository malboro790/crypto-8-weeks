/* ==========================================================================
   WARP TEXT — hero headline
   Портирован с reactbits.dev/text-animations/warp-text: тот же приём и та же
   математика шейдера, но на голом WebGL2. В проекте нет сборки, React и ogl,
   поэтому компонент переписан, а не подключён.

   Как это работает: настоящий текст остаётся в DOM (его читают скринридеры
   и поисковики), но красится прозрачным. Поверх лежит canvas, куда та же
   строка нарисована попиксельно и затем смещается шейдером: медленный дрейф
   на основе fbm-шума плюс линза под курсором и хроматическое расслоение.

   Позиции символов берём из самого DOM через Range, а не пересчитываем
   раскладку заново: так перенос строк, кегль и трекинг совпадают с вёрсткой
   при любой ширине экрана и любом шрифте.
   ========================================================================== */
(function () {
  'use strict';

  var host = document.querySelector('[data-warp]');
  if (!host) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var gl, canvas, program, texture, raf = null;
  var uniforms = {};
  var pointer = { x: 0.5, y: 0.5, active: 0 };
  var start = performance.now();

  /* --- параметры: значения по умолчанию из оригинала -------------------- */
  var P = {
    warpStrength:     0.08,
    warpScale:        1.7,
    speed:            0.55,
    pointerInfluence: 0.42,
    pointerStrength:  0.38,
    refraction:       0.018,
    ripple:           1
  };

  var VERT = [
    '#version 300 es',
    'in vec2 position;',
    'out vec2 vUv;',
    'void main() {',
    '  vUv = position * 0.5 + 0.5;',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec2 uResolution;',
    'uniform vec2 uPointer;',
    'uniform float uPointerActive, uTime, uWarpStrength, uWarpScale, uSpeed;',
    'uniform float uPointerInfluence, uPointerStrength, uRefraction, uRipple, uMotion;',
    'in vec2 vUv;',
    'out vec4 fragColor;',

    'float hash(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p); vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash(i), b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    'float fbm(vec2 p) {',
    '  float v = 0.0, amp = 0.5;',
    '  for (int i = 0; i < 4; i++) { v += amp * noise(p); p *= 2.02; amp *= 0.5; }',
    '  return v;',
    '}',
    'vec4 sampleText(vec2 uv) {',
    '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);',
    '  return texture(uTex, uv);',
    '}',

    'void main() {',
    '  vec2 uv = vUv;',
    '  float aspect = uResolution.x / max(uResolution.y, 1.0);',
    '  float time = uTime * uSpeed;',
    '  float scale = max(uWarpScale, 0.001);',

    /* фоновый дрейф */
    '  vec2 drift = vec2(time * 0.055, -time * 0.045);',
    '  float n1 = fbm(uv * scale * 3.1 + drift);',
    '  float n2 = fbm((uv + 19.17) * scale * 3.4 - drift.yx);',
    '  vec2 ambient = (vec2(n1, n2) - 0.5) * uWarpStrength * 0.045 * uMotion;',

    /* линза под курсором */
    '  vec2 pd = uv - uPointer;',
    '  vec2 ad = vec2(pd.x * aspect, pd.y);',
    '  float dist = length(ad);',
    '  float radius = max(uPointerInfluence, 0.001);',
    '  float t = clamp(dist / radius, 0.0, 1.0);',
    '  float lens = smoothstep(radius, 0.0, dist) * uPointerActive;',
    '  float bulge = t * (1.0 - t) * (1.0 - t) * 6.75 * uPointerActive;',
    '  vec2 dir = dist > 0.0001 ? vec2(ad.x / aspect, ad.y) / dist : vec2(0.0);',
    '  float wave = sin(dist * 28.0 - time * 4.2) * 0.5 + 0.5;',
    '  float ring = (wave - 0.5) * uRipple;',
    '  vec2 pw = -dir * bulge * uPointerStrength * 0.045;',
    '  pw += dir * ring * bulge * uPointerStrength * 0.016;',

    /* хроматическое расслоение */
    '  vec2 displaced = uv + ambient + pw;',
    '  vec2 sd = ambient + pw;',
    '  float sl = length(sd);',
    '  sd = sl > 0.00001 ? sd / sl : vec2(0.7071);',
    '  vec2 split = sd * uRefraction * 0.16 * (0.35 + lens * 1.65);',

    '  vec4 base = sampleText(displaced);',
    '  float r = sampleText(displaced + split).r;',
    '  float b = sampleText(displaced - split).b;',
    '  float a = max(max(sampleText(displaced + split).a, base.a), sampleText(displaced - split).a);',
    '  vec3 color = vec3(r, base.g, b) + lens * base.a * 0.055;',
    '  fragColor = vec4(color, a);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
    return sh;
  }

  /* --- текстура: рисуем ровно то, что уже разложил браузер --------------- */
  function buildTexture(dpr) {
    /* Краску снимаем только на время съёмки: пока класс висит, у строки и
       у подчёркивания computed-цвет прозрачный, и в текстуру попала бы пустота.
       Всё синхронно — кадр между снятием и возвратом не рисуется. */
    var wasWarped = host.classList.contains('is-warped');
    if (wasWarped) host.classList.remove('is-warped');

    var rect = host.getBoundingClientRect();
    var c = document.createElement('canvas');
    c.width  = Math.max(1, Math.round(rect.width  * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    /* Подчёркивание у акцента — псевдоэлемент, до него не дотянуться узлом,
       поэтому считаем его прямоугольник из метрик самой строки. */
    Array.prototype.forEach.call(host.querySelectorAll('.hl'), function (hl) {
      var after = getComputedStyle(hl, '::after');
      if (after.display === 'none') return;
      var fs = parseFloat(getComputedStyle(hl).fontSize);
      var h  = parseFloat(after.height) || fs * 0.13;
      var bt = parseFloat(after.bottom) || fs * 0.04;
      ctx.fillStyle = after.backgroundColor;
      Array.prototype.forEach.call(hl.getClientRects(), function (r) {
        ctx.fillRect(r.left - rect.left, r.bottom - rect.top - bt - h, r.width, h);
      });
    });

    /* Посимвольно: у каждого знака берём его собственный прямоугольник и цвет
       родителя, поэтому акцентные слова остаются акцентными. */
    var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
    var node, range = document.createRange();
    while ((node = walker.nextNode())) {
      var cs = getComputedStyle(node.parentElement);
      ctx.fillStyle = cs.color;
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      var text = node.nodeValue;
      for (var i = 0; i < text.length; i++) {
        if (text[i] === ' ' || text[i] === '\n') continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        var r = range.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        ctx.fillText(text[i], r.left - rect.left, (r.top + r.bottom) / 2 - rect.top);
      }
    }

    if (wasWarped) host.classList.add('is-warped');
    return c;
  }

  function upload(dpr) {
    var src = buildTexture(dpr);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    /* У canvas 2D начало координат сверху, у текстуры WebGL — снизу.
       Без переворота строка выводится вверх ногами. */
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function resize() {
    var rect = host.getBoundingClientRect();
    var box  = canvas.parentElement.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    /* Canvas — сосед строки, а не её потомок (в inline-элемент его не положить),
       поэтому позиционируем вручную относительно общего родителя. */
    canvas.style.left   = (rect.left - box.left) + 'px';
    canvas.style.top    = (rect.top  - box.top)  + 'px';
    canvas.style.width  = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.width  = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
    upload(dpr);
  }

  function frame() {
    gl.uniform1f(uniforms.uTime, (performance.now() - start) / 1000);
    gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
    gl.uniform1f(uniforms.uPointerActive, pointer.active);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }

  function init() {
    canvas = document.createElement('canvas');
    canvas.className = 'warp__canvas';
    canvas.setAttribute('aria-hidden', 'true');

    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return false;                      /* нет WebGL2 — остаётся обычный текст */

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'position');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);

    /* один треугольник с запасом перекрывает экран — дешевле двух */
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    ['uTex','uResolution','uPointer','uPointerActive','uTime','uWarpStrength','uWarpScale',
     'uSpeed','uPointerInfluence','uPointerStrength','uRefraction','uRipple','uMotion']
      .forEach(function (n) { uniforms[n] = gl.getUniformLocation(program, n); });

    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.uTex, 0);

    gl.uniform1f(uniforms.uWarpStrength, P.warpStrength);
    gl.uniform1f(uniforms.uWarpScale, P.warpScale);
    gl.uniform1f(uniforms.uSpeed, P.speed);
    gl.uniform1f(uniforms.uPointerInfluence, P.pointerInfluence);
    gl.uniform1f(uniforms.uPointerStrength, P.pointerStrength);
    gl.uniform1f(uniforms.uRefraction, P.refraction);
    gl.uniform1f(uniforms.uRipple, P.ripple);
    gl.uniform1f(uniforms.uMotion, reduceMotion ? 0 : 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    host.parentElement.appendChild(canvas);
    host.classList.add('is-warped');   /* текст становится прозрачным, но остаётся в DOM */
    resize();
    return true;
  }

  /* Шрифты приезжают позже разметки: до их загрузки Range отдаёт метрики
     подменного шрифта, и текстура получилась бы не той. */
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () {
    if (!init()) return;
    if (!reduceMotion) raf = requestAnimationFrame(frame);
    else { gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3); }

    var hero = host.closest('.hero') || document.body;
    hero.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) / r.width;
      pointer.y = 1 - (e.clientY - r.top) / r.height;
      pointer.active = 1;
    }, { passive: true });
    hero.addEventListener('pointerleave', function () { pointer.active = 0; });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 160);
    });

    /* За пределами экрана кадры не нужны. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { if (!raf && !reduceMotion) raf = requestAnimationFrame(frame); }
          else if (raf) { cancelAnimationFrame(raf); raf = null; }
        });
      }, { threshold: 0 }).observe(canvas);
    }
  });
})();
