import { existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function prepareNext16Project(projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))) {
  const sourceRoot = join(projectRoot, "src");
  const appRoot = existsSync(join(projectRoot, "app")) || existsSync(join(projectRoot, "pages"))
    ? projectRoot
    : sourceRoot;
  const directories = [...new Set([projectRoot, sourceRoot])];
  const extensions = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"];
  let removedMiddleware = 0;

  // Next.js 16 must not see middleware.* and proxy.* together.
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = join(directory, `middleware.${extension}`);
      if (existsSync(candidate)) {
        unlinkSync(candidate);
        removedMiddleware += 1;
        console.log(`[Hostinger compatibility] Removed obsolete ${candidate.slice(projectRoot.length + 1)}.`);
      }
    }
  }

  // Keep exactly one proxy convention file in the directory matching the app root.
  const preferredExtensions = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"];
  const proxyCandidates = [];
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = join(directory, `proxy.${extension}`);
      if (existsSync(candidate)) proxyCandidates.push({ candidate, directory, extension });
    }
  }

  const preferred = proxyCandidates
    .filter((item) => item.directory === appRoot)
    .sort((a, b) => preferredExtensions.indexOf(a.extension) - preferredExtensions.indexOf(b.extension))[0]
      ?? proxyCandidates.sort((a, b) => preferredExtensions.indexOf(a.extension) - preferredExtensions.indexOf(b.extension))[0];

  for (const item of proxyCandidates) {
    if (!preferred || item.candidate !== preferred.candidate) {
      unlinkSync(item.candidate);
      console.log(`[Hostinger compatibility] Removed duplicate ${item.candidate.slice(projectRoot.length + 1)}.`);
    }
  }

  if (!preferred) {
    throw new Error("No proxy file was found. Expected proxy.ts (or another supported proxy extension) at the Next.js project root.");
  }

  const remainingMiddleware = directories.flatMap((directory) =>
    extensions.map((extension) => join(directory, `middleware.${extension}`)).filter(existsSync),
  );
  if (remainingMiddleware.length) {
    throw new Error(`Legacy middleware files remain: ${remainingMiddleware.join(", ")}`);
  }

  console.log(`[Hostinger compatibility] Using ${preferred.candidate.slice(projectRoot.length + 1)}; no middleware/proxy conflict remains.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  prepareNext16Project();
}
