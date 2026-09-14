/* ── Deep Field background ──
   A telescope deep field: distant galaxies at different depths with gentle parallax (pointer and scroll).
   On the home page a reticle now and then acquires one galaxy and a small mono readout names it. The readout is
   illustrative sample text and always carries the word "sample". It is only placed where its whole footprint,
   including parallax travel, clears every heading, paragraph, form and button by a margin.
   Reading pages (glossary, 404) use the calm field: fewer galaxies, no reticle.
   Canvas 2D, sprite-cached galaxies, no libraries. Paused when the tab is hidden or the section is off screen;
   one still frame under reduced motion; the CSS speckle behind it is the no-JS fallback. */
(function(){
  var D = document, W = window;
  var MOTION = !(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(W.matchMedia && W.matchMedia('(pointer: fine)').matches);
  if(!W.requestAnimationFrame || !D.querySelector('canvas.df')) return;
  var stats = W.__bg = { frames:0, t:[], name:'deepfield', ro:{} };   /* ro: where each field's readout is drawn, for layout checks */
  var PAL = [[255,236,214],[214,226,255],[255,214,178],[236,222,255],[255,246,236]];
  var FONT = "'JetBrains Mono', ui-monospace, Menlo, monospace";
  /* per-field settings: what to keep clear, how dense, whether a reticle runs */
  var KINDS = {
    hero:  { text:'.pill,h1,.lead,.ticks-inline li', solid:'.hero-form,.hero-err,.nojs-only,.cframe,.csample',
             blocks:'.pill,h1,.lead,.hero-form,.hero-err,.nojs-only,.ticks-inline li,.cframe,.csample', fold:true, reticle:true,
             labels:[['1 of 4,812 signals','reaches customer data · sample'],['choke point','3 paths meet · sample'],['1 of 4,812 signals','admin key, no owner · sample']] },
    final: { text:'h2,.sub,.eyebrow,.partner h3,.partner li,.incident h3,.incident p', solid:'.cta-row a,.partner,.incident',
             blocks:'h2,.sub,.cta-row a,.partner,.incident', reticle:true,
             labels:[['resolved','path cut · verified · sample'],['1 fix','moves the number · sample']] },
    calm:  { text:'.crumb,.eyebrow,h1,.lead,.count,.code,p', solid:'.search,.row .btn', calm:true }
  };
  function clamp(x,a,b){ return x < a ? a : x > b ? b : x; }
  function smooth(e0,e1,x){ var t = clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t); }
  function rng(seed){ return function(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function hits(b, list, m){ for(var i = 0; i < list.length; i++){ var q = list[i]; if(b.l < q.r + m && b.r > q.l - m && b.t < q.b + m && b.b > q.t - m) return true; } return false; }

  function Field(cv, idx){
    var host = cv.parentElement, kind = cv.getAttribute('data-field'), K = KINDS[kind] || KINDS.calm, ctx = cv.getContext('2d');
    var f = { host:host, visible:false, raf:0, built:false };
    var Wd, Hd, dpr, mobile, PAD = 36, far, gal = [], near = [], lines = [], blocks = [], targets = [], hostTop = 0;
    var px = 0, py = 0, tx = 0, ty = 0, t0 = 0, last = 0, curK = -1, curT = null, hdrH = 0;
    var SC, PT, M;   /* scroll parallax, pointer parallax, reticle metrics */

    function relRect(b, h){ return { l:b.left - h.left, t:b.top - h.top, r:b.right - h.left, b:b.bottom - h.top }; }
    function rects(sel, h, perLine){
      var out = [];
      Array.prototype.forEach.call(host.querySelectorAll(sel), function(el){
        if(!perLine){ var b = el.getBoundingClientRect(); if(b.width > 1 && b.height > 1) out.push(relRect(b, h)); return; }
        var rg = D.createRange(); rg.selectNodeContents(el);
        Array.prototype.forEach.call(rg.getClientRects(), function(b){ if(b.width > 1 && b.height > 1) out.push(relRect(b, h)); });
      });
      return out;
    }

    function sprite(r, size){
      var q = .3 + r()*.7, ang = r()*Math.PI, col = PAL[(r()*PAL.length)|0], spiral = size > 16 && r() < .45;
      var S = Math.ceil(size*1.4*dpr) + 4, c = D.createElement('canvas'); c.width = c.height = S;
      var g = c.getContext('2d'); g.translate(S/2, S/2); g.rotate(ang); g.scale(1, q);
      var rad = size*.7*dpr, h = g.createRadialGradient(0,0,0,0,0,rad);
      h.addColorStop(0, 'rgba(' + col + ',.7)'); h.addColorStop(.18, 'rgba(' + col + ',.36)'); h.addColorStop(.55, 'rgba(' + col + ',.07)'); h.addColorStop(1, 'rgba(' + col + ',0)');
      g.fillStyle = h; g.beginPath(); g.arc(0,0,rad,0,6.2832); g.fill();
      if(spiral){
        g.strokeStyle = 'rgba(' + col + ',.16)'; g.lineWidth = Math.max(1, rad*.12);
        for(var a = 0; a < 2; a++){ g.beginPath(); for(var k = 0; k <= 24; k++){ var th = k/24*3.4 + a*Math.PI, rr = rad*(.15 + .8*k/24); g.lineTo(Math.cos(th)*rr, Math.sin(th)*rr); } g.stroke(); }
      }
      g.setTransform(1,0,0,1,0,0);
      var core = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, Math.max(1.5, size*.12)*dpr);
      core.addColorStop(0, 'rgba(255,250,240,.9)'); core.addColorStop(1, 'rgba(255,250,240,0)');
      g.fillStyle = core; g.fillRect(0,0,S,S);
      return c;
    }

    /* the area a galaxy of size s at depth d can sweep through, as parallax moves it */
    function sweep(x, y, rad, d){
      var sx = (PT + 6)*d;
      return { l:x - rad - sx, r:x + rad + sx, t:y - rad - (PT*d + SC*d*.15), b:y + rad + PT*d + SC*d };
    }

    /* reticle + readout footprint for a target at (x,y) with the label on side s */
    function footprint(x, y, s){
      var ext = M.ext, h = M.hF, lt = Math.min(y - h + 2, y - 15), lb = y + M.lb, lw = h + 18 + M.tw;
      var box = { l:Math.min(x - ext, s > 0 ? x : x - lw), r:Math.max(x + ext, s > 0 ? x + lw : x), t:Math.min(y - ext, lt), b:Math.max(y + ext, lb) };
      var d = M.d, sx = (PT + 6)*d;
      box.l -= sx; box.r += sx; box.t -= PT*d + SC*d*.15; box.b += PT*d + SC*d;
      return box;
    }

    function build(){
      /* measure against settled layout: a reveal still part-way through its transform would move the free space */
      var R = D.documentElement; R.classList.add('sp-measure');
      var hb = host.getBoundingClientRect();
      Wd = Math.round(hb.width); Hd = Math.round(hb.height); hostTop = hb.top + W.scrollY;
      mobile = Wd < 700; dpr = Math.min(W.devicePixelRatio || 1, 2);
      SC = mobile ? 24 : 40; PT = FINE ? (K.calm ? 9 : 18) : 0;
      cv.width = Math.round(Wd*dpr); cv.height = Math.round(Hd*dpr);
      lines = rects(K.text, hb, true).concat(rects(K.solid, hb, false));
      var r = rng(4001 + idx*977), FW = Wd + PAD*2, FH = Hd + PAD*2, area = Wd*Hd;
      /* far layer: faint stars and tiny unresolved galaxies, baked once, quieter behind text */
      far = D.createElement('canvas'); far.width = Math.round(FW*dpr); far.height = Math.round(FH*dpr);
      var g = far.getContext('2d'), n = Math.round(FW*FH / (K.calm ? (mobile ? 1300 : 900) : (mobile ? 900 : 560)));
      for(var i = 0; i < n; i++){
        var x = r()*FW, y = r()*FH, quiet = hits({ l:x - PAD, r:x - PAD, t:y - PAD, b:y - PAD }, lines, 18) ? .4 : 1;
        var col = PAL[(r()*PAL.length)|0], a = (.08 + Math.pow(r(), 3)*.5) * quiet;
        g.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
        if(r() < .12){ g.save(); g.translate(x*dpr, y*dpr); g.rotate(r()*3.14); g.scale(1, .35 + r()*.6); g.beginPath(); g.arc(0, 0, (1.2 + r()*1.8)*dpr, 0, 6.2832); g.globalAlpha = .55; g.fill(); g.restore(); }
        else g.fillRect(x*dpr, y*dpr, (.7 + r()*.8)*dpr, (.7 + r()*.8)*dpr);
      }
      /* resolved galaxies. Phones get a denser field, half of it held above the fold so the mood shows there. */
      gal = [];
      var ng = K.calm ? clamp(Math.round(area / (mobile ? 9000 : 16000)), 14, 48)
                      : mobile ? clamp(Math.round(area / 4200), 60, 120) : clamp(Math.round(area / 7200), 70, 170);
      var foldH = K.fold ? clamp((W.innerHeight || Hd) - Math.max(0, hb.top), 120, Hd) : Hd, inFold = mobile && K.fold ? Math.round(ng*.5) : 0;
      for(var k = 0, guard = 0; k < ng && guard < ng*14; guard++){
        var sz = mobile ? 3.5 + Math.pow(r(), 2.2)*24 : 3 + Math.pow(r(), 2.6)*(K.calm ? 34 : 44);
        var gx = r()*Wd, gy = r()*(k < inFold ? foldH : Hd), d = .3 + r()*.7;
        var over = hits(sweep(gx, gy, sz*.7, d), lines, 4);
        if(over && sz > 6) continue;
        gal.push({ x:gx, y:gy, s:sz, d:d, img:sprite(r, sz), tw:r()*6.28, q: over ? .45 : 1 }); k++;
      }
      near = [];
      var nn = K.calm ? (mobile ? 2 : 3) : (mobile ? 5 : 9);
      for(var m = 0, guard2 = 0; m < nn && guard2 < 300; guard2++){
        var sx = r()*Wd, sy = r()*Hd; if(hits({ l:sx - 20, r:sx + 20, t:sy - 20, b:sy + 20 + SC }, lines, 24)) continue;
        near.push({ x:sx, y:sy, l:(6 + r()*14), a:.35 + r()*.4, col:PAL[(r()*2)|0] }); m++;
      }
      targets = [];
      if(K.reticle) placeTargets(r, hb);
      hdrH = (D.getElementById('siteHeader') || { offsetHeight:0 }).offsetHeight;
      curK = -1; curT = null; stats.ro[kind] = null;
      R.classList.remove('sp-measure');
      f.built = true;
    }

    /* scan the section for spots where the whole reticle and readout sit in free space, then seed a quiet galaxy there */
    function placeTargets(r, hb){
      blocks = rects(K.blocks, hb, false);
      var fs1 = mobile ? 10 : 11, fs2 = mobile ? 9 : 10;
      ctx.font = '500 ' + fs1 + 'px ' + FONT; var w1 = 0, w2 = 0;
      K.labels.forEach(function(l){ w1 = Math.max(w1, ctx.measureText(l[0]).width); });
      ctx.font = '500 ' + fs2 + 'px ' + FONT;
      K.labels.forEach(function(l){ w2 = Math.max(w2, ctx.measureText(l[1]).width); });
      /* phones get a smaller instrument: the free bands between blocks there are only ~60px tall */
      var sz = mobile ? 7 : 11, hF = (sz*.9 + 14)/2, tick = mobile ? 6 : 14, grow = mobile ? 1.3 : 1.6;
      M = { fs1:fs1, fs2:fs2, sz:sz, hF:hF, tick:tick, grow:grow, ext:Math.max(hF*grow*1.42, hF + tick), tw:Math.ceil(Math.max(w1, w2)) + 2, lb:mobile ? 18 : 21, l2:mobile ? 13 : 15, d:.15 };
      /* scan step: fine on phones, where the free bands are only a few pixels taller than the instrument */
      var GAP = mobile ? 8 : 18, EDGE = mobile ? 6 : 8, sy = mobile ? 3 : Math.max(6, Math.round(Hd/90)), sx = mobile ? 8 : Math.max(14, Math.round(Wd/90)), cands = [];
      var TOP = mobile ? 12 : EDGE;   /* a little more air under the sticky header on phones */
      for(var y = EDGE; y < Hd - EDGE; y += sy) for(var x = EDGE; x < Wd - EDGE; x += sx) for(var s = 1; s >= -1; s -= 2){
        var b = footprint(x, y, s);
        if(b.l < EDGE || b.r > Wd - EDGE || b.t < TOP || b.b > Hd - EDGE) continue;
        if(hits(b, blocks, GAP) || hits(b, lines, GAP)) continue;
        cands.push({ x:x, y:y, side:s });
      }
      /* spread picks out; keep at most six */
      for(var i = cands.length - 1; i > 0; i--){ var j = (r()*(i + 1))|0, tmp = cands[i]; cands[i] = cands[j]; cands[j] = tmp; }
      for(var c = 0; c < cands.length && targets.length < 6; c++){
        var C = cands[c], ok = true;
        for(var t = 0; t < targets.length; t++){ var o = targets[t].g; if(Math.abs(o.x - C.x) < 220 && Math.abs(o.y - C.y) < 120){ ok = false; break; } }
        if(!ok) continue;
        var G = { x:C.x, y:C.y, s:sz, d:M.d, img:sprite(r, sz), tw:r()*6.28, q:1 };
        gal.push(G); targets.push({ g:G, side:C.side });
      }
      stats['targets-' + kind] = targets.length; stats['cands-' + kind] = cands.length;
    }

    /* choose, once per cycle, a target that is on screen and clear of the sticky header and phone bar */
    function pick(k){
      if(!targets.length) return null;
      var top = hostTop - W.scrollY, vh = W.innerHeight, bar = D.getElementById('mbar'), low = vh;
      if(bar && bar.offsetHeight && getComputedStyle(bar).visibility === 'visible') low = vh - bar.offsetHeight;
      for(var i = 0; i < targets.length; i++){
        var T = targets[(k + idx + i) % targets.length], vy = top + T.g.y;
        if(!MOTION || (vy - M.ext > hdrH + 16 && vy + M.lb + 30 < low)) return T;
      }
      return null;
    }

    function drawReticle(t){
      stats.ro[kind] = null;
      var CYC = mobile ? 14 : 8, k = MOTION ? Math.floor(t / CYC) : 0, tau = MOTION ? t % CYC : 3.2;
      if(k !== curK){ curK = k; curT = pick(k); }
      if(!curT || tau > 6.4) return;
      var T = curT, G = T.g, lab = K.labels[k % K.labels.length];
      var so = scrollOff(), x = G.x - px*PT*G.d, y = G.y - py*PT*G.d + so*SC*G.d;
      /* never under the sticky header */
      var vy = hostTop - W.scrollY + y;
      var clear = MOTION ? smooth(hdrH + 4, hdrH + 24, vy - M.ext) : 1;
      var acq = smooth(0, 1.4, tau), rel = 1 - smooth(5.6, 6.4, tau);
      var alpha = Math.min(smooth(0, .5, tau), rel) * clear; if(alpha <= .01) return;
      var hF = M.hF, size = 2*hF*(M.grow + (1 - M.grow)*acq), h = size/2, arm = Math.max(4, size*.22);
      ctx.save(); ctx.translate(x, y); ctx.rotate((1 - acq)*.785);
      ctx.strokeStyle = 'rgba(45,225,198,' + (.9*alpha).toFixed(3) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(s){ ctx.moveTo(s[0]*h, s[1]*(h - arm)); ctx.lineTo(s[0]*h, s[1]*h); ctx.lineTo(s[0]*(h - arm), s[1]*h); });
      ctx.stroke(); ctx.restore();
      var hv = hostTop - W.scrollY;
      stats.ro[kind] = { l:x - M.ext, r:x + M.ext, t:y - M.ext + hv, b:y + M.ext + hv, text:'' };
      if(acq < 1) return;
      var lock = smooth(1.4, 1.9, tau) * rel * clear, tk = M.tick;
      ctx.strokeStyle = 'rgba(45,225,198,' + (.45*lock).toFixed(3) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - h - tk, y); ctx.lineTo(x - h - 4, y); ctx.moveTo(x + h + 4, y); ctx.lineTo(x + h + tk, y);
      ctx.moveTo(x, y - h - tk); ctx.lineTo(x, y - h - 4); ctx.moveTo(x, y + h + 4); ctx.lineTo(x, y + h + tk); ctx.stroke();
      /* readout: both lines appear whole, so the word "sample" is on screen whenever any of the label is */
      var side = T.side, lx = x + side*(h + 18), ly = y - 4, txt = smooth(1.7, 2.5, tau) * rel * clear;
      ctx.strokeStyle = 'rgba(45,225,198,' + (.4*lock).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x + side*(h + 2), y - h + 2); ctx.lineTo(lx - side*4, ly - 10); ctx.lineTo(lx + side*16, ly - 10); ctx.stroke();
      if(txt <= .01) return;
      ctx.textAlign = side > 0 ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
      ctx.font = '500 ' + M.fs1 + 'px ' + FONT; ctx.fillStyle = 'rgba(111,240,216,' + (.98*txt).toFixed(3) + ')';
      ctx.fillText(lab[0], lx, ly + 6);
      ctx.font = '500 ' + M.fs2 + 'px ' + FONT; ctx.fillStyle = 'rgba(206,214,226,' + (.9*txt).toFixed(3) + ')';
      ctx.fillText(lab[1], lx, ly + 6 + M.l2);
      var lw = M.tw;
      stats.ro[kind] = { l:Math.min(x - M.ext, side > 0 ? x : lx - lw), r:Math.max(x + M.ext, side > 0 ? lx + lw : x), t:Math.min(y - M.ext, y - h + 2, ly - 10) + hv, b:Math.max(y + M.ext, ly + 6 + M.l2 + 4) + hv, text:lab.join(' · ') };
    }
    function scrollOff(){ return MOTION ? clamp((W.scrollY - hostTop) / (W.innerHeight || 1), -1, 1) : 0; }

    function draw(t){
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, cv.width, cv.height);
      var so = scrollOff(), drift = MOTION ? Math.sin(t/70*6.2832)*6 : 0, tws = K.calm ? .06 : .12;
      ctx.drawImage(far, Math.round((-PAD - px*5 + drift*.4)*dpr), Math.round((-PAD - py*5 + so*10)*dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);
      for(var i = 0; i < gal.length; i++){
        var G = gal[i], S = G.img.width/dpr;
        ctx.globalAlpha = G.q * (MOTION ? 1 - tws + tws*Math.sin(t*.4 + G.tw) : 1);
        ctx.drawImage(G.img, G.x - S/2 - px*PT*G.d + drift*G.d, G.y - S/2 - py*PT*G.d + so*SC*G.d, S, S);
      }
      ctx.globalAlpha = 1;
      for(var j = 0; j < near.length; j++){
        var s = near[j], x = s.x - px*PT*1.6 + drift, y = s.y - py*PT*1.6 + so*SC*1.5, L = s.l, a = s.a * (MOTION ? .85 + .15*Math.sin(t*.9 + j) : 1);
        var gl = ctx.createRadialGradient(x, y, 0, x, y, 6); gl.addColorStop(0, 'rgba(' + s.col + ',' + a.toFixed(3) + ')'); gl.addColorStop(1, 'rgba(' + s.col + ',0)');
        ctx.fillStyle = gl; ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.strokeStyle = 'rgba(' + s.col + ',' + (a*.35).toFixed(3) + ')'; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
        ctx.moveTo(x - L*.35, y - L*.6); ctx.lineTo(x + L*.35, y + L*.6); ctx.moveTo(x + L*.35, y - L*.6); ctx.lineTo(x - L*.35, y + L*.6); ctx.stroke();
      }
      if(K.reticle) drawReticle(t);
    }
    function frame(now){
      f.raf = 0; if(!f.visible || D.hidden) return;
      var a = performance.now(), t = (now - t0)/1000, dt = Math.min(.05, (now - last)/1000 || .016); last = now;
      var e = 1 - Math.exp(-dt*2.5); px += (tx - px)*e; py += (ty - py)*e;
      draw(t);
      var d = performance.now() - a; stats.frames++; stats.t.push(d); if(stats.t.length > 900) stats.t.shift();
      f.raf = requestAnimationFrame(frame);
    }
    f.start = function(){ if(!f.built) build(); if(MOTION && !f.raf && f.visible && !D.hidden) f.raf = requestAnimationFrame(frame); if(!MOTION) draw(3.2); };
    f.stop = function(){ if(f.raf){ cancelAnimationFrame(f.raf); f.raf = 0; } if(MOTION) stats.ro[kind] = null; };
    f.rebuild = function(){ f.built = false; if(f.visible){ build(); if(!MOTION) draw(3.2); } };
    f.boot = function(){
      t0 = performance.now(); last = t0;
      host.classList.add('df-live'); cv.classList.add('on');
      if(MOTION && FINE){
        host.addEventListener('pointermove', function(e){ tx = clamp(e.clientX / W.innerWidth*2 - 1, -1, 1); ty = clamp(e.clientY / W.innerHeight*2 - 1, -1, 1); });
        host.addEventListener('pointerleave', function(){ tx = 0; ty = 0; });
      }
    };
    return f;
  }

  function boot(){
    var fields = Array.prototype.map.call(D.querySelectorAll('canvas.df'), Field);
    fields.forEach(function(f){ f.boot(); });
    if('IntersectionObserver' in W){
      var io = new IntersectionObserver(function(ents){ ents.forEach(function(en){ fields.forEach(function(f){ if(f.host === en.target){ f.visible = en.isIntersecting; f.visible ? f.start() : f.stop(); } }); }); }, { rootMargin:'120px 0px' });
      fields.forEach(function(f){ io.observe(f.host); });
    } else fields.forEach(function(f){ f.visible = true; f.start(); });
    D.addEventListener('visibilitychange', function(){ fields.forEach(function(f){ D.hidden ? f.stop() : f.start(); }); });
    var rt, lw = W.innerWidth;
    function relayout(){ fields.forEach(function(f){ f.rebuild(); }); }
    /* phones fire resize when the URL bar slides; only a width change rebuilds there */
    W.addEventListener('resize', function(){ if(W.innerWidth === lw && W.innerWidth < 700) return; lw = W.innerWidth; clearTimeout(rt); rt = setTimeout(relayout, 180); });
    if('ResizeObserver' in W){ var mt, first = true; var ro = new ResizeObserver(function(){ if(first){ first = false; return; } clearTimeout(mt); mt = setTimeout(relayout, 200); }); fields.forEach(function(f){ ro.observe(f.host); }); }
  }
  /* the CSS star ground is raised a frame after the first paint: the heavy gradient never blocks the headline */
  (function(){ var R = D.documentElement, on = function(){ R.classList.add('sp'); };
    if(MOTION) requestAnimationFrame(function(){ requestAnimationFrame(on); }); else on(); })();
  function go(){ (D.fonts && D.fonts.ready ? D.fonts.ready : Promise.resolve()).then(function(){ setTimeout(boot, 80); }); }
  if(D.readyState === 'complete') go(); else W.addEventListener('load', go);
})();
