import { QueryProvider } from "./api/QueryProvider";
import { router as defaultRouter, RouterProvider } from "./app/router";

export default function App({ router = defaultRouter }: { router?: typeof defaultRouter } = {}) {
  return (
    <QueryProvider>
      <RouterProvider router={router} />
    </QueryProvider>
  );
}
