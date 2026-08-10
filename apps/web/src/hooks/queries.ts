import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import {
  invoicesApi,
  metricsApi,
  organizationsApi,
  paymentsApi,
  plansApi,
  subscriptionsApi,
  usersApi,
} from '../api/endpoints'
import { getErrorMessage } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import type { ListParams } from '../types/api'

export const queryKeys = {
  metricsOverview: (months: number) => ['metrics', 'overview', months] as const,
  metricsRevenue: (months: number) => ['metrics', 'revenue', months] as const,
  organizations: (params: ListParams) => ['organizations', params] as const,
  organization: (id: string) => ['organizations', id] as const,
  users: (params: ListParams) => ['users', params] as const,
  userStats: () => ['users', 'stats'] as const,
  plans: () => ['plans'] as const,
  subscriptions: (params: ListParams) => ['subscriptions', params] as const,
  invoices: (params: ListParams) => ['invoices', params] as const,
  payments: (params: ListParams) => ['payments', params] as const,
}

/* ---------------------------------- Queries ---------------------------------- */

export const useOverview = (months = 8) =>
  useQuery({
    queryKey: queryKeys.metricsOverview(months),
    queryFn: () => metricsApi.overview(months),
  })

export const useRevenueMetrics = (months = 8) =>
  useQuery({
    queryKey: queryKeys.metricsRevenue(months),
    queryFn: () => metricsApi.revenue(months),
  })

export const useOrganizations = (params: ListParams) =>
  useQuery({
    queryKey: queryKeys.organizations(params),
    queryFn: () => organizationsApi.list(params),
    placeholderData: (previous) => previous,
  })

export const useOrganization = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.organization(id ?? ''),
    queryFn: () => organizationsApi.get(id!),
    enabled: Boolean(id),
  })

export const useUsers = (params: ListParams) =>
  useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => usersApi.list(params),
    placeholderData: (previous) => previous,
  })

export const useUserStats = () =>
  useQuery({ queryKey: queryKeys.userStats(), queryFn: usersApi.stats })

export const usePlans = () =>
  useQuery({ queryKey: queryKeys.plans(), queryFn: () => plansApi.list(true) })

export const useSubscriptions = (params: ListParams) =>
  useQuery({
    queryKey: queryKeys.subscriptions(params),
    queryFn: () => subscriptionsApi.list(params),
    placeholderData: (previous) => previous,
  })

export const useInvoices = (params: ListParams) =>
  useQuery({
    queryKey: queryKeys.invoices(params),
    queryFn: () => invoicesApi.list(params),
    placeholderData: (previous) => previous,
  })

export const usePayments = (params: ListParams) =>
  useQuery({
    queryKey: queryKeys.payments(params),
    queryFn: () => paymentsApi.list(params),
    placeholderData: (previous) => previous,
  })

/* --------------------------------- Mutations --------------------------------- */

/**
 * Wraps a mutation with toast feedback and cache invalidation, so every write
 * in the app reports success and failure the same way.
 */
function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    successMessage: string | ((data: TData) => string)
    invalidate?: string[][]
    onSuccess?: (data: TData) => void
  } & Omit<UseMutationOptions<TData, unknown, TVariables>, 'mutationFn' | 'onSuccess'>
) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { successMessage, invalidate = [], onSuccess, ...rest } = options

  return useMutation({
    ...rest,
    mutationFn,
    onSuccess: (data) => {
      toast.success(
        typeof successMessage === 'function' ? successMessage(data) : successMessage
      )

      for (const key of invalidate) {
        queryClient.invalidateQueries({ queryKey: key })
      }

      onSuccess?.(data)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })
}

const BILLING_KEYS = [
  ['metrics'],
  ['organizations'],
  ['subscriptions'],
  ['invoices'],
  ['payments'],
  ['plans'],
]

export const useCreateOrganization = (onDone?: () => void) =>
  useApiMutation(organizationsApi.create, {
    successMessage: 'Organization created',
    invalidate: [['organizations'], ['metrics'], ['users']],
    onSuccess: onDone,
  })

export const useUpdateOrganization = (onDone?: () => void) =>
  useApiMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      organizationsApi.update(id, data),
    {
      successMessage: 'Organization updated',
      invalidate: [['organizations'], ['metrics']],
      onSuccess: onDone,
    }
  )

export const useDeleteOrganization = (onDone?: () => void) =>
  useApiMutation(organizationsApi.remove, {
    successMessage: 'Organization deleted',
    invalidate: [['organizations'], ['metrics']],
    onSuccess: onDone,
  })

export const useCreateUser = (onDone?: () => void) =>
  useApiMutation(usersApi.create, {
    successMessage: 'User created',
    invalidate: [['users'], ['metrics'], ['organizations']],
    onSuccess: onDone,
  })

export const useUpdateUser = (onDone?: () => void) =>
  useApiMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      usersApi.update(id, data),
    {
      successMessage: 'User updated',
      invalidate: [['users'], ['metrics']],
      onSuccess: onDone,
    }
  )

export const useResetUserPassword = (onDone?: () => void) =>
  useApiMutation(
    ({ id, password }: { id: string; password: string }) =>
      usersApi.resetPassword(id, password),
    { successMessage: 'Password reset', onSuccess: onDone }
  )

export const useDeleteUser = (onDone?: () => void) =>
  useApiMutation(usersApi.remove, {
    successMessage: 'User deleted',
    invalidate: [['users'], ['metrics'], ['organizations']],
    onSuccess: onDone,
  })

export const useCreatePlan = (onDone?: () => void) =>
  useApiMutation(plansApi.create, {
    successMessage: 'Plan created',
    invalidate: [['plans'], ['metrics']],
    onSuccess: onDone,
  })

export const useUpdatePlan = (onDone?: () => void) =>
  useApiMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      plansApi.update(id, data),
    {
      successMessage: 'Plan updated',
      invalidate: [['plans'], ['metrics'], ['subscriptions']],
      onSuccess: onDone,
    }
  )

export const useDeletePlan = (onDone?: () => void) =>
  useApiMutation(plansApi.remove, {
    successMessage: 'Plan deleted',
    invalidate: [['plans']],
    onSuccess: onDone,
  })

export const useCreateSubscription = (onDone?: () => void) =>
  useApiMutation(subscriptionsApi.create, {
    successMessage: 'Subscription created',
    invalidate: BILLING_KEYS,
    onSuccess: onDone,
  })

export const useUpdateSubscription = (onDone?: () => void) =>
  useApiMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      subscriptionsApi.update(id, data),
    {
      successMessage: 'Subscription updated',
      invalidate: BILLING_KEYS,
      onSuccess: onDone,
    }
  )

export const useCancelSubscription = (onDone?: () => void) =>
  useApiMutation(subscriptionsApi.cancel, {
    successMessage: 'Subscription cancelled',
    invalidate: BILLING_KEYS,
    onSuccess: onDone,
  })

export const useRenewSubscription = (onDone?: () => void) =>
  useApiMutation(subscriptionsApi.renew, {
    successMessage: 'Subscription renewed',
    invalidate: BILLING_KEYS,
    onSuccess: onDone,
  })

export const useCreateInvoice = (onDone?: () => void) =>
  useApiMutation(invoicesApi.create, {
    successMessage: 'Invoice created',
    invalidate: BILLING_KEYS,
    onSuccess: onDone,
  })

export const useUpdateInvoice = (onDone?: () => void) =>
  useApiMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      invoicesApi.update(id, data),
    {
      successMessage: 'Invoice updated',
      invalidate: BILLING_KEYS,
      onSuccess: onDone,
    }
  )

export const useMarkInvoicePaid = (onDone?: () => void) =>
  useApiMutation(
    ({ id, paymentMethod }: { id: string; paymentMethod?: string }) =>
      invoicesApi.markPaid(id, paymentMethod),
    {
      successMessage: 'Invoice marked as paid',
      invalidate: BILLING_KEYS,
      onSuccess: onDone,
    }
  )

export const useDeleteInvoice = (onDone?: () => void) =>
  useApiMutation(invoicesApi.remove, {
    successMessage: 'Invoice deleted',
    invalidate: BILLING_KEYS,
    onSuccess: onDone,
  })

export const useRefundPayment = (onDone?: () => void) =>
  useApiMutation(paymentsApi.refund, {
    successMessage: 'Payment refunded',
    invalidate: BILLING_KEYS,
    onSuccess: onDone,
  })
