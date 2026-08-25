import axios, { AxiosError } from 'axios'

/**
 * The robot's HTTP client.
 *
 * A separate axios instance from `lib/api.ts`, and that separation mirrors the
 * server: a device token and a user token are signed with different keys and
 * land on different request properties, so no route reachable by one is
 * reachable by the other. Sharing an interceptor between them would be the one
 * way to accidentally send a device token to a user route, or a staff token to
 * /api/devices — and the server would reject both, confusingly, at runtime.
 *
 * ── On storing the credential ──────────────────────────────────────────────
 *
 * The pairing secret is kept in localStorage alongside the token, and that is
 * deliberate rather than careless. A robot is unattended: nobody is standing by
 * to retype a secret when the 15-minute access token expires in the middle of a
 * lecture, so the credential has to live on the device that holds it. This is
 * the same trade a provisioned appliance always makes, and it is why the server
 * gives devices their own short-lived tokens, re-reads the device row on every
 * request, and can revoke one instantly from the super admin's console.
 *
 * What follows from that: the browser profile running the robot screen is
 * itself a credential. Treat "unpair" as the way to hand the machine on, and
 * revoke the device in the console if a screen is lost.
 */

const TOKEN_KEY = 'walle.device.token'
const CREDENTIAL_KEY = 'walle.device.credential'

export interface DeviceCredential {
  deviceKeyId: string
  secret: string
}

export const deviceStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),

  getCredential: (): DeviceCredential | null => {
    const raw = localStorage.getItem(CREDENTIAL_KEY)

    if (!raw) return null

    try {
      return JSON.parse(raw) as DeviceCredential
    } catch {
      // A corrupt entry is indistinguishable from no pairing, and pretending
      // otherwise would leave the screen stuck on an error it cannot clear.
      localStorage.removeItem(CREDENTIAL_KEY)
      return null
    }
  },

  setCredential: (credential: DeviceCredential) =>
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential)),

  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(CREDENTIAL_KEY)
  },
}

export const deviceApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})

deviceApi.interceptors.request.use((config) => {
  const token = deviceStorage.getToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

/** Raised when the device token has expired and a silent re-auth is needed. */
export const DEVICE_UNAUTHORIZED_EVENT = 'walle:device-unauthorized'

deviceApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // The token is gone, but the credential is not: the console re-exchanges
      // it rather than dropping back to the pairing screen. A robot that asks
      // for its secret again every fifteen minutes is a robot nobody deploys.
      deviceStorage.clearToken()
      window.dispatchEvent(new CustomEvent(DEVICE_UNAUTHORIZED_EVENT))
    }

    return Promise.reject(error)
  }
)
