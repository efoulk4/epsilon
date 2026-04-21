# Shopify Embedded App Setup

This document explains how to set up and configure the Shopify Accessibility Auditor as an embedded Shopify app.

## Prerequisites

1. A Shopify Partner account
2. A Shopify development store (or production store)
3. Supabase project with the required database tables
4. OpenAI API key (for AI alt text generation)

## 1. Create a Shopify App

1. Go to your Shopify Partners dashboard
2. Navigate to Apps → Create app → Create app manually
3. Fill in app details:
   - App name: Accessibility Auditor
   - App URL: `https://your-app-url.com`
   - Allowed redirection URL(s): `https://your-app-url.com/api/auth/shopify/callback`

4. Under Configuration → App setup:
   - Embedded app: Yes
   - App Bridge version: Latest

## 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
# Shopify App Configuration
SHOPIFY_API_KEY=your_shopify_api_key_from_partners_dashboard
SHOPIFY_API_SECRET=your_shopify_api_secret_from_partners_dashboard
SHOPIFY_SCOPES=read_products,write_products
SHOPIFY_APP_URL=https://your-app-url.com
NEXT_PUBLIC_SHOPIFY_API_KEY=your_shopify_api_key_from_partners_dashboard

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

## 3. Database Setup

Run the Supabase migrations to create the required tables:

```bash
# If using Supabase CLI
supabase migration up

# Or manually run the SQL in your Supabase dashboard:
# - supabase/migrations/001_audits.sql
# - supabase/migrations/002_shopify_sessions.sql
```

## 4. Deploy Your App

Deploy to a hosting provider that supports Next.js (Vercel, Railway, etc.):

```bash
# Example with Vercel
vercel --prod
```

Make sure to set all environment variables in your hosting provider's dashboard.

## 5. Install the App

1. In your Shopify Partners dashboard, go to your app → Test your app
2. Select your development store
3. Click "Install app"
4. You'll be redirected through the OAuth flow
5. Once installed, the app will be embedded in your Shopify admin

## How It Works

### Authentication Flow

1. User clicks "Install" in Shopify Partners or the app listing
2. Redirected to `/api/auth/shopify/install?shop=yourstore.myshopify.com`
3. Server generates OAuth URL and redirects to Shopify
4. User approves permissions
5. Shopify redirects to `/api/auth/shopify/callback` with auth code
6. Server exchanges code for access token
7. Access token is stored in Supabase `shopify_sessions` table
8. User redirected to app homepage with `shop` and `host` params

### App Bridge Integration

- `AppBridgeProvider` wraps the entire app (in `layout.tsx`)
- Extracts `host` and `shop` from URL parameters
- Initializes Shopify App Bridge for embedded app features
- Stores shop info in session storage for navigation

### Running Audits

Two modes available:

1. **Standard Mode** (current): Enter any URL to audit
   - Uses `runAccessibilityAudit(url)`

2. **Shopify-Authenticated Mode** (new): Audit the authenticated shop's storefront
   - Uses `runAccessibilityAuditForShop(shop)`
   - Fetches shop's online store URL via Shopify Admin API GraphQL
   - Automatically audits the correct storefront

## API Routes

- `GET /api/auth/shopify/install` - Initiates OAuth flow
- `GET /api/auth/shopify/callback` - OAuth callback handler

## Server Actions

- `runAccessibilityAudit(url)` - Audit any URL
- `runAccessibilityAuditForShop(shop)` - Audit authenticated shop's storefront
- `saveAuditToDatabase(result)` - Save audit results to Supabase
- `getAuditHistory(url, days)` - Fetch audit history for a URL

## Utilities

- `getShopifyGraphQLClient(shop)` - Get authenticated GraphQL client
- `getShopifyRestClient(shop)` - Get authenticated REST client
- `getShopOnlineStoreUrl(shop)` - Fetch shop's storefront URL
- `getShopifySession(shop)` - Retrieve session from database
- `saveShopifySession(session)` - Store session in database

## Development

```bash
npm run dev
```

Visit `http://localhost:3001` to test locally.

To test the embedded app flow, you'll need to use ngrok or a similar tunnel:

```bash
ngrok http 3001
```

Then update your Shopify app URLs to the ngrok URL.

## Security Notes

- OAuth tokens are stored securely in Supabase with RLS policies
- Service role key is required for server-side token access
- Never expose `SHOPIFY_API_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` to the client
- App uses offline access tokens for persistent API access
