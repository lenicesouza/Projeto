# Meu Dia — assistente pessoal

Painel pessoal em cards: rotina da casa, cuidados pessoais, inglês, coisas que você vive adiando e finanças. Funciona no celular e no computador, inclusive offline, e pode ser "instalado" na tela inicial (PWA).

## Como usar

Não precisa de instalação nem de build. Basta servir a pasta:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Também dá para abrir o `index.html` direto, mas aí o modo offline/instalável fica desligado.

Para usar no celular, publique a pasta em qualquer hospedagem estática (GitHub Pages, Netlify, Vercel), abra o link no navegador e escolha **"Adicionar à tela de início"**.

## O que tem

A tela inicial tem **"Para hoje"** (o que vence hoje em todos os cards) e os **cards**. Cada card abre sua própria tela.

| Card | Função |
| --- | --- |
| 🏠 **Casa** | Checklist de tarefas domésticas com frequência. Traz **sugestões** prontas (louça, banheiro, roupa de cama, geladeira…) para adicionar com um toque. |
| 💆 **Cuidados** | Mesma lógica, para autocuidado (ex.: hidratar o cabelo e sobrancelha 1x por semana), também com sugestões. |
| 🇬🇧 **Inglês** | Meta de prática "20 min, 4x por semana" com contagem da semana e **anotações** datadas (o que praticou, palavras novas). |
| ⏳ **Adiados** | Pendências sem data certa. Mostra há quantos dias você adia cada uma, um "menor próximo passo" e até 3 em **foco da semana**. |
| 💰 **Finanças** | Lançamentos, **compromissos** (contas fixas do mês, com vencimento e pagamento), orçamento por categoria e metas. |
| ⚙️ **Configurações** | Criar/excluir cards de rotina (ex.: Academia, Plantas), backup e apagar dados. |

Todo card de rotina também tem anotações. Itens, pendências e compromissos podem ser **editados** pelo ✎ (o histórico é mantido); o "Excluir" fica dentro da edição.

## Lembretes

Não há notificação push (exigiria um servidor e os dados sairiam do aparelho). Em vez disso, na edição de um item (✎) há **⏰ Lembrete no calendário**: escolha horário e dias e toque em **📅 Adicionar ao calendário**. O app gera um evento repetido com alarme para o Calendário do celular.

- O alarme toca **mesmo que o item já esteja marcado** — o calendário não sabe o que foi feito no app.
- Mudanças no app **não atualizam** o calendário: apague o evento no Calendário e adicione de novo.
- "A cada N dias" vira um evento a cada N dias a partir do próximo vencimento, em datas fixas.

## Como as frequências funcionam

| Frequência | Quando está "feito" | Quando aparece em "Para hoje" |
| --- | --- | --- |
| Todo dia | Marcado hoje | Todos os dias |
| Dias da semana | Marcado no dia programado | Só nos dias escolhidos |
| 1x por semana | Marcado em qualquer dia de segunda a domingo | Só no sábado e domingo, se ainda não feito |
| X vezes por semana | Marcado hoje; a semana conta as vezes (ex.: 2/4) e a meta é batida ao chegar em X | Todo dia, até bater a meta da semana |
| 1x por mês | Marcado em qualquer dia do mês | Só nos 2 últimos dias do mês, se ainda não feito |
| A cada N dias | Conta a partir da última vez | Quando vence ou está atrasado |

Semanais e mensais só entram em "Para hoje" no fim do prazo **de propósito**: se aparecessem desde segunda, a tela inicial viraria uma lista permanente de pendências. Eles aparecem no card o tempo todo.

## Compromissos (contas fixas)

Cadastre nome, valor, dia do vencimento e categoria. Todo mês a conta aparece em *Finanças → Compromissos*; ao **pagar**, você confirma o valor (útil para luz/água, que variam) e isso vira uma despesa em Lançamentos. Contas que vencem em até 3 dias ou já venceram aparecem em "Para hoje". Se ao cadastrar o vencimento do mês já passou, a conta começa a contar no mês seguinte.

## Como o dinheiro das metas é contado

"Guardar" numa meta cria um lançamento ligado a ela. Esse valor **não conta como despesa** (não afeta o orçamento), mas sai do **saldo livre** do mês: `saldo livre = receitas − despesas − guardado`. "Retirar" faz o contrário. Excluir uma meta mantém os lançamentos no histórico.

## Usando no celular e no computador

Não há sincronização. Use o **celular como aparelho principal**. Para ver os dados no computador: *Mais → Exportar backup* no celular e *Importar backup* no computador. A importação **substitui** tudo que havia no destino.

## Limitações conhecidas (intencionais nesta versão)

- **Versões antigas:** os hábitos da primeira versão viram automaticamente o card 🔁 Hábitos, com o histórico.
- **Os dados ficam só no navegador** (`localStorage`). Trocar de aparelho, limpar o navegador ou usar aba anônima = perder dados. Por isso existe o backup — use-o.
- **Sem sincronização** entre celular e computador.
- **Lembretes só via Calendário** (ver acima), sem notificação do próprio app.
- **Finanças manuais**: não há integração com banco. Lançar à mão é o principal ponto de abandono desse tipo de app.

## Próximos passos sugeridos (em ordem)

1. Usar por 2–3 semanas e anotar o que realmente faz falta.
2. Sincronização em nuvem com login (ex.: Supabase/Firebase) — só quando o uso justificar.
3. Notificações do próprio app, cientes do que já foi feito (exige servidor ou app nativo).

## Estrutura

```
index.html            estrutura da página e navegação
styles.css            visual (tema claro/escuro automático)
app.js                lógica, telas e persistência
sw.js                 cache para funcionar offline
manifest.webmanifest  metadados para instalar como app
icon.svg              ícone
```
