# Página da VSL e o CTA

## A página

Uma VSL é uma página de **uma coisa só**. Tudo que não é o vídeo ou o CTA compete com a
oferta.

- Sem header, menu, rodapé, WhatsApp flutuante, popup, cookie banner grande. Se o site
  tem esses elementos globais, esconda-os nesta rota.
- Isso vale pra página **nova**. Quando o pedido é trocar o player numa página existente,
  respeite o que está lá e sugira o enxugamento como próximo passo — a pessoa pode ter
  motivo pra manter depoimentos ou rodapé (política de privacidade exigida pelo anúncio,
  por exemplo).
- Fundo escuro (o vídeo fica mais presente) com um leve gradiente/glow atrás do player.
- **Mobile-first.** A maioria do tráfego pago chega pelo celular.
- Vídeo vertical (9:16): largura `min(440px, 100%, calc((100dvh - 120px) * 0.5625))` —
  cabe na altura da tela sem scroll, capado a 440px no desktop.
- Vídeo horizontal (16:9): largura `min(960px, 100%)`, centralizado.
- Respiro lateral de ~22px: sem isso o glow do player é cortado na borda em telas com
  `overflow-x: hidden`.
- `viewport-fit=cover` + `env(safe-area-inset-*)` no padding pra não ficar sob o notch.
- `noindex` se a página é só destino de anúncio.

## O CTA

O CTA **não existe** até o vídeo chegar no momento da oferta. Isso é a mecânica central:
quem vê o botão já ouviu o argumento.

- Renderize condicionalmente (`{ctaVisible && ...}`), não `display:none` — botão no DOM
  antes da hora aparece em leitor de tela e em inspetor.
- Ao revelar: animação curta de entrada (opacity + translateY 14px, 0.5s) e um pulso
  suave no box-shadow. Depois, `scrollIntoView({ block: 'nearest' })` com 150ms de
  atraso — rola só se o botão ficou abaixo da dobra, e o vídeo continua visível.
- Um botão, uma ação. Texto curto, em 1ª pessoa do visitante quando fizer sentido
  ("Quero começar", "Recuperar minhas vendas").
- Largura = largura do player, 12px abaixo dele.

### Quando revelar

| Cenário | Prop |
|---|---|
| Oferta no fim do vídeo (mais comum) | `revealSecondsFromEnd={10}` — 10s antes do fim |
| Oferta no meio de um vídeo longo | `revealAtSecond={540}` — no segundo em que a oferta é falada |
| Vídeo curto (< 60s) | `revealSecondsFromEnd={5}` |

Ache o segundo exato assistindo ao vídeo: o botão aparece **quando a pessoa fala "clica
no botão abaixo"**, não antes.

### O que acontece no clique

Três padrões comuns — escolha pelo que o projeto já tem:

1. **Link direto** (checkout, agenda, WhatsApp): `<a href>` estilizado como botão.
2. **Captura inline**: o botão vira um campo (WhatsApp/e-mail) + enviar. Salva o lead e
   redireciona. Menos atrito que abrir outra página.
3. **Revelar landing abaixo**: o clique abre a página de vendas completa embaixo do vídeo
   e rola até ela. Bom quando a oferta precisa de mais explicação.

## Modo preview

Adicione `?preview=1` na URL pra mostrar o CTA de cara. Quem revisa a página não precisa
assistir o vídeo inteiro toda vez.

```ts
const isPreview = new URLSearchParams(location.search).get('preview') === '1';
const [ctaVisible, setCtaVisible] = useState(isPreview);
```

## Fontes e cores

Use as do projeto. O player aceita `accentColor`, `accentFromColor`, `glowColor` — passe
a cor primária da marca no accent e uma versão escura dela no glow.
