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
  Badge,
} from '@shopify/polaris'
import { fixProductContentWithAI } from '../actions/fixProductContent'
import { useIdToken } from '../hooks/useIdToken'

type FixType = 'seo-title' | 'seo-description' | 'product-title' | 'product-description'

interface ProductContentFixModalProps {
  open: boolean
  onClose: () => void
  fixType: FixType
  productId: string
  productHandle: string
  productTitle: string
  currentValue: string
  description: string
  seoTitle: string
  seoDescription: string
}

const LABELS: Record<FixType, { title: string; fieldLabel: string; maxChars: number; multiline: boolean }> = {
  'seo-title': {
    title: 'Fix SEO Title',
    fieldLabel: 'SEO Title',
    maxChars: 60,
    multiline: false,
  },
  'seo-description': {
    title: 'Fix SEO Description',
    fieldLabel: 'SEO Description',
    maxChars: 160,
    multiline: true,
  },
  'product-title': {
    title: 'Fix Product Title',
    fieldLabel: 'Product Title',
    maxChars: 60,
    multiline: false,
  },
  'product-description': {
    title: 'Fix Product Description',
    fieldLabel: 'Product Description',
    maxChars: 500,
    multiline: true,
  },
}

export function ProductContentFixModal({
  open,
  onClose,
  fixType,
  productId,
  productHandle,
  productTitle,
  currentValue,
  description,
  seoTitle,
  seoDescription,
}: ProductContentFixModalProps) {
  const getIdToken = useIdToken()
  const [content, setContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = LABELS[fixType]

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const idToken = await getIdToken()
      const result = await fixProductContentWithAI(
        { productId, productHandle, productTitle, description, seoTitle, seoDescription, fixType },
        idToken
      )
      if (result.success && result.generatedContent) {
        setContent(result.generatedContent)
      } else {
        setError(result.error || 'Failed to generate content')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setGenerating(false)
    }
  }

  const handleApply = async () => {
    if (!content.trim()) return
    setApplying(true)
    setError(null)
    try {
      const idToken = await getIdToken()
      const result = await fixProductContentWithAI(
        { productId, productHandle, productTitle, description, seoTitle, seoDescription, fixType, applyDirectly: true },
        idToken
      )
      if (result.success) {
        setApplied(true)
        // Update local content to what was actually applied
        if (result.generatedContent) setContent(result.generatedContent)
      } else {
        setError(result.error || 'Failed to apply fix')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setApplying(false)
    }
  }

  const handleClose = () => {
    setContent('')
    setError(null)
    setApplied(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={label.title}
      secondaryActions={[{ content: 'Close', onAction: handleClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error && (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          )}

          {applied && (
            <Banner tone="success">
              Fix applied to your store successfully.
            </Banner>
          )}

          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">
              Product: <strong>{productTitle}</strong>
            </Text>
            {currentValue && (
              <Text as="p" variant="bodySm" tone="subdued">
                Current value: <em>&quot;{currentValue}&quot;</em>
              </Text>
            )}
          </BlockStack>

          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">{label.fieldLabel}</Text>
              <Button onClick={handleGenerate} loading={generating} disabled={generating || applied}>
                {generating ? 'Generating...' : 'Generate with AI'}
              </Button>
            </InlineStack>

            <TextField
              label=""
              value={content}
              onChange={setContent}
              placeholder={`Click 'Generate with AI' or enter ${label.fieldLabel.toLowerCase()} manually`}
              multiline={label.multiline ? 4 : undefined}
              autoComplete="off"
              helpText={`${content.length} / ${label.maxChars} characters recommended`}
              disabled={applied}
            />
          </BlockStack>

          {content && !applied && (
            <InlineStack align="end">
              <Button
                variant="primary"
                tone="success"
                onClick={handleApply}
                loading={applying}
                disabled={applying || !content.trim()}
              >
                {applying ? 'Applying...' : 'Apply to Store'}
              </Button>
            </InlineStack>
          )}

          {content.length > label.maxChars && (
            <Banner tone="warning">
              <Text as="p" variant="bodySm">
                Content exceeds recommended {label.maxChars} characters. Consider shortening it.
              </Text>
            </Banner>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  )
}
