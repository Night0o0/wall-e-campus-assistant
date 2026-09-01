import { Server, ShieldCheck, Link2 } from 'lucide-react'
import { Page, Card } from '../components/layout/Page'
import { useAuth } from '../context/AuthContext'

export function Settings() {
  const { user } = useAuth()

  return (
    <Page
      title="Platform"
      subtitle="Deployment and platform context for the owner console."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          title="Environment"
          description="Which backend this browser is currently talking to."
        >
          <dl className="space-y-3">
            <Row
              label="API endpoint"
              value={import.meta.env.VITE_API_URL ?? '/api (dev proxy)'}
            />
            <Row
              label="Auth provider"
              value={import.meta.env.VITE_SUPABASE_URL ? 'supabase-capable' : 'legacy only'}
            />
            <Row label="Role" value={user?.role ?? 'SYSTEM_OWNER'} />
          </dl>
        </Card>

        <Card title="Access model" description="What this owner console is responsible for.">
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">
              This screen no longer duplicates Account profile or password work.
              Those live on the shared Account page. Platform responsibilities
              here are organizations, university administrators, platform users,
              and cross-tenant metrics.
            </p>
          </div>
        </Card>

        <Card title="Cutover guard" description="Supabase staging remains an explicit verification step.">
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
            <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">
              Legacy authentication stays in place until a staging run proves
              `AUTH_PROVIDER=supabase` end to end. This page reports context; it
              does not flip that switch.
            </p>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 p-4">
            <Server className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">
              Platform email, authentication and operational settings are
              configured by the deployment environment rather than in-browser
              controls.
            </p>
          </div>
        </Card>
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
