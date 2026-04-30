export const metadata = {
  title: 'Pricing — Epsilon Accessibility Auditor',
}

export default function Pricing() {
  const contactEmail = 'evanfoulk4@gmail.com'

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.7, color: '#1a1a1a' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Pricing</h1>
      <p style={{ color: '#666', marginBottom: 40 }}>Simple, transparent pricing. No hidden fees. Cancel anytime through your Shopify admin.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 48 }}>
        <PlanCard
          name="Basic"
          price="$9"
          features={[
            'Monthly automated full audit',
            '1 manual audit per day',
            'Full violation reports',
            'AI-powered fix suggestions',
            'Compliance history log',
          ]}
        />
        <PlanCard
          name="Pro"
          price="$29"
          popular
          features={[
            'Weekly automated full audit',
            'Unlimited manual audits',
            'Full violation reports',
            'AI-powered fix suggestions',
            'Compliance history log',
            'Priority audit scheduling',
          ]}
        />
      </div>

      <Section title="Free trial">
        <p>All new installs include a free trial with full Pro access so you can evaluate the app before committing to a plan.</p>
      </Section>

      <Section title="Billing">
        <p>Subscriptions are billed monthly through the Shopify Billing API. You will be charged on your regular Shopify billing cycle. You can upgrade, downgrade, or cancel at any time from the Billing tab inside the app.</p>
      </Section>

      <Section title="Why ongoing audits matter">
        <p>Under ADA and WCAG guidelines, courts and regulators look at whether you have made a genuine, documented effort to improve accessibility over time. A timestamped history of regular audits and remediation attempts has been cited as evidence of good faith in multiple cases, leading to dismissed claims or reduced settlements even when violations were still present. Every audit you run extends that record.</p>
      </Section>

      <Section title="Questions?">
        <p>Email us at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
      </Section>
    </main>
  )
}

function PlanCard({ name, price, features, popular }: { name: string; price: string; features: string[]; popular?: boolean }) {
  return (
    <div style={{
      border: popular ? '2px solid #008060' : '1px solid #e5e5e5',
      borderRadius: 8,
      padding: 24,
      position: 'relative',
    }}>
      {popular && (
        <div style={{
          position: 'absolute',
          top: -12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#008060',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          padding: '2px 12px',
          borderRadius: 12,
        }}>
          Most Popular
        </div>
      )}
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{name}</h2>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 36, fontWeight: 700 }}>{price}</span>
        <span style={{ color: '#666', fontSize: 14 }}> / month</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 14 }}>
            <span style={{ color: '#008060', fontWeight: 700 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, borderBottom: '1px solid #e5e5e5', paddingBottom: 8 }}>
        {title}
      </h2>
      {children}
    </section>
  )
}
