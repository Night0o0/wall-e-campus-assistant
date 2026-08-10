import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { User as UserIcon, Lock, Server } from 'lucide-react'
import { Page, Card } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/endpoints'
import { getErrorMessage } from '../lib/api'
import { formatDate } from '../lib/utils'

export function Settings() {
  const { user, setUser } = useAuth()
  const toast = useToast()

  const [profile, setProfile] = useState({ fullName: '', email: '' })
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setProfile({ fullName: user.fullName, email: user.email })
    }
  }, [user])

  const updateProfile = useMutation({
    mutationFn: () => authApi.updateProfile(profile),
    onSuccess: (updated) => {
      setUser({ ...user!, ...updated })
      toast.success('Profile updated')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const changePassword = useMutation({
    mutationFn: () =>
      authApi.changePassword(passwords.currentPassword, passwords.newPassword),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Password changed')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const handleProfileSubmit = (event: FormEvent) => {
    event.preventDefault()
    updateProfile.mutate()
  }

  const handlePasswordSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setPasswordError(null)
    changePassword.mutate()
  }

  return (
    <Page title="Settings" subtitle="Your account and platform details.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Profile"
          description="How your account appears across the console."
        >
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
                <UserIcon className="h-6 w-6 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {user?.fullName}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="purple">System Owner</Badge>
                  {user?.createdAt && (
                    <span className="text-xs text-slate-500">
                      Joined {formatDate(user.createdAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Input
              label="Full name"
              required
              value={profile.fullName}
              onChange={(event) =>
                setProfile({ ...profile, fullName: event.target.value })
              }
            />

            <Input
              label="Email"
              type="email"
              required
              value={profile.email}
              onChange={(event) =>
                setProfile({ ...profile, email: event.target.value })
              }
            />

            <Input
              label="University ID"
              value={user?.universityId ?? ''}
              disabled
              hint="Assigned at account creation and cannot be changed"
            />

            <Button type="submit" loading={updateProfile.isPending}>
              Save profile
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Password" description="Change the password you sign in with.">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                label="Current password"
                type="password"
                required
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(event) =>
                  setPasswords({
                    ...passwords,
                    currentPassword: event.target.value,
                  })
                }
              />
              <Input
                label="New password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, newPassword: event.target.value })
                }
                hint="At least 8 characters"
              />
              <Input
                label="Confirm new password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={(event) =>
                  setPasswords({
                    ...passwords,
                    confirmPassword: event.target.value,
                  })
                }
                error={passwordError ?? undefined}
              />
              <Button
                type="submit"
                icon={Lock}
                loading={changePassword.isPending}
              >
                Change password
              </Button>
            </form>
          </Card>

          <Card title="Platform" description="Environment this console is talking to.">
            <dl className="space-y-3">
              <Row
                label="API endpoint"
                value={import.meta.env.VITE_API_URL ?? '/api (dev proxy)'}
              />
              <Row label="Your organization" value={user?.organization?.name ?? '—'} />
              <Row label="Organization code" value={user?.organization?.code ?? '—'} />
              <Row label="Role" value="SYSTEM_OWNER" />
            </dl>

            <div className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 p-4">
              <Server className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              <p className="text-sm text-slate-600">
                Platform-wide settings such as tax rates, billing currency and
                email notifications aren't implemented yet.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="truncate font-mono text-sm text-slate-900">{value}</dd>
    </div>
  )
}
