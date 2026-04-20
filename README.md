# Accessibility Auditor - Zero-Footprint WCAG Checker

A modern, server-side accessibility auditing tool built specifically for Shopify stores and web applications. This tool performs WCAG 2.1 Level A/AA compliance checks without relying on slow JavaScript overlays.

## Features

- **Server-Side Auditing**: Uses Playwright and Axe-core to perform audits on the server, avoiding client-side performance impact
- **Zero-Footprint**: No JavaScript overlays or widgets injected into your site
- **WCAG 2.1 Compliance**: Checks for WCAG 2.1 Level A and AA violations
- **Detailed Reports**: Provides comprehensive violation details with actionable recommendations
- **Impact-Based Categorization**: Violations sorted by impact (Critical, Serious, Moderate, Minor)
- **Modern UI**: Polaris-inspired interface built with Tailwind CSS
- **Shopify Ready**: Designed for Shopify embedded apps (Polaris UI components)

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + Lucide Icons
- **Logic Engine**: Playwright (Chromium) + @axe-core/playwright
- **Backend**: Supabase (Auth & Audit Logs) - *Placeholder for future implementation*
- **UI Inspiration**: Shopify Polaris

## Prerequisites

- Node.js 18+ or Node.js 20+
- npm or yarn or pnpm

## Installation

### 1. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Next.js 15
- React 19
- Playwright
- @axe-core/playwright
- Tailwind CSS
- Lucide React (icons)
- Shopify Polaris
- Supabase client (for future integration)

### 2. Install Playwright Browsers

The `postinstall` script will automatically install Chromium, but you can also run:

```bash
npx playwright install chromium
```

### 3. Environment Setup

Copy the `.env.local` file and update with your Supabase credentials (when ready):

```bash
# .env.local is already created with placeholders
# Update these values when you're ready to integrate Supabase:
# NEXT_PUBLIC_SUPABASE_URL=your_actual_supabase_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_supabase_anon_key
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
epsilon/
├── app/
│   ├── actions/
│   │   └── audit.ts          # Server Action for accessibility audits
│   ├── globals.css           # Global styles with Tailwind
│   ├── layout.tsx            # Root layout component
│   └── page.tsx              # Main dashboard page
├── types/
│   └── audit.ts              # TypeScript types for audit results
├── .env.local                # Environment variables (Supabase config)
├── .gitignore
├── next.config.js            # Next.js configuration
├── package.json
├── postcss.config.js
├── tailwind.config.ts        # Tailwind with Polaris color palette
├── tsconfig.json
└── README.md
```

## Usage

1. **Enter a URL**: Type any publicly accessible URL into the input field
2. **Run Audit**: Click the "Run Audit" button to start the scan
3. **View Results**: See a comprehensive breakdown of:
   - Total violations
   - Violations by impact level (Critical, Serious, Moderate, Minor)
   - Detailed violation information with:
     - Description and remediation advice
     - Affected HTML elements
     - CSS selectors for each violation
     - Links to WCAG documentation

## How It Works

### Server Action (`app/actions/audit.ts`)

1. **Browser Launch**: Spins up a headless Chromium browser using Playwright
2. **Navigation**: Navigates to the user-provided URL
3. **Axe Injection**: Injects the Axe-core accessibility testing engine
4. **Scan Execution**: Runs a comprehensive scan targeting WCAG 2.1 Level A/AA rules
5. **Result Processing**: Transforms violations into a structured format
6. **Cleanup**: Closes the browser to prevent memory leaks

### Frontend Dashboard (`app/page.tsx`)

- **URL Input**: Accepts any valid HTTP/HTTPS URL
- **Loading State**: Shows progress during the audit
- **Results Display**:
  - Summary cards with violation counts by impact
  - Detailed violation cards with code snippets
  - Links to WCAG documentation for each issue
- **Error Handling**: Graceful error messages for failed audits

## Future Enhancements

- [ ] Supabase integration for audit history
- [ ] User authentication and authorization
- [ ] Scheduled automated audits
- [ ] Email notifications for new violations
- [ ] Export reports as PDF
- [ ] Multi-page site crawling
- [ ] Comparison of audits over time
- [ ] Shopify app embedding

## API Reference

### Server Actions

#### `runAccessibilityAudit(url: string)`

Performs an accessibility audit on the provided URL.

**Parameters:**
- `url` (string): The URL to audit (must be publicly accessible)

**Returns:**
- `AuditResult`: Complete audit report with violations
- `AuditError`: Error object if the audit fails

#### `saveAuditToDatabase(auditResult: AuditResult)`

*Placeholder function for future Supabase integration*

**Parameters:**
- `auditResult` (AuditResult): The audit result to save

**Returns:**
- `{ success: boolean; id?: string }`: Success status and optional record ID

## Development

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Lint Code

```bash
npm run lint
```

## Important Notes

### Memory Management

The audit tool automatically closes the Playwright browser after each scan to prevent memory leaks. This is critical for production deployments.

### Rate Limiting

Consider implementing rate limiting in production to prevent abuse, as each audit spawns a headless browser instance.

### Timeout Configuration

The default navigation timeout is 30 seconds. Adjust in `app/actions/audit.ts:35` if needed:

```typescript
await page.goto(url, {
  waitUntil: 'networkidle',
  timeout: 30000, // Adjust this value
})
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables (Supabase credentials when ready)
4. Deploy

**Note**: Vercel's serverless functions have a 10-second timeout on the Hobby plan. Consider upgrading to Pro for longer execution times.

### Docker

A Dockerfile can be added for containerized deployments. Ensure Playwright dependencies are installed:

```dockerfile
RUN npx playwright install-deps chromium
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues or questions, please open an issue on GitHub.
