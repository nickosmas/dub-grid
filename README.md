# DubGrid

Multi-tenant staff scheduling for care facilities.

## Tech Stack

- [Next.js](https://nextjs.org) (App Router)
- TypeScript
- [Supabase](https://supabase.com) (database + auth)
- Tailwind CSS
- [Vitest](https://vitest.dev) (testing)

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy the environment variables file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

3. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
src/
├── app/          # Next.js App Router pages and layouts
├── components/   # Shared UI components
└── __tests__/    # Test files
supabase/
├── schema.sql    # Database schema
└── super_admin_seed.sql
```

## Running Tests

```bash
npm test
```
