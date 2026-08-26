import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { User as UserIcon, Lock, LifeBuoy } from 'lucide-react'
import { Page, Card } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/endpoints'
import { getErrorMessage } from '../lib/api'
import { formatDate } from '../lib/utils'

const ROLE_LABELS: Record<string, string> = {
  SYSTEM_OWNER: 'System Owner',
  UNIVERSITY_ADMIN: 'University Administrator',
  INSTRUCTOR: 'Teaching Staff',
  STUDENT: 'Student',
}

/**
 * Your own name, email and password — for whoever is signed in.
 *
 * The endpoints behind it (/auth/profile, /auth/password) were always
 * role-agnostic; only the page was not. The platform owner's Settings screen
 * hard-coded "System Owner" and a platform panel, so staff had no way to change
 * their own password at all. This is that screen for everybody, and Settings
 * keeps the owner-only platform details.
 */
export function Account() {
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

  const handlePasswordSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setPasswordError(null)
    changePassword.mutate()
  }

  const isStaff =
    user?.role === 'INSTRUCTOR' || user?.role === 'UNIVERSITY_ADMIN'

  return (
    <Page title="Account" subtitle="Your name, sign-in email and password.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Profile" description="How your account appears to others.">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              updateProfile.mutate()
            }}
            className="space-y-4"
          >
            <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100">
                <UserIcon className="h-6 w-6 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {user?.fullName}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="purple">
                    {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
                  </Badge>
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
                hint="At least 8 characters"
                value={passwords.newPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, newPassword: event.target.value })
                }
              />
              <Input
                label="Confirm new password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                error={passwordError ?? undefined}
                value={passwords.confirmPassword}
                onChange={(event) =>
                  setPasswords({
                    ...passwords,
                    confirmPassword: event.target.value,
                  })
                }
              />
              <Button type="submit" icon={Lock} loading={changePassword.isPending}>
                Change password
              </Button>
            </form>
          </Card>

          {isStaff && (
            <Card
              title="Forgotten password"
              description="What to do when you cannot sign in at all."
            >
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
                <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div className="text-sm text-slate-600">
                  <p>
                    Staff passwords are not reset by email. Contact your
                    university administrator, who can set a new one for you from
                    Students &amp; Staff.
                  </p>
                  <p className="mt-2">
                    A staff account approves registrations and publishes material
                    to whole cohorts, so recovering one is a decision a person
                    makes — not something a mailbox can authorise on its own.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Page>
  )
}
