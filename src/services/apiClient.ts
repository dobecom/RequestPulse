const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
export const apiBaseUrl = (configuredBaseUrl || '/api/v1').replace(/\/+$/, '')

export async function postJson<T>(
  path: string,
  body: unknown,
  options: RequestInit = {},
): Promise<T | undefined> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`)
  }
  if (response.status === 204) return undefined
  return (await response.json()) as T
}
