/* ── Signal in the Noise ──
   The whole site is dark over a quiet field of many faint points (the haystack). On the home page a slow
   instrument sweep passes over it and one point resolves into a teal signal beside the top fix; three faint
   paths draw in to meet it as you scroll, and the field thins section by section so the final CTA is calm.
   The signal and its paths are placed only in free space: they never sit under a heading, paragraph, form,
   card or button at any width. Reading pages (glossary, 404) carry the calm field — fewer points, no sweep.
   Canvas 2D, one fixed full-viewport canvas, no libraries. DPR capped at 2. Starts after load so the text
   paints first; paused when the tab is hidden and when no signal is on screen; one still resolved frame under
   reduced motion; the CSS star speckle behind it is the no-JS fallback. */
(function(){
  var D = document, R = D.documentElement, W = window;
  var MOTION = R.classList.contains('motion');
  if(!W.requestAnimationFrame) return;
  var ground = D.getElementById('sp-ground'); if(!ground) return;
  var cv = ground.querySelector('canvas'); if(!cv) return;
  var ctx = cv.getContext && cv.getContext('2d'); if(!ctx) return;
  var FIELD = ground.getAttribute('data-field') || 'calm';
  var HERO = FIELD === 'hero';
  var stats = W.__bg = { frames:0, t:[], name:'signal', field:FIELD, sig:[], paths:[] };

  /* the CSS star speckle is raised a frame after first paint: the heavy gradient never blocks the headline,
     and it bridges the gap until the live canvas fades in over it. */
  (function(){ var on = function(){ R.classList.add('sp'); }; if(MOTION) requestAnimationFrame(function(){ requestAnimationFrame(on); }); else on(); })();

  var TEAL = '45,225,198', STAR = '214,228,255';
  var vw, vh, dpr, mobile, layers = [], twinkles = [], anchors = [], docH = 1;
  var t0 = 0, hitAt = -1, lastSweepX = -1, running = false, raf = 0;

  function rnd(seed){ return function(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function clamp(x,a,b){ return x < a ? a : x > b ? b : x; }
  function smooth(e0,e1,x){ var t = clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t); }

  /* ── the haystack: two tileable star layers ──
     structure (brighter, persists) and noise (fades as you scroll). Calm pages get fewer points. */
  function buildLayers(){
    var r = rnd(7919), area = vw * vh;
    var per = HERO ? (mobile ? 820 : 480) : (mobile ? 1500 : 1050);
    var n = Math.min(HERO ? 3400 : 1800, Math.round(area / per));
    layers = [0,1].map(function(){ var c = D.createElement('canvas'); c.width = Math.ceil(vw*dpr); c.height = Math.ceil(vh*dpr); return c; });
    var lc = layers.map(function(c){ return c.getContext('2d'); });
    twinkles = [];
    var twMax = HERO ? (mobile ? 24 : 70) : (mobile ? 12 : 34);
    for(var i = 0; i < n; i++){
      var x = r()*vw, y = r()*vh, m = r(), structure = m > .72;
      var a = structure ? .28 + r()*.42 : .07 + r()*.2;
      var s = (structure ? 1 + r()*.9 : .6 + r()*.7) * dpr;
      var g = lc[structure ? 0 : 1];
      var warm = r() < .05;
      g.fillStyle = 'rgba(' + (warm ? '255,214,170' : STAR) + ',' + a.toFixed(3) + ')';
      g.fillRect(x*dpr, y*dpr, s, s);
      if(structure && m > .985){
        var gr = g.createRadialGradient(x*dpr, y*dpr, 0, x*dpr, y*dpr, 5*dpr);
        gr.addColorStop(0, 'rgba(' + STAR + ',.22)'); gr.addColorStop(1, 'rgba(' + STAR + ',0)');
        g.fillStyle = gr; g.fillRect((x-5)*dpr, (y-5)*dpr, 10*dpr, 10*dpr);
      }
      if(structure && twinkles.length < twMax && r() < .3) twinkles.push({x:x, y:y, p:r()*6.28, f:.6 + r()*1.4, s:s});
    }
  }

  /* ── anchors: where a point resolves into the teal signal ──
     They live in document space and are re-measured on layout change. The hero anchor sits in the free gap
     beside the top fix; the final anchor beside the design-partner card. Both are validated against every
     heading, paragraph, form, card and button so nothing is ever drawn under text. */
  function docRect(el){ var b = el.getBoundingClientRect(); return { l:b.left, t:b.top + W.scrollY, r:b.right, b:b.bottom + W.scrollY, w:b.width, h:b.height }; }
  /* measured with sp-measure on, so reveal cards (opacity 0 until they animate in) still report their rects */
  function collect(sel, root){
    var out = []; (root || D).querySelectorAll(sel).forEach(function(el){
      var cs = getComputedStyle(el); if(cs.visibility === 'hidden' || cs.display === 'none') return;
      var b = el.getBoundingClientRect(); if(b.width > 1 && b.height > 1) out.push({ l:b.left, t:b.top + W.scrollY, r:b.right, b:b.bottom + W.scrollY });
    }); return out;
  }
  function boxHits(bx, list, m){ for(var i = 0; i < list.length; i++){ var q = list[i]; if(bx.l < q.r + m && bx.r > q.l - m && bx.t < q.b + m && bx.b > q.t - m) return true; } return false; }
  function ptInAny(x, y, list, m){ for(var i = 0; i < list.length; i++){ var q = list[i]; if(x > q.l - m && x < q.r + m && y > q.t - m && y < q.b + m) return true; } return false; }
  var FR = 20;   /* radius the reticle + core keeps clear of any text or control */

  /* build three converging paths from open space; trim each so no drawn point sits over text */
  function makePaths(A, sec, avoid, seed){
    var r = rnd(seed), dirs;
    if(!mobile){
      dirs = [ {a:-1.35, len:210}, {a:2.55, len:250}, {a:.55, len:230} ];
    } else {
      dirs = [ {a:-2.1, len:150}, {a:-.5, len:150}, {a:1.9, len:170} ];
    }
    var paths = [];
    for(var di = 0; di < dirs.length; di++){
      var dir = dirs[di], ang = dir.a + (r() - .5)*.5, len = dir.len;
      var ox = A.x + Math.cos(ang)*len, oy = A.y + Math.sin(ang)*len;
      /* keep origins inside a sane band around the section */
      oy = clamp(oy, sec.t - 180, sec.b + 260); ox = clamp(ox, -40, vw + 40);
      /* a gently bowed polyline from origin to the anchor */
      var pts = [{x:ox, y:oy}], k = 4;
      for(var i = 1; i < k; i++){
        var t = i/k, nx = -(A.y - oy), ny = (A.x - ox), L = Math.sqrt(nx*nx + ny*ny) || 1;
        var j = (r() - .5) * (mobile ? 34 : 60) * Math.sin(t*Math.PI);
        pts.push({ x:ox + (A.x - ox)*t + nx/L*j, y:oy + (A.y - oy)*t + ny/L*j });
      }
      pts.push({x:A.x, y:A.y});
      /* trim from the origin: keep the longest tail (anchor side) whose every sample clears text */
      var cut = 0;
      for(var s = 0; s < pts.length - 1; s++){
        var blocked = false;
        for(var u = 0; u <= 6; u++){ var f = u/6, sx = pts[s].x + (pts[s+1].x - pts[s].x)*f, sy = pts[s].y + (pts[s+1].y - pts[s].y)*f; if(ptInAny(sx, sy, avoid, 6)){ blocked = true; break; } }
        if(blocked) cut = s + 1;
      }
      if(cut >= pts.length - 1) continue;               /* whole path blocked → drop it */
      pts = pts.slice(cut);
      var seg = [], total = 0;
      for(var q = 1; q < pts.length; q++){ var dx = pts[q].x - pts[q-1].x, dy = pts[q].y - pts[q-1].y, d = Math.sqrt(dx*dx + dy*dy); seg.push(d); total += d; }
      if(total > 24) paths.push({ pts:pts, seg:seg, len:total });
    }
    return paths;
  }

  function makeHero(){
    var hero = D.getElementById('top'), copy = D.querySelector('.hero .hero-copy'), card = D.querySelector('.hero .cframe');
    var form = D.querySelector('.hero-form'), q1 = D.querySelector('.hero .qrow'), ticks = D.querySelector('.hero .ticks-inline');
    if(!hero || !copy) return null;
    var h = docRect(hero);
    var avoid = collect('.hero .pill,.hero h1,.hero .lead,.hero-form,.hero-err,.hero .ticks-inline li,.hero .nojs-only,.hero .cframe,.hero .console');
    var headGuard = h.t + 118;                            /* stay clear of the sticky header when the hero is at the top */
    var A;
    if(!mobile && card && form){                          /* desktop: the free gap beside the top fix, between the copy and the card */
      var c = docRect(card), f = docRect(form), qy = q1 ? (docRect(q1).t + docRect(q1).b)/2 : (c.t + c.b)/2;
      A = { x:(f.r + c.l)/2, y:clamp(qy, Math.max(c.t + 24, headGuard), c.b - 24) };
    } else if(card && ticks){                             /* stacked: the clear band between "Plain English" and the card top */
      var tb = docRect(ticks).b, ct = docRect(card).t;
      A = { x:vw*.5, y:(tb + ct)/2 };
    } else A = { x:vw*.5, y:clamp(h.t + h.h*.5, headGuard, h.b) };
    A = settle(A, avoid, h.t, h.b + 40, headGuard);
    if(!A) return null;
    return { A:A, paths:makePaths(A, h, avoid, 101), kind:1, top:h.t - 220, bottom:h.b + 320 };
  }

  function makeFinal(){
    var fin = D.getElementById('book'), col = D.querySelector('#book .final-grid > div'), partner = D.getElementById('partners'), inc = D.querySelector('#book .incident');
    if(!fin || !col) return null;
    var f = docRect(fin);
    var avoid = collect('#book h2,#book .sub,#book .cta-row a,#book .partner,#book .incident');
    var A;
    if(!mobile && partner){                               /* desktop: the gap beside the design-partner card */
      var cc = docRect(col), p = docRect(partner);
      A = { x:(cc.r + p.l)/2, y:(p.t + p.b)/2 };
    } else if(partner && inc){                            /* stacked: the calm band below the partner card, above the incident bar */
      A = { x:vw*.5, y:(docRect(partner).b + docRect(inc).t)/2 };
    } else A = { x:vw*.5, y:f.t + 40 };
    A = settle(A, avoid, f.t - 60, f.b + 60, f.t - 60);
    if(!A) return null;
    return { A:A, paths:makePaths(A, f, avoid, 202), kind:2, top:f.t - 220, bottom:f.b + 320 };
  }

  /* spiral out from the wanted point to the nearest spot whose FR box clears every avoid rect */
  function settle(A, avoid, top, bottom, minY){
    var box = function(x,y){ return { l:x - FR, t:y - FR, r:x + FR, b:y + FR }; };
    var okAt = function(x,y){ return y - FR > minY && y - FR > top && y + FR < bottom && x - FR > 6 && x + FR < vw - 6 && !boxHits(box(x,y), avoid, 4); };
    if(okAt(A.x, A.y)) return A;
    for(var rad = 20; rad <= 360; rad += 18){
      for(var a = 0; a < 16; a++){
        var th = a/16*6.2832, x = A.x + Math.cos(th)*rad, y = A.y + Math.sin(th)*rad*.72;
        if(okAt(x, y)) return { x:x, y:y };
      }
    }
    return null;   /* nothing clear enough → no signal rather than one over text */
  }

  function measure(){
    docH = Math.max(1, D.documentElement.scrollHeight - vh);
    anchors = [];
    if(HERO){
      R.classList.add('sp-measure');                      /* settle reveals so their rects are final before we place a signal */
      var a = makeHero(); if(a) anchors.push(a);
      var b = makeFinal(); if(b) anchors.push(b);
      R.classList.remove('sp-measure');
    }
    stats.anchors = anchors.map(function(an){ return { x:Math.round(an.A.x), y:Math.round(an.A.y), kind:an.kind, paths:an.paths.length }; });
  }

  function resize(){
    var nw = W.innerWidth, nh = W.innerHeight;
    var rebuild = !layers.length || nw !== vw || Math.abs(nh - vh) > 140;
    vw = nw; vh = nh; mobile = vw < 700; dpr = Math.min(W.devicePixelRatio || 1, 2);
    if(rebuild){ cv.width = Math.ceil(vw*dpr); cv.height = Math.ceil(vh*dpr); buildLayers(); }
    measure();
  }

  function drawPath(path, prog, alpha){
    var want = path.len * prog; if(want <= 0) return;
    ctx.beginPath(); ctx.moveTo(path.pts[0].x, path.pts[0].y);
    var acc = 0;
    for(var i = 0; i < path.seg.length; i++){
      var a = path.pts[i], b = path.pts[i+1], d = path.seg[i];
      if(acc + d >= want){ var t = (want - acc)/d; ctx.lineTo(a.x + (b.x - a.x)*t, a.y + (b.y - a.y)*t); break; }
      ctx.lineTo(b.x, b.y); acc += d;
    }
    ctx.strokeStyle = 'rgba(' + TEAL + ',' + (.5*alpha).toFixed(3) + ')'; ctx.lineWidth = 1.1; ctx.stroke();
    acc = 0;
    for(var k = 1; k < path.pts.length - 1; k++){
      acc += path.seg[k-1]; if(acc > want) break;
      ctx.fillStyle = 'rgba(' + STAR + ',' + (.7*alpha).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(path.pts[k].x, path.pts[k].y, 1.8, 0, 6.2832); ctx.fill();
    }
  }

  function draw(now){
    var t = (now - t0)/1000, sy = W.scrollY, P = clamp(sy / docH, 0, 1);
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, cv.width, cv.height);
    /* 1 · the haystack, with slow parallax. The noise layer thins as the page resolves. */
    var noiseA = 1 - smooth(.12, .78, P) * .82, structA = 1 - smooth(.55, 1, P) * .35;
    var Hh = layers[0].height, off = MOTION ? ((sy * .08 * dpr) % Hh) : 0;
    for(var li = 0; li < 2; li++){
      ctx.globalAlpha = li ? noiseA : structA;
      ctx.drawImage(layers[li], 0, -off); if(off > 0) ctx.drawImage(layers[li], 0, Hh - off);
    }
    ctx.globalAlpha = 1; ctx.setTransform(dpr,0,0,dpr,0,0);
    var offC = off / dpr;
    if(MOTION){
      for(var i = 0; i < twinkles.length; i++){
        var s = twinkles[i], aa = Math.max(0, Math.sin(t*s.f + s.p)) * .45 * structA, y = s.y - offC; if(y < 0) y += vh;
        ctx.fillStyle = 'rgba(' + STAR + ',' + aa.toFixed(3) + ')'; ctx.fillRect(s.x - .5, y - .5, s.s/dpr + .6, s.s/dpr + .6);
      }
    }
    /* 2 · the instrument sweep (hero only, while the hero is on screen): a band that briefly lifts the field */
    var sweepX = -1, heroOn = HERO && anchors.length && (anchors[0].bottom - sy > 0 && anchors[0].top - sy < vh);
    if(MOTION && HERO && heroOn){
      var period = 12, ph = (t % period) / period, bw = vw * (mobile ? .32 : .16);
      if(ph < .55){
        var u = ph / .55; sweepX = -bw + (vw + bw*2) * (u*u*(3-2*u)*.25 + u*.75);
        var fade = Math.sin(u*Math.PI) * (1 - smooth(.6, 1, P)*.6);
        var bx = Math.max(0, sweepX - bw), bwid = Math.min(vw, sweepX) - bx;
        if(bwid > 1){
          ctx.setTransform(1,0,0,1,0,0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .85 * fade;
          for(var lj = 0; lj < 2; lj++){ var src = layers[lj];
            ctx.drawImage(src, bx*dpr, 0, bwid*dpr, Hh, bx*dpr, -off, bwid*dpr, Hh);
            if(off > 0) ctx.drawImage(src, bx*dpr, 0, bwid*dpr, Hh, bx*dpr, Hh - off, bwid*dpr, Hh);
          }
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.setTransform(dpr,0,0,dpr,0,0);
          var g = ctx.createLinearGradient(sweepX - bw, 0, sweepX, 0);
          g.addColorStop(0, 'rgba(' + TEAL + ',0)'); g.addColorStop(1, 'rgba(' + TEAL + ',' + (.07*fade).toFixed(3) + ')');
          ctx.fillStyle = g; ctx.fillRect(sweepX - bw, 0, bw, vh);
        }
        if(sweepX > 0 && sweepX < vw){ ctx.fillStyle = 'rgba(' + TEAL + ',' + (.3*fade).toFixed(3) + ')'; ctx.fillRect(sweepX, 0, 1, vh); }
      }
    }
    /* 3 · the signal(s) and the paths that meet there */
    stats.sig = []; stats.paths = [];
    for(var n = 0; n < anchors.length; n++){
      var an = anchors[n], ay = an.A.y - sy, ax = an.A.x;
      if(an.bottom - sy < 0 || an.top - sy > vh) continue;
      var prog, lock;
      if(an.kind === 1){
        if(MOTION){
          if(hitAt < 0 && sweepX >= ax && lastSweepX >= 0 && lastSweepX < ax) hitAt = t;
          if(hitAt < 0 && t > 7) hitAt = t;                /* never wait longer than one sweep */
          var intro = hitAt < 0 ? 0 : smooth(0, 2.6, t - hitAt);
          var scr = smooth(0, 1, (sy - (an.top + 40)) / Math.max(1, vh*.9));  /* paths complete as you scroll the hero */
          lock = hitAt < 0 ? 0 : smooth(0, .9, t - hitAt);
          prog = Math.max(intro * .42, scr);
        } else { lock = 1; prog = 1; }
      } else { lock = 1; prog = 1; }
      ctx.save(); ctx.translate(0, -sy);
      var fadeIn = an.kind === 2 ? 1 : .55 + .45*prog;
      var vis = [];
      for(var pi = 0; pi < an.paths.length; pi++){ var pr = clamp(prog*1.15 - pi*.07, 0, 1); drawPath(an.paths[pi], pr, fadeIn); if(pr > .02) vis.push(an.paths[pi].pts.map(function(pt){ return { x:pt.x, y:pt.y - sy }; })); }
      ctx.restore();
      stats.paths = stats.paths.concat(vis);
      /* the needle: an ordinary faint point until the sweep resolves it */
      var breathe = MOTION ? .5 + .5*Math.sin(t*1.3) : .6, gr = mobile ? 40 : 48;
      var glow = ctx.createRadialGradient(ax, ay, 0, ax, ay, gr);
      glow.addColorStop(0, 'rgba(' + TEAL + ',' + (.24*lock).toFixed(3) + ')'); glow.addColorStop(.6, 'rgba(' + TEAL + ',' + (.06*lock).toFixed(3) + ')'); glow.addColorStop(1, 'rgba(' + TEAL + ',0)');
      ctx.fillStyle = glow; ctx.fillRect(ax - gr, ay - gr, gr*2, gr*2);
      ctx.fillStyle = lock > .05 ? 'rgba(' + TEAL + ',' + (.55 + .45*lock).toFixed(3) + ')' : 'rgba(' + STAR + ',.5)';
      ctx.beginPath(); ctx.arc(ax, ay, 1.4 + 1.6*lock, 0, 6.2832); ctx.fill();
      if(lock > 0){
        ctx.strokeStyle = 'rgba(' + TEAL + ',' + ((.35 + .2*breathe)*lock).toFixed(3) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ax, ay, 8 + 1.4*breathe, 0, 6.2832); ctx.stroke();
        if(MOTION && an.kind === 1 && hitAt >= 0){ var pt = t - hitAt; if(pt < 2.2){ var pr2 = smooth(0, 2.2, pt); ctx.strokeStyle = 'rgba(' + TEAL + ',' + (.5*(1-pr2)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(ax, ay, 9 + 42*pr2, 0, 6.2832); ctx.stroke(); } }
        var tk = mobile ? 11 : 13, tl = 4;
        ctx.strokeStyle = 'rgba(' + TEAL + ',' + (.6*lock).toFixed(3) + ')'; ctx.beginPath();
        ctx.moveTo(ax - tk - tl, ay); ctx.lineTo(ax - tk, ay); ctx.moveTo(ax + tk, ay); ctx.lineTo(ax + tk + tl, ay);
        ctx.moveTo(ax, ay - tk - tl); ctx.lineTo(ax, ay - tk); ctx.moveTo(ax, ay + tk); ctx.lineTo(ax, ay + tk + tl); ctx.stroke();
        stats.sig.push({ l:ax - FR, t:ay - FR, r:ax + FR, b:ay + FR });
      }
    }
    lastSweepX = sweepX;
  }

  /* ── loop: run only when something needs animating, else stop until the next scroll or resize ── */
  var lastY = -1, stillSince = 0;
  function needsAnim(now){
    if(!MOTION) return false;
    var y = W.scrollY; if(y !== lastY){ lastY = y; stillSince = now; return true; }
    var onScreen = anchors.some(function(an){ return an.bottom - y > 0 && an.top - y < vh; });
    if(onScreen) return true;                              /* sweep + breathing signal keep going near a signal */
    return now - stillSince < 500;                        /* otherwise settle, then stop until the next scroll */
  }
  function frame(now){
    raf = 0; if(!running) return;
    if(!needsAnim(now)){ return; }                         /* stopped: a scroll/resize will kick() us again */
    var a = performance.now(); draw(now);
    var d = performance.now() - a; stats.frames++; stats.t.push(d); if(stats.t.length > 900) stats.t.shift();
    raf = requestAnimationFrame(frame);
  }
  function kick(){ if(MOTION){ if(!raf && running){ lastY = -1; raf = requestAnimationFrame(frame); } } else if(running){ draw(performance.now()); stats.frames++; } }
  function setRunning(on){ running = on && !D.hidden; if(running) kick(); else if(raf){ cancelAnimationFrame(raf); raf = 0; } }

  function boot(){
    t0 = performance.now();
    resize();
    ground.classList.add('live');
    var rt; W.addEventListener('resize', function(){ clearTimeout(rt); rt = setTimeout(function(){ resize(); kick(); }, 150); }, { passive:true });
    if('ResizeObserver' in W){ var mt, first = true; new ResizeObserver(function(){ if(first){ first = false; return; } clearTimeout(mt); mt = setTimeout(function(){ measure(); kick(); }, 140); }).observe(D.body); }
    D.addEventListener('visibilitychange', function(){ setRunning(!D.hidden); });
    W.addEventListener('scroll', kick, { passive:true });
    /* re-measure once fonts/late layout settle, so anchors sit in the final free space */
    setTimeout(function(){ measure(); kick(); }, 700);
    setRunning(true);
  }
  function go(){ (D.fonts && D.fonts.ready ? D.fonts.ready : Promise.resolve()).then(function(){ setTimeout(boot, 80); }); }
  if(D.readyState === 'complete') go(); else W.addEventListener('load', go);
})();
