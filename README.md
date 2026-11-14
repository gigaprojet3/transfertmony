# TransfertMony

Transferts d'argent panafricains de Mobile Money à Mobile Money (MTN MoMo, Airtel Money, Orange Money, Wave, M-Pesa…), via l'agrégateur **SasPay**.

Stack : Next.js 16 (App Router, API Routes) · Tailwind CSS 4 · PostgreSQL + Prisma 6 · JWT (jose) en cookie httpOnly · bcrypt.

## Démarrage

```bash
cp .env.example .env          # puis renseigner DATABASE_URL et les clés SasPay
npx prisma migrate dev --name init
npx prisma db seed            # pays, devises, opérateurs, frais
npm run dev
```

Ouvrir http://localhost:3000, créer un compte, puis envoyer un transfert depuis le tableau de bord.

## Structure

```
prisma/
  schema.prisma            User, CountryRate, Transaction, TransactionEvent, WebhookEvent
  seed.mjs                 corridors (taux indicatifs)
src/
  proxy.js                 protège /dashboard (Next 16 : remplace middleware)
  lib/
    prisma.js              client Prisma unique
    session.js             JWT + cookie de session
    auth.js                requireUser, vérification du PIN (verrouillage), anti-CSRF
    pricing.js             frais + taux de change en Decimal (devis serveur)
    validation.js          schémas zod
    status.js              machine à états et libellés (partagé client/serveur)
    errors.js              AppError -> réponses JSON
    client.js              fetch + formatage (navigateur)
  services/
    saspayService.js       collectMoney(), sendMoney(), getTransactionStatus(), signatures webhook
    transferService.js     orchestration encaissement -> décaissement, idempotence, réconciliation
  app/
    api/auth/{register,login,logout,me}
    api/rates              pays et opérateurs
    api/transfer/quote     simulateur
    api/transfer/initiate  création + encaissement
    api/transactions       historique
    api/users/lookup       destinataire via lien de réception
    api/webhooks/saspay    confirmation SasPay -> décaissement
    api/cron/reconcile     filet de sécurité (webhooks perdus, timeouts)
    dashboard/ login/ register/
  components/
    dashboard/             SendMoneyForm (ticket), PinDialog, TransactionHistory, ReceiveCard
    auth/
```

## Flux d'un transfert

```
Client ──POST /api/transfer/initiate (Idempotency-Key + PIN)──► PENDING ─► COLLECTING ─► SasPay collect
                                                                                  │
SasPay ──POST /api/webhooks/saspay (signé)── SUCCESS ──► COLLECTED ─► PAYOUT_PROCESSING ─► SasPay payout
                                                                                  │
SasPay ──POST /api/webhooks/saspay── payout SUCCESS ──► COMPLETED   (FAILED ──► PAYOUT_FAILED : à rembourser)
```

Libellés affichés : `En attente` (PENDING, COLLECTING), `Encaissé` (COLLECTED, PAYOUT_PROCESSING), `Transféré` (COMPLETED), `Échoué` (FAILED, PAYOUT_FAILED).

## Garanties de sécurité financière

- **Montants en Decimal** partout ; frais arrondis au supérieur, montant reçu à l'inférieur.
- **Devis recalculé côté serveur** à l'envoi : le client ne fixe jamais un montant.
- **PIN obligatoire** avant chaque envoi, bcrypt, blocage 15 min après 5 échecs.
- **Idempotence client** : `@@unique([senderId, idempotencyKey])`. Une relance renvoie la même transaction ; la même clé pour un autre contenu est refusée (409).
- **Idempotence SasPay** : en-tête `Idempotency-Key: <reference>:collect|payout`.
- **Transitions atomiques** (`UPDATE … WHERE status IN (…)`) : un webhook dupliqué ou concurrent ne déclenche qu'un seul décaissement.
- **Webhooks** : signature HMAC vérifiée sur le corps brut, fenêtre anti-rejeu de 5 min, déduplication par `eventId`.
- **Contrôle du montant encaissé** : s'il diffère du montant attendu, la transaction passe en `ON_HOLD` au lieu de payer.
- **Résultat incertain ≠ échec** : timeout ou 5xx ne marquent jamais un transfert « Échoué » ; la réconciliation interroge SasPay.
- **Journal d'audit** (`TransactionEvent`) de chaque changement de statut.

## À faire avant la production

1. **Adapter `src/services/saspayService.js` à la documentation SasPay** : endpoints, champs, schéma de signature, codes opérateurs (marqués `À ADAPTER`).
2. Planifier `GET /api/cron/reconcile` toutes les 5 min (`Authorization: Bearer $CRON_SECRET`).
3. Traiter les `PAYOUT_FAILED` (remboursement automatique ou back-office) : alerte `[ALERTE REMBOURSEMENT]` dans les logs.
4. Brancher une vraie source de taux de change pour `CountryRate.unitsPerUsd`.
5. Ajouter une limitation de débit (login, PIN, initiate) avec Redis, des plafonds KYC journaliers et la vérification OTP du numéro.
6. Restreindre le webhook aux IP SasPay si elles sont publiées.
