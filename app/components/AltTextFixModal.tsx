'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  Modal,
  BlockStack,
  Text,
  TextField,
  Button,
  InlineStack,
  Banner,
} from '@shopify/polaris'
import { generateAltText } from '../actions/altText'
import { useIdToken } from '../hooks/useIdToken'

interface AltTextFixModalProps {
  open: boolean
  onClose: () => void
  imageUrl: string
  imageHtml: string
  currentAlt?: string
}

export function AltTextFixModal({
  open,
  onClose,
  imageUrl,
  imageHtml,
  currentAlt,
}: AltTextFixModalProps) {
  const getIdToken = useIdToken()
  const [altText, setAltText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerateAltText = async () => {
    setGenerating(true)
    setError(null)

    try {
      const idToken = await getIdToken()
      const result = await generateAltText(imageUrl, idToken)

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

  const handleClose = () => {
    setAltText('')
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Generate Alt Text"
      secondaryActions={[
        {
          content: 'Close',
          onAction: handleClose,
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
              <Image
                src={imageUrl}
                alt="Preview"
                width={400}
                height={180}
                unoptimized
                style={{
                  maxWidth: '100%',
                  maxHeight: '180px',
                  objectFit: 'contain',
                  width: 'auto',
                  height: 'auto',
                }}
              />
            </div>
          </BlockStack>

          {currentAlt && (
            <Banner tone="warning">
              <Text as="p" variant="bodyMd">
                Current alt text: <strong>&quot;{currentAlt}&quot;</strong> — this is too generic for screen readers.
              </Text>
            </Banner>
          )}

          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">
                Suggested Alt Text
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
              placeholder="Click 'Generate with AI' or enter alt text manually"
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
