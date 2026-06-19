# Full-Stack OpenRouter Chatbot

React + TypeScript frontend, Express + TypeScript backend, PostgreSQL storage, and OpenRouter chat completions.

## Setup

1. Create a PostgreSQL database. For local development, you can use:

```bash
docker compose up -d postgres
```

2. Run the schema:

```bash
psql "$DATABASE_URL" -f backend/db/schema.sql
```

3. Configure backend environment:

```bash
cp backend/.env.example backend/.env
```

4. Configure frontend environment if needed:

```bash
cp frontend/.env.example frontend/.env
```

5. Install and run:

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:3001`
