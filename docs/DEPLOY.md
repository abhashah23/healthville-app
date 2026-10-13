# Deployment notes (for Umair)

Recommended setup, all in **Microsoft Azure, Canada Central (Toronto)**, since
Healthville already uses Microsoft 365. Nothing here is final until Healthville
approves hosting (see `decisions.md`).

## Pieces

| Piece | Azure service | Notes |
|---|---|---|
| App | App Service, Linux, Node 22 LTS | One instance is enough for this size. "HTTPS only" on, minimum TLS 1.2, Always On. Health check path: `/health`. |
| Database | Azure Database for PostgreSQL, Flexible Server | Canada Central. Encrypted at rest by default. Require TLS. Backups kept in Canada (geo-redundant backup pairs with Canada East). |
| Email | Microsoft 365 SMTP (dedicated sending mailbox) or Azure Communication Services Email | Check where the email service stores message data. Emails contain only a sign-in link. |
| Secrets | App Service configuration (or Key Vault references) | Never commit `.env`. |

Rough cost at pilot size: about CAD $75 to $200 a month. Please confirm with
the Azure pricing calculator.

## Settings (environment variables)

See `.env.example`. In production:

- `NODE_ENV=production` (turns on secure cookies, HSTS, and refuses to start
  without email settings or an https `APP_URL`)
- `DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require`
- `APP_URL=https://<the app's address>`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

## Deploy steps

1. Create the database and an app user with rights to create tables.
2. Create the App Service and set the settings above.
3. Deploy the code (zip deploy or GitHub Actions). Startup command: `npm start`.
   This applies database changes in `migrations/` and then starts the app.
4. Create the first admin from the App Service SSH console:
   `npm run create-admin -- "Abha Shah" abha@...`
5. Sign in as that admin and add the rest of the people through the Admin pages.
6. **Never run `npm run seed-demo` against the real database.** It refuses
   when `NODE_ENV=production`.

## Things to know

- Sign-in link requests are rate-limited in memory. If you ever run more than
  one instance, move that to the database or a shared store.
- Sign-in links appear in the URL of the confirm page, so they can show up in
  web server access logs. They work once and expire in 60 minutes. Keep App
  Service logs in Canada and limit who can read them.
- Pages that show personal information send `Cache-Control: no-store`.
- The app sets a strict Content Security Policy: no inline scripts or styles,
  and no third-party content. Fonts are served from `/fonts`.
- Audit log: table `audit_log`. Deleting a participant keeps audit rows with
  their participant code only.
- Backups: Azure keeps point-in-time backups. When a participant's data is
  deleted on request, it stays in backups until those expire. Set the backup
  retention period to match what counsel approves.
