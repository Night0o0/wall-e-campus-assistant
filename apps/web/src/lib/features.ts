/**
 * Build-time feature switches.
 *
 * Billing (plans, subscriptions, invoices, payments, revenue) is off by default
 * so the console can be used as a plain attendance system during a campus
 * pilot. Nothing is deleted — set VITE_BILLING_ENABLED=true, and the matching
 * BILLING_ENABLED=true on the backend, to bring the whole surface back.
 */
export const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === 'true'
