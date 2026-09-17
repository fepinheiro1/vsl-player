/* ══════════════════════════════════════════════════════════════════════
   vsl-player.js — player de VSL estilo VTurb, sem framework, sem mensalidade.

   Uso mínimo:
     <script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
     <script src="vsl-player.js"></script>
     <div id="vsl"></div>
     <script>
       VslPlayer.create(document.getElementById('vsl'), {
         src: 'https://SEU-CDN/vsl/index.m3u8',
         poster: 'https://SEU-CDN/vsl/poster.jpg',
         revealSecondsFromEnd: 10,
         onReveal: () => document.getElementById('cta').hidden = false,
       });
     </script>

   Mecânicas (as mesmas do VslPlayer.tsx):
   - HLS via hls.js (MSE): sem .mp4 único pra baixar
   - autoplay mudo + botão grande de som; ativar o som REINICIA o vídeo
   - sem controles nativos, sem botão direito, sem PiP, sem download
   - pode pausar, não pode avançar (anti-seek)
   - barra larga com progresso "fake", sem tempo na tela
   - onStart / onProgress(25|50|75|95) / onReveal / onEnded
     (progresso e reveal só contam com som ativo)
   ══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var DEFAULT_BAR_STOPS = [
    { t: 0.0, b: 0.0 },
    { t: 0.2, b: 0.5 },
    { t: 0.55, b: 0.75 },
    { t: 1.0, b: 1.0 },
  ];
  var MILESTONES = [25, 50, 75, 95];

  var CSS =
    '.vslp{position:relative;width:100%;background:#000;border-radius:20px;overflow:hidden;user-select:none;-webkit-user-select:none}' +
    '.vslp video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}' +
    '.vslp__stage{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;cursor:pointer;padding:0;margin:0}' +
    '.vslp__center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}' +
    '.vslp__sound{display:flex;align-items:center;justify-content:center;width:116px;height:116px;border-radius:50%;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:vslp-pulse 2.2s ease-in-out infinite}' +
    '.vslp__play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;width:70px;height:70px;border-radius:50%;background:rgba(0,0,0,.55);backdrop-filter:blur(2px)}' +
    '.vslp__loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.25);animation:vslp-spin .8s linear infinite}' +
    '.vslp__bar{position:absolute;left:0;right:0;bottom:0;height:8px;background:rgba(255,255,255,.16);pointer-events:none}' +
    '.vslp__fill{height:100%;width:0;transition:width .25s linear}' +
    '.vslp__mark{position:absolute;top:12px;right:14px;height:20px;width:auto;opacity:.55;object-fit:contain;pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))}' +
    '.vslp [hidden]{display:none!important}' +
    '@keyframes vslp-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}' +
    '@keyframes vslp-pulse{0%,100%{box-shadow:0 8px 32px rgba(0,0,0,.25),0 0 0 0 rgba(255,255,255,.18)}50%{box-shadow:0 8px 32px rgba(0,0,0,.25),0 0 0 16px rgba(255,255,255,0)}}';

  var SVG_MUTE =
    '<svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
  var SVG_PLAY =
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>';

  function injectCss() {
    if (document.getElementById('vslp-css')) return;
    var s = document.createElement('style');
    s.id = 'vslp-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function fakeBarFill(r, stops) {
    r = Math.min(1, Math.max(0, r));
    for (var i = 1; i < stops.length; i++) {
      var prev = stops[i - 1], cur = stops[i];
      if (r <= cur.t) {
        var span = cur.t - prev.t || 1;
        return prev.b + ((r - prev.t) / span) * (cur.b - prev.b);
      }
    }
    return 1;
  }

  function create(container, opts) {
    opts = opts || {};
    if (!opts.src) throw new Error('VslPlayer: opts.src é obrigatório (.m3u8 ou .mp4)');
    injectCss();

    var aspect = opts.aspectRatio || '9 / 16';
    var accent = opts.accentColor || '#22D3EE';
    var accentFrom = opts.accentFromColor || '#0EA5E9';
    var glow = opts.glowColor || '#000000';
    var revealFromEnd = opts.revealSecondsFromEnd != null ? opts.revealSecondsFromEnd : 10;
    var revealAt = opts.revealAtSecond;
    var restart = opts.restartOnUnmute !== false;
    var stops = opts.barStops || DEFAULT_BAR_STOPS;

    // ── DOM ──
    var root = document.createElement('div');
    root.className = 'vslp';
    root.style.aspectRatio = aspect;
    root.style.boxShadow = '0 24px 80px -24px ' + glow + 'cc, 0 0 0 1px rgba(255,255,255,.06)';
    root.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    var video = document.createElement('video');
    if (opts.poster) video.poster = opts.poster;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;
    video.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
    video.draggable = false;

    var stage = document.createElement('button');
    stage.type = 'button';
    stage.className = 'vslp__stage';
    stage.setAttribute('aria-label', 'Ativar som');

    var center = document.createElement('span');
    center.className = 'vslp__center';
    var sound = document.createElement('span');
    sound.className = 'vslp__sound';
    sound.innerHTML = SVG_MUTE;
    center.appendChild(sound);

    var play = document.createElement('span');
    play.className = 'vslp__play';
    play.style.boxShadow = '0 0 24px ' + accent + '55';
    play.innerHTML = SVG_PLAY;
    play.hidden = true;

    var loader = document.createElement('span');
    loader.className = 'vslp__loader';
    loader.style.borderTopColor = accent;

    stage.appendChild(center);
    stage.appendChild(play);
    stage.appendChild(loader);

    var bar = document.createElement('div');
    bar.className = 'vslp__bar';
    var fill = document.createElement('div');
    fill.className = 'vslp__fill';
    fill.style.background = 'linear-gradient(90deg,' + accentFrom + ',' + accent + ')';
    fill.style.boxShadow = '0 0 12px ' + accent + 'aa';
    bar.appendChild(fill);

    root.appendChild(video);
    root.appendChild(stage);
    root.appendChild(bar);

    if (opts.watermarkSrc) {
      var mark = document.createElement('img');
      mark.className = 'vslp__mark';
      mark.src = opts.watermarkSrc;
      mark.alt = '';
      mark.draggable = false;
      root.appendChild(mark);
    }

    container.innerHTML = '';
    container.appendChild(root);

    // ── estado ──
    var maxWatched = 0, soundOn = false, started = false, revealed = false, ready = false;
    var fired = {};
    var hls = null;

    function setPausedUi(p) {
      play.hidden = !(soundOn && p && ready);
      stage.setAttribute('aria-label', !soundOn ? 'Ativar som' : p ? 'Reproduzir' : 'Pausar');
    }

    // ── mídia ──
    video.addEventListener('canplay', function () { ready = true; loader.hidden = true; setPausedUi(video.paused); });

    var isHls = /\.m3u8(\?|$)/i.test(opts.src);
    var Hls = global.Hls;
    if (isHls && Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      var recoveries = 0;
      hls.on(Hls.Events.ERROR, function (_e, data) {
        if (!data.fatal || recoveries >= 5) return;
        recoveries++;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      });
      hls.loadSource(opts.src);
      hls.attachMedia(video);
    } else {
      // Safari/iOS: HLS nativo. .mp4 direto também cai aqui.
      if (isHls && !Hls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        console.warn('VslPlayer: inclua hls.js antes deste script para tocar .m3u8 neste navegador.');
      }
      video.src = opts.src;
    }

    video.muted = true;
    video.play().then(function () { setPausedUi(false); }).catch(function () { setPausedUi(true); });

    // ── progresso / reveal ──
    video.addEventListener('timeupdate', function () {
      var d = video.duration;
      if (!d || isNaN(d)) return;
      var t = video.currentTime;
      if (t > maxWatched) maxWatched = t;
      fill.style.width = fakeBarFill(t / d, stops) * 100 + '%';

      if (soundOn) {
        var pct = (t / d) * 100;
        for (var i = 0; i < MILESTONES.length; i++) {
          var m = MILESTONES[i];
          if (pct >= m && !fired[m]) { fired[m] = true; if (opts.onProgress) opts.onProgress(m); }
        }
        var should = revealAt != null ? t >= revealAt : d - t <= revealFromEnd;
        if (!revealed && should) { revealed = true; if (opts.onReveal) opts.onReveal(); }
      }
    });

    // anti-seek
    video.addEventListener('seeking', function () {
      if (video.currentTime > maxWatched + 0.4) video.currentTime = maxWatched;
    });

    video.addEventListener('ended', function () { setPausedUi(true); if (opts.onEnded) opts.onEnded(); });

    // ── interações ──
    function enableSound() {
      video.muted = false;
      video.volume = 1;
      if (restart) { maxWatched = 0; fired = {}; video.currentTime = 0; fill.style.width = '0%'; }
      soundOn = true;
      center.hidden = true;
      if (!started) { started = true; if (opts.onStart) opts.onStart(); }
      video.play().then(function () { setPausedUi(false); }).catch(function () {});
    }
    function togglePlay() {
      if (video.paused) video.play().then(function () { setPausedUi(false); }).catch(function () {});
      else { video.pause(); setPausedUi(true); }
    }
    stage.addEventListener('click', function () { if (!soundOn) enableSound(); else togglePlay(); });

    return {
      video: video,
      destroy: function () { if (hls) hls.destroy(); container.innerHTML = ''; },
    };
  }

  global.VslPlayer = { create: create };
})(window);
