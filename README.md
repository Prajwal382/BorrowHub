# BorrowHub

Equipment lending and return management for one department or student organization.

## Getting started

Requires Node.js 22 and Docker Desktop.

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Paste the printed value into `SESSION_SECRET` in `.env`, then run:

```powershell
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

Then open http://localhost:3000.

## Demo accounts

Created by `npm run db:seed`. The password for all of them is `BorrowHub#2026`.

| Role          | Email                      |
| ------------- | -------------------------- |
| Administrator | `admin@borrowhub.test`     |
| Staff         | `staff@borrowhub.test`     |
| Borrower      | `borrower1@borrowhub.test` |
| Borrower      | `borrower2@borrowhub.test` |

The seed also creates one overdue demo loan: the Epson projector (`PRJ-001`), checked out to Riley Borrower. It is created once, and only if the projector is free, so running the seed again never disturbs real activity.
