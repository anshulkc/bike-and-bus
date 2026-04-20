import type { CardLayout, Theme } from '../lib/prefs'

type Props = {
  theme: Theme
  setTheme: (t: Theme) => void
  layout: CardLayout
  setLayout: (l: CardLayout) => void
}

export function SettingsSheet({ theme, setTheme, layout, setLayout }: Props) {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: 14,
        borderRadius: 14,
        background: 'var(--bb-surface)',
        border: '1px solid var(--bb-line)',
      }}
    >
      <Section label="Appearance">
        <div style={{ display: 'flex', gap: 8 }}>
          <PresetButton
            selected={theme === 'mono'}
            onClick={() => setTheme('mono')}
            title="Light"
            swatchBg="#FAFAFA"
            swatchFg="#09090B"
          />
          <PresetButton
            selected={theme === 'ink'}
            onClick={() => setTheme('ink')}
            title="Dark"
            swatchBg="#0B0D10"
            swatchFg="#7DE2A4"
          />
        </div>
      </Section>

      <div style={{ height: 14 }} />

      <Section label="Results layout">
        <div style={{ display: 'flex', gap: 8 }}>
          <BigPreset
            selected={layout === 'detailed'}
            onClick={() => setLayout('detailed')}
            title="Detailed"
            sub="dots timeline"
          />
          <BigPreset
            selected={layout === 'compact'}
            onClick={() => setLayout('compact')}
            title="Compact"
            sub="dense row"
          />
        </div>
      </Section>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          fontSize: 10,
          color: 'var(--bb-mut)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </>
  )
}

function PresetButton({
  selected,
  onClick,
  title,
  swatchBg,
  swatchFg,
}: {
  selected: boolean
  onClick: () => void
  title: string
  swatchBg: string
  swatchFg: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 12px',
        borderRadius: 10,
        background: selected ? 'var(--bb-fg)' : 'var(--bb-bg)',
        color: selected ? 'var(--bb-bg)' : 'var(--bb-fg)',
        border: `1px solid ${selected ? 'var(--bb-fg)' : 'var(--bb-line)'}`,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <span style={{ display: 'inline-flex', gap: 2 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: swatchBg, border: '1px solid rgba(0,0,0,0.15)' }} />
        <span style={{ width: 10, height: 10, borderRadius: 999, background: swatchFg }} />
      </span>
      {title}
    </button>
  )
}

function BigPreset({
  selected,
  onClick,
  title,
  sub,
}: {
  selected: boolean
  onClick: () => void
  title: string
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 12px',
        borderRadius: 10,
        textAlign: 'left',
        background: selected ? 'var(--bb-fg)' : 'var(--bb-bg)',
        color: selected ? 'var(--bb-bg)' : 'var(--bb-fg)',
        border: `1px solid ${selected ? 'var(--bb-fg)' : 'var(--bb-line)'}`,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{sub}</div>
    </button>
  )
}
