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

A tela inicial é uma **agenda**: uma faixa de dias que dá para rolar (ou deslizar o dedo sobre a lista para trocar de dia, ‹ › para pular semanas, 📅 para ir a uma data) e, abaixo, a **lista de tarefas do dia** escolhido. Embaixo ficam os **cards**, onde você cadastra as rotinas e a recorrência de cada uma.

- **Lista do dia:** rotinas que vencem no dia, contas que vencem no dia e pendências com prazo. Hoje também mostra o que está atrasado e as pendências em foco.
- **Metas da semana:** itens "X vezes por semana" (ex.: inglês 4x), com a contagem da semana. Dá para marcar em qualquer dia.
- **Dias passados:** mostram o que foi feito e permitem marcar o que você esqueceu — a próxima data é recalculada a partir dali.
- **Dias futuros:** previsão (sem marcar), supondo que o que está pendente hoje seja feito hoje.
- **Bolinha em cada dia:** verde = tudo feito; laranja = pendente; cinza = dia passado com algo não feito.

| Card | Função |
| --- | --- |
| 🏠 **Casa** | Checklist de tarefas domésticas com frequência. Traz **sugestões** prontas (louça, banheiro, roupa de cama, geladeira…) para adicionar com um toque. |
| 💆 **Cuidados** | Mesma lógica, para autocuidado (ex.: hidratar o cabelo e sobrancelha 1x por semana), também com sugestões. |
| 🇬🇧 **Inglês** | Meta de prática "20 min, 4x por semana" com contagem da semana e **anotações** datadas (o que praticou, palavras novas). |
| ⏳ **Adiados** | Pendências sem data certa. Mostra há quantos dias você adia cada uma, um "menor próximo passo" e até 3 em **foco da semana**. |
| 💰 **Finanças** | Lançamentos, **compromissos** (contas fixas do mês, com vencimento e pagamento), orçamento por categoria e metas. |
| ⚙️ **Configurações** | **Adicionar vários itens de uma vez** (colar uma lista), criar/excluir cards de rotina, backup e apagar dados. |

Todo card de rotina também tem anotações. Itens, pendências e compromissos podem ser **editados** pelo ✎ (o histórico é mantido); o "Excluir" fica dentro da edição.

## Adicionar vários itens de uma vez

Em ⚙️ → **📋 Adicionar vários itens de uma vez**, cole uma lista com um item por linha e a frequência escrita do jeito comum:

```
# 🏠 Casa
Limpar janelas - a cada 15 dias
Passar pano - 3x na semana
Aspirar a casa - dias intercalados

# 🐾 Pets
Banho no Max - a cada 15 dias
```

- Entende: "todo dia", "dias intercalados", "1x / 3 vezes na semana", "1x por mês", "a cada 15 dias", "a cada 2 meses", "quinzenal", "semanal", "mensal".
- `# Nome` abre um card (criado se não existir; o emoji é opcional). Linhas sem `#` vão para o card escolhido na lista.
- Item com o mesmo nome de um existente (ignorando o que está entre parênteses) **atualiza** a frequência e mantém o histórico.
- Mostra uma **prévia** antes de salvar, com as linhas que não entendeu e a média de tarefas por dia.
- As **primeiras datas** dos itens novos são espalhadas pelo ciclo de cada um, nos dias com menos tarefas, para não acumular tudo no primeiro dia.

## Lembretes

Não há notificação push (exigiria um servidor e os dados sairiam do aparelho). Em vez disso, na edição de um item (✎) há **⏰ Lembrete no calendário**: escolha horário e dias e toque em **📅 Adicionar ao calendário**. O app gera um evento repetido com alarme para o Calendário do celular.

- O alarme toca **mesmo que o item já esteja marcado** — o calendário não sabe o que foi feito no app.
- Mudanças no app **não atualizam** o calendário: apague o evento no Calendário e adicione de novo.
- O evento parte da próxima data prevista e segue em datas fixas: se você atrasar, o app recalcula, mas o Calendário não.

## Como as frequências funcionam

**1x por semana, 1x por mês e a cada N dias contam a partir da última vez que você fez.** Ex.: hidratou o cabelo em 04/10 com recorrência semanal → a próxima é 11/10. Se não fizer no dia, o item **acumula**: aparece no dia seguinte como "atrasado" até ser marcado, e a contagem recomeça do dia em que for feito.

| Frequência | Próxima data | Se não fizer no dia |
| --- | --- | --- |
| Todo dia | Todos os dias | Não acumula (a louça de ontem não vira duas hoje) |
| Dias da semana | Nos dias escolhidos | Não acumula (é um compromisso marcado) |
| 1x por semana | 7 dias após a última vez | Acumula para o dia seguinte |
| 1x por mês | Mesmo dia do mês seguinte (31/01 → 28/02) | Acumula para o dia seguinte |
| A cada N dias | N dias após a última vez | Acumula para o dia seguinte |
| X vezes por semana | Meta da semana (seg–dom), em qualquer dia | A contagem zera na segunda |

- Item **nunca marcado** aparece hoje como "Primeira vez". Ao criar, informe **"Última vez que fez"** para a agenda já começar na data certa — ou volte na agenda até o dia em que fez e marque lá.
- Como a contagem recomeça de quando você fez, atrasos frequentes fazem "toda semana" virar, na prática, a cada 8–9 dias.

## Compromissos (contas fixas)

Cadastre nome, valor, dia do vencimento e categoria. Todo mês a conta aparece em *Finanças → Compromissos*; ao **pagar**, você confirma o valor (útil para luz/água, que variam) e isso vira uma despesa em Lançamentos. Contas aparecem na agenda no dia do vencimento; vencidas e não pagas aparecem também no dia de hoje. Se ao cadastrar o vencimento do mês já passou, a conta começa a contar no mês seguinte.

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
