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
  Box,
} from '@shopify/polaris'
import { fixProductContentWithAI, applyProductContent } from '../actions/fixProductContent'
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

const LABELS: Record<FixType, { title: string; fieldLabel: string; maxChars: number; multiline: boolean; hint: string }> = {
  'seo-title': {
    title: 'Fix SEO Title',
    fieldLabel: 'SEO Title',
    maxChars: 60,
    multiline: false,
    hint: 'Shown as the blue link in Google search results. Be specific — include the product name and a key attribute.',
  },
  'seo-description': {
    title: 'Fix SEO Description',
    fieldLabel: 'SEO Description',
    maxChars: 160,
    multiline: true,
    hint: 'Shown below the title in search results. Summarize what the product is and its key benefit in 1–2 sentences.',
  },
  'product-title': {
    title: 'Fix Product Title',
    fieldLabel: 'Product Title',
    maxChars: 60,
    multiline: false,
    hint: 'Shown on the product page and in search. Use the format: Material + Item + Variant (e.g. "Merino Wool Running Socks").',
  },
  'product-description': {
    title: 'Fix Product Description',
    fieldLabel: 'Product Description',
    maxChars: 500,
    multiline: true,
    hint: '2–4 sentences in plain language. Describe what it is, key features, and who it\'s for. Avoid HTML or jargon.',
  },
}

const isSeoField = (fixType: FixType) => fixType === 'seo-title' || fixType === 'seo-description'

function GoogleSearchPreview({ seoTitle, seoDescription, handle }: { seoTitle: string; seoDescription: string; handle: string }) {
  const displayUrl = `yourstore.com/products/${handle}`
  return (
    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
      <BlockStack gap="050">
        <Text as="p" variant="bodySm" tone="subdued">Google Search Preview</Text>
        <Text as="p" variant="bodySm" tone="subdued">{displayUrl}</Text>
        <Text as="p" variant="bodyMd" tone="magic-subdued">
          {seoTitle || <em>No SEO title set</em>}
        </Text>
        <Text as="p" variant="bodySm">
          {seoDescription || <em>No SEO description set</em>}
        </Text>
      </BlockStack>
    </Box>
  )
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
  const overLimit = content.length > label.maxChars

  const ctx = { productId, productHandle, productTitle, description, seoTitle, seoDescription, fixType }

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const idToken = await getIdToken()
      const result = await fixProductContentWithAI(ctx, idToken)
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
      const result = await applyProductContent(ctx, content, idToken)
      if (result.success) {
        setApplied(true)
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

  const previewSeoTitle = fixType === 'seo-title' ? content : seoTitle
  const previewSeoDescription = fixType === 'seo-description' ? content : seoDescription

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

          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              Product: <strong>{productTitle}</strong>
            </Text>
            {currentValue && (
              <Text as="p" variant="bodySm" tone="subdued">
                Current: <em>&quot;{currentValue}&quot;</em>
              </Text>
            )}
            <Text as="p" variant="bodySm" tone="subdued">{label.hint}</Text>
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
              placeholder={`Click 'Generate with AI' or type manually`}
              multiline={label.multiline ? 4 : undefined}
              autoComplete="off"
              helpText={
                <Text as="span" variant="bodySm" tone={overLimit ? 'critical' : 'subdued'}>
                  {content.length} / {label.maxChars} characters{overLimit ? ' — too long' : ''}
                </Text>
              }
              disabled={applied}
              error={overLimit ? `Shorten to ${label.maxChars} characters or fewer` : undefined}
            />
          </BlockStack>

          {isSeoField(fixType) && content && (
            <GoogleSearchPreview
              seoTitle={previewSeoTitle}
              seoDescription={previewSeoDescription}
              handle={productHandle}
            />
          )}

          {content && !applied && (
            <InlineStack align="end">
              <Button
                variant="primary"
                tone="success"
                onClick={handleApply}
                loading={applying}
                disabled={applying || !content.trim() || overLimit}
              >
                {applying ? 'Applying...' : 'Apply to Store'}
              </Button>
            </InlineStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  )
}
