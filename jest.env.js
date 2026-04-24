// Runs before any module imports — must use require(), not import
const crypto = require('crypto')
const { config } = require('dotenv')

// Load .env.test first
config({ path: '.env.test' })

// Ensure ENCRYPTION_KEY is set before any module that checks it at load time
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
}

process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test_api_key'
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test_api_secret'
process.env.SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL || 'https://test.example.com'
