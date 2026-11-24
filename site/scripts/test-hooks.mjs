// Lets `node --test` load the site's TypeScript as Next does: `@/` is the
// site root and imports leave off `.ts`. Registered by `pnpm test`.

import { existsSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

export async function resolve(specifier, context, next) {
  const local = specifier.startsWith("@/")
    ? root + specifier.slice(2)
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:")
      ? fileURLToPath(new URL(specifier, context.parentURL))
      : null;
  if (local && !/\.[cm]?[jt]s$/.test(local)) {
    for (const candidate of [`${local}.ts`, `${local}/index.ts`]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(local ? pathToFileURL(local).href : specifier, context);
}

if (!process.env.NOOTLE_TEST_HOOKS) {
  process.env.NOOTLE_TEST_HOOKS = "1";
  register(import.meta.url);
}
