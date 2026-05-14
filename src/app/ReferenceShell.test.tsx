import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ReferenceShell } from "./ReferenceShell";

function renderInRouter() {
  const rootRoute = createRootRoute();
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ReferenceShell>
        <p>child</p>
      </ReferenceShell>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ReferenceShell", () => {
  test("renders the Deckwright brand link", async () => {
    renderInRouter();
    const link = await screen.findByRole("link", { name: "Deckwright" });
    expect(link).toHaveAttribute("href", "/");
  });

  test("renders the children", async () => {
    renderInRouter();
    expect(await screen.findByText("child")).toBeInTheDocument();
  });

  test("does not render a user menu or footer", async () => {
    renderInRouter();
    await screen.findByText("child");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });
});
