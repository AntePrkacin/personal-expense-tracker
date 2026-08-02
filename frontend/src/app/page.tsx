import type { paths } from '@/types/api';

// Read out of the generated spec rather than restated here. Renaming this
// field in the backend now breaks the build instead of quietly rendering an
// empty box. Regenerate with `npm run api:sync` from the repo root.
type HelloResponse = paths['/api/hello']['get']['responses'][200]['content']['application/json'];

async function getHello(): Promise<HelloResponse> {
  const baseUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';
  // no-store: always hit the API so the page reflects the live backend.
  const res = await fetch(`${baseUrl}/api/hello`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }
  return res.json();
}

// Async Server Component: the fetch runs on the server at request time, so
// there is no CORS involved and no client-side loading state to manage.
export default async function Home() {
  let message: string;
  let reachable = true;

  try {
    const data = await getHello();
    message = data.message;
  } catch {
    reachable = false;
    message = 'Could not reach the API. Is the backend running on port 3000?';
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <span className="text-label-m rounded-full border border-border-default bg-surface-card px-3 py-1 text-text-secondary">
        Decode Academy Demo
      </span>
      <h1 className="text-display-l max-w-2xl">Frontend + Backend connected 🎉</h1>
      <p className="text-body-l max-w-md text-text-secondary">
        {reachable ? 'Message fetched from the NestJS API:' : 'Backend unreachable:'}
      </p>
      <p
        className={`text-body-m max-w-md rounded-lg border px-4 py-3 ${
          reachable
            ? 'border-border-default bg-surface-card text-text-primary'
            : 'border-status-danger bg-status-danger-soft text-status-danger-text'
        }`}
      >
        {message}
      </p>
    </main>
  );
}
