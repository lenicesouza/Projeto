# Meu Dia — assistente pessoal

Tarefas, rotina (hábitos) e finanças pessoais em um só lugar. Funciona no celular e no computador, inclusive offline, e pode ser "instalado" na tela inicial (PWA).

## Como usar

Não precisa de instalação nem de build. Basta servir a pasta:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Também dá para abrir o `index.html` direto, mas aí o modo offline/instalável fica desligado.

Para usar no celular, publique a pasta em qualquer hospedagem estática (GitHub Pages, Netlify, Vercel), abra o link no navegador e escolha **"Adicionar à tela de início"**.

## O que tem

| Aba | Função |
| --- | --- |
| **Hoje** | Resumo do dia: tarefas de hoje e atrasadas, hábitos programados, saldo do mês. Adição rápida de tarefa. |
| **Tarefas** | Tarefas com data e prioridade, agrupadas em Atrasadas / Hoje / Próximas / Sem data. |
| **Rotina** | Hábitos com dias da semana, marcação dos últimos 7 dias e contagem de sequência (🔥). |
| **Finanças** | Receitas e despesas por mês, saldo, gastos por categoria. |
| **Mais** | Exportar/importar backup em JSON e apagar dados. |

## Limitações conhecidas (intencionais nesta 1ª versão)

- **Os dados ficam só no navegador** (`localStorage`). Trocar de aparelho, limpar o navegador ou usar aba anônima = perder dados. Por isso existe o backup — use-o.
- **Sem sincronização** entre celular e computador.
- **Sem notificações/lembretes.** Navegadores limitam notificações de apps web sem servidor, especialmente no iPhone.
- **Finanças manuais**: não há integração com banco. Lançar à mão é o principal ponto de abandono desse tipo de app.

## Próximos passos sugeridos (em ordem)

1. Usar por 2–3 semanas e anotar o que realmente faz falta.
2. Tarefas e lançamentos **recorrentes** (conta de luz todo dia 10, etc.).
3. Orçamento por categoria com alerta ao estourar.
4. Sincronização em nuvem com login (ex.: Supabase/Firebase) — só quando o uso justificar.
5. Lembretes/notificações (exige servidor ou app nativo).

## Estrutura

```
index.html            estrutura da página e navegação
styles.css            visual (tema claro/escuro automático)
app.js                lógica, telas e persistência
sw.js                 cache para funcionar offline
manifest.webmanifest  metadados para instalar como app
icon.svg              ícone
```
