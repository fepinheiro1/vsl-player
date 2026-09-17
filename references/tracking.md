# Tracking da VSL

O player dispara 4 callbacks. A página traduz em eventos pras ferramentas que o projeto
já usa. O funil que importa:

```
page_view → video_start → progress_25 → 50 → 75 → 95 → cta_reveal → cta_click → lead/checkout
```

## Nomes de evento (padrão sugerido)

| Callback | Evento | O que responde |
|---|---|---|
| `onStart` | `vsl_video_start` | Quantos ativaram o som (= começaram de verdade). Sem isso, o autoplay mudo inflaria o número. |
| `onProgress(25/50/75/95)` | `vsl_progress_25` … `vsl_progress_95` | Onde as pessoas param. **Um evento por marco** (não 1 evento + parâmetro) — assim cada marco vira uma linha no relatório do GA4 sem cadastrar dimensão. |
| `onReveal` | `vsl_cta_reveal` | Quantos chegaram no momento da oferta. |
| clique no CTA | `vsl_cta_click` | reveal → click é a taxa do botão. |
| `onEnded` | `vsl_video_ended` | Assistiu até o fim. |

Retenção = `progress_N / video_start`. Se cai forte entre 25 e 50, o problema é o roteiro
nos primeiros minutos, não o CTA.

## Uma função só

```ts
function track(name: string, params: Record<string, unknown> = {}) {
  // GTM
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...params });
  // GA4 direto (se não usa GTM)
  window.gtag?.('event', name, params);
  // Meta Pixel — evento custom (não use 'Lead' aqui; reserve pro lead real)
  window.fbq?.('trackCustom', name, params);
}
```

Passe `content_name: 'vsl-<nome>'` em todos se o projeto tiver mais de uma VSL.

## Ligando no player (React)

```tsx
<VslPlayer
  src={SRC}
  onStart={() => track('vsl_video_start')}
  onProgress={(p) => track(`vsl_progress_${p}`)}
  onReveal={() => { track('vsl_cta_reveal'); setCtaVisible(true); }}
  onEnded={() => track('vsl_video_ended')}
/>
```

## Detalhes que evitam número errado

- Progresso e reveal só disparam **com som ativo** — o player já garante isso.
- Cada marco dispara **uma vez** por carregamento — já garantido. Se a pessoa recarrega a
  página, dispara de novo; é o comportamento normal do GA4.
- Se o projeto salva eventos no próprio banco, gere uma `idempotency_key` =
  `vsl:sessao:evento:marco` e faça upsert — evita duplicar quando a rede repete o POST.
