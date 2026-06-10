import axios from 'axios'
import { router } from '@inertiajs/react'

function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]!) : undefined
}

const api = axios.create({ withCredentials: true })

api.interceptors.request.use((config) => {
  const token = getCsrfToken()
  if (token) {
    config.headers['X-XSRF-TOKEN'] = token
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err.config?.url ?? ''
    const isAuthForm =
      url === '/login' ||
      url === '/register' ||
      url.endsWith('/login') ||
      url.endsWith('/register')
    if (err.response?.status === 401 && !isAuthForm) {
      router.visit('/login')
    }
    return Promise.reject(err)
  }
)

export default api

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type AxiosLikeError = {
  response?: { status?: number; data?: { message?: string | string[]; error?: string } }
  message?: string
}

/** Map an axios rejection to `ApiError` using the API `{ message }` body when present. */
export function toApiError(err: unknown): ApiError {
  const ax = err as AxiosLikeError
  const status = ax.response?.status ?? 500
  const data = ax.response?.data
  const raw = data?.message ?? data?.error
  const msg = Array.isArray(raw) ? raw.join(', ') : raw
  return new ApiError(status, msg ?? ax.message ?? 'Request failed', data)
}

/** Prefer server validation text over axios' generic status-line message. */
export function apiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof ApiError) return err.message
  const ax = err as AxiosLikeError
  const raw = ax.response?.data?.message ?? ax.response?.data?.error
  const msg = Array.isArray(raw) ? raw.join(', ') : raw
  if (typeof msg === 'string' && msg.length > 0) return msg
  if (err instanceof Error && err.message && !/^Request failed with status code \d+$/.test(err.message)) {
    return err.message
  }
  return fallback
}

async function requestApi<T>(
  run: () => Promise<{ data: T }>
): Promise<T> {
  try {
    return (await run()).data
  } catch (err) {
    throw toApiError(err)
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { method?: string; body?: BodyInit | null } = {}
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = options.headers as Record<string, string> | undefined

  try {
    const res = await api.request<T>({
      url: path,
      method,
      data: options.body ? JSON.parse(String(options.body)) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })
    return res.data
  } catch (err: unknown) {
    throw toApiError(err)
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  return requestApi(() => api.get<T>(url))
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  return requestApi(() => api.post<T>(url, data))
}

export async function apiPut<T>(url: string, data?: unknown): Promise<T> {
  return requestApi(() => api.put<T>(url, data))
}

export async function apiDelete<T>(url: string): Promise<T> {
  return requestApi(() => api.delete<T>(url))
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  return requestApi(() => api.patch<T>(url, data))
}
