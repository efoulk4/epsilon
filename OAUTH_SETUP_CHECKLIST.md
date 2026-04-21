# OAuth Setup Checklist

## Prerequisites
- [ ] Shopify Partner account created
- [ ] Development store created
- [ ] Supabase project set up
- [ ] ngrok installed

## Setup Steps

### 1. Local Development Setup
- [ ] Install ngrok: `brew install ngrok/ngrok/ngrok`
- [ ] Sign up at https://dashboard.ngrok.com/signup
- [ ] Get auth token from ngrok dashboard
- [ ] Authenticate ngrok: `ngrok config add-authtoken YOUR_TOKEN`
- [ ] Start ngrok: `ngrok http 3001`
- [ ] Note your ngrok URL (e.g., `https://abc123.ngrok.io`)

### 2. Shopify App Configuration
- [ ] Go to Shopify Partners dashboard
- [ ] Create new app (Apps → Create app → Create app manually)
- [ ] Set App URL to your ngrok URL
- [ ] Add redirect URL: `https://your-ngrok-url.ngrok.io/api/auth/shopify/callback`
- [ ] Enable embedded app in Configuration
- [ ] Set App Bridge to latest version
- [ ] Add required scopes (start with `read_products`)
- [ ] Copy Client ID (API Key)
- [ ] Copy Client Secret (API Secret)

### 3. Environment Variables
- [ ] Copy `.env.example` to `.env.local`
- [ ] Set `SHOPIFY_API_KEY` to Client ID
- [ ] Set `SHOPIFY_API_SECRET` to Client Secret
- [ ] Set `SHOPIFY_SCOPES` (e.g., `read_products,write_products`)
- [ ] Set `SHOPIFY_APP_URL` to ngrok URL
- [ ] Set `NEXT_PUBLIC_SHOPIFY_API_KEY` to Client ID
- [ ] Configure Supabase credentials
- [ ] Configure OpenAI API key (if needed)

### 4. Database Setup
- [ ] Run migration: `001_create_audits_table.sql`
- [ ] Run migration: `002_shopify_sessions.sql`
- [ ] Verify tables exist in Supabase dashboard

### 5. Testing
- [ ] Start dev server: `npm run dev`
- [ ] ngrok tunnel is running and pointing to port 3001
- [ ] Install app on development store
- [ ] Complete OAuth flow
- [ ] Verify session stored in Supabase
- [ ] Test "Audit My Store" button
- [ ] Test manual URL audit

## Troubleshooting

### OAuth errors
- Check that redirect URL exactly matches in Shopify Partners
- Verify API credentials are correct in `.env.local`
- Ensure ngrok URL is HTTPS

### Session not saving
- Check Supabase credentials
- Verify `shopify_sessions` table exists
- Check server logs for errors

### App not loading
- Verify dev server is running on port 3001
- Check ngrok tunnel is active
- Ensure App Bridge is configured correctly

## Common Commands

```bash
# Start dev server
npm run dev

# Start ngrok tunnel
ngrok http 3001

# Check environment variables
cat .env.local

# View Supabase migrations
ls supabase/migrations/
```

## URLs to Keep Handy

- Shopify Partners: https://partners.shopify.com/
- ngrok Dashboard: https://dashboard.ngrok.com/
- Supabase Dashboard: https://app.supabase.com/
- Your Development Store: https://yourstore.myshopify.com/admin
