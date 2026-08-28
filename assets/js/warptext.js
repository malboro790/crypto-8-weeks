/* ==========================================================================
   WARP TEXT — искажение заголовка под курсором

   Порт эффекта WarpText из reactbits: собственная реализация на WebGL2,
   без React и без их исходника. Слово рисуется в offscreen-канвас, дальше
   шейдер читает эту текстуру со смещением по фрактальному шуму. Смещение
   включает только гауссова линза вокруг курсора, поэтому в покое надпись
   стоит абсолютно ровно — искажённый текст просто не читается.

   Только для десктопа: эффект живёт целиком на наведении, а на тач-экране
   наводить нечем. Там остаётся исходный SVG.
   ========================================================================== */
(function () {
  var host = document.querySelector('[data-warptext]');
  if (!host) return;

  var desktop = window.matchMedia('(min-width: 901px)').matches &&
                window.matchMedia('(hover: hover)').matches;
  var reduce  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!desktop || reduce) return;

  var svg = host.querySelector('svg');
  var src = svg && svg.querySelector('text');
  if (!svg || !src) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'hero__warp';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  var gl = canvas.getContext('webgl2', { antialias: false, alpha: true,
                                         premultipliedAlpha: false });
  if (!gl) { canvas.remove(); return; }   /* нет WebGL2 — остаётся SVG */

  var VERT = '#version 300 es\n' + [
    'in vec2 aPos;',
    'out vec2 vUv;',
    'void main(){ vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = '#version 300 es\n' + [
    'precision highp float;',
    'in vec2 vUv;',
    'out vec4 o;',
    'uniform sampler2D uTex;',
    'uniform vec2  uMouse;',
    'uniform float uActive;',
    'uniform float uTime;',
    'uniform float uAspect;',
    'uniform vec3  uColor;',

    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float a = 0.5, s = 0.0;',
    '  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.0; a *= 0.5; }',
    '  return s;',
    '}',

    'void main(){',
    '  vec2 uv = vUv;',
    /* Линза: чем ближе к курсору, тем сильнее смещение. По горизонтали
       расстояние правится пропорциями, иначе на широком слове пятно
       превращается в овал. */
    '  vec2 d = vec2((uv.x - uMouse.x) * uAspect, uv.y - uMouse.y);',
    '  float lens = exp(-dot(d, d) * 26.0) * uActive;',

    '  vec2 n = vec2(fbm(uv * 5.0 + uTime * 0.18),',
    '                fbm(uv * 5.0 + 9.7 - uTime * 0.14)) - 0.5;',
    '  vec2 off = n * 0.10 * lens;',
    '  float ca = 0.010 * lens;',   /* хроматический развал по краям линзы */

    '  float r = texture(uTex, uv + off + vec2(ca, 0.0)).a;',
    '  float g = texture(uTex, uv + off).a;',
    '  float b = texture(uTex, uv + off - vec2(ca, 0.0)).a;',

    '  vec3 col = uColor * g + vec3(r - g, 0.0, b - g) * 0.55;',
    '  float a = max(max(r, g), b);',
    '  if (a < 0.002) discard;',
    '  o = vec4(col, a);',
    '}'
  ].join('\n');

  function compile(type, s) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, s); gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.remove(); return; }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ['uTex', 'uMouse', 'uActive', 'uTime', 'uAspect', 'uColor'].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  var cs = getComputedStyle(src);
  var fill = cs.fill || 'rgb(193, 255, 15)';

  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(U.uTex, 0);

  /* Цвет забираем с самого SVG: шейдер читает из текстуры только альфу,
     поэтому заливку надо передать отдельно — иначе слово под курсором
     белеет. */
  var rgb = (fill.match(/[\d.]+/g) || []).map(Number);
  if (rgb.length < 3) rgb = [0.757 * 255, 255, 0.059 * 255];
  gl.uniform3f(U.uColor, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);

  /* Слово перерисовываем в текстуру тем же кеглем и с теми же метриками,
     что и SVG, — иначе при наведении оно прыгало бы на пару пикселей. */
  var off = document.createElement('canvas');
  var octx = off.getContext('2d');
  var W = 0, H = 0;

  function paint() {
    var r = host.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w === W && h === H) return true;
    W = w; H = h;

    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform1f(U.uAspect, w / h);

    off.width = w; off.height = h;
    octx.clearRect(0, 0, w, h);
    octx.fillStyle = fill;
    octx.textBaseline = 'alphabetic';

    /* Кегль подбираем так, чтобы чернила заняли всю ширину: та же логика,
       что у viewBox в разметке, только в пикселях канваса. */
    var word = src.textContent.trim();
    var probe = 100;
    octx.font = (cs.fontWeight || '600') + ' ' + probe + 'px ' + (cs.fontFamily || 'Geist');
    var m = octx.measureText(word);
    var inkW = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
    var size = probe * (w / inkW);
    octx.font = (cs.fontWeight || '600') + ' ' + size + 'px ' + (cs.fontFamily || 'Geist');
    var m2 = octx.measureText(word);
    octx.fillText(word, m2.actualBoundingBoxLeft, m2.actualBoundingBoxAscent);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
    return true;
  }

  var mouse = [0.5, 0.5];
  var active = 0, target = 0;
  var raf = null, t0 = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    paint();
    active += (target - active) * 0.12;
    gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
    gl.uniform1f(U.uActive, active);
    gl.uniform1f(U.uTime, (now - t0) / 1000);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* Пока курсора нет и остаточное искажение погасло, крутить кадры незачем:
       статичная картинка совпадает с исходным SVG, и его можно вернуть. */
    if (target === 0 && active < 0.002) {
      active = 0;
      cancelAnimationFrame(raf); raf = null;
      host.classList.remove('is-warping');
    }
  }
  function wake() { if (!raf) { host.classList.add('is-warping'); raf = requestAnimationFrame(frame); } }

  /* Текстуру готовим до первого наведения и обязательно после загрузки
     шрифта. Иначе первый кадр рисовался запасной гарнитурой, канвас ещё
     держал стартовые 300×150, и слово на мгновение прыгало в размере
     прежде чем начиналось искажение. */
  function arm() {
    if (!paint()) return;
    gl.uniform2f(U.uMouse, 0.5, 0.5);
    gl.uniform1f(U.uActive, 0);
    gl.uniform1f(U.uTime, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    host.addEventListener('pointerenter', function () { target = 1; wake(); });
    host.addEventListener('pointerleave', function () { target = 0; wake(); });
    host.addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect();
      mouse[0] = (e.clientX - r.left) / r.width;
      mouse[1] = (e.clientY - r.top) / r.height;
      target = 1; wake();
    });
    window.addEventListener('resize', function () { W = 0; H = 0; if (!raf) arm(); else wake(); });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(arm);
  else arm();
})();
