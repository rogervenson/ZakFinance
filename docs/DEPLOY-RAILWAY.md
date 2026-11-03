# Publicar no Railway

O repositório já traz o [`railway.json`](../railway.json):

- **Build:** `npm run build` (o cliente Prisma é gerado no `npm install`).
- **Start:** `npm run start:prod`, que confere o ambiente, aplica as migrations (`prisma migrate deploy`), roda o seed (seguro em todo start: só cria o que falta) e inicia o servidor.
- **Health check:** `GET /api/health` confirma que o banco responde.

Não há arquivos enviados para guardar, então **não é preciso volume**.

## 1. Enviar o código para o GitHub

No computador, na pasta do projeto:

```
git push
```

## 2. Criar os serviços

1. No Railway: **New Project → Deploy from GitHub repo** e escolha `rogervenson/ZakFinance`.
2. No mesmo projeto: **+ Create → Database → PostgreSQL**.

## 3. Variáveis do app

No serviço do app (não no Postgres), aba **Variables**:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_TIMEZONE` | `America/Sao_Paulo` |
| `ADMIN_EMAIL` | `zak@exemplo.com` (só é usado se o banco estiver vazio) |
| `ADMIN_PASSWORD` | senha temporária, pelo menos 10 caracteres (idem) |
| `SESSION_TTL_HOURS` | opcional, padrão 12 |

O Railway define `PORT` e `NODE_ENV=production`. Em produção o cookie de sessão é `Secure`, então use HTTPS (os domínios do Railway já são).

## 4. Primeiro deploy e endereço

1. Salvar as variáveis dispara o deploy. Nos logs, procure `[config] Ambiente OK.`, `[seed] Configuração base pronta.` e `Ready`.
2. Em **Settings → Networking → Generate Domain**, gere o endereço `*.up.railway.app`.

## 5. Levar os dados do computador para o Railway

Os dados lançados até hoje estão no banco local. Para levá-los:

1. No Railway, abra o serviço **Postgres → Variables** e copie a `DATABASE_PUBLIC_URL` (a que tem `proxy.rlwy.net`).
2. No computador, com o banco local ligado (`npm run db` em outro terminal):

   ```
   npm run copy-data -- "COLE_AQUI_A_DATABASE_PUBLIC_URL"
   ```

3. Confira a lista de tabelas e quantidades e digite `copiar`. O script apaga o que houver no Railway, copia tudo e confere as contagens.
4. Entre no endereço publicado com o mesmo e-mail e senha que você usa no computador.

Depois disso, use só o app publicado. Rodar o `copy-data` de novo **sobrescreve** o Railway com os dados do computador.

## 6. Atualizações

Cada `git push` na `main` publica sozinho; as migrations rodam no start.

## Não consigo entrar (troquei o e-mail, esqueci a senha)

`ADMIN_EMAIL` e `ADMIN_PASSWORD` só criam o usuário no primeiro start, com o banco vazio. Trocar depois não muda nada — o log do deploy mostra o login atual na linha `[seed] Login: ...`.

Para redefinir o acesso pelo próprio Railway:

1. Em **Variables**, defina `ADMIN_EMAIL`, `ADMIN_PASSWORD` (10+ caracteres) e `ADMIN_RESET` = `1`.
2. Espere o redeploy; o log mostra `[seed] ADMIN_RESET: acesso redefinido para ...`.
3. Entre com esse e-mail e senha e escolha a nova senha.
4. **Apague a variável `ADMIN_RESET`** (senão o acesso é redefinido a cada deploy).

Ou, pelo computador, 
Com a `DATABASE_PUBLIC_URL` do Railway:

```
set DATABASE_URL=COLE_AQUI_A_DATABASE_PUBLIC_URL
npm run reset-password -- zak@exemplo.com
```

(no PowerShell: `$env:DATABASE_URL="..."` em vez de `set`).

## Backup

Os dados ficam só no PostgreSQL do Railway. Ative os backups do serviço Postgres no Railway, ou copie para outro banco com `npm run copy-data` apontando a origem (`DATABASE_URL`) para o Railway.
