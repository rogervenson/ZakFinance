# Publicar no Railway

O repositório já traz o [`railway.json`](../railway.json):

- **Build:** `npm run build` (o cliente Prisma é gerado no `npm install`).
- **Start:** `npm run start:prod`, que confere o ambiente, aplica as migrations (`prisma migrate deploy`), roda o seed (seguro em todo start: só cria o que falta) e inicia o servidor.
- **Health check:** `GET /api/health` confirma que o banco responde.

Não há arquivos enviados para guardar, então **não é preciso volume**.

## 1. Criar os serviços

1. No Railway: **New Project → Deploy from GitHub repo** e escolha o repositório do ZakFinance.
2. No mesmo projeto: **Database → PostgreSQL**.

## 2. Variáveis do app

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_TIMEZONE` | `America/Sao_Paulo` |
| `ADMIN_EMAIL` | e-mail do Zak |
| `ADMIN_PASSWORD` | senha temporária (pelo menos 10 caracteres; troca obrigatória no primeiro acesso) |
| `ADMIN_NAME` | opcional, padrão "Zak" |
| `SESSION_TTL_HOURS` | opcional, padrão 12 |

O Railway define `PORT` e `NODE_ENV=production`. Em produção o cookie de sessão é `Secure`, então use HTTPS (os domínios do Railway já são).

## 3. Publicar

1. Em **Settings → Networking → Generate Domain**, gere o endereço `*.up.railway.app` (ou ligue um domínio próprio).
2. Cada push na `main` publica sozinho. Nos logs, procure `[seed] Configuração base pronta.` e `Ready`.
3. Entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD` e escolha a nova senha.

## 4. Carregar a planilha

Use a tela **Importar planilha** do próprio app publicado: baixe a Zak26 como .xlsx, envie, confira a prévia e importe. Não é preciso rodar nada no computador.

## Backup

Os dados ficam só no PostgreSQL. Ative os backups do serviço Postgres no Railway, ou exporte com `pg_dump` usando a `DATABASE_PUBLIC_URL`.
