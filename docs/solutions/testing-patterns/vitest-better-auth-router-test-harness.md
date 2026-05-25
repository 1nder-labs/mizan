---
module: apps/web
date: 2026-05-25
problem_type: testing_pattern
component: tooling
severity: high
related_components:
  - apps/web/tests/integration/login-form.test.tsx
  - apps/web/tests/integration/queue-table-msw.test.tsx
  - apps/web/tests/integration/case-detail.test.tsx
  - apps/web/tests/setup/msw-server.ts
  - apps/web/tests/setup.ts
tags:
  - vitest
  - msw
  - testing-library
  - better-auth
  - tanstack-router
  - jsdom
  - integration-tests
applies_when:
  - "Writing vitest + RTL + MSW integration tests for a TanStack Router app"
  - "A component under test renders inside RouterProvider via memory-history"
  - "A component under test calls better-auth (or any client that builds an absolute URL against window.location.origin)"
---

# Vitest + RTL + MSW harness rules for TanStack Router + better-auth apps

## Context

Phase 6's reviewer-UI integration suite went red in three predictable ways the first time the tests landed. Same component, same MSW setup, three failure shapes:

1. **`RouterProvider` mounts async — first paint is empty.** A `render(<QueryClientProvider><RouterProvider router={router} /></QueryClientProvider>)` followed by `expect(screen.getByText(...))` ran the assertion before the router had matched any route. The dumped body was `<body><div /></body>` and the assertion errored as "unable to find element."
2. **better-auth bypasses MSW and hits the loopback.** `authClient.signIn.email(...)` resolved an absolute URL against `window.location.origin` (jsdom → `http://localhost:3000`) and went straight through the Node fetch interceptor as a real TCP connect — `ECONNREFUSED 127.0.0.1:3000`. The MSW handler registered as `http.post("/api/auth/sign-in/email", ...)` never saw the request.
3. **MSW v2 `resetHandlers` rejected the array shape.** `afterEach(() => server.resetHandlers([handler]))` threw `Invariant Violation: [MSW] Failed to replace initial handlers during reset: invalid handlers. Did you forget to spread the handlers array?`. MSW v2 expects spread, not array.

A fourth issue surfaced once cross-test cleanup got tight: occasional `getByLabelText("Email")` returning duplicates because RHF + zodResolver fired async validation that resolved *after* the test body returned, bleeding partially-cleaned DOM into the next render.

## Guidance

Apply these four rules to every vitest + RTL + MSW integration test in a TanStack Router app:

### 1. Prime the router with `await router.load()` before rendering

```tsx
async function renderWithRouter(element: React.ReactNode): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <>{element}</> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
```

`router.load()` primes the route match tree synchronously so the first paint already has the matched component mounted. Without it the first render returns the router's loading shim (an empty `<div />` by default) and the test asserts against that. Use `findByText` / `findByRole` after `render` as a defense in depth — they poll — but `router.load()` is the upstream fix.

### 2. Mock the auth client at the module boundary; don't try to intercept its fetch

```tsx
const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));
vi.mock("@/lib/auth-client.ts", () => ({
  authClient: { signIn: { email: signInMock } },
}));

import { LoginForm } from "../../src/components/login/form.tsx";

test("calls onAuthenticated when better-auth returns no error", async () => {
  signInMock.mockResolvedValueOnce({ data: { token: "fake" }, error: null });
  // ...
});
```

`vi.hoisted` is required: `vi.mock` calls are hoisted to the top of the file, and a plain `const signInMock = vi.fn()` declared at module scope is not yet initialised when the mock factory runs. `vi.hoisted` puts the mock fn in the same hoisted band as the `vi.mock` call.

Why mock at the boundary rather than via MSW: better-auth ships `better-fetch`, which constructs an absolute URL against `window.location.origin` (jsdom resolves to `http://localhost:3000`) before MSW's request interceptor sees the call. The request goes straight through as a real Node fetch to a loopback that has no server bound — ECONNREFUSED. Mocking the authClient export is the cleanest seam: the test stays pure, no live socket, no MSW timing race.

MSW remains the right tool for downstream RPC calls that go through `fetch` directly (queue, cases, brief) — those *do* get intercepted because they hit relative paths through `hc<AppType>` which resolves against the jsdom origin and trips the MSW handler.

### 3. Use `server.resetHandlers(handler)` (spread), not `server.resetHandlers([handler])`

```ts
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers(successHandler));   // ✅ spread
afterAll(() => server.close());
```

MSW v2's `resetHandlers` takes a rest parameter, not an array. Passing an array triggers `Invariant Violation: invalid handlers` at the first `afterEach`. This is a v2 break from v1; transition guides miss it because the v1 syntax was `resetHandlers(...handlers)` which accepted both.

### 4. Scope every query to the render's container with `within(container)`

```ts
function mountLogin(onAuthenticated: () => void) {
  const { container } = render(<LoginForm onAuthenticated={onAuthenticated} />);
  return within(container);
}

test("rejects short password client-side without network call", async () => {
  const ui = mountLogin(onAuthenticated);
  await user.type(ui.getByLabelText("Email"), "reviewer@launchgood.com");
  // ...
});
```

When component-under-test runs async work (RHF + zodResolver validation, AI SDK streams, debounced effects) that resolves *after* the test body returns, partially-cleaned DOM from the prior test can leak into the next render's query scope. `cleanup()` in `afterEach` removes the DOM, but `screen` queries the live `document` — so a stray node added between `cleanup()` and the next `render` will be found. Scoping every query to the render's own container is hard isolation that doesn't depend on cleanup timing.

## Why This Matters

Each of these four bugs is silent and frustrating in isolation. Together they make the integration suite look broken when the component code is fine. The first time we hit them, six of nine tests went red and the team spent a day chasing "the components don't work" when the real story was "the test harness was wrong."

Two structural reasons these patterns matter beyond Phase 6:

- **Loaders + MSW look orthogonal but aren't.** A loader test that doesn't prime the router asserts against an empty body; the loader hasn't run yet. The next instinct is to add an MSW handler for the loader endpoint, which doesn't help because the loader never started. Priming the router is the load-bearing step.
- **Better-auth and MSW look composable but aren't, by default.** better-auth normalises to absolute URLs upstream of the fetch interceptor. The cleanest seam is the auth-client module export, not the network. Test what you own (the form's behavior); mock what you don't (better-auth's transport).

## When to Apply

- Any vitest integration test that mounts a component inside `RouterProvider` via memory-history → use `await router.load()` and prefer `findByText`.
- Any vitest integration test that exercises a code path which calls `authClient.signIn`, `authClient.signUp`, `authClient.signOut`, or `authClient.getSession` → mock at the module boundary with `vi.hoisted`, not MSW.
- Every MSW v2 reset call → spread the handlers.
- Any RHF-driven form test or any component that fires async work past its render → wrap queries in `within(container)`.

## Examples

### Before — three flaky tests

```tsx
function renderWithRouter(element: React.ReactNode): void {
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory(...) });
  render(<QueryClientProvider><RouterProvider router={router} /></QueryClientProvider>);
}

test("renders rows", () => {
  renderWithRouter(<QueueTable rows={FIXTURE.cases} ... />);
  expect(screen.getByText("11111111")).toBeInTheDocument();   // ❌ <body><div /></body>
});

test("calls onAuthenticated on 200", async () => {
  render(<LoginForm onAuthenticated={onAuthenticated} />);
  await user.type(screen.getByLabelText("Email"), "...");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));   // ❌ ECONNREFUSED
});

afterEach(() => server.resetHandlers([successHandler]));   // ❌ Invariant Violation
```

### After — green and stable

```tsx
async function renderWithRouter(element: React.ReactNode): Promise<void> {
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory(...) });
  await router.load();
  render(<QueryClientProvider><RouterProvider router={router} /></QueryClientProvider>);
}

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));
vi.mock("@/lib/auth-client.ts", () => ({ authClient: { signIn: { email: signInMock } } }));

test("renders rows", async () => {
  await renderWithRouter(<QueueTable rows={FIXTURE.cases} ... />);
  expect(await screen.findByText("11111111")).toBeInTheDocument();   // ✅
});

test("calls onAuthenticated when better-auth returns no error", async () => {
  signInMock.mockResolvedValueOnce({ data: { token: "fake" }, error: null });
  const ui = mountLogin(onAuthenticated);
  await user.type(ui.getByLabelText("Email"), "...");
  await user.click(ui.getByRole("button", { name: /sign in/i }));
  await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));   // ✅
});

afterEach(() => server.resetHandlers(successHandler));   // ✅ spread
```

## Anti-pattern checklist

- ❌ `render(<RouterProvider ...>)` followed by `getByText` without `await router.load()`. Loader hasn't run; assertion sees the empty shim.
- ❌ Adding an MSW handler for `/api/auth/sign-in/email` and expecting it to intercept better-auth. better-auth's `better-fetch` builds an absolute URL upstream of MSW's interceptor; the request never reaches the handler.
- ❌ `const mock = vi.fn(); vi.mock("module", () => ({ x: mock }))`. `vi.mock` hoists past the `vi.fn()` declaration — `mock` is undefined when the factory runs. Use `vi.hoisted` to colocate.
- ❌ `server.resetHandlers([handler])` on MSW v2. Use the spread.
- ❌ Relying on `screen.getBy*` across tests with async-firing components. Scope to `within(container)`.

## Related references

- `apps/web/tests/integration/login-form.test.tsx` — vi.hoisted + module-mock pattern
- `apps/web/tests/integration/case-detail.test.tsx` — `await router.load()` prime
- `apps/web/tests/integration/queue-table-msw.test.tsx` — same prime, with MSW intercepting downstream `/api/cases`
- `apps/web/tests/setup.ts` — RTL cleanup + jsdom matchMedia polyfill
- MSW v2 release notes: https://mswjs.io/docs/migrations/1.x-to-2.x
- TanStack Router testing reference: https://tanstack.com/router/v1/docs/framework/react/guide/testing
