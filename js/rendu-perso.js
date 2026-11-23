// Rendu d'un personnage Dofus 3 dans un <canvas> (WebGL), à partir des fichiers allégés de data/persos/ :
// pose.json (position de chaque partie du corps), <skin>.json (maillages) et <skin>.webp (textures en gris).
// Les zones grises sont teintées avec les 6 couleurs du personnage.
(() => {
  "use strict";
  const BASE = "data/persos/";
  const cache = new Map();
  const charger = (url, type) => {
    if (!cache.has(url)) {
      const p = type === "image"
        ? new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; })
        : fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });
      cache.set(url, p);
      p.catch(() => cache.delete(url));
    }
    return cache.get(url);
  };
  const skin = async (id) => {
    const [d, img] = await Promise.all([charger(`${BASE}${id}.json`), charger(`${BASE}${id}.webp`, "image")]);
    return { ...d, img };
  };
  const mul = (A, B) => [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ];
  const rgb = (n) => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

  // Construit la liste des triangles (x, y, u, v, r, g, b, teinté) pour chaque texture, dans l'ordre de dessin.
  function triangles(image, skins, couleurs) {
    const lots = [];
    for (const [nom, ...M] of image) {
      for (const s of skins) {
        const p = s.parts[nom];
        if (!p) continue;
        let coul = null, k = 0;
        let L = lots.length && lots[lots.length - 1].s === s ? lots[lots.length - 1].L : null;
        if (!L) { L = []; lots.push({ s, L }); }
        for (const e of p.dl) {
          if (typeof e === "number" && e >= 0) { coul = e && couleurs[e - 1] != null ? rgb(couleurs[e - 1]) : null; continue; }
          const ch = p.ch[k++];
          const teinte = coul;
          coul = null; // une couleur ne s'applique qu'au morceau qui suit (les yeux, juste après, gardent leur couleur)
          if (!ch) continue;
          const T = e === -1 ? M : mul(M, e);
          const [debut, nb] = ch;
          for (let i = debut; i < debut + nb; i++) {
            const v = s.I[i] * 4, x = s.V[v], y = s.V[v + 1];
            L.push(T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5], s.V[v + 2], s.V[v + 3], ...(teinte || [1, 1, 1]), teinte ? 1 : 0);
          }
        }
        break;
      }
    }
    return lots;
  }

  const VS = `attribute vec2 p;attribute vec2 uv;attribute vec4 c;uniform vec4 t;varying vec2 vUv;varying vec4 vC;
    void main(){vUv=uv;vC=c;gl_Position=vec4((p.x-t.x)*t.z,(p.y-t.y)*t.w,0.,1.);}`;
  const FS = `precision mediump float;uniform sampler2D tex;varying vec2 vUv;varying vec4 vC;
    void main(){vec4 x=texture2D(tex,vUv);vec3 col=vC.a>.5?min(x.rgb*vC.rgb*2.,1.):x.rgb;gl_FragColor=vec4(col*x.a,x.a);}`;

  function cadre(images) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const lots of images) for (const { L } of lots) for (let i = 0; i < L.length; i += 8) {
      if (L[i] < x0) x0 = L[i]; if (L[i] > x1) x1 = L[i]; if (L[i + 1] < y0) y0 = L[i + 1]; if (L[i + 1] > y1) y1 = L[i + 1];
    }
    return [x0, y0, x1, y1];
  }

  function preparer(canvas) {
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) throw new Error("WebGL indisponible");
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (const [nom, n, dec] of [["p", 2, 0], ["uv", 2, 8], ["c", 4, 16]]) {
      const l = gl.getAttribLocation(prog, nom); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 32, dec);
    }
    return { gl, prog, textures: new Map() };
  }

  function peindre(canvas, ctx, lots, [x0, y0, x1, y1]) {
    const { gl, prog, textures } = ctx;
    const W = canvas.width, H = canvas.height, marge = Math.round(Math.min(W, H) * 0.04);
    const ech = Math.min((W - 2 * marge) / (x1 - x0), (H - 2 * marge) / (y1 - y0));
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // Pieds en bas du cadre, personnage centré horizontalement.
    gl.uniform4f(gl.getUniformLocation(prog, "t"), (x0 + x1) / 2, y0 - marge / ech + (H / 2) / ech, 2 * ech / W, 2 * ech / H);
    for (const { s, L } of lots) {
      if (!textures.has(s.img)) {
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s.img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        textures.set(s.img, tex);
      }
      gl.bindTexture(gl.TEXTURE_2D, textures.get(s.img));
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(L), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, L.length / 8);
    }
  }

  // look = { corps: skin du corps, tete: skin de la tête, couleurs: [6 entiers RVB] }.
  // Joue la respiration en boucle ; renvoie { arreter() }. Avec { fixe: true }, dessine une seule image.
  // Un même canvas peut être redessiné : l'animation précédente s'arrête et le contexte WebGL est réutilisé.
  const etats = new WeakMap();
  async function dessiner(canvas, look, { fixe = false } = {}) {
    const st = etats.get(canvas) || { ctx: null, tour: 0 };
    etats.set(canvas, st);
    const tour = ++st.tour;
    const [pose, ...skins] = await Promise.all([charger(BASE + "pose.json"), skin(look.tete), skin(look.corps)]);
    if (tour !== st.tour) return { arreter() {} }; // un dessin plus récent a été demandé entre-temps
    const images = pose.frames.map((f) => triangles(f, skins, look.couleurs || []));
    const c = cadre(images);
    st.ctx = st.ctx || preparer(canvas);
    const ctx = st.ctx;
    const reduit = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let i = 0, avant = 0;
    peindre(canvas, ctx, images[0], c);
    const arreter = () => { if (st.tour === tour) st.tour++; };
    if (fixe || reduit) return { arreter };
    const pas = 1000 / (pose.ips || 30);
    const boucle = (t) => {
      if (tour !== st.tour) return;
      if (canvas.isConnected && t - avant >= pas) { avant = t; i = (i + 1) % images.length; peindre(canvas, ctx, images[i], c); }
      requestAnimationFrame(boucle);
    };
    requestAnimationFrame(boucle);
    return { arreter };
  }
  const catalogue = () => charger(BASE + "classes.json");

  window.RenduPerso = { dessiner, catalogue };
})();
