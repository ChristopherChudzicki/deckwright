import { mergeOverrides } from "./entries";

// Dynamic so the descriptions stay out of the main chunk — router.tsx imports
// IconDebugView statically. Kept out of entries.ts because the generator script
// imports that module and tsconfig.node.json has no resolveJsonModule.
export async function loadIconDescriptions(): Promise<Record<string, string>> {
  const [base, overrides] = await Promise.all([
    import("./corpus.json"),
    import("./overrides.json"),
  ]);
  return mergeOverrides(base.default, overrides.default);
}
