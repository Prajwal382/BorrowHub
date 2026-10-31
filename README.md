# BorrowHub

Equipment lending and return management for one department or student organization.

## Getting started

Requires Node.js 22 and Docker Desktop.

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

Then open http://localhost:3000.
