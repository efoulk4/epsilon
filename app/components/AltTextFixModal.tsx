'use client'

import { useState } from 'react'
import {
  Modal,
  BlockStack,
  Text,
  TextField,
  Button,
  InlineStack,
  Banner,
  Spinner,
} from '@shopify/polaris'
import { generateAltText, saveAltTextToShopify } from '../actions/altText'

interface AltTextFixModalProps {
  open: boolean
  onClose: () => void
  imageUrl: string
  imageHtml: string
}

export function AltTextFixModal({
  open,
  onClose,
  imageUrl,
  imageHtml,
}: AltTextFixModalProps) {
  const [altText, setAltText] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleGenerateAltText = async () => {
    setGenerating(true)
    setError(null)

    try {
      const result = await generateAltText(imageUrl)

      if (result.success && result.altText) {
        setAltText(result.altText)
      } else {
        setError(result.error || 'Failed to generate alt text')
      }
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveToShopify = async () => {
    if (!altText.trim()) {
      setError('Please enter or generate alt text first')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Extract image ID from HTML (this is a simplified example)
      const imageIdMatch = imageHtml.match(/data-image-id="(\d+)"/)
      const imageId = imageIdMatch ? imageIdMatch[1] : ''

      if (!imageId) {
        setError('Could not find image ID. This feature requires Shopify integration.')
        setLoading(false)
        return
      }

      const result = await saveAltTextToShopify(imageId, altText)

      if (result.success) {
        setSuccess(true)
        setTimeout(() => {
          onClose()
          setSuccess(false)
          setAltText('')
        }, 2000)
      } else {
        setError(result.error || 'Failed to save alt text to Shopify')
      }
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fix Missing Alt Text"
      primaryAction={{
        content: 'Save to Shopify',
        onAction: handleSaveToShopify,
        loading,
        disabled: !altText.trim() || success,
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error && (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          )}

          {success && (
            <Banner tone="success">
              Alt text saved successfully!
            </Banner>
          )}

          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Image Preview
            </Text>
            <div
              style={{
                border: '1px solid #e1e3e5',
                borderRadius: '8px',
                padding: '12px',
                maxHeight: '200px',
                overflow: 'hidden',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: '#f6f6f7',
              }}
            >
              <img
                src={imageUrl}
                alt="Preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '180px',
                  objectFit: 'contain',
                }}
              />
            </div>
          </BlockStack>

          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">
                Alt Text
              </Text>
              <Button
                onClick={handleGenerateAltText}
                loading={generating}
                disabled={generating}
              >
                {generating ? 'Generating...' : 'Generate with AI'}
              </Button>
            </InlineStack>

            <TextField
              label=""
              value={altText}
              onChange={setAltText}
              placeholder="Enter alt text or click 'Generate with AI'"
              multiline={3}
              autoComplete="off"
              helpText="Describe the image concisely for screen readers (under 125 characters recommended)"
            />

            <Text as="p" variant="bodySm" tone="subdued">
              Character count: {altText.length}
            </Text>
          </BlockStack>

          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Original HTML
            </Text>
            <div
              style={{
                backgroundColor: '#f6f6f7',
                padding: '12px',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '12px',
                wordBreak: 'break-all',
                maxHeight: '100px',
                overflow: 'auto',
              }}
            >
              {imageHtml}
            </div>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  )
}
