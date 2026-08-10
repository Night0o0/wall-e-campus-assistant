import { Bot, Cpu, Radio, Construction } from 'lucide-react'
import { Page, Card } from '../components/layout/Page'
import { Badge } from '../components/ui/Badge'
import { usePlans } from '../hooks/queries'

/**
 * Robot fleet management is a planned extension: the platform sells software
 * first, and robots attach to an organization later. This page documents the
 * intended shape rather than pretending to show live devices.
 */
export function Robots() {
  const { data: plans } = usePlans()

  return (
    <Page
      title="Robots"
      subtitle="Hardware fleet — a planned extension of the platform."
    >
      <Card>
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <Construction className="h-8 w-8 text-slate-400" />
          </div>
          <div className="max-w-lg">
            <h3 className="text-lg font-semibold text-slate-900">
              Fleet management isn't built yet
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              The attendance platform runs entirely without hardware. When robots
              are added, each one will register against an organization and report
              status here — no changes to billing or user management required.
            </p>
          </div>
          <Badge tone="warning">Planned</Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card title="Device registry">
          <div className="flex items-start gap-3">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">
              Pair a tablet and its ESP32 controller to an organization, then track
              serial numbers, location and online status.
            </p>
          </div>
        </Card>

        <Card title="Event stream">
          <div className="flex items-start gap-3">
            <Radio className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">
              High-level events such as{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                attendance_success
              </code>{' '}
              pushed to devices over WebSocket, per ADR-005.
            </p>
          </div>
        </Card>

        <Card title="Plan limits">
          <div className="flex items-start gap-3">
            <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <div className="text-sm text-slate-600">
              <p>Robot allowances are already priced into every plan:</p>
              <ul className="mt-2 space-y-1">
                {plans?.map((plan) => (
                  <li key={plan.id} className="flex justify-between gap-4">
                    <span>{plan.name}</span>
                    <span className="font-medium text-slate-900">
                      {plan.maxRobots} robots
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  )
}
