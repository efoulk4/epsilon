# Supabase Setup Guide

This guide will help you set up Supabase for the Accessibility Auditor app.

## Prerequisites

- A Supabase account (free tier works fine)
- Access to your Supabase project dashboard

## Step 1: Create a Supabase Project

1. Go to [Supabase](https://supabase.com)
2. Sign in or create a new account
3. Click "New Project"
4. Enter your project details and create the project

## Step 2: Run the Database Migration

1. Navigate to the SQL Editor in your Supabase dashboard
2. Copy the contents of `supabase/migrations/001_create_audits_table.sql`
3. Paste it into the SQL Editor
4. Click "Run" to execute the migration

This will create the `audits` table with the following schema:

- `id` (UUID, primary key)
- `url` (TEXT) - The audited URL
- `timestamp` (TIMESTAMPTZ) - When the audit was performed
- `total_violations` (INTEGER) - Total number of violations found
- `violations_by_impact` (JSONB) - Breakdown by severity (critical, serious, moderate, minor)
- `health_score` (INTEGER) - Calculated health score (0-100)
- `violations` (JSONB) - Full violation details
- `created_at` (TIMESTAMPTZ) - When the record was created

## Step 3: Get Your API Credentials

1. In your Supabase dashboard, go to Project Settings → API
2. Find your **Project URL** and **anon/public** key
3. Copy these values

## Step 4: Update Environment Variables

1. Open `.env.local` in your project root
2. Replace the placeholder values:

```env
NEXT_PUBLIC_SUPABASE_URL=your_actual_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key
```

## Step 5: Restart the Development Server

```bash
npm run dev
```

## Verification

To verify everything is working:

1. Run an accessibility audit on any URL
2. Check your Supabase dashboard → Table Editor → `audits` table
3. You should see a new row with the audit results
4. Switch to the "History" tab in the app
5. Enter the same URL and click "View History"
6. You should see your audit history with the health score chart

## Troubleshooting

### "Missing Supabase environment variables" error

- Make sure you've updated `.env.local` with your actual credentials
- Restart the dev server after updating environment variables

### No data showing in History tab

- Make sure you've run at least one audit for the URL
- Check that the audit was saved successfully (check browser console for errors)
- Verify the data exists in your Supabase table

### Database connection errors

- Verify your API URL and key are correct
- Check that Row Level Security (RLS) policies are set up correctly
- Make sure your Supabase project is active and not paused

## Security Note

The default RLS policy allows all operations for development purposes. For production, you should:

1. Implement proper authentication
2. Update RLS policies to restrict access based on authenticated users
3. Consider adding user_id columns to track audit ownership
