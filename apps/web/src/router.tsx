import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { ArchiveGate } from '@/components/archive-gate';
import { CatalogPage } from '@/routes/catalog-page';
import { ModelPage } from '@/routes/model-page';
import { NotFoundPage } from '@/routes/not-found-page';
import { SignInPage } from '@/routes/sign-in-page';
import { TavolaPage } from '@/routes/tavola-page';

/**
 * The chrome, then the gate, then the screen.
 *
 * The gate is applied here rather than route by route because it is not a property of any one
 * screen: the archive is members-only, the API refuses all of it, and a screen that discovered
 * that for itself would be one of several slightly different ways of saying so. The one route
 * outside it is the gate itself — asking to be let in cannot require already being in.
 */
function RootLayout() {
  const atTheGate = useRouterState({
    select: (state) => state.location.pathname.startsWith('/sign-in'),
  });

  return (
    <AppShell>
      {atTheGate ? (
        <Outlet />
      ) : (
        <ArchiveGate>
          <Outlet />
        </ArchiveGate>
      )}
    </AppShell>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: CatalogPage,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
  /**
   * Where the member was going before the gate stopped them. A link to a drawing sent between
   * two members has to survive being opened by someone who is signed out (story 53).
   */
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = search['next'];
    // Somewhere in this archive and nowhere else: a `next` pointing off this origin turns the
    // sign-in screen into an open redirect, which is worth nothing to us and a lot to someone
    // sending a member a link.
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
      ? { next }
      : {};
  },
});

const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/models/$modelId',
  component: ModelPage,
});

const tavolaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tavole/$tavolaId',
  component: TavolaPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([catalogRoute, signInRoute, modelRoute, tavolaRoute]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
