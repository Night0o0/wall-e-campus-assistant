import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Materials } from './Materials'
import type { TeachableAudience } from '../../types/campus'

/**
 * Course Material — the instructor publish form.
 *
 * The correction this suite guards: an instructor targets material at a course
 * and an academic audience they teach, chosen from dependent dropdowns, and
 * never at a single lecture day/time. Only audiences the server returned are
 * offered, the dropdowns narrow each other, and the submitted payload is an
 * `audience`, not a `scheduleId`.
 */

const success = vi.fn()
const toastError = vi.fn()
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ success, error: toastError, info: vi.fn() }),
}))

let role = 'INSTRUCTOR'
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', role } }),
}))

const teachableAudiences = vi.fn()
const create = vi.fn()
const list = vi.fn()
const mine = vi.fn()
const coursesList = vi.fn()

vi.mock('../../api/campus', () => ({
  materialsApi: {
    teachableAudiences: () => teachableAudiences(),
    create: (data: unknown) => create(data),
    list: (params: unknown) => list(params),
    mine: () => mine(),
    update: vi.fn(),
    deactivate: vi.fn(),
  },
  coursesApi: {
    list: (params: unknown) => coursesList(params),
  },
}))

/** Two courses; CS201 taught to two levels and two sections, EE101 to one. */
const AUDIENCES: TeachableAudience[] = [
  {
    course: { id: 'c-cs', courseCode: 'CS201', courseName: 'Data Structures' },
    faculty: 'Faculty of Engineering',
    department: 'Mechatronics',
    level: 2,
    semester: 1,
    section: 'A',
  },
  {
    course: { id: 'c-cs', courseCode: 'CS201', courseName: 'Data Structures' },
    faculty: 'Faculty of Engineering',
    department: 'Mechatronics',
    level: 2,
    semester: 1,
    section: 'B',
  },
  {
    course: { id: 'c-cs', courseCode: 'CS201', courseName: 'Data Structures' },
    faculty: 'Faculty of Engineering',
    department: 'Mechatronics',
    level: 3,
    semester: 2,
    section: 'A',
  },
  {
    course: { id: 'c-ee', courseCode: 'EE101', courseName: 'Electronics' },
    faculty: 'Faculty of Science',
    department: 'Physics',
    level: 1,
    semester: 1,
    section: 'A',
  },
]

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Materials />
    </QueryClientProvider>
  )
}

const openPublish = async ({ waitForCourse = false } = {}) => {
  fireEvent.click(await screen.findByRole('button', { name: /Publish a link/i }))
  await screen.findByRole('dialog')
  // The Course dropdown appears only once its query (audiences for an
  // instructor, the course list for a super admin) has resolved.
  if (waitForCourse) await screen.findByLabelText(/^Course/)
}

/** The <select> for a labelled field inside the open dialog. */
const selectFor = (label: RegExp) =>
  screen.getByLabelText(label) as HTMLSelectElement

beforeEach(() => {
  role = 'INSTRUCTOR'
  success.mockReset()
  toastError.mockReset()
  create.mockReset().mockResolvedValue({ id: 'new' })
  teachableAudiences.mockReset().mockResolvedValue(AUDIENCES)
  list.mockReset().mockResolvedValue([])
  mine.mockReset().mockResolvedValue({ courses: [] })
  coursesList.mockReset().mockResolvedValue({ data: [] })
})

// The web vitest config does not enable globals, so @testing-library/react's
// automatic per-test cleanup is not registered — without this, portalled
// modals from earlier tests linger and duplicate every query.
afterEach(cleanup)

describe('the instructor publish form', () => {
  it('shows no lecture day/time selector', async () => {
    renderPage()
    await openPublish({ waitForCourse: true })

    // The old design asked "Which of your lectures is this for?" and listed
    // day + time. Neither the prompt nor any weekday/time text may appear.
    expect(screen.queryByLabelText(/which of your lectures/i)).toBeNull()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)).toBeNull()
    // A Course dropdown, not a lecture dropdown, is the entry point.
    expect(screen.getByLabelText(/^Course/)).toBeTruthy()
  })

  it('offers only the courses the instructor teaches', async () => {
    renderPage()
    await openPublish({ waitForCourse: true })

    const courseOptions = within(selectFor(/^Course/))
      .getAllByRole('option')
      .map((o) => o.textContent)

    expect(courseOptions).toContain('CS201 — Data Structures')
    expect(courseOptions).toContain('EE101 — Electronics')
    // No stray course the instructor does not teach.
    expect(courseOptions.filter((t) => t && t !== 'Choose a course…')).toHaveLength(2)
  })

  it('narrows dependent dropdowns to the chosen course and cohort', async () => {
    renderPage()
    await openPublish({ waitForCourse: true })

    // Choose CS201 → its faculty is the only one offered.
    fireEvent.change(selectFor(/^Course/), { target: { value: 'c-cs' } })
    const faculties = within(selectFor(/^Faculty/))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(faculties).toContain('Faculty of Engineering')
    expect(faculties).not.toContain('Faculty of Science') // that is EE101's

    fireEvent.change(selectFor(/^Faculty/), { target: { value: 'Faculty of Engineering' } })
    fireEvent.change(selectFor(/^Department/), { target: { value: 'Mechatronics' } })

    // CS201 Mechatronics is taught at levels 2 and 3 — both offered, nothing else.
    const levels = within(selectFor(/^Level/))
      .getAllByRole('option')
      .map((o) => o.textContent)
      .filter((t) => t !== 'Choose a level…')
    expect(levels).toEqual(['Level 2', 'Level 3'])

    // Level 2 is only semester 1; level 2 sem 1 has sections A and B.
    fireEvent.change(selectFor(/^Level/), { target: { value: '2' } })
    const semesters = within(selectFor(/^Semester/))
      .getAllByRole('option')
      .map((o) => o.textContent)
      .filter((t) => t !== 'Choose a semester…')
    expect(semesters).toEqual(['First semester'])

    fireEvent.change(selectFor(/^Semester/), { target: { value: '1' } })
    const sections = within(selectFor(/Section/))
      .getAllByRole('option')
      .map((o) => o.textContent)
      .filter((t) => t !== 'Choose a section…')
    expect(sections).toEqual(['Section A', 'Section B'])
  })

  it('clears downstream choices when a parent changes', async () => {
    renderPage()
    await openPublish({ waitForCourse: true })

    fireEvent.change(selectFor(/^Course/), { target: { value: 'c-cs' } })
    fireEvent.change(selectFor(/^Faculty/), { target: { value: 'Faculty of Engineering' } })
    fireEvent.change(selectFor(/^Department/), { target: { value: 'Mechatronics' } })
    fireEvent.change(selectFor(/^Level/), { target: { value: '3' } })
    expect(selectFor(/^Level/).value).toBe('3')

    // Switching the course must reset the level chosen under the old one.
    fireEvent.change(selectFor(/^Course/), { target: { value: 'c-ee' } })
    expect(selectFor(/^Level/).value).toBe('')
  })

  it('submits the selected audience, not a schedule id', async () => {
    renderPage()
    await openPublish({ waitForCourse: true })

    fireEvent.change(selectFor(/^Course/), { target: { value: 'c-cs' } })
    fireEvent.change(selectFor(/^Faculty/), { target: { value: 'Faculty of Engineering' } })
    fireEvent.change(selectFor(/^Department/), { target: { value: 'Mechatronics' } })
    fireEvent.change(selectFor(/^Level/), { target: { value: '2' } })
    fireEvent.change(selectFor(/^Semester/), { target: { value: '1' } })
    fireEvent.change(selectFor(/Section/), { target: { value: 'B' } })

    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Lectures' } })
    fireEvent.change(screen.getByLabelText(/Google Drive link/i), {
      target: { value: 'https://drive.google.com/drive/folders/abc' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Publish$/ }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      courseId: 'c-cs',
      title: 'Lectures',
      driveUrl: 'https://drive.google.com/drive/folders/abc',
      audience: {
        faculty: 'Faculty of Engineering',
        department: 'Mechatronics',
        level: 2,
        semester: 1,
        section: 'B',
      },
    })
    const payload = create.mock.calls[0][0]
    expect(payload).not.toHaveProperty('scheduleId')
  })

  it('keeps Publish disabled until the audience is complete', async () => {
    renderPage()
    await openPublish({ waitForCourse: true })

    const publishButton = screen.getByRole('button', { name: /^Publish$/ }) as HTMLButtonElement
    expect(publishButton.disabled).toBe(true)

    fireEvent.change(selectFor(/^Course/), { target: { value: 'c-cs' } })
    fireEvent.change(selectFor(/^Faculty/), { target: { value: 'Faculty of Engineering' } })
    fireEvent.change(selectFor(/^Department/), { target: { value: 'Mechatronics' } })
    fireEvent.change(selectFor(/^Level/), { target: { value: '2' } })
    fireEvent.change(selectFor(/^Semester/), { target: { value: '1' } })
    // Section still unchosen → still disabled.
    expect(publishButton.disabled).toBe(true)

    fireEvent.change(selectFor(/Section/), { target: { value: 'A' } })
    expect(publishButton.disabled).toBe(false)
  })
})

describe('the audiences query states', () => {
  it('shows a skeleton while the audiences load', async () => {
    let resolve: (v: TeachableAudience[]) => void = () => {}
    teachableAudiences.mockReturnValue(new Promise((r) => (resolve = r)))

    renderPage()
    await openPublish()

    // No Course dropdown yet; a loading skeleton stands in its place. The modal
    // is portalled to document.body, so query the dialog, not the container.
    expect(screen.queryByLabelText(/^Course/)).toBeNull()
    expect(screen.getByRole('dialog').querySelector('.animate-pulse')).toBeTruthy()

    resolve(AUDIENCES)
    await screen.findByLabelText(/^Course/)
  })

  it('explains when the instructor teaches nothing', async () => {
    teachableAudiences.mockResolvedValue([])
    renderPage()
    await openPublish()

    await screen.findByText(/no teaching assignments yet/i)
    expect(screen.queryByLabelText(/^Course/)).toBeNull()
    const publishButton = screen.getByRole('button', { name: /^Publish$/ }) as HTMLButtonElement
    expect(publishButton.disabled).toBe(true)
  })

  it('surfaces an API error from the audiences endpoint', async () => {
    teachableAudiences.mockRejectedValue(new Error('boom'))
    renderPage()
    await openPublish()

    await screen.findByText(/Could not load the courses you teach/i)
  })
})

describe('the super admin publish form', () => {
  beforeEach(() => {
    role = 'UNIVERSITY_ADMIN'
    coursesList.mockResolvedValue({
      data: [{ id: 'c-any', courseCode: 'XX100', courseName: 'Anything' }],
    })
  })

  it('keeps the explicit audience form and submits an audience payload', async () => {
    renderPage()
    await openPublish({ waitForCourse: true })

    // The super admin never calls the instructor audiences endpoint.
    expect(teachableAudiences).not.toHaveBeenCalled()

    fireEvent.change(selectFor(/^Course/), { target: { value: 'c-any' } })
    fireEvent.change(screen.getByLabelText(/^Faculty/), { target: { value: 'Faculty of Arts' } })
    fireEvent.change(screen.getByLabelText(/^Department/), { target: { value: 'History' } })
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Syllabus' } })
    fireEvent.change(screen.getByLabelText(/Google Drive link/i), {
      target: { value: 'https://drive.google.com/drive/folders/xyz' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Publish$/ }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const payload = create.mock.calls[0][0]
    expect(payload.courseId).toBe('c-any')
    expect(payload.audience).toMatchObject({
      faculty: 'Faculty of Arts',
      department: 'History',
      level: 2,
      semester: 1,
      section: null,
    })
    expect(payload).not.toHaveProperty('scheduleId')
  })
})
