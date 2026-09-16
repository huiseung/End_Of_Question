const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.message === 'string' ? data.message : '요청에 실패했습니다. 다시 시도해 주세요.');
  }
  return response.json() as Promise<T>;
}
