import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

/* ══════════════════════════════════════════════════════════════════════
   VslPlayer — player de VSL profissional.

   O que ele faz (e por quê):
   - HLS via hls.js: o vídeo chega em pedaços pelo MSE, sem um .mp4 único
     pra baixar com "salvar como".
   - Autoplay mudo + botão grande de som. Ao ativar o som o vídeo VOLTA
     PRO INÍCIO: quem chega não perde a abertura, e o "watch real" começa
     ali (é aí que disparam onStart e os marcos de progresso).
   - Sem controles nativos, sem botão direito, sem PiP, sem download.
   - Pode PAUSAR, não pode AVANÇAR (anti-seek): o argumento do vídeo é
     construído em ordem; pular pro final quebra a lógica da oferta.
   - Sem tempo na tela. Só uma barra larga com velocidade "fake": anda
     rápido no começo (sensação de "já estou na metade") e arrasta no fim.
   - onReveal nos últimos N segundos: é o gatilho pra mostrar o CTA no
     momento em que a oferta é feita no vídeo — e só se o som foi ativado
     (o autoplay mudo chegando ao fim NÃO abre o CTA).

   Dependência: hls.js  →  npm i hls.js
   ══════════════════════════════════════════════════════════════════════ */

/* ── mapeamento "fake" do tempo real (0–1) → preenchimento da barra (0–1)
   Padrão: chega a 50% da barra em 20% do vídeo, a 75% em 55%, e arrasta
   os últimos 25% da barra ao longo dos 45% finais. Ajuste via prop barStops. */
export type BarStop = { t: number; b: number };
const DEFAULT_BAR_STOPS: BarStop[] = [
  { t: 0.0, b: 0.0 },
  { t: 0.2, b: 0.5 },
  { t: 0.55, b: 0.75 },
  { t: 1.0, b: 1.0 },
];

function fakeBarFill(realFraction: number, stops: BarStop[]): number {
  const r = Math.min(1, Math.max(0, realFraction));
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const cur = stops[i];
    if (r <= cur.t) {
      const span = cur.t - prev.t || 1;
      const k = (r - prev.t) / span;
      return prev.b + k * (cur.b - prev.b);
    }
  }
  return 1;
}

/** Marcos reportados uma vez cada, só com som ativo (watch real, não o preview mudo). */
const PROGRESS_MILESTONES = [25, 50, 75, 95] as const;
export type ProgressMilestone = (typeof PROGRESS_MILESTONES)[number];

export interface VslPlayerProps {
  /** URL do playlist .m3u8 (ou .mp4 direto — funciona, mas fica fácil de baixar) */
  src: string;
  /** imagem de capa (primeiro frame) */
  poster?: string;
  /** proporção do player. '9 / 16' (vertical) ou '16 / 9' (horizontal). Default 9/16 */
  aspectRatio?: string;
  /** quantos segundos antes do fim revela o CTA (default 10) */
  revealSecondsFromEnd?: number;
  /** alternativa: revelar o CTA num segundo específico (ex.: 180). Tem prioridade sobre revealSecondsFromEnd */
  revealAtSecond?: number;
  /** ao ativar o som, volta pro início. Default true */
  restartOnUnmute?: boolean;
  /** curva da barra fake. Default DEFAULT_BAR_STOPS */
  barStops?: BarStop[];
  /** chamado uma vez quando o usuário ativa o som e o watch "de verdade" começa */
  onStart?: () => void;
  /** chamado a cada marco (25/50/75/95%), uma vez cada, só após o som ser ativado */
  onProgress?: (percent: ProgressMilestone) => void;
  /** chamado uma vez quando o CTA deve aparecer */
  onReveal?: () => void;
  /** chamado quando o vídeo termina */
  onEnded?: () => void;
  /** cor do brilho ao redor do player */
  glowColor?: string;
  /** cor da barra de progresso, spinner e halo do botão */
  accentColor?: string;
  /** início do gradiente da barra */
  accentFromColor?: string;
  /** logo pequeno no canto superior direito (marca d'água). Opcional */
  watermarkSrc?: string;
  className?: string;
}

export function VslPlayer({
  src,
  poster,
  aspectRatio = '9 / 16',
  revealSecondsFromEnd = 10,
  revealAtSecond,
  restartOnUnmute = true,
  barStops = DEFAULT_BAR_STOPS,
  onStart,
  onProgress,
  onReveal,
  onEnded,
  glowColor = '#000000',
  accentColor = '#22D3EE',
  accentFromColor = '#0EA5E9',
  watermarkSrc,
  className,
}: VslPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxWatchedRef = useRef(0);
  const revealedRef = useRef(false);
  const startedRef = useRef(false);
  const progressFiredRef = useRef<Set<ProgressMilestone>>(new Set());
  const soundOnRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [paused, setPaused] = useState(true);
  const [barFill, setBarFill] = useState(0);

  /* ── carrega a mídia ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    const onCanPlay = () => setReady(true);
    video.addEventListener('canplay', onCanPlay);

    const isHls = /\.m3u8(\?|$)/i.test(src);

    if (isHls && Hls.isSupported()) {
      // Chrome/Firefox/Edge: mídia via MSE (blob) — sem arquivo único pra baixar
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      // sem isto, uma oscilação de rede deixa o player preto pra sempre
      let recoveries = 0;
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal || !hls || recoveries >= 5) return;
        recoveries += 1;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      // Safari/iOS tocam HLS nativo; .mp4 direto cai aqui também
      video.src = src;
    }

    // autoplay mudo: aumenta a taxa de quem começa a assistir; som entra no 1º toque
    video.muted = true;
    video.play().then(() => setPaused(false)).catch(() => setPaused(true));

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      if (hls) hls.destroy();
    };
  }, [src]);

  /* ── progresso + reveal do CTA ── */
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration || Number.isNaN(video.duration)) return;

    if (video.currentTime > maxWatchedRef.current) {
      maxWatchedRef.current = video.currentTime;
    }

    setBarFill(fakeBarFill(video.currentTime / video.duration, barStops));

    if (soundOnRef.current) {
      const pct = (video.currentTime / video.duration) * 100;
      for (const milestone of PROGRESS_MILESTONES) {
        if (pct >= milestone && !progressFiredRef.current.has(milestone)) {
          progressFiredRef.current.add(milestone);
          onProgress?.(milestone);
        }
      }
    }

    const shouldReveal =
      revealAtSecond != null
        ? video.currentTime >= revealAtSecond
        : video.duration - video.currentTime <= revealSecondsFromEnd;

    if (soundOnRef.current && !revealedRef.current && shouldReveal) {
      revealedRef.current = true;
      onReveal?.();
    }
  }, [barStops, onProgress, onReveal, revealAtSecond, revealSecondsFromEnd]);

  // anti-seek: não deixa ir além do que já foi assistido
  const handleSeeking = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime > maxWatchedRef.current + 0.4) {
      video.currentTime = maxWatchedRef.current;
    }
  }, []);

  /* ── interações ── */
  const enableSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    if (restartOnUnmute) {
      maxWatchedRef.current = 0;
      progressFiredRef.current.clear();
      video.currentTime = 0;
      setBarFill(0);
    }
    soundOnRef.current = true;
    setSoundOn(true);
    if (!startedRef.current) {
      startedRef.current = true;
      onStart?.();
    }
    video.play().then(() => setPaused(false)).catch(() => {});
  }, [onStart, restartOnUnmute]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setPaused(false)).catch(() => {});
    } else {
      video.pause();
      setPaused(true);
    }
  }, []);

  // 1º toque ativa o som; depois alterna play/pause
  const handleStageClick = useCallback(() => {
    if (!soundOn) {
      enableSound();
      return;
    }
    togglePlay();
  }, [soundOn, enableSound, togglePlay]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio,
        background: '#000',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: `0 24px 80px -24px ${glowColor}cc, 0 0 0 1px rgba(255,255,255,0.06)`,
        userSelect: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noplaybackrate noremoteplayback"
        draggable={false}
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onEnded={() => {
          setPaused(true);
          onEnded?.();
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          pointerEvents: 'none', // cliques vão pro overlay, não pro <video>
        }}
      />

      {/* camada de clique (ativar som / play-pause) */}
      <button
        type="button"
        onClick={handleStageClick}
        aria-label={!soundOn ? 'Ativar som' : paused ? 'Reproduzir' : 'Pausar'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {/* estado inicial: só o botão de som, grande e translúcido, pulsando */}
        {!soundOn && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 116,
                height: 116,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.16)',
                border: '1px solid rgba(255,255,255,0.35)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                animation: 'vsl-sound-pulse 2.2s ease-in-out infinite',
              }}
            >
              {/* ícone "volume mudo" */}
              <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <line x1="22" x2="16" y1="9" y2="15" />
                <line x1="16" x2="22" y1="9" y2="15" />
              </svg>
            </span>
          </span>
        )}

        {/* ícone de play quando pausado (com som já ativo) */}
        {soundOn && paused && ready && (
          <span
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 70,
              height: 70,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(2px)',
              boxShadow: `0 0 24px ${accentColor}55`,
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          </span>
        )}

        {/* loader enquanto não está pronto */}
        {!ready && (
          <span
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.25)',
              borderTopColor: accentColor,
              animation: 'vsl-spin 0.8s linear infinite',
            }}
          />
        )}
      </button>

      {/* barra de progresso "fake" — larga, não interativa, sem tempo */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 8,
          background: 'rgba(255,255,255,0.16)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${barFill * 100}%`,
            background: `linear-gradient(90deg, ${accentFromColor}, ${accentColor})`,
            boxShadow: `0 0 12px ${accentColor}aa`,
            transition: 'width 0.25s linear',
          }}
        />
      </div>

      {watermarkSrc && (
        <img
          src={watermarkSrc}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            height: 20,
            width: 'auto',
            opacity: 0.55,
            objectFit: 'contain',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.45))',
          }}
        />
      )}

      <style>{`
        @keyframes vsl-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}
        @keyframes vsl-sound-pulse{
          0%,100%{ box-shadow:0 8px 32px rgba(0,0,0,0.25), 0 0 0 0 rgba(255,255,255,0.18); }
          50%{ box-shadow:0 8px 32px rgba(0,0,0,0.25), 0 0 0 16px rgba(255,255,255,0); }
        }
      `}</style>
    </div>
  );
}

export default VslPlayer;
