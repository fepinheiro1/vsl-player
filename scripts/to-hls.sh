#!/usr/bin/env bash
# Converte um vídeo (mp4/mov, qualquer codec) em HLS pronto pra VSL:
#   index.m3u8 + seg_NNN.ts (6s cada) + poster.jpg
#
# Uso:  scripts/to-hls.sh entrada.mp4 [pasta-de-saida] [crf]
#   crf: qualidade (18 = maior, 28 = menor). Default 21.
#
# Requer ffmpeg:  brew install ffmpeg  |  apt install ffmpeg  |  winget install ffmpeg
set -euo pipefail

IN="${1:?uso: to-hls.sh entrada.mp4 [saida] [crf]}"
OUT="${2:-hls}"
CRF="${3:-21}"

command -v ffmpeg >/dev/null || { echo "ffmpeg não encontrado"; exit 1; }
mkdir -p "$OUT"

# H.264 High + AAC: toca em tudo (iOS, Android, Safari, Chrome). HEVC/H.265 do
# iPhone NÃO toca no Chrome — por isso sempre reencoda.
# -g 60 -sc_threshold 0: keyframe fixo a cada 2s (30fps) pra segmentar limpo.
# independent_segments: cada .ts começa em keyframe → seek/recover sem artefato.
ffmpeg -y -i "$IN" \
  -c:v libx264 -profile:v high -preset medium -crf "$CRF" -maxrate 4000k -bufsize 8000k \
  -g 60 -keyint_min 60 -sc_threshold 0 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "$OUT/seg_%03d.ts" \
  "$OUT/index.m3u8"

# poster = frame do segundo 1 (o frame 0 costuma ser preto/transição)
ffmpeg -y -ss 1 -i "$IN" -frames:v 1 -q:v 3 -vf "scale='min(1080,iw)':-2" "$OUT/poster.jpg"

echo
echo "Pronto em $OUT/:"
ls -la "$OUT" | tail -n +2 | awk '{print "  " $5 "\t" $9}'
echo
echo "Suba a pasta inteira pro seu bucket/CDN (ver references/hospedagem.md)."
