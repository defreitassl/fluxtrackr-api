# API

Backend do FluxTrackr em Node.js + TypeScript com NestJS.

## Responsabilidades

- Autenticacao JWT basica.
- Regras de negocio financeiras.
- Contratos HTTP consumidos pelo app mobile e pelo bot Telegram.
- Integracao com PostgreSQL via Prisma.

## Configuracao

Crie `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

## Rodar localmente

Suba o PostgreSQL:

```bash
docker compose up -d postgres
```

Prepare o Prisma e o seed:

```bash
npm run prisma:generate
npm run prisma:seed
```

Rode a API:

```bash
PORT=3001 npm run start
```

Para desenvolvimento com watch:

```bash
PORT=3001 npm run start:dev
```

## Validacao

```bash
npm run build
```

## Contrato OpenAPI

O contrato completo da API fica em [`openapi.yaml`](./openapi.yaml). Ele documenta
as rotas implementadas, autenticação JWT, validações de entrada, formatos de
resposta e erros HTTP para uso por clientes, coleções de teste e geradores de SDK.

## Rotas principais

- `GET /health`
- `POST /auth/login`
- `GET/POST/PATCH/DELETE /transactions`
- `GET/POST/PATCH/DELETE /accounts`
- `POST/GET /account-transfers` e `GET /account-transfers/:id`
- `POST/GET /accounts/:id/balance-adjustments` e `GET /accounts/:id/balance`
- `GET/POST/PATCH/DELETE /credit-cards`
- `GET/POST /credit-card-purchases` e `GET /credit-card-purchases/:id`
- `GET /credit-card-invoices`, `GET /credit-card-invoices/:id` e `POST /credit-card-invoices/:id/pay`
- `GET/POST/PATCH/DELETE /financial-events`
- `POST /financial-events/:id/postpone`, `POST /financial-events/:id/confirm` e `POST /financial-events/:id/realize`
- `GET /financial-timeline`
- `GET /balance-forecast`
- `GET /dashboard-overview`
- `POST/GET/PATCH/DELETE /category-budgets`, `GET /category-budgets/overview`
- `GET/POST/PATCH/DELETE /categories`
- `POST/GET/PATCH/DELETE /financial-goals`, `GET /financial-goals/overview` e `POST/GET /financial-goals/:id/contributions`
- `GET/POST/PATCH/DELETE /fixed-expenses`
- `GET/POST/PATCH/DELETE /fixed-incomes`
- `GET /fixed-occurrences`, `GET /fixed-occurrences/:id`, `POST /fixed-occurrences/:id/realize` e `POST /fixed-occurrences/:id/cancel`
- `GET /monthly-summary`
- `GET/POST/PATCH/DELETE /subscriptions`, `GET /subscriptions/summary`
- `GET /subscription-charges`, `GET /subscription-charges/:id`, `POST /subscription-charges/:id/realize` e `POST /subscription-charges/:id/cancel`
- `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` e `DELETE /notifications/:id`
- `GET/PATCH /notification-preferences` e `GET /activities`

## Compras no cartao e faturas

A compra cria o compromisso, suas parcelas e as faturas mensais em uma unica transacao Prisma. Ela nao cria uma `Transaction`; isso fica reservado ao futuro pagamento da fatura.

Testes manuais (substitua os IDs e o token):

```bash
curl -X POST http://localhost:3001/credit-card-purchases \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"creditCardId":"CARD_ID","categoryId":"CATEGORY_ID","description":"Notebook","totalAmount":3600,"purchaseDate":"2026-07-10T12:00:00.000Z","installmentCount":12}'

curl 'http://localhost:3001/credit-card-purchases?creditCardId=CARD_ID&startDate=2026-07-01T00:00:00.000Z&endDate=2026-07-31T23:59:59.999Z' \
  -H 'Authorization: Bearer TOKEN'

curl 'http://localhost:3001/credit-card-purchases/PURCHASE_ID' \
  -H 'Authorization: Bearer TOKEN'

curl 'http://localhost:3001/credit-card-invoices?creditCardId=CARD_ID&year=2026&month=8&status=open' \
  -H 'Authorization: Bearer TOKEN'

curl 'http://localhost:3001/credit-card-invoices/INVOICE_ID' \
  -H 'Authorization: Bearer TOKEN'

curl -X POST 'http://localhost:3001/credit-card-invoices/INVOICE_ID/pay' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"accountId":"ACCOUNT_ID","paidAt":"2026-08-07T12:00:00.000Z"}'
```

O pagamento e integral, soma as parcelas nao canceladas e cria uma `Transaction` de despesa na conta pagadora. `paidAt` e opcional. Pagamento parcial, juros, estorno e alteracao direta de saldo nao fazem parte deste fluxo.

## Eventos financeiros

Eventos representam receitas e despesas futuras. Confirmar apenas muda o evento para `confirmed`, registrando o compromisso sem criar movimentacao. Realizar um evento confirmado cria atomicamente uma `Transaction` em conta ou reutiliza o dominio de compras para cartão, muda o status para `realized` e somente então cria a próxima ocorrência recorrente.

```bash
curl -X POST http://localhost:3001/financial-events \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"type":"expense","name":"Seguro do carro","expectedAmount":1200,"date":"2026-08-15T12:00:00.000Z","categoryId":"CATEGORY_ID","accountId":"ACCOUNT_ID","paymentMethod":"pix","recurrence":"yearly","installmentCount":1}'

curl -X POST http://localhost:3001/financial-events/FINANCIAL_EVENT_ID/confirm \
  -H 'Authorization: Bearer TOKEN'

curl -X POST http://localhost:3001/financial-events/FINANCIAL_EVENT_ID/realize \
  -H 'Authorization: Bearer TOKEN'
```

## Timeline financeira

A timeline agrega transacoes realizadas, eventos financeiros futuros, faturas e ocorrencias mensais persistidas de gastos e ganhos fixos. A consulta e somente de leitura e exige um intervalo de no maximo 366 dias.

```bash
curl 'http://localhost:3001/financial-timeline?startDate=2026-08-01T00%3A00%3A00.000Z&endDate=2026-08-31T23%3A59%3A59.999Z' \
  -H 'Authorization: Bearer TOKEN'

curl 'http://localhost:3001/financial-timeline?startDate=2026-08-01T00%3A00%3A00.000Z&endDate=2026-08-31T23%3A59%3A59.999Z&type=expense&sourceType=credit_card_invoice&includeCanceled=false' \
  -H 'Authorization: Bearer TOKEN'
```

Eventos `planned`, `confirmed` e `postponed` aparecem como projetados. Ocorrencias fixas `pending` de templates ativos aparecem como projetadas; realizadas aparecem somente pela `Transaction`, e canceladas apenas com `includeCanceled=true`. A materializacao idempotente cobre o mes UTC atual e os 13 seguintes na inicializacao, diariamente e apos criacao/atualizacao do template.

`DELETE /fixed-expenses/:id` e `DELETE /fixed-incomes/:id` arquivam o template com `isActive: false`. Os templates aceitam `categoryId`, `accountId` e `paymentMethod` opcionais. Contas vinculadas devem estar ativas; categorias devem ser compativeis; `credit` nao pode ser realizado diretamente em conta.

## Previsao consolidada de saldo

A previsao soma os saldos iniciais e transacoes realizadas das contas ativas e aplica somente impactos projetados retornados diretamente pela Timeline, incluindo eventos planejados e confirmados. A consulta da Timeline começa à meia-noite UTC do dia de `asOf`, enquanto o saldo atual preserva o horário exato. A consulta e protegida por JWT, somente de leitura e nao persiste saldo ou previsao.

```bash
curl 'http://localhost:3001/balance-forecast?horizonDays=30' \
  -H 'Authorization: Bearer TOKEN'

curl 'http://localhost:3001/balance-forecast?asOf=2026-08-01T12%3A00%3A00.000Z&horizonDays=366' \
  -H 'Authorization: Bearer TOKEN'
```

`asOf` usa a data/hora atual por padrao. `horizonDays` usa 30 e aceita de 1 a 366. Valores monetarios sao strings com duas casas decimais e os pontos diarios usam datas UTC.

## Dashboard financeiro

`GET /dashboard-overview` consolida, em uma consulta protegida por JWT, saldo atual, valor comprometido, disponivel para gastar, meta diaria, previsao de 30 dias, proxima fatura, cinco proximos compromissos e cinco transacoes recentes. `asOf` e opcional e todas as fronteiras usam UTC.

```text
saldo total
- valor comprometido
= disponivel para gastar
```

O saldo total e o `currentBalance` calculado pelo `BalanceForecastService`. O comprometido soma faturas `open`, `closed` e `overdue`, ocorrencias fixas de despesa `pending` com template ativo, eventos de despesa `confirmed` e cobranças pendentes de assinaturas financeiras, vencidos ou com data ate o fim do mes UTC. Faturas usam o total compartilhado de parcelas nao canceladas. Planos pagos e cobrança comercial do próprio FluxTrackr continuam fora do escopo.

`spentToday` considera apenas transacoes comuns e parcelas de compras normais no cartao feitas no dia cuja fatura vence ate o fim do mes. Pagamentos de fatura, realizacoes e compras originadas de evento sao excluidos. A recomendacao parte do disponivel antes do gasto de hoje, evitando desconto duplo. Faturas de total zero nao aparecem como proxima fatura.

## Transferencias e ajustes de saldo

```text
Transferencia: nao e receita; nao e despesa; altera somente a distribuicao entre contas.
Ajuste: nao e receita; nao e despesa; corrige o saldo real e mantem historico.
```

O saldo usa `initialBalance + receitas - despesas + recebidas - enviadas + ajustes`, com `Prisma.Decimal` e corte por `asOf`. Transferencias e ajustes sao atomicos, nao criam `Transaction`, aparecem na Timeline como informativos e entram em `latestMovements`; `latestTransactions` permanece temporariamente como campo legado.

## Orçamentos mensais por categoria

`CategoryBudget` define um limite analítico mensal, ativo por padrão, para uma categoria `expense` ou `both` do próprio usuário. Não bloqueia movimentações, não altera saldo e não entra no comprometido. `DELETE /category-budgets/:id` apenas arquiva; `GET /category-budgets?isActive=false` preserva consulta histórica.

`GET /category-budgets/overview?year=2026&month=7&asOf=` retorna gasto em conta e cartão, restante, percentual e status `within_budget`, `near_limit` ou `exceeded`, sempre como strings monetárias com duas casas. Para conta, entram somente `Transaction` de despesa da categoria até o período UTC realizado e pagamentos de fatura são excluídos. Para cartão, cada parcela não cancelada entra pelo mês/ano da fatura, inclusive faturas pagas; compras parceladas contam somente pelo valor da parcela e pagamento da fatura não conta novamente.

`GET /dashboard-overview` inclui somente `budgetSummary` do mês UTC de `asOf`; saldo, comprometido, disponível para gastar e meta diária não mudam.

## Ciclo de vida de categorias

Categorias são arquiváveis. `DELETE /categories/:id` e `PATCH` com `isActive:false` definem `Category.isActive:false` e arquivam, na mesma transação, todos os `CategoryBudget` ativos associados. Não há exclusão física e histórico financeiro permanece consultável. `GET /categories` retorna somente ativas por padrão; aceita `isActive` e `type`. Uma categoria com orçamento ativo não pode mudar para `income`. Orçamento ativo exige categoria ativa que aceite despesas; overview de orçamentos e `budgetSummary` ignoram tanto orçamento quanto categoria arquivados.

## Metas financeiras

Meta financeira é objetivo analítico de médio ou longo prazo. Aporte é valor que usuário considera destinado à meta. Aporte não movimenta conta bancária, não cria `Transaction`, não altera saldo, comprometido, orçamento, previsão, Dashboard ou Timeline.

`FinancialGoal` persiste alvo e status; `GoalContribution` persiste somente aportes e retiradas. Progresso é sempre derivado com `Prisma.Decimal`: `contribution - withdrawal`; restante é `max(alvo - atual, 0)` e percentual é `min(atual / alvo * 100, 100)`. Criação, atualização, cancelamento e aportes usam transação `Serializable` com retry de `P2034`. Metas canceladas não aceitam movimentações; conclusão é automática e retirada pode reabrir meta.

Rotas JWT: `POST/GET/PATCH/DELETE /financial-goals`, `GET /financial-goals/overview`, `POST /financial-goals/:id/contributions` e `GET /financial-goals/:id/contributions`. O overview aceita `asOf` como corte de existência da meta, movimentações e ciclo de vida. Campos configuráveis, como nome e valor-alvo, não têm versionamento histórico neste MVP. O prazo é data-calendário UTC: vencer hoje não atrasa a meta; metas concluídas, canceladas ou sem prazo retornam campos de prazo nulos. Retiradas são validadas contra todo o histórico cronológico e não podem deixar saldo negativo em nenhum instante.

## Notificações e atividades

Notificação é um alerta persistido sobre uma condição financeira atual. Atividade é um registro persistido de uma ação realizada; não é movimentação financeira e nenhuma das duas entra na Timeline, saldo, previsão, comprometido ou orçamento.

Rotas JWT: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`, `DELETE /notifications/:id`, `GET/PATCH /notification-preferences` e `GET /activities`. Notificações são somente in-app/API neste recorte: push nativo, e-mail, SMS, WebSocket e Telegram continuam fora do escopo. Preferências controlam novos alertas; alertas resolvidos e dispensados permanecem persistidos.

Validacao completa:

```bash
npm run prisma:generate
npm run build
npm test
```

Atividades são auditoria funcional: são gravadas na mesma transação da ação de domínio e fazem rollback junto dela. `occurredAt` é o instante real da ação do usuário; quando houver uma data financeira distinta, `metadata.effectiveDate` guarda a data em UTC. Valores monetários em metadata são strings com duas casas.

Notificações são projeções derivadas. A integração imediata ocorre somente depois do commit e uma falha é registrada sem desfazer a operação financeira. O bootstrap e o cron horário (`15 * * * *`, UTC) continuam reconciliando o estado persistido. Preferências desativadas impedem apenas novas ativações: alertas já existentes ainda são resolvidos quando a condição deixa de existir. Marcar como lida ou dispensar preserva o primeiro timestamp.

## Assinaturas financeiras

`Subscription` é um template recorrente; `SubscriptionCharge` é uma cobrança persistida com snapshot e estado próprio. `recurrenceAnchorDate` é a base UTC da série; `nextChargeDate` é somente o ponteiro da próxima pendência. As cobranças são materializadas de forma idempotente para o mês UTC atual e 13 seguintes, no bootstrap, às 00:10 UTC e após alterações do template. Assinaturas inativas não geram cobranças nem são reativadas automaticamente; somente `PATCH {"isActive":true}` reativa. Somente `monthly`, `semiannual` e `yearly` são aceitas; cada assinatura usa exatamente uma conta ativa (com método não `credit`) ou um cartão ativo (sem método).

Rotas JWT: `POST/GET/PATCH/DELETE /subscriptions`, `GET /subscriptions/summary`, `GET /subscription-charges`, `GET /subscription-charges/:id`, `POST /subscription-charges/:id/realize` e `POST /subscription-charges/:id/cancel`.

Cobranças pendentes aparecem uma vez na Timeline e previsão. Uma realização aceita data atual ou passada e um único override de destino: conta remove cartão, cartão remove conta e método; ambos os destinos, método em cartão ou data futura retornam `400`. Uma realização em conta cria uma `Transaction`; no cartão, reutiliza `CreditCardPurchaseDomainService`, criando compra/parcela/fatura. Os resultados realizados não são repetidos pela cobrança. O Dashboard inclui pendências de assinatura no comprometido e exclui suas realizações de `spentToday`.
