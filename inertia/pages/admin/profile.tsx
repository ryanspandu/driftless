import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import { IdCard, Loader2, Mail, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Separator } from '~/components/ui/separator'
import { formatAdminTableDateTime } from '~/lib/utils'
import api, { ApiError } from '~/lib/api'

interface ProfileUser {
  id: string
  email: string
  username: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  phone?: string | null
  address?: string | null
  status?: 'ACTIVE' | 'INACTIVE' | null
  createdAt?: string | null
  roles?: { name: string }[]
}

interface Props {
  user: ProfileUser
}

const Dash = () => <span className="text-muted-foreground">—</span>

/** Label + value cell. Shows `view` text normally; swaps to `edit` in place when editing. */
const Field: FC<{
  label: string
  editing: boolean
  view: ReactNode
  edit?: ReactNode
  className?: string
}> = ({ label, editing, view, edit, className }) => (
  <div className={className}>
    <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
    {editing && edit ? edit : <div className="text-sm font-medium text-foreground">{view}</div>}
  </div>
)

const ProfilePage: FC<Props> = ({ user }) => {
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(user.firstName ?? '')
  const [lastName, setLastName] = useState(user.lastName ?? '')
  const [username, setUsername] = useState(user.username ?? '')
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [address, setAddress] = useState(user.address ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetFromUser() {
    setFirstName(user.firstName ?? '')
    setLastName(user.lastName ?? '')
    setUsername(user.username ?? '')
    setEmail(user.email)
    setPhone(user.phone ?? '')
    setAddress(user.address ?? '')
    setError(null)
  }

  useEffect(resetFromUser, [user])

  const roleLabel = useMemo(
    () => (user.roles && user.roles.length ? user.roles.map((r) => r.name).join(', ') : null),
    [user.roles]
  )
  const isActive = (user.status ?? 'ACTIVE') === 'ACTIVE'

  // Derived from current state so the header reflects edits + stays correct after save.
  const name = `${firstName} ${lastName}`.trim() || user.fullName || username || email
  const initials = (() => {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
  })()

  async function onSave() {
    setError(null)
    setSaving(true)
    try {
      await api.put('/api/me', {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        username: username.trim() || null,
        email: email.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
      })
      toast.success('Profile updated')
      setEditing(false)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save profile'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* Topbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IdCard className="size-5" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile Details</h1>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={saving}
              onClick={() => {
                resetFromUser()
                setEditing(false)
              }}
            >
              <X className="size-4" />
              Cancel
            </Button>
            <Button className="gap-2" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="gap-2" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-8 p-6 sm:p-8">
          {/* About */}
          <section className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">About</p>
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {initials}
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-foreground">{name}</h2>
                  <Badge variant={isActive ? 'success' : 'secondary'} className="gap-1">
                    <span className={isActive ? 'text-emerald-500' : 'text-muted-foreground'}>•</span>
                    {isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="size-3.5" aria-hidden />
                  <a className="text-ring hover:underline" href={`mailto:${email}`}>
                    {email}
                  </a>
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Account */}
          <section className="space-y-5">
            <p className="text-sm font-medium text-muted-foreground">Account</p>
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="First name"
                editing={editing}
                view={firstName || <Dash />}
                edit={<Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />}
              />
              <Field
                label="Last name"
                editing={editing}
                view={lastName || <Dash />}
                edit={<Input value={lastName} onChange={(e) => setLastName(e.target.value)} />}
              />
              <Field
                label="Username"
                editing={editing}
                view={username || <Dash />}
                edit={<Input value={username} onChange={(e) => setUsername(e.target.value)} />}
              />
              <Field
                label="Email"
                editing={editing}
                view={email || <Dash />}
                edit={<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
              />
              <Field
                label="Phone"
                editing={editing}
                view={phone || <Dash />}
                edit={<Input value={phone} onChange={(e) => setPhone(e.target.value)} />}
              />
              <Field label="User type" editing={editing} view={roleLabel ?? <Dash />} />
              <Field
                label="Member since"
                editing={editing}
                view={user.createdAt ? formatAdminTableDateTime(user.createdAt) : <Dash />}
              />
              <Field
                label="Address"
                editing={editing}
                className="sm:col-span-2 lg:col-span-3"
                view={address || <Dash />}
                edit={
                  <Textarea
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, city, country"
                  />
                }
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </CardContent>
      </Card>
    </div>
  )
}

export default ProfilePage
