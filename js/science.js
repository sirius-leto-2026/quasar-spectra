/* Научное ядро: космология ΛCDM, линии квазаров, поиск z, лес Лайман-альфа.
   Работает и в браузере (window.Sci), и в Node (require) — для проверок. */
(function (root) {
  "use strict";

  // ---------- Космология: плоская ΛCDM, Planck 2018 ----------
  const C_KMS = 299792.458;
  const COSMO = { H0: 67.66, Om: 0.3111 };
  const MPC_TO_GLY = 3.26156e-3; // 1 Мпк = 3,26156 млн св. лет = 0,00326156 млрд

  function simpson(f, a, b, n) {
    if (n % 2) n++;
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    return (s * h) / 3;
  }

  function cosmology(z, p) {
    const { H0, Om } = p || COSMO;
    const Ol = 1 - Om;
    const E = (x) => Math.sqrt(Om * (1 + x) ** 3 + Ol);
    const DH = C_KMS / H0;              // хаббловское расстояние, Мпк
    const tH = 977.792 / H0;            // хаббловское время, млрд лет
    const Dc = DH * simpson((x) => 1 / E(x), 0, z, 2000);
    // возраст при масштабном факторе a: t = tH ∫0^a da / (a E(a)); замена a = u², чтобы убрать особенность в нуле
    const ageAt = (a) => tH * simpson((u) => (2 * u * u) / Math.sqrt(Om + Ol * u ** 6), 0, Math.sqrt(a), 2000);
    const age0 = ageAt(1);
    const ageZ = ageAt(1 / (1 + z));
    return {
      z,
      Dc,                               // сопутствующее (собственное сегодня) расстояние, Мпк
      Dl: (1 + z) * Dc,                 // фотометрическое расстояние, Мпк
      Da: Dc / (1 + z),                 // расстояние по угловому размеру, Мпк
      lookback: age0 - ageZ,            // время в пути света, млрд лет
      ageAtEmission: ageZ,              // возраст Вселенной в момент излучения, млрд лет
      age0,
      DcGly: Dc * MPC_TO_GLY,
    };
  }

  // ---------- Линии квазаров (лабораторные длины волн в вакууме, Å) ----------
  // w — относительная сила линии в среднем спектре квазара (Vanden Berk et al. 2001), для автопоиска
  const LINES = [
    { id: "Lyb", name: "Lyβ / O VI", lam: 1033.8, w: 9, el: "H, O" },
    { id: "Lya", name: "Lyα", lam: 1215.67, w: 100, el: "H" },
    { id: "SiIV", name: "Si IV + O IV]", lam: 1399.8, w: 8, el: "Si, O" },
    { id: "CIV", name: "C IV", lam: 1549.06, w: 26, el: "C" },
    { id: "CIII", name: "C III]", lam: 1908.73, w: 16, el: "C" },
    { id: "MgII", name: "Mg II", lam: 2798.75, w: 14, el: "Mg" },
    { id: "OII", name: "[O II]", lam: 3728.48, w: 1, el: "O" },
    { id: "Hg", name: "Hγ", lam: 4341.68, w: 4, el: "H" },
    { id: "Hb", name: "Hβ", lam: 4862.68, w: 9, el: "H" },
    { id: "OIII", name: "[O III]", lam: 5008.24, w: 3, el: "O" },
    { id: "Ha", name: "Hα", lam: 6564.61, w: 31, el: "H" },
  ];

  // ---------- Обработка спектра ----------
  function clean(spec) {
    const w = [], f = [];
    for (let i = 0; i < spec.wave.length; i++) if (spec.flux[i] !== null && isFinite(spec.flux[i])) { w.push(spec.wave[i]); f.push(spec.flux[i]); }
    return { w, f };
  }

  function smooth(f, half) {
    const out = new Array(f.length);
    let s = 0, n = 0, lo = 0, hi = -1;
    for (let i = 0; i < f.length; i++) {
      while (hi < Math.min(f.length - 1, i + half)) { hi++; s += f[hi]; n++; }
      while (lo < i - half) { s -= f[lo]; lo++; n--; }
      out[i] = s / n;
    }
    return out;
  }

  function median(a) {
    const b = a.filter(Number.isFinite).sort((x, y) => x - y);
    return b.length ? b[Math.floor(b.length / 2)] : NaN;
  }

  function interp(w, f, x) {
    if (x < w[0] || x > w[w.length - 1]) return NaN;
    let lo = 0, hi = w.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (w[m] > x) hi = m; else lo = m; }
    const t = (x - w[lo]) / (w[hi] - w[lo] || 1);
    return f[lo] * (1 - t) + f[hi] * t;
  }

  // Уточнение положения пика линии: максимум сглаженного потока в окне ±win Å, затем центроид по верхушке
  function peakNear(w, fs, lam, win) {
    let best = -1, bv = -Infinity;
    for (let i = 0; i < w.length; i++) {
      if (w[i] < lam - win) continue;
      if (w[i] > lam + win) break;
      if (fs[i] > bv) { bv = fs[i]; best = i; }
    }
    if (best < 0) return null;
    if (best === 0 || best === w.length - 1 || Math.abs(w[best] - lam) >= win * 0.98) return null; // упёрлись в край окна — пика нет
    let sw = 0, s = 0;
    for (let i = Math.max(0, best - 4); i <= Math.min(w.length - 1, best + 4); i++) { const v = Math.max(0, fs[i] - 0.5 * bv); s += v * w[i]; sw += v; }
    return { lam: sw > 0 ? s / sw : w[best], value: bv };
  }

  // Автоматический поиск z: корреляция спектра с шаблоном квазара.
  // Шаблон в системе покоя: гауссовы эмиссионные линии (FWHM ≈ 4000 км/с) + провал потока синее Lyα (лес).
  // Для каждого z считаем коэффициент корреляции Пирсона между шаблоном и нормированным спектром;
  // линия, которая должна быть видна, но её нет, снижает корреляцию — так отсекаются ложные совпадения.
  const TPL_S = { Lyb: 0.15, Lya: 1.0, SiIV: 0.12, CIV: 0.5, CIII: 0.28, MgII: 0.3, OII: 0.04, Hg: 0.08, Hb: 0.22, OIII: 0.18, Ha: 0.6 };
  const T_L0 = Math.log10(700), T_DL = 1e-4;
  let TPL = null;
  function template() {
    if (TPL) return TPL;
    const n = Math.ceil((Math.log10(9000) - T_L0) / T_DL);
    TPL = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const lam = Math.pow(10, T_L0 + i * T_DL);
      let t = lam < 1190 ? -0.35 : 0;          // лес Лайман-альфа ослабляет поток синее Lyα
      for (const L of LINES) {
        const sig = L.lam * (L.id === "OIII" || L.id === "OII" ? 0.0015 : 0.0057);
        t += TPL_S[L.id] * Math.exp(-0.5 * ((lam - L.lam) / sig) ** 2);
      }
      TPL[i] = t;
    }
    return TPL;
  }

  function autoRedshift(spec, opts) {
    const o = Object.assign({ zmin: 0.03, zmax: 5.5, baseHalf: 150 }, opts);
    const { w, f } = clean(spec);
    const fs = smooth(f, 2);
    const base = o.baseHalf > 0 ? smooth(f, o.baseHalf) : f.map(() => median(f)); // широкое сглаживание ≈ континуум
    const norm = fs.map((v, i) => v / (Math.abs(base[i]) + 1e-6) - 1);
    const lw = w.map((x) => Math.log10(x));
    const T = template();
    const corrAt = (lz) => {
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < lw.length; i += 2) {
        const k = Math.round((lw[i] - lz - T_L0) / T_DL);
        if (k < 0 || k >= T.length) continue;
        const x = norm[i], y = T[k];
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      }
      if (n < 300) return -1;
      const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
      return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : -1;
    };
    let best = null, bestHi = null;
    const lzHi = Math.log10(1 + 2.0);
    for (let lz = Math.log10(1 + o.zmin); lz <= Math.log10(1 + o.zmax); lz += T_DL) {
      const r = corrAt(lz);
      if (!best || r > best.r) best = { lz, r };
      if (lz >= lzHi && (!bestHi || r > bestHi.r)) bestHi = { lz, r };
    }
    if (!best || best.r <= 0) return null;
    // Главная ловушка: Lyα далёкого квазара легко принять за Mg II или C IV близкого.
    // Решает лес Лайман-альфа: если синее «линии Lyα» много узких провалов, а краснее — мало, квазар далёкий.
    let forestTest = null;
    if (bestHi && best.lz < lzHi && bestHi.r > 0.3 * best.r) {
      const zh = Math.pow(10, bestHi.lz) - 1;
      const fr = lyaForest(spec, zh), ctrl = lyaForest(spec, zh, { restMin: 1270, restMax: 1450 });
      if (fr && ctrl) {
        forestTest = { zHigh: zh, forest: fr.per100, control: ctrl.per100 };
        if (fr.per100 >= 1 && fr.per100 > 3 * ctrl.per100 + 0.3) best = bestHi;
      }
    }
    const zc = Math.pow(10, best.lz) - 1;
    const ref = refine(spec, zc, { w, fs });
    // уточнение по пикам принимаем, только если оно близко к корреляционному
    const z = ref.lines.length >= 2 && Math.abs(ref.z - zc) / (1 + zc) < 0.004 ? ref.z : zc;
    return { z, zCorr: zc, r: best.r, lines: ref.lines, forestTest };
  }

  // Уточнение z по пикам отдельных линий около начального приближения z0
  function refine(spec, z0, pre) {
    const { w, fs } = pre || (() => { const c = clean(spec); return { w: c.w, fs: smooth(c.f, 2) }; })();
    const used = [];
    for (const L of LINES) {
      if (L.w < 8 || L.id === "Lyb" || L.id === "Lya") continue; // Lyα искажена лесом поглощения
      const x = L.lam * (1 + z0);
      if (x < w[0] + 40 || x > w[w.length - 1] - 40) continue;
      const p = peakNear(w, fs, x, 0.006 * x);
      if (p) used.push({ line: L.name, lamObs: p.lam, z: p.lam / L.lam - 1, w: L.w });
    }
    if (!used.length) return { z: z0, lines: [] };
    const zs = used.map((u) => u.z).sort((a, b) => a - b);
    const z = zs.length % 2 ? zs[(zs.length - 1) / 2] : (zs[zs.length / 2 - 1] + zs[zs.length / 2]) / 2; // медиана
    return { z, lines: used };
  }

  // ---------- Лес Лайман-альфа ----------
  // Участок между Lyβ и Lyα в системе покоя квазара (1050–1170 Å) → наблюдаемая область (1+z)·[1050; 1170].
  // Континуум: «верхняя огибающая» (скользящий 90-й перцентиль), линия поглощения = провал ниже depth·континуума.
  function lyaForest(spec, z, opts) {
    const o = Object.assign({ restMin: 1050, restMax: 1170, depth: 0.6, minPix: 2, minWidthA: 100 }, opts);
    const { w, f } = clean(spec);
    const lo = Math.max(o.restMin * (1 + z), w[0] + 5), hi = Math.min(o.restMax * (1 + z), w[w.length - 1]);
    if (hi - lo < o.minWidthA) return null;
    const idx = [];
    for (let i = 0; i < w.length; i++) if (w[i] >= lo && w[i] <= hi) idx.push(i);
    const fs = smooth(f, 1);
    const cont = new Array(w.length).fill(NaN);
    const half = 25;
    for (const i of idx) {
      const win = fs.slice(Math.max(0, i - half), i + half + 1).sort((a, b) => a - b);
      cont[i] = win[Math.floor(win.length * 0.9)];
    }
    let count = 0, run = 0;
    const dips = [];
    for (const i of idx) {
      const absorbed = cont[i] > 0 && fs[i] < o.depth * cont[i];
      if (absorbed) run++;
      if ((!absorbed || i === idx[idx.length - 1]) && run > 0) {
        if (run >= o.minPix) { count++; dips.push(w[i - Math.ceil(run / 2)]); }
        run = 0;
      }
    }
    const width = hi - lo;
    return { lo, hi, width, count, per100: (100 * count) / width, dips, cont: idx.map((i) => [w[i], cont[i]]) };
  }

  function linfit(xs, ys) {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const k = sxy / sxx;
    return { k, b: my - k * mx, r: sxy / Math.sqrt(sxx * syy), n };
  }

  const Sci = { COSMO, cosmology, LINES, clean, smooth, median, interp, peakNear, autoRedshift, refine, lyaForest, linfit };
  if (typeof module !== "undefined" && module.exports) module.exports = Sci;
  else root.Sci = Sci;
})(typeof window !== "undefined" ? window : globalThis);
