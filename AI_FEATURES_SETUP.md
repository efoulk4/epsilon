# AI-Powered Alt Text Fix Setup Guide

This guide explains how to set up the AI-powered alt text generation feature using Google Gemini.

## Features

- **Automatic Alt Text Generation**: Uses Google Gemini Vision AI to analyze images and generate descriptive alt text
- **Fix Now Button**: Appears on image-alt violations, allowing one-click fixes
- **Manual Editing**: Edit AI-generated suggestions before saving
- **Shopify Integration**: Save alt text directly back to Shopify (optional)

## Prerequisites

- A Google Cloud account with Gemini API access
- (Optional) Shopify store with API access for saving alt text

## Step 1: Get a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Get API Key" or "Create API Key"
3. Copy your API key

## Step 2: Configure Environment Variables

Open `.env.local` and add your Gemini API key:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

## Step 3: (Optional) Set Up Shopify Integration

To enable saving alt text back to Shopify, you need:

### 3.1 Create a Shopify Private App

1. In your Shopify admin, go to **Apps** → **App and sales channel settings**
2. Click **Develop apps** → **Create an app**
3. Name your app (e.g., "Accessibility Auditor")
4. Click **Configure Admin API scopes**
5. Enable these scopes:
   - `read_products`
   - `write_products`
6. Click **Save**, then **Install app**
7. Copy your **Admin API access token**

### 3.2 Add Shopify Credentials to .env.local

```env
SHOPIFY_ACCESS_TOKEN=shpat_your_access_token_here
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
```

## Step 4: Restart the Development Server

```bash
npm run dev
```

## How to Use

1. **Run an accessibility audit** on any website
2. **Look for image-alt violations** in the results
3. **Click "Fix Now with AI"** on any image missing alt text
4. **Review the AI-generated alt text** in the modal
5. **Edit if needed**, then click **"Save to Shopify"** (requires Shopify setup)

## Features Overview

### AI Alt Text Generation

The Gemini Vision API:
- Analyzes the visual content of images
- Generates concise, descriptive alt text (under 125 characters recommended)
- Provides context-aware descriptions
- Follows accessibility best practices

### Manual Override

You can:
- Edit the AI-generated alt text before saving
- Write your own alt text from scratch
- See character count in real-time

### Shopify Integration

When configured:
- Saves alt text directly to your Shopify product images
- Updates the image metadata via Shopify Admin API
- Provides success/error feedback

## Cost Information

### Google Gemini API

- **Free tier**: 15 requests per minute, 1,500 requests per day
- **Pricing**: Very low cost per image analysis (check current Google AI pricing)
- **Model used**: `gemini-1.5-flash` (optimized for speed and cost)

### Shopify API

- No additional cost for API requests
- Requires a Shopify plan with API access (all paid plans)

## Troubleshooting

### "Gemini API key not configured" error

- Make sure you've added `GEMINI_API_KEY` to `.env.local`
- Restart the dev server after adding the key
- Verify the key is correct and has proper permissions

### "Failed to fetch image from URL"

- The image URL must be publicly accessible
- Some images may be blocked by CORS policies
- Try with a different image or website

### "Shopify API not configured" error

- This is expected if you haven't set up Shopify integration
- The AI alt text generation still works without Shopify
- You can manually copy the generated alt text and update Shopify yourself

### Image not detected

- Make sure the violation is for `image-alt` (not other image-related rules)
- The image must have a valid `src` attribute in the HTML
- Check the browser console for more details

## Security Notes

- **Never commit API keys** to version control
- `.env.local` is in `.gitignore` by default
- API keys are only used server-side (not exposed to the browser)
- Consider using environment-specific keys for production

## Limitations

- Only works for publicly accessible images
- Requires a valid Gemini API key for AI generation
- Shopify integration requires proper API credentials
- Some image formats may not be supported by Gemini
- Rate limits apply based on your Gemini API tier

## Future Enhancements

Potential improvements:
- Batch processing multiple images at once
- Custom alt text templates or guidelines
- Multi-language support
- Integration with other CMS platforms
- Historical tracking of alt text changes
