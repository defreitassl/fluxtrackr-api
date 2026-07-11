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
- `GET /credit-card-invoices` e `GET /credit-card-invoices/:id`
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
```

Validacao completa:

```bash
npm run prisma:generate
npm run build
npm test
```
