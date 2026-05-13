import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AuthCallback } from "../auth/AuthCallback";
import { LoginView } from "../auth/LoginView";
import { RequireOwner } from "../auth/RequireOwner";
import { DeckView } from "../views/DeckView";
import { EditorView } from "../views/EditorView";
import { HomeView } from "../views/HomeView";
import { IconDebugView } from "../views/IconDebugView";
import { PrintView } from "../views/PrintView";
import { Root } from "./Root";

const rootRoute = createRootRoute({ component: Root });

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
  component: HomeView,
});

const deckViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId",
  component: function DeckViewRoute() {
    const { deckId } = deckViewRoute.useParams();
    return <DeckView deckId={deckId} />;
  },
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
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
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/print",
  component: function PrintRoute() {
    const { deckId } = printRoute.useParams();
    return <PrintView deckId={deckId} />;
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginView,
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallback,
});

const iconDebugRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debug/icons",
  component: IconDebugView,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  deckViewRoute,
  editorRoute,
  printRoute,
  loginRoute,
  authCallbackRoute,
  iconDebugRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { RouterProvider };
