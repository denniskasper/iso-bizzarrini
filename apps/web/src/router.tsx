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
import { CategoriesPage } from '@/routes/categories-page';
import { CategoryPage } from '@/routes/category-page';
import { ClubPage } from '@/routes/club-page';
import { LegalNoticePage } from '@/routes/legal-notice-page';
import { MembershipPage } from '@/routes/membership-page';
import { ModelPage } from '@/routes/model-page';
import { NotFoundPage } from '@/routes/not-found-page';
import { PrivacyPage } from '@/routes/privacy-page';
import { CatalogRunPage } from '@/routes/catalog-run-page';
import { ReadingsPage } from '@/routes/readings-page';
import { RemindersPage } from '@/routes/reminders-page';
import { ReviewPage } from '@/routes/review-page';
import { RosterImportPage } from '@/routes/roster-import-page';
import { RosterPage } from '@/routes/roster-page';
import { SearchPage } from '@/routes/search-page';
import { SetPasswordPage } from '@/routes/set-password-page';
import { SignInPage } from '@/routes/sign-in-page';
import { SpecificationsPage } from '@/routes/specifications-page';
import { SubAssemblyPage } from '@/routes/sub-assembly-page';
import { TavolaPage } from '@/routes/tavola-page';

/**
 * The chrome, then the gate, then the screen.
 *
 * The gate is applied here rather than route by route because it is not a property of any one
 * screen: the archive is members-only, the API refuses all of it, and a screen that discovered
 * that for itself would be one of several slightly different ways of saying so.
 *
 * **Six routes stand outside it.** Four for the same reason: asking to be let in cannot
 * require already being in. Signing in and choosing a password from a link are the two ways in;
 * the roster and the Club are outside it because they are behind a *role* rather than behind a
 * Membership, and an Administrator whose own Membership has run out must still be able to reach
 * the screen that records their payment. The other two are the platform's own legal pages
 * (issue #9): the privacy statement, which is addressed to people who are not members yet and
 * people who no longer are, and the legal notice, which is addressed to anybody at all.
 */
const OUTSIDE_THE_GATE = [
  '/sign-in',
  '/set-password',
  '/roster',
  '/club',
  '/privacy',
  '/legal-notice',
  '/membership',
  '/reminders',
  '/readings',
];

function RootLayout() {
  const atTheGate = useRouterState({
    select: (state) => OUTSIDE_THE_GATE.some((path) => state.location.pathname.startsWith(path)),
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

/**
 * Where an invitation and a reset link both land. The token is in the address because that is
 * where an e-mail client puts it; it is sent to the archive in a request **body**, so it does not
 * end up in an access log on the way.
 */
const setPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/set-password',
  component: SetPasswordPage,
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const token = search['token'];
    return typeof token === 'string' && token.trim() !== '' ? { token } : {};
  },
});

/** An Administrator's screens. The archive enforces the role; these only say so. */
const rosterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/roster',
  component: RosterPage,
});

/**
 * Loading the Club's list (ticket 16). Under `/roster` in the address as well as in the chrome,
 * so it is covered by the same `OUTSIDE_THE_GATE` prefix and needs no second rule about who may
 * reach it — it is the roster's, and behind the roster's role.
 */
const rosterImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/roster/import',
  component: RosterImportPage,
});

/**
 * Who a renewal reminder would be written to (issue #3). An Administrator's, and outside the
 * gate with the roster it reads: behind a role, not behind a Membership.
 */
const remindersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reminders',
  component: RemindersPage,
});

/**
 * What the server reads the factory catalog with (issue #55). An Administrator's, and outside
 * the gate with the roster: behind a role, not behind a Membership.
 */
const readingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/readings',
  component: ReadingsPage,
});

/** One Catalog run as it reads, and once it has (issue #58). An Administrator's, like Readings. */
const catalogRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/readings/runs/$runId',
  component: CatalogRunPage,
});

const clubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/club',
  component: ClubPage,
});

/**
 * A member's own Membership (ADR 0004). Outside the gate for the reason the roster is: the
 * person who most needs it is the one whose Membership has run out. `paid` is what the payment
 * provider sends a member back with, and says only that they have been to its page.
 */
const membershipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/membership',
  component: MembershipPage,
  validateSearch: (search: Record<string, unknown>): { paid?: string } =>
    search['paid'] === '1' ? { paid: '1' } : {},
});

/** What is kept about a person and for how long (ADR 0007). Open to anybody. */
const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: PrivacyPage,
});

/** Who is behind the platform (issue #9). Open to anybody. */
const legalNoticeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/legal-notice',
  component: LegalNoticePage,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  component: SearchPage,
  /**
   * **What is being searched for, in the address.** The same argument the Position on a Tavola
   * makes: a member who has found the bracket they were after can send the address bar to
   * somebody else, reload it, or reach it again from their history — none of which a screen
   * holding its query in a variable can do. It also survives the gate, since `next` carries the
   * whole location.
   *
   * Absent rather than blank when nothing is being asked: `/search` on its own is the screen
   * before anybody has typed, and it deserves the bare address.
   */
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = search['q'];
    return typeof q === 'string' && q.trim() !== '' ? { q } : {};
  },
});

const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/models/$modelId',
  component: ModelPage,
  /**
   * Which system of the car is being looked at, **in the address** (issue #8), for the reason
   * the Position on a Tavola is: `?category=brakes` can be sent to somebody, reloaded, and
   * reached again from history. It is the Category's slug, a word a person can read.
   */
  validateSearch: (search: Record<string, unknown>): { category?: string } => {
    const category = search['category'];
    return typeof category === 'string' && category.trim() !== '' ? { category } : {};
  },
});

/**
 * The systems of a car, and one of them across every car (issue #8). Inside the gate like the
 * rest of the archive: an Administrator keeps the list from the first of these, and what makes
 * that theirs is the role the archive checks, not where the screen sits.
 */
const categoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/categories',
  component: CategoriesPage,
});

const categoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/categories/$slug',
  component: CategoryPage,
});

/**
 * The Units and the Specification names (issue #109), next to the Categories and kept the same
 * way: read by anyone in the archive, changed only by an Administrator.
 */
const specificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/specifications',
  component: SpecificationsPage,
});

/**
 * What members have sent that an Editor has yet to decide (issue #6). Inside the gate, because
 * it is the archive's: the role that makes it an Editor's is checked where the queue is read.
 */
const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review',
  component: ReviewPage,
});

const tavolaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tavole/$tavolaId',
  component: TavolaPage,
  /**
   * Which Position is being read, **in the address** — which is what makes a link to one
   * shareable at all (story 52). A member sends the address bar and the other one opens exactly
   * what they were looking at, through the sign-in screen if they are signed out (story 53),
   * because `next` already carries the whole location.
   *
   * The **number as the factory printed it**, and not an id: `?position=210` is legible in a
   * forum post, survives being retyped by hand, and is the same thing the member has in their
   * hand. Which number it resolves to is `positionMatching`'s business, so a link built from
   * `210` opens `210 S` for the same reason typing it does.
   */
  validateSearch: (search: Record<string, unknown>): { position?: string } => {
    const position = search['position'];
    return typeof position === 'string' && position.trim() !== '' ? { position } : {};
  },
});

/**
 * **A Sub-assembly's own page** (issue #110), under the drawing it is on: a Sub-assembly exists on
 * one Tavola and nowhere else, so its address says which. Inside the gate like the drawing, so a
 * link to one sent to a member who is signed out opens it once they are in, as `next` carries it.
 */
const subAssemblyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tavole/$tavolaId/sub-assemblies/$subAssemblyId',
  component: SubAssemblyPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    catalogRoute,
    signInRoute,
    setPasswordRoute,
    rosterRoute,
    rosterImportRoute,
    clubRoute,
    remindersRoute,
    readingsRoute,
    catalogRunRoute,
    privacyRoute,
    membershipRoute,
    legalNoticeRoute,
    searchRoute,
    modelRoute,
    categoriesRoute,
    categoryRoute,
    specificationsRoute,
    reviewRoute,
    tavolaRoute,
    subAssemblyRoute,
  ]),
  defaultPreload: 'intent',
  parseSearch,
  stringifySearch,
});

/**
 * **An address in this archive is written the way a member would type it**, and these two
 * functions are the whole of that: `?position=210%20S`, not `?position=%22210+S%22`.
 *
 * The router's own default encodes every value as JSON and decodes numbers back out as numbers,
 * which is right for an application whose search parameters carry structure and wrong for this
 * one twice over. A link to a Position is quoted in a forum post, read down a telephone and
 * retyped by hand, so a pair of quote marks in it is a link that arrives broken (story 52); and
 * `210 S` and `210` must be the same *kind* of thing, when one of them would come back as a
 * number and the other as a string.
 *
 * Every search parameter this application has is a string a person could have written: a number
 * the factory printed, and the path a member was heading for when the gate stopped them. Both
 * routes' `validateSearch` say so, and now they can be believed.
 */
function parseSearch(searchStr: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(searchStr));
}

function stringifySearch(search: Record<string, unknown>): string {
  const written = Object.entries(search)
    // An absent parameter is absent from the address, rather than present and empty: nothing is
    // being read is the ordinary state of this screen and it deserves the bare URL.
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return written.length > 0 ? `?${written.join('&')}` : '';
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
