
import { Link } from '@inertiajs/react'
import { FormEvent, useEffect, useState, type FC } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Separator } from '~/components/ui/separator'
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
}

interface Props {
  user: ProfileUser
}

const ProfilePage: FC<Props> = ({ user }) => {
  const [firstName, setFirstName] = useState(user.firstName ?? '')
  const [lastName, setLastName] = useState(user.lastName ?? '')
  const [username, setUsername] = useState(user.username ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [address, setAddress] = useState(user.address ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFirstName(user.firstName ?? '')
    setLastName(user.lastName ?? '')
    setUsername(user.username ?? '')
    setPhone(user.phone ?? '')
    setAddress(user.address ?? '')
  }, [user])

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await api.put('/api/me', {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        username: username.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
      })
      toast.success('Profile updated')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save profile'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your personal account.{' '}
          <Link
            href="/admin/settings"
            className="font-medium text-ring underline-offset-4 hover:underline"
          >
            Website settings
          </Link>{' '}
          (name, logo, integrations) are there.
        </p>
      </div>

      <Card id="profile" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSaveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={user.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Password changes are not yet available in this build.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 opacity-60">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" type="password" disabled />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" type="password" disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" type="password" disabled />
            </div>
          </div>
          <Button disabled>Update password</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default ProfilePage
