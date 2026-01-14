# FinanceTracker (Chat-First Expense Tracker)

This project implements the attached plan: Next.js (Vercel) + Supabase (Auth + Postgres) + optional OpenAI categorization, with **double-entry** and **integer cents** storage.

## 1) Supabase setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run:
   - `supabase/schema.sql`
3. In Authentication:
   - Enable Email auth (default).

## 2) Environment variables

Create `.env.local` in the project root (not committed):

- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...` (server-only)
- `OPENAI_API_KEY=...` (server-only, optional until AI todo)

## 3) Run locally

You run the dev server from your terminal when you’re ready.

