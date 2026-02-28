import { createFileRoute } from '@tanstack/react-router';

interface LoginSearch {
  error?: string;
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    error: typeof search['error'] === 'string' ? search['error'] : undefined
  }),
  component: LoginPage
});

function LoginPage(): React.JSX.Element {
  const { error } = Route.useSearch();

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="reveal w-full max-w-xs">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-[var(--radius-lg)] border border-stone-strong bg-elevated text-sm font-bold text-accent">
            ff
          </div>
          <h1 className="text-lg font-semibold text-ink">ffmpeg-rest</h1>
          <p className="mt-1 text-xs text-ink-muted">Enter password to continue</p>
        </div>

        <section className="rounded-[var(--radius-lg)] border border-stone bg-surface p-4">
          <form method="post" action="/auth/login" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[11px] uppercase tracking-wide text-ink-muted">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoFocus
                required
                autoComplete="current-password"
                className="w-full rounded-[var(--radius-md)] border border-stone-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
                placeholder="..."
              />
            </div>

            {error === 'invalid' ? (
              <p className="rounded-[var(--radius-md)] border border-error bg-error-soft px-3 py-2 text-xs text-error">
                Invalid password.
              </p>
            ) : null}

            <button type="submit" className="btn-primary mt-1 w-full">
              Log in
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
