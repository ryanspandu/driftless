import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { AppSelect } from '~/components/ui/app-select'
import { ArticleEditor } from '~/components/admin/article-editor'
import { MediaField, isImageMime, isVideoMime } from '~/puck/media-field'
import type { KitFieldDef } from '~/custom/types'

/**
 * One control per `KitFieldType` — deliberately small (7 variants) rather
 * than folded into `field-renderer.tsx`'s 20+-variant CMS field switch,
 * which serves a different, much larger schema.
 */
export function KitFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: KitFieldDef
  value: unknown
  onChange: (next: unknown) => void
  disabled?: boolean
}) {
  const id = `kit-field-${field.key}`

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
      {field.type === 'text' || field.type === 'url' ? (
        <Input
          id={id}
          type={field.type === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      ) : null}
      {field.type === 'richtext' ? (
        <ArticleEditor
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          disabled={disabled}
        />
      ) : null}
      {field.type === 'toggle' ? (
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={onChange}
          disabled={disabled}
        />
      ) : null}
      {field.type === 'select' ? (
        <AppSelect
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          options={field.options ?? []}
          disabled={disabled}
        />
      ) : null}
      {field.type === 'image' ? (
        <MediaField
          value={typeof value === 'string' ? value : undefined}
          onChange={onChange}
          mimeFilter={isImageMime}
          kindLabel="image"
        />
      ) : null}
      {field.type === 'video' ? (
        <MediaField
          value={typeof value === 'string' ? value : undefined}
          onChange={onChange}
          mimeFilter={isVideoMime}
          kindLabel="video"
        />
      ) : null}
    </div>
  )
}
