---
name: vsl-player
description: Monta um player de VSL (Video Sales Letter) estilo VTurb no projeto do usuário, sem pagar ferramenta — vídeo em HLS, autoplay mudo com botão de som que reinicia o vídeo, sem controles nem download, não deixa avançar, barra de progresso sem tempo, CTA que só aparece no momento da oferta e eventos de retenção (25/50/75/95%). Use sempre que o usuário falar em VSL, vídeo de vendas, página de vendas com vídeo, VTurb/Vturb, player de lançamento, "esconder os controles do vídeo", "não deixar pular o vídeo", "mostrar o botão só depois de X minutos", CTA atrasado, funil com vídeo ou landing de tráfego pago com vídeo — mesmo que não use a palavra "VSL". Também para converter um vídeo em HLS ou decidir onde hospedar o vídeo de uma página de vendas.
---

# vsl-player

Uma VSL é uma página com um vídeo que vende e um botão que aparece na hora certa. As
ferramentas pagas (VTurb, Vturb, Panda, Converte.ai) vendem basicamente sete mecânicas
de player. Esta skill entrega as sete em código que roda no projeto do usuário, com os
arquivos prontos em `assets/`.

## As sete mecânicas (e por que cada uma existe)

| # | Mecânica | Por quê |
|---|---|---|
| 1 | **Autoplay mudo + botão grande de som** | Navegador não deixa tocar com som sem clique. O vídeo já rodando "puxa" o toque; o botão pulsando é o único elemento na tela. |
| 2 | **Ativar o som reinicia o vídeo** | Quem clica no segundo 8 não perdeu a abertura. O "assistiu de verdade" começa aqui — é o `onStart`. |
| 3 | **Sem controles, sem tempo** | Ver "12:47" no canto faz a pessoa decidir se vale a pena *antes* de ouvir. Sem tempo, a decisão é pelo conteúdo. |
| 4 | **Barra de progresso "fake"** | Uma barra larga que anda rápido no começo (chega à metade em 20% do vídeo) e arrasta no final. Dá sensação de "já estou quase lá". |
| 5 | **Pode pausar, não pode avançar** | O argumento é construído em ordem. Pular pro final mostra o preço sem a lógica. Voltar é permitido. |
| 6 | **HLS, sem botão direito, sem PiP, sem download** | O vídeo chega em pedaços de 6s pelo MSE; não há um `.mp4` pra "salvar como". Dificulta, não impede — quem quer muito, grava a tela. |
| 7 | **CTA revelado no momento da oferta** | O botão não existe até o vídeo chegar no ponto em que a oferta é feita, e só se o som foi ativado. Quem vê o botão já ouviu o porquê. |

Mais os **marcos de retenção** (25/50/75/95%) — é o que responde "onde as pessoas param".

## Fluxo de trabalho

Siga na ordem. Cada passo tem um arquivo de referência — leia só o do passo em que está.

### 1. Entender o que o usuário tem

Pergunte só o que não dá pra descobrir no projeto:

- **O vídeo**: já existe? Formato e duração? Vertical (9:16, gravado no celular) ou
  horizontal (16:9)? Em que segundo a oferta é feita (ou é no fim)?
- **O que acontece no clique do CTA**: link pra checkout/agenda, captura de WhatsApp/e-mail
  inline, ou revelar uma landing abaixo?
- **Onde hospedar o vídeo**: o projeto já usa algum bucket/CDN (Supabase, R2, S3, Bunny)?

Descubra sozinho lendo o projeto: a stack (tabela abaixo), se já tem GA4/GTM/Pixel, se há
header/footer/WhatsApp global que precisa sumir na rota da VSL.

### 2. Escolher a versão do player pela stack

| Stack do projeto | Use | Como |
|---|---|---|
| React, Next.js, Remix, Vite+React, Gatsby | `assets/react/VslPlayer.tsx` | Copie pra `components/`, `npm i hls.js`. Em Next.js App Router, o arquivo precisa de `'use client'` na 1ª linha. |
| Vue, Svelte, Astro, Angular, SolidJS | `assets/vanilla/vsl-player.js` | Copie pra `public/`, chame `VslPlayer.create(el, opts)` no `onMounted`/`onMount`/equivalente. Inclua hls.js antes. |
| HTML puro, WordPress, Elementor, Webflow, Framer, Wix (embed) | `assets/vanilla/vsl-player.js` + `assets/vanilla/exemplo.html` | O `exemplo.html` é uma página de VSL completa; adapte. Em construtores, cole num bloco HTML/embed. |
| Flutter / React Native | não coberto | As mecânicas são as mesmas; reimplemente sobre o player nativo (`video_player`, `react-native-video`) usando o `.tsx` como spec. |

Não reescreva o player do zero — copie o arquivo. Ele já trata os detalhes que custam
horas: recuperação de erro de rede do hls.js, Safari tocando HLS nativo, `pointer-events`
no `<video>` pra não abrir controles no toque longo do iOS, progresso só com som ativo.

Adapte só: cores (`accentColor`, `accentFromColor`, `glowColor` = cores da marca),
`aspectRatio`, `watermarkSrc` (logo do usuário, opcional) e o momento do reveal.

### 3. Converter o vídeo pra HLS

```bash
scripts/to-hls.sh video-original.mp4 hls
```

Gera `hls/index.m3u8`, `hls/seg_NNN.ts` e `hls/poster.jpg`.

Se o HLS vai ficar dentro do repo (`public/`), lembre que **`seg_NNN.ts` tem a mesma
extensão do TypeScript**: um `tsconfig` com `include: ["**/*.ts"]` tenta compilar os
segmentos e derruba o build. Adicione `public` ao `exclude` do tsconfig (ou hospede num
bucket, onde isso não existe). Reencoda em H.264 mesmo se
o original já for MP4 — vídeo de iPhone vem em HEVC e não toca no Chrome. Se o usuário
não tem ffmpeg, o script diz como instalar. Se não tem o vídeo ainda, monte tudo com um
`.mp4` qualquer de placeholder e deixe a conversão pro final.

Sem tempo pra HLS? O player aceita `src` de um `.mp4` direto e tudo funciona — só fica
fácil de baixar. Diga isso ao usuário e siga.

Confira a duração do arquivo (`ffprobe -show_entries format=duration -v quiet -of csv=p=0
video.mp4`) contra o momento do reveal. Se o usuário pediu "botão aos 3 minutos" e o vídeo
tem 20 segundos, ele te mandou um placeholder ou o vídeo errado — configure a regra como
pedida, avise a diferença nas notas finais e deixe o comando de reconversão pronto pro
vídeo definitivo. Nunca "corrija" o reveal pra caber no placeholder.

### 4. Hospedar

Leia `references/hospedagem.md`. Resumo: qualquer bucket público com CORS `*` e
Content-Type certo (`application/vnd.apple.mpegurl` no `.m3u8`, `video/mp2t` no `.ts`).
Prefira o que o projeto já usa; se não usa nada, R2 (egress grátis) ou Supabase Storage.
YouTube/Vimeo não servem — não deixam tirar controles nem bloquear seek.

Depois do upload, teste com `curl -sI` antes de seguir. Falta de CORS é a causa nº 1 de
"player preto sem erro".

### 5. Montar a página e o CTA

Leia `references/pagina-e-cta.md`. Os pontos que mais importam:

- Uma VSL converte melhor como página de **uma coisa só**: sem header, menu, rodapé,
  WhatsApp flutuante. Se o usuário pediu uma página nova, nasça assim e esconda os globais
  nessa rota. Se ele pediu só pra trocar o player numa página que já existe, troque o
  player — não refaça a página dele sem pedir — e ofereça a versão enxuta como próximo
  passo nas notas.
- Vídeo vertical: largura `min(440px, 100%, calc((100dvh - 120px) * 0.5625))`.
- CTA **renderizado condicionalmente** (não `display:none`) e revelado pelo `onReveal`,
  com animação curta e `scrollIntoView({ block: 'nearest' })`.
- `?preview=1` na URL mostra o CTA de cara — quem revisa não assiste tudo de novo.
- `noindex` se a página é só destino de anúncio.

### 6. Ligar o tracking

Leia `references/tracking.md`. Um evento por callback (`vsl_video_start`,
`vsl_progress_25`…`95`, `vsl_cta_reveal`, `vsl_cta_click`, `vsl_video_ended`), enviado
pro que o projeto já tem (dataLayer, gtag, fbq). Retenção = `progress_N / video_start`.

### 7. Verificar

Antes de dizer que está pronto, confira no navegador:

- [ ] Abre já rodando, mudo, com o botão de som pulsando no centro
- [ ] Clicar no botão: volta pro início com som; botão some
- [ ] Clicar no vídeo pausa; clicar de novo continua (ícone de play aparece pausado)
- [ ] Botão direito não abre menu; não há controles nativos
- [ ] Não dá pra avançar (se houver como tentar, ex.: teclado)
- [ ] Barra anda sem mostrar tempo
- [ ] CTA aparece no momento certo — teste com `revealAtSecond={5}` temporariamente
- [ ] O CTA **não** aparece se o vídeo mudo chega ao fim sem ativar o som
- [ ] Mobile: vídeo cabe na tela sem scroll; nada sob o notch
- [ ] Eventos chegam (console do GTM / DebugView do GA4)

## Ética

As mecânicas acima são de **retenção**: mantêm a pessoa ouvindo o argumento inteiro. Não
são de engano. Diferencie:

- Barra fake e sem tempo: ok — ninguém é enganado sobre o produto.
- Anti-seek: ok — a pessoa pode fechar a aba a qualquer momento.
- Countdown falso que reinicia, "só 3 vagas" fabricado, "oferta acaba hoje" todo dia:
  **não faça**. Se o usuário pedir, explique que isso derruba a reputação e sugira o
  equivalente honesto (prazo real, lote real, bônus real).

## Arquivos desta skill

```
SKILL.md                      ← você está aqui
assets/react/VslPlayer.tsx    ← player React (hls.js)
assets/vanilla/vsl-player.js  ← player sem framework
assets/vanilla/exemplo.html   ← página de VSL completa em HTML puro
scripts/to-hls.sh             ← vídeo → HLS + poster (ffmpeg)
references/hospedagem.md      ← buckets/CDN, CORS, Content-Type, upload
references/pagina-e-cta.md    ← layout, reveal, preview, o que fazer no clique
references/tracking.md        ← eventos, funil de retenção, GA4/Pixel
```

---
vsl-player · por **Performa.AI** — performance digital para e-commerce. MIT.
