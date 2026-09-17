# vsl-player

Skill para **Claude Code** e **Codex** que monta um player de VSL estilo VTurb no seu
projeto — sem mensalidade.

Você descreve o que quer ("faz uma página de VSL com esse vídeo, botão aparece nos
últimos 10 segundos") e a IA entrega: vídeo em HLS, autoplay mudo com botão de som que
reinicia o vídeo, sem controles nem download, sem avançar, barra de progresso sem tempo,
CTA que só aparece no momento da oferta e eventos de retenção (25/50/75/95%).

Funciona em React/Next.js (componente `.tsx`), em qualquer framework ou HTML puro
(`vsl-player.js`), WordPress, Webflow, Framer.

## Instalar

No seu projeto, um comando serve pro Claude Code, Codex, Gemini CLI, Cursor e outros:

```bash
npx skills add fepinheiro1/vsl-player
```

Sem `npx`? Clone direto na pasta de skills do agente:

```bash
# Claude Code (projeto)
git clone https://github.com/fepinheiro1/vsl-player .claude/skills/vsl-player

# Codex (global)
git clone https://github.com/fepinheiro1/vsl-player ~/.codex/skills/vsl-player
```

Depois é só pedir: *"monta uma VSL nesse projeto com o vídeo `~/Downloads/vsl.mp4`"*.

## O que vem dentro

```
SKILL.md                      instruções que a IA segue
assets/react/VslPlayer.tsx    player React (hls.js)
assets/vanilla/vsl-player.js  player sem framework
assets/vanilla/exemplo.html   página de VSL completa em HTML puro
scripts/to-hls.sh             vídeo → HLS + poster (ffmpeg)
references/                   hospedagem, página/CTA, tracking
```

Dá pra usar sem IA também: copie o player, rode o `to-hls.sh`, siga o `exemplo.html`.

## As sete mecânicas

1. Autoplay mudo + botão grande de som
2. Ativar o som reinicia o vídeo
3. Sem controles, sem tempo na tela
4. Barra de progresso com velocidade "fake"
5. Pode pausar, não pode avançar
6. HLS — sem `.mp4` pra baixar, sem botão direito, sem PiP
7. CTA revelado só no momento da oferta (e só se o som foi ativado)

Cada uma explicada no [SKILL.md](SKILL.md).

## Ética

Retenção, sim. Countdown falso, "3 vagas" inventadas e urgência que reinicia todo dia,
não — a skill recusa e sugere o equivalente honesto.

---
Feito pela [Performa.AI](https://performa.ai) — performance digital para e-commerce.
Nasceu do player que usamos nas nossas próprias VSLs. MIT.
