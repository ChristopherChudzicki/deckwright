import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AuthCallback } from "../auth/AuthCallback";
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

const rootRoute = createRootRoute();

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
  getParentRoute: () => rootRoute,
  path: "/",
  component: function HomeRoute() {
    return (
      <Root>
        <HomeView />
      </Root>
    );
  },
});

const deckViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId",
  validateSearch: validateDeckSearch,
  component: function DeckViewRoute() {
    const { deckId } = deckViewRoute.useParams();
    return (
      <Root>
        <DeckView deckId={deckId} />
      </Root>
    );
  },
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/edit/$cardId",
  component: function EditorRoute() {
    const { deckId, cardId } = editorRoute.useParams();
    return (
      <Root>
        <RequireOwner deckId={deckId}>
          <EditorView deckId={deckId} cardId={cardId} />
        </RequireOwner>
      </Root>
    );
  },
});

const printRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/print",
  component: function PrintRoute() {
    const { deckId } = printRoute.useParams();
    return (
      <Root>
        <PrintView deckId={deckId} />
      </Root>
    );
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: function LoginRoute() {
    return (
      <Root>
        <LoginView />
      </Root>
    );
  },
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: function AuthCallbackRoute() {
    return (
      <Root>
        <AuthCallback />
      </Root>
    );
  },
});

const iconDebugRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debug/icons",
  component: function IconDebugRoute() {
    return (
      <Root>
        <IconDebugView />
      </Root>
    );
  },
});

const referenceDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reference/$kind/$key",
  component: function ReferenceDetailRoute() {
    const { kind, key } = referenceDetailRoute.useParams();
    return (
      <ReferenceShell>
        <ReferenceView kind={kind as ReferenceKind} cardKey={key} />
      </ReferenceShell>
    );
  },
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  deckViewRoute,
  editorRoute,
  printRoute,
  loginRoute,
  authCallbackRoute,
  iconDebugRoute,
  referenceDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { RouterProvider };
