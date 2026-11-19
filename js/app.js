/* Интерфейс лаборатории «Спектры квазаров». Без сборки: открыть index.html в браузере. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const fmt = (x, d = 3) => (x === null || x === undefined || !isFinite(x) ? "—" : (+x).toFixed(d).replace(".", ","));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  if (!window.QUASARS) { $("meta").textContent = "Нет data/quasars.js — запустите tools/fetch_sdss.py"; return; }
  const RES = window.RESULTS || null;
  const SETS = {
    region: { title: "Участок неба", items: window.QUASARS.items.slice().sort((a, b) => a.z_cat - b.z_cat) },
    forest: { title: "Далёкие квазары (лес Lyα)", items: (window.FOREST ? window.FOREST.items : []).slice().sort((a, b) => a.z_cat - b.z_cat) },
    blazars: { title: "Блазары", items: window.BLAZARS ? window.BLAZARS.items : [] },
  };
  const ALL = {};
  Object.values(SETS).forEach((s) => s.items.forEach((q) => { ALL[q.id] = q; }));
  const QM = window.QUASARS.meta;
  $("meta").textContent = `Участок RA ${QM.ra[0]}–${QM.ra[1]}°, Dec ${QM.dec[0]}–${QM.dec[1]}° · ${SETS.region.items.length} квазаров участка, ` +
    `${SETS.forest.items.length} далёких квазаров, ${SETS.blazars.items.length} блазаров · ${QM.source}`;
  const resRow = {};
  if (RES) RES.region.forEach((r) => { resRow[r.id] = r; });
  const zRef = (q) => (q.z_lit !== undefined ? q.z_lit : q.z_cat);

  // ---------- свои z (только в этом браузере) ----------
  const KEY = "quasar-spectra:myz";
  let myZ = {};
  try { myZ = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { myZ = {}; }
  const saveMy = () => { try { localStorage.setItem(KEY, JSON.stringify(myZ)); } catch (e) { /* без хранилища тоже работает */ } };
  const zUse = (q) => (myZ[q.id] !== undefined ? myZ[q.id] : zRef(q));
  const dzPct = (q) => (myZ[q.id] === undefined ? null : (100 * Math.abs(myZ[q.id] - zRef(q))) / zRef(q));

  // ---------- вкладки ----------
  const drawers = {};
  function openTab(name) {
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === name));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === name));
    if (drawers[name]) drawers[name]();
  }
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => { openTab(b.dataset.tab); try { history.replaceState(null, "", "#tab=" + b.dataset.tab); } catch (e) { /* file:// */ } }));

  // ---------- оси для canvas ----------
  function niceTicks(a, b, n) {
    const span = b - a, raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => span / s <= n) || 10 * p;
    const t = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) t.push(+v.toFixed(10));
    return t;
  }
  function axes(cv, xr, yr, xl, yl, opt) {
    const o = opt || {};
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
    const P = { l: 64, r: 16, t: 26, b: 44 };
    ctx.clearRect(0, 0, W, H);
    ctx.font = "13px Segoe UI, Arial"; ctx.fillStyle = "#5a6275"; ctx.strokeStyle = "#d3dcec"; ctx.lineWidth = 1;
    const tx = o.xlog ? Math.log10 : (v) => v;
    const X = (x) => P.l + ((tx(x) - tx(xr[0])) / (tx(xr[1]) - tx(xr[0]))) * (W - P.l - P.r);
    const Y = (y) => H - P.b - ((y - yr[0]) / (yr[1] - yr[0])) * (H - P.t - P.b);
    ctx.textAlign = "center";
    for (const v of o.xticks || niceTicks(xr[0], xr[1], 9)) { ctx.beginPath(); ctx.moveTo(X(v), P.t); ctx.lineTo(X(v), H - P.b); ctx.stroke(); ctx.fillText(String(v).replace(".", ","), X(v), H - P.b + 16); }
    ctx.textAlign = "right";
    if (!o.noy) for (const v of niceTicks(yr[0], yr[1], 6)) { ctx.beginPath(); ctx.moveTo(P.l, Y(v)); ctx.lineTo(W - P.r, Y(v)); ctx.stroke(); ctx.fillText(String(v).replace(".", ","), P.l - 6, Y(v) + 4); }
    ctx.textAlign = "center"; ctx.fillStyle = "#1b2233";
    ctx.fillText(xl, (P.l + W - P.r) / 2, H - 8);
    ctx.save(); ctx.translate(16, (P.t + H - P.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yl, 0, 0); ctx.restore();
    ctx.strokeStyle = "#5a6275"; ctx.strokeRect(P.l, P.t, W - P.l - P.r, H - P.t - P.b);
    return { ctx, X, Y, P, W, H, xr, yr };
  }
  function line(A, xs, ys, color, lw) {
    const { ctx, X, Y } = A;
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1; ctx.beginPath();
    let pen = false;
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (y === null || !isFinite(y) || xs[i] < A.xr[0] || xs[i] > A.xr[1]) { pen = false; continue; }
      const yy = Y(Math.max(A.yr[0], Math.min(A.yr[1], y)));
      if (pen) ctx.lineTo(X(xs[i]), yy); else { ctx.moveTo(X(xs[i]), yy); pen = true; }
    }
    ctx.stroke(); ctx.lineWidth = 1;
  }
  function dot(A, x, y, color, r, cross) {
    const { ctx, X, Y } = A;
    ctx.fillStyle = color; ctx.strokeStyle = color;
    if (cross) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(x) - r, Y(y) - r); ctx.lineTo(X(x) + r, Y(y) + r); ctx.moveTo(X(x) + r, Y(y) - r); ctx.lineTo(X(x) - r, Y(y) + r); ctx.stroke(); ctx.lineWidth = 1; return; }
    ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, 7); ctx.fill();
  }
  const links = (q) => `<a href="https://skyserver.sdss.org/dr17/VisualTools/explore/summary?ra=${q.ra}&dec=${q.dec}" target="_blank" rel="noopener">SkyServer</a> · ` +
    `<a href="https://aladin.cds.unistra.fr/AladinLite/?target=${q.ra}%20${q.dec}&fov=0.05&survey=P%2FSDSS9%2Fcolor" target="_blank" rel="noopener">Aladin Lite</a>`;

  // ================= Спектр и z =================
  let setName = "region", cur = 0, zNow = 0, view = null, autoInfo = null, quiz = null;
  const list = () => SETS[setName].items;
  const dsSel = $("dataset");
  Object.entries(SETS).forEach(([k, s]) => { if (s.items.length) { const o = document.createElement("option"); o.value = k; o.textContent = `${s.title} (${s.items.length})`; dsSel.appendChild(o); } });
  dsSel.addEventListener("change", () => { setName = dsSel.value; stopQuiz(); select(0); });
  const sel = $("markline");
  Sci.LINES.forEach((L, i) => { const o = document.createElement("option"); o.value = i; o.textContent = `${L.name} — ${L.lam} Å`; sel.appendChild(o); });
  sel.value = 1;

  function renderList() {
    const box = $("qlist"); box.innerHTML = "";
    list().forEach((q, i) => {
      const b = document.createElement("button");
      const d = dzPct(q);
      const label = q.blazar || q.name.replace("SDSS ", "");
      const hide = quiz && i === cur;
      b.innerHTML = `<span>${i + 1}. ${hide ? "???" : esc(label)}</span><span>${hide ? "" : "z=" + fmt(zRef(q), 3)} ${d === null || hide ? "" : d <= 1 ? '<span class="ok">✓</span>' : "✗"}</span>`;
      if (i === cur) b.classList.add("on");
      b.addEventListener("click", () => { stopQuiz(); select(i); });
      box.appendChild(b);
    });
  }

  function select(i, keepZ) {
    cur = i; autoInfo = null;
    const q = list()[i];
    if (quiz) {
      $("qname").textContent = "Незнакомый квазар";
      $("qinfo").textContent = ""; $("qlinks").innerHTML = "";
    } else {
      $("qname").textContent = q.blazar ? `${q.blazar} (${q.type})` : q.name;
      $("qinfo").textContent = `RA ${fmt(q.ra, 4)}°, Dec ${fmt(q.dec, 4)}° · S/N ${fmt(q.sn, 1)} · plate ${q.plate}, MJD ${q.mjd}, fiber ${q.fiber}`;
      $("qlinks").innerHTML = links(q);
    }
    if (!keepZ) setZ(myZ[q.id] !== undefined && !quiz ? myZ[q.id] : 0); else setZ(zNow);
    renderList();
  }

  function setZ(z) {
    zNow = Math.max(0, +z || 0);
    $("zin").value = zNow.toFixed(4);
    $("zslider").value = zNow;
    drawSpectrum(); updateCards();
  }

  function drawSpectrum() {
    const q = list()[cur], cv = $("plot");
    const { w, f } = Sci.clean(q);
    const rest = $("restchk").checked && zNow > 0;
    const k = rest ? 1 + zNow : 1;
    const wx = w.map((x) => x / k);
    const fs = $("smoothchk").checked ? Sci.smooth(f, 3) : f;
    const sorted = fs.slice().sort((a, b) => a - b);
    const ymin = Math.min(0, sorted[Math.floor(sorted.length * 0.005)]);
    const ymax = sorted[Math.floor(sorted.length * 0.998)] * 1.18;
    const A = axes(cv, [wx[0], wx[wx.length - 1]], [ymin, ymax], rest ? "Длина волны в системе покоя квазара, Å" : "Наблюдаемая длина волны λ, Å", "Поток, 10⁻¹⁷ эрг/с/см²/Å");
    view = Object.assign(A, { k });
    const { ctx, X, Y } = A;
    if (zNow > 1.9) {
      const fr = Sci.lyaForest(q, zNow);
      if (fr) {
        ctx.fillStyle = "rgba(91,45,145,0.08)"; ctx.fillRect(X(fr.lo / k), A.P.t, X(fr.hi / k) - X(fr.lo / k), A.H - A.P.t - A.P.b);
        ctx.strokeStyle = "rgba(91,45,145,0.6)"; ctx.setLineDash([2, 3]); ctx.beginPath();
        fr.cont.forEach(([x, y], j) => (j ? ctx.lineTo(X(x / k), Y(y)) : ctx.moveTo(X(x / k), Y(y)))); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#5b2d91"; fr.dips.forEach((x) => ctx.fillRect(X(x / k) - 1, A.H - A.P.b - 10, 2, 10));
        ctx.textAlign = "left"; ctx.fillText(`лес Lyα: ${fr.count} линий, ${fmt(fr.per100, 1)} на 100 Å`, X(fr.lo / k) + 4, A.P.t + 30);
      }
    }
    line(A, wx, fs, "#16357a", 1);
    ctx.font = "12px Segoe UI, Arial"; ctx.textAlign = "center";
    Sci.LINES.forEach((L) => {
      const x = (L.lam * (1 + zNow)) / k;
      if (x < wx[0] || x > wx[wx.length - 1]) return;
      ctx.strokeStyle = L.w >= 8 ? "#d2501e" : "#e8a07f"; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(X(x), A.P.t); ctx.lineTo(X(x), A.H - A.P.b); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#b03d10"; ctx.fillText(L.name, X(x), A.P.t - 8);
    });
    if (autoInfo) { ctx.fillStyle = "#1a7f37"; autoInfo.lines.forEach((u) => { ctx.beginPath(); ctx.arc(X(u.lamObs / k), A.P.t + 12, 4, 0, 7); ctx.fill(); }); }
  }

  function updateCards() {
    const q = list()[cur];
    const r = resRow[q.id];
    $("card_cat").style.visibility = quiz ? "hidden" : "visible";
    $("c_zcat").textContent = q.z_lit !== undefined ? `${fmt(q.z_lit, 4)} (лит.)` : fmt(q.z_cat, 4);
    $("c_qc").textContent = q.blazar ? `SDSS: z = ${fmt(q.z_cat, 3)}${q.z_warning ? " (флаг ошибки)" : ""}` : r ? `проект: z = ${fmt(r["z_итог"], 4)}, ${r["контроль"]}` : "";
    const has = myZ[q.id] !== undefined && !quiz;
    $("c_zmy").textContent = has ? fmt(myZ[q.id], 4) : "не задано";
    const d = quiz ? null : dzPct(q);
    $("c_dz").textContent = d === null ? `на графике z = ${fmt(zNow, 4)}` : `расхождение ${fmt(d, 2)} % ${d <= 1 ? "— в норме (≤ 1 %)" : "— больше 1 %"}`;
    const zz = zNow > 0 ? zNow : quiz ? 0.001 : zRef(q);
    const c = Sci.cosmology(zz);
    $("c_dc").textContent = `${fmt(c.DcGly, 2)} млрд св. лет`;
    $("c_dc2").textContent = `${fmt(c.Dc, 0)} Мпк${zNow > 0 ? "" : " (по каталожному z)"}`;
    $("c_lb").textContent = `${fmt(c.lookback, 2)} млрд лет`;
    $("c_age").textContent = `${fmt(c.ageAtEmission, 2)} млрд лет`;
    $("linesused").textContent = autoInfo && autoInfo.lines.length
      ? "Использованные линии: " + autoInfo.lines.map((u) => `${u.line} λ=${fmt(u.lamObs, 1)} Å → z=${fmt(u.z, 4)}`).join("; ") : "";
  }

  // ----- тренажёр -----
  let quizTimer = null;
  function stopQuiz() { quiz = null; clearInterval(quizTimer); $("quizbar").hidden = true; $("auto").disabled = false; }
  $("quiz").addEventListener("click", () => {
    const pool = [];
    ["region", "forest"].forEach((s) => SETS[s].items.forEach((q, i) => { const r = resRow[q.id]; if (!r || r["контроль"] === "квазар") pool.push([s, i]); }));
    const [s, i] = pool[Math.floor(Math.random() * pool.length)];
    setName = s; dsSel.value = s;
    quiz = { t0: Date.now() };
    $("auto").disabled = true;
    $("quizbar").hidden = false;
    const tick = () => { const t = (Date.now() - quiz.t0) / 1000; $("quizbar").innerHTML = `<b>Тренажёр.</b> Найдите z по линиям и нажмите «Принять моё z». Время: <b>${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}</b> (цель — до 2 минут, ошибка ≤ 1 %)`; };
    tick(); clearInterval(quizTimer); quizTimer = setInterval(tick, 500);
    select(i);
  });

  $("zslider").addEventListener("input", (e) => { autoInfo = null; setZ(e.target.value); });
  $("zin").addEventListener("change", (e) => { autoInfo = null; setZ(e.target.value); });
  $("smoothchk").addEventListener("change", drawSpectrum);
  $("restchk").addEventListener("change", drawSpectrum);
  $("auto").addEventListener("click", () => {
    const r = Sci.autoRedshift(list()[cur]);
    if (!r) { alert("Не удалось найти линии — подберите z вручную."); return; }
    autoInfo = r; setZ(r.z);
  });
  $("accept").addEventListener("click", () => {
    if (!(zNow > 0)) { alert("Сначала подберите z (ползунок, щелчок по линии или авто-поиск)."); return; }
    const q = list()[cur];
    if (quiz) {
      const t = (Date.now() - quiz.t0) / 1000, d = (100 * Math.abs(zNow - zRef(q))) / zRef(q);
      clearInterval(quizTimer);
      $("quizbar").innerHTML = `<b>${d <= 1 && t <= 120 ? "Зачёт!" : "Попробуйте ещё."}</b> Это ${esc(q.name)}: z по каталогу ${fmt(zRef(q), 4)}, ваше ${fmt(zNow, 4)} — расхождение ${fmt(d, 2)} %, время ${fmt(t, 0)} с. <button id="quiznext">Следующий</button>`;
      $("quiznext").addEventListener("click", () => $("quiz").click());
      quiz = null; $("auto").disabled = false;
      myZ[q.id] = +zNow.toFixed(5); saveMy(); select(cur, true); return;
    }
    myZ[q.id] = +zNow.toFixed(5); saveMy(); renderList(); updateCards();
  });
  $("plot").addEventListener("click", (e) => {
    if (!view) return;
    const r = e.target.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * e.target.width;
    const lamPlot = view.xr[0] + ((px - view.P.l) / (view.W - view.P.l - view.P.r)) * (view.xr[1] - view.xr[0]);
    const lam = lamPlot * view.k;
    const { w, f } = Sci.clean(list()[cur]);
    const p = Sci.peakNear(w, Sci.smooth(f, 3), lam, 25) || { lam };
    const L = Sci.LINES[+sel.value];
    $("restchk").checked = false;
    autoInfo = { lines: [{ line: L.name, lamObs: p.lam, z: p.lam / L.lam - 1 }] };
    setZ(p.lam / L.lam - 1);
  });

  // ================= Карта неба =================
  function skyXY(ra, dec) {
    const s = QM.sky, rad = Math.PI / 180;
    const a0 = s.ra0 * rad, d0 = s.dec0 * rad, a = ra * rad, d = dec * rad;
    const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
    const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc;
    const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
    const sc = s.scale_arcsec / 206264.806;
    return [s.px / 2 - xi / sc, s.px / 2 - eta / sc];
  }
  const zColor = (z) => `hsl(${280 - Math.min(z, 3.5) * 70}, 95%, 62%)`;
  let skyDone = false;
  drawers.sky = function () {
    if (skyDone || !QM.sky) return;
    skyDone = true;
    const svg = $("skysvg"), px = QM.sky.px;
    svg.setAttribute("viewBox", `0 0 ${px} ${px}`);
    let h = "";
    SETS.region.items.forEach((q, i) => {
      const [x, y] = skyXY(q.ra, q.dec);
      const z = resRow[q.id] ? resRow[q.id]["z_итог"] : q.z_cat;
      h += `<g class="qmark" data-i="${i}" tabindex="0" role="button" aria-label="${esc(q.name)}, z ${fmt(z, 2)}"><circle cx="${x}" cy="${y}" r="17" stroke="${zColor(z)}"/><text x="${x + 20}" y="${y - 12}" fill="${zColor(z)}">${fmt(z, 2)}</text></g>`;
    });
    svg.innerHTML = h;
    const info = (i) => {
      const q = SETS.region.items[i], r = resRow[q.id], c = Sci.cosmology(r ? r["z_итог"] : q.z_cat);
      $("skyinfo").innerHTML = `<img src="data/thumbs/${q.id}.jpg" alt="Квазар ${esc(q.name)} крупным планом" class="thumb"><b>${esc(q.name)}</b><br>z = ${fmt(r ? r["z_итог"] : q.z_cat, 3)} (каталог ${fmt(q.z_cat, 3)})<br>` +
        `расстояние ${fmt(c.DcGly, 1)} млрд св. лет, свет шёл ${fmt(c.lookback, 1)} млрд лет<br>${r ? esc(r["контроль"]) : ""}<br>${links(q)}<br><button class="go">Открыть спектр</button>`;
      $("skyinfo").querySelector(".go").addEventListener("click", () => go(i));
    };
    const go = (i) => { setName = "region"; dsSel.value = "region"; stopQuiz(); openTab("spec"); select(i); };
    svg.querySelectorAll(".qmark").forEach((g) => {
      const i = +g.dataset.i;
      g.addEventListener("mouseenter", () => info(i));
      g.addEventListener("focus", () => info(i));
      g.addEventListener("click", () => go(i));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter") go(i); });
    });
    $("skymeta").textContent = `Снимок SDSS (gri), ${fmt((QM.sky.px * QM.sky.scale_arcsec) / 3600, 2)}° × ${fmt((QM.sky.px * QM.sky.scale_arcsec) / 3600, 2)}°, север вверху, восток слева. Центр RA ${QM.sky.ra0}°, Dec ${QM.sky.dec0}°.`;
  };

  // ================= Выборка =================
  function rows() {
    return SETS.region.items.map((q, i) => {
      const r = resRow[q.id];
      const z = myZ[q.id] !== undefined ? myZ[q.id] : r ? r["z_итог"] : q.z_cat, c = Sci.cosmology(z);
      return { n: i + 1, q, z, my: myZ[q.id], proj: r ? r["z_итог"] : null, d: dzPct(q), c };
    });
  }
  drawers.sample = function () {
    const R = rows();
    const ok = R.filter((r) => r.d !== null && r.d <= 1).length, mine = R.filter((r) => r.my !== undefined).length;
    $("sumline").textContent = `Своё z: ${mine} из ${R.length}; из них с расхождением ≤ 1 %: ${ok}. Расстояния — по своему z, если оно есть, иначе по z проекта.`;
    let h = "<tr><th>№, объект</th><th>RA, °</th><th>Dec, °</th><th>z каталог</th><th>z проекта</th><th>z моё</th><th>Δ моё, %</th><th>Расст., млрд св. лет</th><th>Свет шёл, млрд лет</th><th>Возраст Вселенной, млрд лет</th></tr>";
    R.forEach((r) => {
      h += `<tr class="${r.d !== null && r.d > 1 ? "bad" : ""}"><td>${r.n}. ${esc(r.q.name)}</td><td>${fmt(r.q.ra, 4)}</td><td>${fmt(r.q.dec, 4)}</td><td>${fmt(r.q.z_cat, 4)}</td><td>${fmt(r.proj, 4)}</td><td>${r.my === undefined ? "—" : fmt(r.my, 4)}</td><td>${fmt(r.d, 2)}</td><td>${fmt(r.c.DcGly, 2)}</td><td>${fmt(r.c.lookback, 2)}</td><td>${fmt(r.c.ageAtEmission, 2)}</td></tr>`;
    });
    $("tbl").innerHTML = h;
    const D = R.map((r) => r.c.DcGly), bw = 2, nb = Math.ceil((Math.max(...D) + 0.01) / bw);
    const cnt = new Array(nb).fill(0); D.forEach((d) => cnt[Math.floor(d / bw)]++);
    const A = axes($("hist"), [0, nb * bw], [0, Math.max(...cnt) + 1], "Сопутствующее расстояние, млрд св. лет", "Число квазаров");
    A.ctx.fillStyle = "rgba(47,111,214,0.75)";
    cnt.forEach((c, i) => A.ctx.fillRect(A.X(i * bw) + 1, A.Y(c), A.X(bw) - A.X(0) - 2, A.Y(0) - A.Y(c)));
    const cv = $("cone"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const ras = R.map((r) => r.q.ra), ra0 = (Math.min(...ras) + Math.max(...ras)) / 2, span = Math.max(...ras) - Math.min(...ras) || 1;
    const k = (50 / span) * (Math.PI / 180), Rmax = Math.max(...D) * 1.08, ox = W / 2, oy = H - 20, sc = (H - 50) / Rmax;
    ctx.strokeStyle = "#d3dcec"; ctx.fillStyle = "#5a6275"; ctx.font = "12px Segoe UI, Arial"; ctx.textAlign = "left";
    for (let g = 5; g < Rmax; g += 5) { ctx.beginPath(); ctx.arc(ox, oy, g * sc, -Math.PI / 2 - 0.5 * span * k - 0.05, -Math.PI / 2 + 0.5 * span * k + 0.05); ctx.stroke(); ctx.fillText(`${g}`, ox + 4, oy - g * sc + 12); }
    R.forEach((r) => {
      const a = -Math.PI / 2 - (r.q.ra - ra0) * k, rr = r.c.DcGly * sc;
      ctx.fillStyle = `hsl(${240 - Math.min(r.z, 4) * 55},70%,45%)`;
      ctx.beginPath(); ctx.arc(ox + rr * Math.cos(a), oy + rr * Math.sin(a), 4, 0, 7); ctx.fill();
    });
    ctx.fillStyle = "#1b2233"; ctx.fillText("Земля", ox - 18, oy + 15);
    ctx.fillText(`угол по RA растянут ×${fmt(50 / span, 0)}; дуги — каждые 5 млрд св. лет; цвет — z`, 8, 16);
  };
  $("autoall").addEventListener("click", () => {
    let n = 0;
    SETS.region.items.forEach((q) => { if (myZ[q.id] === undefined) { const r = Sci.autoRedshift(q); if (r) { myZ[q.id] = +r.z.toFixed(5); n++; } } });
    saveMy(); renderList(); drawers.sample(); alert(`Авто-поиск выполнен для ${n} квазаров. Спорные проверьте вручную!`);
  });
  $("csv").addEventListener("click", () => {
    const head = "name;ra;dec;z_cat;z_project;z_my;dz_my_pct;Dc_Mpc;Dc_Gly;lookback_Gyr;age_at_emission_Gyr\n";
    const body = rows().map((r) => [r.q.name, r.q.ra, r.q.dec, r.q.z_cat, r.proj ?? "", r.my ?? "", r.d === null ? "" : r.d.toFixed(3), r.c.Dc.toFixed(1), r.c.DcGly.toFixed(3), r.c.lookback.toFixed(3), r.c.ageAtEmission.toFixed(3)].join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + head + body], { type: "text/csv" }));
    a.download = "квазары_участка.csv"; a.click();
  });

  // ================= Эпохи и блазары =================
  const COLORS = ["#16357a", "#2f6fd6", "#5b2d91", "#d2501e"];
  const XT = [1000, 1500, 2000, 3000, 4000, 5000, 7000];
  drawers.epochs = function () {
    if (!RES) { $("compcap").textContent = "Нет data/results.js — запустите analysis/pipeline.py"; return; }
    const comps = Object.entries(RES.composites);
    const A = axes($("compplot"), [900, 7000], [0, 2.2 * comps.length + 1.2], "Длина волны в системе покоя квазара, Å", "Нормированный поток (со сдвигом)", { xlog: true, xticks: XT, noy: true });
    comps.forEach(([lab, c], j) => line(A, c.w, c.f.map((v) => (v === null ? null : v + 2.2 * j)), COLORS[j], 1.2));
    A.ctx.font = "12px Segoe UI, Arial";
    comps.forEach(([lab, c], j) => { A.ctx.fillStyle = COLORS[j]; A.ctx.textAlign = "right"; A.ctx.fillText(`${lab}: ${c.n} спектров`, A.W - 24, A.Y(2.2 * j + 1.6)); });
    A.ctx.textAlign = "center"; A.ctx.fillStyle = "#b03d10";
    Sci.LINES.forEach((L) => { if (L.w < 8 && L.id !== "OIII") return; A.ctx.strokeStyle = "rgba(210,80,30,.35)"; A.ctx.setLineDash([3, 4]); A.ctx.beginPath(); A.ctx.moveTo(A.X(L.lam), A.P.t); A.ctx.lineTo(A.X(L.lam), A.H - A.P.b); A.ctx.stroke(); A.ctx.setLineDash([]); A.ctx.fillText(L.name, A.X(L.lam), A.P.t - 8); });
    $("compcap").textContent = "Спектры приведены к системе покоя и нормированы; медиана по всем квазарам интервала z.";
    // блазары
    const bz = $("bzsel");
    if (!bz.options.length) {
      SETS.blazars.items.forEach((q, i) => { const o = document.createElement("option"); o.value = i; o.textContent = `${q.blazar} — ${q.type}, z = ${q.z_lit}`; bz.appendChild(o); });
      bz.addEventListener("change", drawBlazar);
      let h = "<tr><th>Блазар</th><th>Тип</th><th>z (литература)</th><th>z SDSS</th><th>z SDSS верно?</th><th>Сильнейшая линия</th><th>EW в покое, Å</th><th>FWHM, км/с</th></tr>";
      RES.blazars.forEach((b) => { h += `<tr><td>${esc(b["объект"])}</td><td>${b["тип"]}</td><td>${fmt(b["z_лит"], 4)}</td><td>${fmt(b["z_каталог"], 4)}</td><td>${b["z_SDSS_верно"] ? "да" : "<b>нет</b>"}</td><td>${esc(b["сильнейшая_линия"])}</td><td>${fmt(b["EW_покой_Å"], 1)}</td><td>${fmt(b["FWHM_км_с"], 0)}</td></tr>`; });
      $("bztbl").innerHTML = h;
    }
    drawBlazar();
  };
  function drawBlazar() {
    const q = SETS.blazars.items[+$("bzsel").value || 0];
    if (!q) return;
    const z = q.z_lit, { w, f } = Sci.clean(q);
    const wr = w.map((x) => x / (1 + z)), fs = Sci.smooth(f, 4);
    const med = Sci.median(fs);
    // композит с наибольшим перекрытием
    let best = null;
    Object.values(RES.composites).forEach((c) => {
      let n = 0, s = [];
      c.w.forEach((x, i) => { if (c.f[i] !== null && x > wr[0] && x < wr[wr.length - 1]) { n++; s.push(c.f[i]); } });
      if (!best || n > best.n) best = { c, n, med: Sci.median(s) };
    });
    const ys = fs.map((v) => v / med);
    const sorted = ys.slice().sort((a, b) => a - b);
    const A = axes($("bzplot"), [wr[0], wr[wr.length - 1]], [0, Math.max(sorted[Math.floor(sorted.length * 0.995)] * 1.15, 2.2)], "Длина волны в системе покоя, Å", "Нормированный поток");
    if (best && best.n) line(A, best.c.w, best.c.f.map((v) => (v === null ? null : v / best.med)), "#9aa3b5", 1.5);
    line(A, wr, ys, q.type === "BL Lac" ? "#5b2d91" : "#2f6fd6", 1);
    A.ctx.textAlign = "center"; A.ctx.fillStyle = "#b03d10"; A.ctx.font = "12px Segoe UI, Arial";
    Sci.LINES.forEach((L) => { if (L.lam < wr[0] || L.lam > wr[wr.length - 1] || (L.w < 8 && L.id !== "OIII")) return; A.ctx.fillText(L.name, A.X(L.lam), A.P.t - 8); });
    const r = RES.blazars.find((b) => b["объект"] === q.blazar) || {};
    $("bzinfo").textContent = q.type === "BL Lac"
      ? `Лацертида: линий почти нет (EW ${fmt(r["EW_покой_Å"], 1)} Å). Конвейер SDSS дал z = ${fmt(q.z_cat, 3)}${q.z_warning ? " с флагом ошибки" : ""}; по литературе ${q.z_lit}.`
      : `FSRQ: широкие линии, как у обычных квазаров (${esc(r["сильнейшая_линия"] || "")}: EW ${fmt(r["EW_покой_Å"], 0)} Å).`;
  }

  // ================= Лес Лайман-альфа =================
  drawers.forest = function () {
    if (!RES) { $("verdict").textContent = "Нет data/results.js — запустите analysis/pipeline.py"; return; }
    const F = RES.forest, M = RES.metrics;
    const zs = F.map((r) => r.z);
    const xr = [Math.floor(Math.min(...zs) * 10) / 10 - 0.1, Math.ceil(Math.max(...zs) * 10) / 10 + 0.2];
    const A = axes($("fplot"), xr, [-0.2, 0.9], "Красное смещение квазара z", "D_A = 1 − ⟨F/C⟩");
    const zz = []; for (let z = xr[0]; z <= xr[1]; z += 0.02) zz.push(z);
    line(A, zz, zz.map((z) => 1 - Math.exp(-0.0018 * Math.pow(1 + z, 3.92))), "#1b2233", 1.5);
    if (RES.forest_fit) line(A, zz, zz.map((z) => 1 - Math.exp(-RES.forest_fit[0] * Math.pow(1 + z, RES.forest_fit[1]))), "#d2501e", 2);
    F.forEach((r) => dot(A, r.z, r.DA, "#5b2d91", 4.5));
    const B = axes($("fplot2"), xr, [0, Math.max(...F.map((r) => Math.max(r["линий_на_100Å"], r["линий_на_100Å_JS"] || 0))) * 1.15], "Красное смещение квазара z", "Линий леса на 100 Å");
    F.forEach((r) => { dot(B, r.z, r["линий_на_100Å"], "#2f6fd6", 4.5); if (r["линий_на_100Å_JS"] !== null) dot(B, r.z, r["линий_на_100Å_JS"], "#d2501e", 4, true); });
    const [rho, p] = M.forest_spearman_DA, [rho2, p2] = M.forest_spearman_per100, [rho3, p3] = M.forest_spearman_per100_JS;
    $("verdict").innerHTML = `<b>${F.length} спектров.</b> Доля поглощённого света: коэффициент Спирмена ρ = ${fmt(rho, 2)} (95 % интервал ${fmt(M.forest_DA_rho_CI95[0], 2)}…${fmt(M.forest_DA_rho_CI95[1], 2)}), p = ${p.toExponential(1)}. ` +
      `Число линий: ρ = ${fmt(rho2, 2)}, p = ${p2.toExponential(1)} (метод 2) и ρ = ${fmt(rho3, 2)}, p = ${p3.toExponential(1)} (метод 1).<br>` +
      (rho > 0 && p < 0.05 ? "<b>Гипотеза подтверждается:</b> чем больше z, тем гуще лес и тем больше света поглощено межгалактическим водородом. " : "Гипотеза не подтверждена на этой выборке. ") +
      (RES.forest_fit ? `Наша подгонка τ = ${fmt(RES.forest_fit[0], 4)}(1+z)<sup>${fmt(RES.forest_fit[1], 2)}</sup> близка к закону из литературы τ = 0,0018(1+z)<sup>3,92</sup> (Faucher-Giguère и др., 2008); наши значения немного ниже, потому что континуум продолжен степенным законом.` : "");
    let h = "<tr><th>Объект</th><th>z</th><th>S/N в лесу</th><th>D_A</th><th>Линий</th><th>На 100 Å (метод 2)</th><th>На 100 Å (метод 1)</th></tr>";
    F.slice().sort((a, b) => a.z - b.z).forEach((r) => { h += `<tr><td>${esc(r["объект"])}</td><td>${fmt(r.z, 3)}</td><td>${fmt(r["S/N_лес"], 1)}</td><td>${fmt(r.DA, 3)}</td><td>${r["линий"]}</td><td>${fmt(r["линий_на_100Å"], 2)}</td><td>${fmt(r["линий_на_100Å_JS"], 2)}</td></tr>`; });
    $("ftbl").innerHTML = h;
  };

  // ================= Калькулятор =================
  drawers.calc = function () {
    const z = Math.max(0, +$("cz").value || 0), p = { H0: +$("cH0").value || 67.66, Om: +$("cOm").value || 0.3111 };
    const c = Sci.cosmology(z, p);
    const rowsC = [
      ["Возраст Вселенной сегодня", `${fmt(c.age0, 3)} млрд лет`],
      ["Возраст Вселенной в момент излучения", `${fmt(c.ageAtEmission, 3)} млрд лет`],
      ["Время в пути света", `${fmt(c.lookback, 3)} млрд лет`],
      ["Сопутствующее расстояние", `${fmt(c.Dc, 1)} Мпк = ${fmt(c.DcGly, 3)} млрд св. лет`],
      ["Фотометрическое расстояние D_L", `${fmt(c.Dl, 1)} Мпк`],
      ["Расстояние по угловому размеру D_A", `${fmt(c.Da, 1)} Мпк`],
      ["Вселенная с тех пор растянулась в", `${fmt(1 + z, 3)} раза`],
      ["Линия Lyα 1216 Å придёт на длине волны", `${fmt(1215.67 * (1 + z), 1)} Å`],
    ];
    $("calcout").innerHTML = rowsC.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join("");
  };
  ["cz", "cH0", "cOm"].forEach((id) => $(id).addEventListener("input", drawers.calc));

  // ================= Теория =================
  const GLOSS = [
    ["Квазар", "Активное ядро далёкой галактики: вещество падает на сверхмассивную чёрную дыру и светится ярче всей галактики."],
    ["Блазар", "Квазар, джет которого направлен почти на нас. FSRQ — с широкими линиями; лацертиды (BL Lac) — почти без линий."],
    ["Спектр", "Зависимость яркости от длины волны. Линии — «отпечатки пальцев» химических элементов."],
    ["Эмиссионная линия", "Яркий горб в спектре: свет излучает горячий газ определённого элемента (H, C, Mg…)."],
    ["Красное смещение z", "Относительное удлинение волн: 1 + z = λ_набл / λ_лаб. Для далёких объектов — растяжение пространства, пока шёл свет."],
    ["Сопутствующее расстояние", "Расстояние до объекта «сегодня», с учётом расширения Вселенной."],
    ["Время в пути света", "Сколько лет назад свет покинул объект; столько лет назад мы его и видим."],
    ["Лес Лайман-альфа", "Множество узких линий поглощения синее линии Lyα: облака межгалактического водорода на пути света."],
    ["D_A", "Доля света, поглощённая лесом: 1 − ⟨F/C⟩, где C — уровень непоглощённого (континуального) потока."],
    ["Континуум", "Гладкая часть спектра без линий."],
    ["FWHM", "Ширина линии на половине высоты. Широкие линии (тысячи км/с) — газ, быстро вращающийся вокруг чёрной дыры."],
    ["EW", "Эквивалентная ширина: сила линии относительно континуума."],
    ["BAL-квазар", "Квазар с широкими линиями поглощения: быстрый ветер вещества от ядра «съедает» часть спектра."],
    ["Реионизация", "Эпоха (z ≈ 6–10), когда первые звёзды и квазары ионизовали водород Вселенной."],
    ["ΛCDM", "Стандартная космологическая модель: тёмная энергия (Λ) + холодная тёмная материя."],
  ];
  $("gloss").innerHTML = GLOSS.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("");
  $("labtbl").innerHTML = "<tr><th>Линия</th><th>Элемент</th><th>λ, Å</th><th>Сила</th></tr>" + Sci.LINES.map((L) => `<tr><td>${L.name}</td><td>${L.el}</td><td>${L.lam}</td><td>${L.w >= 20 ? "сильная" : L.w >= 8 ? "средняя" : "слабая"}</td></tr>`).join("");

  // ================= Итоги =================
  drawers.results = function () {
    if (!RES) { $("crittbl").innerHTML = "<tr><td>Нет data/results.js — запустите analysis/pipeline.py</td></tr>"; return; }
    $("crittbl").innerHTML = "<tr><th>Критерий</th><th>Цель</th><th>Достигнуто</th><th>Выполнен</th></tr>" +
      RES.criteria.map((c) => `<tr><td>${esc(c["критерий"])}</td><td>${esc(c["цель"])}</td><td>${esc(c["достигнуто"])}</td><td>${c["выполнен"] ? '<span class="ok">✓ да</span>' : "✗ нет"}</td></tr>`).join("");
    const M = RES.metrics;
    $("findings").innerHTML = [
      `Определены z, расстояния и эпохи ${M.n_region} квазаров участка: от z = ${fmt(M.z_range[0], 2)} до ${fmt(M.z_range[1], 2)}; свет самых далёких шёл к нам ${fmt(Sci.cosmology(M.z_range[1]).lookback, 1)} млрд лет.`,
      `${M.z_confirmed_two_methods} из ${M.n_region} значений z подтверждены двумя независимыми методами; медианное расхождение с каталогом SDSS — ${fmt(M.z_median_dev_pct, 2)} %.`,
      `Гипотеза подтверждена: доля света, поглощённого лесом Лайман-альфа, растёт с z (ρ = ${fmt(M.forest_spearman_DA[0], 2)}, p = ${M.forest_spearman_DA[1].toExponential(1)}, ${M.forest_n} спектров).`,
      "Линии углерода, кремния, магния и кислорода видны в квазарах всех эпох — тяжёлые элементы появились очень рано.",
      "Широкие линии квазаров имеют ширину 2–10 тыс. км/с; по Mg II оценены массы чёрных дыр (сотни миллионов — миллиарды масс Солнца).",
      "Блазары-FSRQ похожи на квазары, а у лацертид линий почти нет — конвейер SDSS ошибся в z двух из трёх лацертид.",
      `Контроль качества нашёл ${M.catalog_problems.length} объектов, требующих осторожности: звёзды под видом квазаров и BAL-квазары.`,
    ].map((s) => `<li>${s}</li>`).join("");
    $("qctbl").innerHTML = "<tr><th>Объект</th><th>z каталога</th><th>Что не так</th></tr>" + M.catalog_problems.map((p) => `<tr><td>${esc(p["объект"])}</td><td>${fmt(p["z_каталог"], 3)}</td><td>${esc(p["контроль"])}</td></tr>`).join("");
  };

  // ---------- старт ----------
  select(0);
  const h = (location.hash || "").replace(/^#(tab=)?/, "");
  if (h && $(h) && $(h).classList.contains("tab")) { openTab(h); setTimeout(() => window.scrollTo(0, 0), 0); }
})();
