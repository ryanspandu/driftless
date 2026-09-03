import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { useWebsiteSettings, useUpdateWebsiteSettings } from '~/hooks/api/use-website-settings'
import { WEBSITE_SETTING_SECTIONS } from '~/types/api'
import { ColorPickerInput } from '~/puck/style-controls'
import { parseSavedColors, slugifyColorName, type SavedColor } from '~/puck/saved-colors'

/**
 * The site Appearance editor — default font + Primary/Secondary palette + named
 * saved colours (Webflow-style). Site-wide `web_settings` (section `theme`), saved
 * EXPLICITLY (not tied to page Publish). Shared by Website Settings → Appearance
 * and the page builder's Settings dialog so both stay identical.
 */

/** A curated set of Google Fonts (label → family + stylesheet href). */
const FONT_OPTIONS: { label: string; family: string; url: string }[] = [
  { label: 'System default', family: '', url: '' },
  {
    label: 'Inter',
    family: 'Inter',
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Roboto',
    family: 'Roboto',
    url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  },
  {
    label: 'Open Sans',
    family: 'Open Sans',
    url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Poppins',
    family: 'Poppins',
    url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Montserrat',
    family: 'Montserrat',
    url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Lato',
    family: 'Lato',
    url: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap',
  },
  {
    label: 'Playfair Display',
    family: 'Playfair Display',
    url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap',
  },
]

/** Read the CSRF token the app sets as a cookie, for the raw font upload fetch. */
function readXsrf(): string {
  const m = typeof document !== 'undefined' && document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return m ? decodeURIComponent(m[1]!) : ''
}

/** `rgb(r, g, b)` → `#rrggbb`. Empty string when it can't be parsed. */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return ''
  return (
    '#' +
    m
      .slice(0, 3)
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Read the real public-theme default colours (from the `.theme-light` scope) as
 * hex, so the preview shows what's actually in use rather than black.
 */
function readThemeDefaults(): { primary: string; secondary: string } {
  const fallback = { primary: '#5225e6', secondary: '#f1f5f9' }
  if (typeof document === 'undefined') return fallback
  const host = document.createElement('div')
  host.className = 'theme-light'
  host.setAttribute('style', 'position:absolute;opacity:0;pointer-events:none;left:-9999px')
  host.innerHTML = '<span></span><span></span>'
  const spans = host.querySelectorAll('span')
  ;(spans[0] as HTMLElement).style.color = 'var(--primary)'
  ;(spans[1] as HTMLElement).style.color = 'var(--secondary)'
  document.body.appendChild(host)
  const read = (el: Element) => rgbToHex(getComputedStyle(el).color)
  const out = {
    primary: read(spans[0]!) || fallback.primary,
    secondary: read(spans[1]!) || fallback.secondary,
  }
  document.body.removeChild(host)
  return out
}

/** A labelled colour picker (no swatch row) for the palette fields. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <ColorPickerInput value={value} onChange={onChange} />
    </div>
  )
}

/** One editable saved colour: a stable slug, a display name, a concrete value. */
type ColorRow = { id: string; slug: string; name: string; value: string }

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/** Assign stable slugs (kept for existing rows, generated + deduped for new). */
function serializeColors(rows: ColorRow[]): SavedColor[] {
  const used = new Set<string>()
  for (const r of rows) if (r.slug && r.value.trim()) used.add(r.slug)
  const out: SavedColor[] = []
  for (const r of rows) {
    const value = r.value.trim()
    if (!value) continue
    let slug = r.slug
    if (!slug) {
      const base = slugifyColorName(r.name) || 'color'
      slug = base
      let i = 2
      while (used.has(slug)) slug = `${base}-${i++}`
      used.add(slug)
    }
    out.push({ slug, name: r.name.trim() || slug, value })
  }
  return out
}

export function AppearancePanel() {
  const { data, isPending } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const theme = data?.sections?.[WEBSITE_SETTING_SECTIONS.THEME]

  const [fontUrl, setFontUrl] = useState('')
  const [fontFamily, setFontFamily] = useState('')
  const [fontFaceUrl, setFontFaceUrl] = useState('')
  const [fontCustomName, setFontCustomName] = useState('')
  const [primary, setPrimary] = useState('')
  const [secondary, setSecondary] = useState('')
  const [colors, setColors] = useState<ColorRow[]>([])
  const [defaults, setDefaults] = useState({ primary: '#5225e6', secondary: '#f1f5f9' })
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => setDefaults(readThemeDefaults()), [])

  useEffect(() => {
    if (!theme) return
    setFontFamily(theme.font_family ?? '')
    setFontUrl(theme.font_css_url ?? '')
    setFontFaceUrl(theme.font_face_url ?? '')
    setFontCustomName(theme.font_custom_name ?? '')
    setPrimary(theme.primary_color ?? '')
    setSecondary(theme.secondary_color ?? '')
    setColors(parseSavedColors(theme.saved_colors).map((c) => ({ id: uid(), ...c })))
  }, [theme])

  const hasCustomFont = Boolean(fontFaceUrl && fontCustomName)
  const customActive = hasCustomFont && fontFamily === fontCustomName

  const selectedFont = customActive
    ? fontCustomName
    : (FONT_OPTIONS.find((f) => f.family === fontFamily)?.label ?? 'System default')

  const fontOptions = [
    ...FONT_OPTIONS.map((f) => ({ value: f.label, label: f.label })),
    ...(hasCustomFont
      ? [
          {
            value: fontCustomName,
            label: fontCustomName,
            icon: (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Custom
              </span>
            ),
          },
        ]
      : []),
  ]

  function pickFont(value: string) {
    if (hasCustomFont && value === fontCustomName) {
      setFontFamily(fontCustomName)
      setFontUrl('')
      return
    }
    const opt = FONT_OPTIONS.find((f) => f.label === value) ?? FONT_OPTIONS[0]!
    setFontFamily(opt.family)
    setFontUrl(opt.url)
  }

  async function onUploadFont(file: File) {
    setFormError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/admin/media', {
        method: 'POST',
        body,
        credentials: 'same-origin',
        headers: { 'X-XSRF-TOKEN': readXsrf() },
      })
      if (!res.ok) throw new Error('Upload failed. Use a .woff2, .woff, .ttf or .otf file.')
      const media = (await res.json()) as { url: string }
      setFontFaceUrl(media.url)
      const name =
        fontCustomName ||
        file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9 _-]/g, ' ')
          .trim()
          .slice(0, 40) ||
        'Custom'
      setFontCustomName(name)
      setFontFamily(name)
      setFontUrl('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function removeCustomFont() {
    if (customActive) {
      setFontFamily('')
      setFontUrl('')
    }
    setFontFaceUrl('')
    setFontCustomName('')
  }

  const addColor = () =>
    setColors((c) => [...c, { id: uid(), slug: '', name: '', value: '#000000' }])
  const patchColor = (id: string, patch: Partial<ColorRow>) =>
    setColors((c) => c.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const removeColor = (id: string) => setColors((c) => c.filter((r) => r.id !== id))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const section = WEBSITE_SETTING_SECTIONS.THEME
    try {
      await update.mutateAsync({
        patches: [
          { section, key: 'font_family', value: fontFamily.trim() },
          { section, key: 'font_css_url', value: fontUrl.trim() },
          { section, key: 'font_face_url', value: fontFaceUrl.trim() },
          { section, key: 'font_custom_name', value: fontCustomName.trim() },
          { section, key: 'primary_color', value: primary.trim() },
          { section, key: 'secondary_color', value: secondary.trim() },
          { section, key: 'saved_colors', value: JSON.stringify(serializeColors(colors)) },
        ],
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Default font and colour palette for the public site and storefront. These do not affect the
        dashboard. A font set on an individual page-builder block still overrides the default.
      </p>

      <div className="space-y-2">
        <Label>Default font</Label>
        <AppSelect
          value={selectedFont}
          onChange={pickFont}
          options={fontOptions}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          Google Fonts load on public pages only. Upload your own below to add it here.
        </p>
      </div>

      {/* Custom font — uploaded separately, then selectable above with a Custom badge. */}
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <Label>Custom font</Label>
          {hasCustomFont ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Custom
            </span>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="custom-font-name" className="text-xs text-muted-foreground">
            Font name
          </Label>
          <Input
            id="custom-font-name"
            value={fontCustomName}
            onChange={(e) => {
              const v = e.target.value
              if (customActive) setFontFamily(v)
              setFontCustomName(v)
            }}
            placeholder="My Brand Font"
            disabled={!hasCustomFont && !uploading}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-transparent px-3 py-1.5 text-sm font-medium hover:bg-muted">
            {uploading ? 'Uploading…' : hasCustomFont ? 'Replace font file' : 'Upload font file'}
            <input
              type="file"
              accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUploadFont(f)
                e.target.value = ''
              }}
            />
          </label>
          {hasCustomFont ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span className="max-w-[220px] truncate font-mono">{fontFaceUrl}</span>
              <button
                type="button"
                onClick={removeCustomFont}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Remove
              </button>
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          .woff2, .woff, .ttf or .otf, up to 10MB. Once uploaded, pick it in the Default font list
          above.
        </p>
      </div>

      {/* Load the custom font into this page so the preview below is accurate. */}
      {hasCustomFont ? (
        <style
          dangerouslySetInnerHTML={{
            __html: `@font-face{font-family:'${fontCustomName}';src:url('${fontFaceUrl}');font-display:swap}`,
          }}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField label="Primary" value={primary} onChange={setPrimary} />
        <ColorField label="Secondary" value={secondary} onChange={setSecondary} />
      </div>

      {/* Saved colours — named variables reusable in the page builder. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Saved colours</Label>
          <button
            type="button"
            onClick={addColor}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Add colour
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Name a colour to reuse it as a swatch in the builder. Editing it updates every block that
          uses it.
        </p>
        {colors.length === 0 ? (
          <p className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
            No saved colours yet.
          </p>
        ) : (
          <div className="space-y-2">
            {colors.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Input
                  value={c.name}
                  onChange={(e) => patchColor(c.id, { name: e.target.value })}
                  placeholder="Colour name"
                  className="flex-1"
                />
                <div className="w-44 shrink-0">
                  <ColorPickerInput
                    value={c.value}
                    onChange={(v) => patchColor(c.id, { value: v })}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Remove colour"
                  onClick={() => removeColor(c.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live preview */}
      <div
        className="rounded-lg border p-4"
        style={fontFamily ? { fontFamily: `'${fontFamily}', sans-serif` } : undefined}
      >
        <p className="mb-2 text-sm text-muted-foreground">Preview</p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: primary || defaults.primary }}
          >
            Primary button
          </span>
          <span
            className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ backgroundColor: secondary || defaults.secondary, color: '#0f172a' }}
          >
            Secondary
          </span>
          {serializeColors(colors).map((c) => (
            <span
              key={c.slug}
              className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: c.value }}
            >
              {c.name}
            </span>
          ))}
          <span className="text-lg font-semibold">The quick brown fox</span>
        </div>
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save appearance'}
        </Button>
        {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
      </div>
    </form>
  )
}
