import '@testing-library/jest-dom'
import crypto from 'crypto'
import { config } from 'dotenv'

// Load test environment variables
config({ path: '.env.test' })

// Set ENCRYPTION_KEY if not set (generate a test key)
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
}

// Ensure other required env vars are set for tests
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test_api_key'
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test_api_secret'
process.env.SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL || 'https://test.example.com'
