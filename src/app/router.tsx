import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { AuthCallback } from "../auth/AuthCallback";
import { AuthProvider } from "../auth/AuthProvider";
import { LoginView } from "../auth/LoginView";
import { RequireOwner } from "../auth/RequireOwner";
import { DeckView } from "../views/DeckView";
import { EditorView } from "../views/EditorView";
import { HomeView } from "../views/HomeView";
import { IconDebugView } from "../views/IconDebugView";
import { PrintView } from "../views/PrintView";
import { type ReferenceKind, ReferenceView } from "../views/ReferenceView";
import { ReferenceShell } from "./ReferenceShell";
import { Root } from "./Root";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// Pathless layout routes: TanStack Router prefixes typed-route paths with the
// layout `id` (e.g. `from: "/app/deck/$deckId"`), but URLs are unchanged. The
// layouts exist so AuthProvider can scope to the app subtree — reference
// routes mount under `referenceLayoutRoute` with no auth wrapper, so QR
// scanners on /reference/* never trigger anonymous sign-in.
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: function AppLayout() {
    return (
      <AuthProvider>
        <Root />
      </AuthProvider>
    );
  },
});

const referenceLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "reference",
  component: ReferenceShell,
});

export type DeckSearch = {
  kind?: "item" | "spell";
  sort?: "name";
};

export function validateDeckSearch(raw: Record<string, unknown>): DeckSearch {
  const out: DeckSearch = {};
  if (raw.kind === "item" || raw.kind === "spell") out.kind = raw.kind;
  if (raw.sort === "name") out.sort = raw.sort;
  return out;
}

const homeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: HomeView,
});

const deckViewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/deck/$deckId",
  validateSearch: validateDeckSearch,
  component: function DeckViewRoute() {
    const { deckId } = deckViewRoute.useParams();
    return <DeckView deckId={deckId} />;
  },
});

const editorRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/deck/$deckId/edit/$cardId",
  component: function EditorRoute() {
    const { deckId, cardId } = editorRoute.useParams();
    return (
      <RequireOwner deckId={deckId}>
        <EditorView deckId={deckId} cardId={cardId} />
      </RequireOwner>
    );
  },
});

const printRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/deck/$deckId/print",
  component: function PrintRoute() {
    const { deckId } = printRoute.useParams();
    return <PrintView deckId={deckId} />;
  },
});

const loginRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/login",
  component: LoginView,
});

const authCallbackRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/auth/callback",
  component: AuthCallback,
});

const iconDebugRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/debug/icons",
  component: IconDebugView,
});

const referenceDetailRoute = createRoute({
  getParentRoute: () => referenceLayoutRoute,
  path: "/reference/$kind/$key",
  component: function ReferenceDetailRoute() {
    const { kind, key } = referenceDetailRoute.useParams();
    return <ReferenceView kind={kind as ReferenceKind} cardKey={key} />;
  },
});

/** Exported for tests only — production code should use the configured `router` below. */
export const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([
    homeRoute,
    deckViewRoute,
    editorRoute,
    printRoute,
    loginRoute,
    authCallbackRoute,
    iconDebugRoute,
  ]),
  referenceLayoutRoute.addChildren([referenceDetailRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { RouterProvider };
