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

## Rotas principais

- `GET /health`
- `POST /auth/login`
- `GET/POST/PATCH/DELETE /transactions`
- `GET/POST/PATCH/DELETE /accounts`
- `GET/POST/PATCH/DELETE /credit-cards`
- `GET/POST /credit-card-purchases` e `GET /credit-card-purchases/:id`
- `GET /credit-card-invoices`, `GET /credit-card-invoices/:id` e `POST /credit-card-invoices/:id/pay`
- `GET/POST/PATCH/DELETE /financial-events`
- `POST /financial-events/:id/postpone` e `POST /financial-events/:id/confirm`
- `GET /financial-timeline`
- `GET/POST/PATCH/DELETE /categories`
- `GET/POST/PATCH/DELETE /fixed-expenses`
- `GET/POST/PATCH/DELETE /fixed-incomes`
- `GET /monthly-summary`

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

Eventos representam receitas e despesas futuras. Ao confirmar, um evento em conta cria uma `Transaction`; um evento de despesa no cartao cria uma `CreditCardPurchase` com parcelas e faturas pelo mesmo fluxo das compras diretas. Eventos recorrentes confirmados geram a proxima ocorrencia planejada.

```bash
curl -X POST http://localhost:3001/financial-events \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"type":"expense","name":"Seguro do carro","expectedAmount":1200,"date":"2026-08-15T12:00:00.000Z","categoryId":"CATEGORY_ID","accountId":"ACCOUNT_ID","paymentMethod":"pix","recurrence":"yearly","installmentCount":1}'

curl -X POST http://localhost:3001/financial-events/FINANCIAL_EVENT_ID/confirm \
  -H 'Authorization: Bearer TOKEN'
```

## Timeline financeira

A timeline agrega transacoes realizadas, eventos financeiros futuros, faturas e ocorrencias virtuais de gastos e ganhos fixos. A consulta e somente de leitura e exige um intervalo de no maximo 366 dias.

```bash
curl 'http://localhost:3001/financial-timeline?startDate=2026-08-01T00%3A00%3A00.000Z&endDate=2026-08-31T23%3A59%3A59.999Z' \
  -H 'Authorization: Bearer TOKEN'

curl 'http://localhost:3001/financial-timeline?startDate=2026-08-01T00%3A00%3A00.000Z&endDate=2026-08-31T23%3A59%3A59.999Z&type=expense&sourceType=credit_card_invoice&includeCanceled=false' \
  -H 'Authorization: Bearer TOKEN'
```

As ocorrencias de gastos e ganhos fixos sao calculadas em memoria e nao sao persistidas. Faturas aparecem uma vez por mes, com o total das parcelas nao canceladas.

Validacao completa:

```bash
npm run prisma:generate
npm run build
npm test
```
