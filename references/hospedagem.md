# Hospedagem do HLS

O player só precisa de uma URL pública pro `index.m3u8` e pros `seg_NNN.ts` na mesma
pasta. Qualquer bucket/CDN que sirva arquivos estáticos com CORS serve.

## O que precisa estar certo (vale pra todos)

| Item | Valor |
|---|---|
| Content-Type do `.m3u8` | `application/vnd.apple.mpegurl` (ou `application/x-mpegURL`) |
| Content-Type do `.ts` | `video/mp2t` |
| CORS | `Access-Control-Allow-Origin: *` (ou o domínio da página) — sem isso o hls.js falha em silêncio no Chrome |
| Cache | `.ts` e `poster.jpg` podem ter cache longo (imutáveis); `.m3u8` cache curto ou nenhum se você troca o vídeo mantendo a URL |
| Estrutura | `pasta/index.m3u8`, `pasta/seg_000.ts`, … `pasta/poster.jpg` — o playlist referencia os segmentos por caminho relativo |

Teste rápido no terminal (deve devolver 200 e o header de CORS):

```bash
curl -sI "https://SEU-CDN/vsl/index.m3u8" | grep -iE "HTTP|content-type|access-control"
```

## Supabase Storage (bucket público)

1. Criar bucket `vsl` público (Storage → New bucket → Public).
2. Upload da pasta pelo painel, ou via REST com a service role key:

```bash
BASE="https://SEU-PROJETO.supabase.co/storage/v1/object/vsl/minha-vsl"
KEY="$SUPABASE_SERVICE_ROLE_KEY"
for f in hls/*; do
  n=$(basename "$f")
  case "$n" in *.m3u8) ct="application/vnd.apple.mpegurl";; *.ts) ct="video/mp2t";; *) ct="image/jpeg";; esac
  curl -s -X POST "$BASE/$n" -H "Authorization: Bearer $KEY" -H "Content-Type: $ct" \
       -H "x-upsert: true" --data-binary @"$f" >/dev/null && echo "ok $n"
done
```

URL final: `https://SEU-PROJETO.supabase.co/storage/v1/object/public/vsl/minha-vsl/index.m3u8`.
CORS já vem `*`. Bom pra quem já usa Supabase no projeto; egress conta no plano.

## Cloudflare R2

Bucket → Settings → Public access (r2.dev ou domínio próprio) → CORS policy:
`[{"AllowedOrigins":["*"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"]}]`.
Upload com `wrangler r2 object put` ou pelo painel. **Egress grátis** — melhor custo
pra VSL com muito tráfego.

## Bunny Storage + CDN

Storage Zone → upload → Pull Zone apontando pro storage. Barato, CDN global, painel
simples. Ative CORS na Pull Zone (Headers → Add CORS headers).

## AWS S3 + CloudFront

S3 com bucket policy de leitura pública (ou OAC via CloudFront) + CORS no bucket. Sem
CloudFront o egress do S3 fica caro rápido.

## Vercel / Netlify / GitHub Pages (pasta `public/`)

Funciona pra vídeo curto (< ~50 MB total). Coloque a pasta em `public/vsl/` e a URL fica
`/vsl/index.m3u8`. Acima disso, o deploy fica lento e alguns hosts limitam tamanho —
prefira um bucket.

## O que NÃO usar

- **YouTube/Vimeo embed**: não dá pra tirar controles, esconder tempo nem bloquear seek.
  É exatamente o que a VSL evita.
- **Google Drive / Dropbox como CDN**: sem CORS confiável, sem Content-Type certo, throttling.
