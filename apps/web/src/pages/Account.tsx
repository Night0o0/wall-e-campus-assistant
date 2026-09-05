import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { User as UserIcon, Lock, LifeBuoy } from 'lucide-react'
import { Page, Card } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Field'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../lib/api'
import { formatDate } from '../lib/utils'
import { changeOwnPassword, updateOwnAccount } from '../lib/accountAuth'
import { studentsApi } from '../api/campus'

const PROFILE_FIELD_LABELS: Record<string, string> = {
  faculty: 'Faculty',
  department: 'Department',
  level: 'Level',
  semester: 'Semester',
  section: 'Section',
  phoneNumber: 'Phone number',
  nationalId: 'National ID',
  dateOfBirth: 'Date of birth',
}

const ROLE_LABELS: Record<string, string> = {
  SYSTEM_OWNER: 'System Owner',
  UNIVERSITY_ADMIN: 'University Administrator',
  DEPARTMENT_ADMIN: 'Department Administrator',
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
  const isStudent = user?.role === 'STUDENT'

  const [profile, setProfile] = useState({ fullName: '', email: '' })
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [academicProfile, setAcademicProfile] = useState({
    faculty: '',
    department: '',
    level: '',
    semester: '',
    section: '',
    groupName: '',
    academicYear: '',
    phoneNumber: '',
    nationalId: '',
    dateOfBirth: '',
  })

  useEffect(() => {
    if (user) {
      setProfile({ fullName: user.fullName, email: user.email })
    }
  }, [user])

  const studentProfile = useQuery({
    queryKey: ['student-profile'],
    queryFn: studentsApi.profile,
    enabled: isStudent,
  })

  useEffect(() => {
    if (!studentProfile.data) return

    setAcademicProfile({
      faculty: studentProfile.data.faculty ?? '',
      department: studentProfile.data.department ?? '',
      level: studentProfile.data.level ? String(studentProfile.data.level) : '',
      semester: studentProfile.data.semester ?? '',
      section: studentProfile.data.section ?? '',
      groupName: studentProfile.data.groupName ?? '',
      academicYear: studentProfile.data.academicYear ?? '',
      phoneNumber: studentProfile.data.phoneNumber ?? '',
      nationalId: studentProfile.data.nationalId ?? '',
      dateOfBirth: studentProfile.data.dateOfBirth ?? '',
    })
  }, [studentProfile.data])

  const updateProfile = useMutation({
    mutationFn: () => updateOwnAccount({
      currentEmail: user!.email,
      fullName: profile.fullName,
      email: profile.email,
    }),
    onSuccess: ({ user: updated, emailConfirmationPending }) => {
      setUser({ ...user!, ...updated })
      toast.success(emailConfirmationPending
        ? 'Profile updated. Confirm the new sign-in email to finish changing it.'
        : 'Profile updated')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const changePassword = useMutation({
    mutationFn: () => changeOwnPassword({
      email: user!.email,
      currentPassword: passwords.currentPassword,
      newPassword: passwords.newPassword,
    }),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Password changed')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const updateAcademicProfile = useMutation({
    mutationFn: () =>
      studentsApi.updateProfile({
        faculty: academicProfile.faculty.trim() || undefined,
        department: academicProfile.department.trim() || undefined,
        level: academicProfile.level ? Number(academicProfile.level) : undefined,
        semester: academicProfile.semester.trim() || undefined,
        section: academicProfile.section.trim() || undefined,
        groupName: academicProfile.groupName.trim() || undefined,
        academicYear: academicProfile.academicYear.trim() || undefined,
        phoneNumber: academicProfile.phoneNumber.trim() || undefined,
        nationalId: academicProfile.nationalId.trim() || undefined,
        dateOfBirth: academicProfile.dateOfBirth || undefined,
      }),
    onSuccess: () => {
      void studentProfile.refetch()
      toast.success('Academic profile updated')
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
    user?.role === 'INSTRUCTOR' ||
    user?.role === 'DEPARTMENT_ADMIN' ||
    user?.role === 'UNIVERSITY_ADMIN'

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
          {isStudent && (
            <Card
              title="Academic profile"
              description="Complete this so your timetable, course material and attendance scope can be derived from stored records."
            >
              {studentProfile.isLoading ? (
                <Skeleton className="h-56" />
              ) : studentProfile.error ? (
                <p className="text-sm text-danger-600">
                  {getErrorMessage(studentProfile.error)}
                </p>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        studentProfile.data?.status === 'COMPLETED'
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {studentProfile.data?.status === 'COMPLETED'
                        ? 'Complete'
                        : 'Incomplete'}
                    </Badge>
                    {studentProfile.data?.missingFields.map((field) => (
                      <Badge key={field} tone="neutral">
                        Missing {PROFILE_FIELD_LABELS[field] ?? field}
                      </Badge>
                    ))}
                  </div>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      updateAcademicProfile.mutate()
                    }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="Faculty"
                        value={academicProfile.faculty}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            faculty: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Department"
                        value={academicProfile.department}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            department: event.target.value,
                          })
                        }
                      />
                      <Select
                        label="Level"
                        value={academicProfile.level}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            level: event.target.value,
                          })
                        }
                      >
                        <option value="">Choose level…</option>
                        {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                          <option key={value} value={value}>
                            Level {value}
                          </option>
                        ))}
                      </Select>
                      <Input
                        label="Semester"
                        placeholder="First semester"
                        value={academicProfile.semester}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            semester: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Section"
                        value={academicProfile.section}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            section: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Group"
                        value={academicProfile.groupName}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            groupName: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Academic year"
                        placeholder="2026/2027"
                        value={academicProfile.academicYear}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            academicYear: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Phone number"
                        value={academicProfile.phoneNumber}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            phoneNumber: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="National ID"
                        inputMode="numeric"
                        value={academicProfile.nationalId}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            nationalId: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Date of birth"
                        type="date"
                        value={academicProfile.dateOfBirth}
                        onChange={(event) =>
                          setAcademicProfile({
                            ...academicProfile,
                            dateOfBirth: event.target.value,
                          })
                        }
                      />
                    </div>

                    <Button type="submit" loading={updateAcademicProfile.isPending}>
                      Save academic profile
                    </Button>
                  </form>
                </>
              )}
            </Card>
          )}

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
                    Use the Forgot password link on the sign-in page. A university
                    administrator can also set a temporary password for an
                    authorized campus account.
                  </p>
                  <p className="mt-2">
                    Password recovery is handled by Supabase Auth; account status
                    and access remain controlled by the campus backend.
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
