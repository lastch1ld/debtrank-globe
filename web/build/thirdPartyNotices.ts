import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** The directory of the npm package a bundled module came from, or null for
 * the app's own modules and for virtual ones (`\0` prefix). The last
 * `node_modules` segment wins, so a nested copy resolves to itself. */
export function packageRoot(moduleId: string): string | null {
  if (moduleId.startsWith("\0")) return null;
  const path = moduleId.split("?")[0].replaceAll("\\", "/");
  const marker = "/node_modules/";
  const at = path.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = path.slice(at + marker.length).split("/");
  const parts = rest[0].startsWith("@") ? rest.slice(0, 2) : rest.slice(0, 1);
  if (parts.length === 0 || parts.some((p) => !p)) return null;
  return `${path.slice(0, at + marker.length)}${parts.join("/")}`;
}

export interface PackageNotice {
  name: string;
  version: string;
  license: string;
  licenseText: string | null;
  noticeText: string | null;
}

const LICENSE_FILE = /^(licen[sc]e|copying)(\.[a-z]+)?$/i;
const NOTICE_FILE = /^notice(\.[a-z]+)?$/i;

function readFirst(dir: string, pattern: RegExp): string | null {
  const file = readdirSync(dir).find((f) => pattern.test(f));
  return file ? readFileSync(join(dir, file), "utf8").trim() : null;
}

/** What the package says about itself. Throws if it has no package.json: a
 * bundled package we cannot name is a build problem to see, not skip. */
export function readPackage(root: string): PackageNotice {
  const manifest = join(root, "package.json");
  if (!existsSync(manifest)) throw new Error(`No package.json in ${root}`);
  const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
    name?: string;
    version?: string;
    license?: string | { type?: string };
    licenses?: { type?: string }[];
  };
  const declared =
    typeof pkg.license === "string"
      ? pkg.license
      : (pkg.license?.type ?? pkg.licenses?.map((l) => l.type).join(" OR "));
  const licenseText = readFirst(root, LICENSE_FILE);
  return {
    name: pkg.name ?? root,
    version: pkg.version ?? "unknown",
    // A package can omit the field and still carry a licence file (one of
    // ours did); say so rather than printing "undefined".
    license: declared || (licenseText ? "see licence text" : "not declared"),
    licenseText,
    noticeText: readFirst(root, NOTICE_FILE),
  };
}

const RULE = "=".repeat(72);

export function renderNotices(packages: PackageNotice[]): string {
  const sorted = [...packages].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
  const out = [
    "THIRD-PARTY NOTICES",
    "",
    "debtrank-globe's own code is MIT-licensed (see LICENSE in the repository).",
    "This application is built from the open-source packages below. Each is",
    "included under its own licence, reproduced here as those licences require.",
    "Data sources and their credits are listed in docs/data-api.md.",
    "",
    `${sorted.length} packages.`,
  ];
  for (const p of sorted) {
    out.push("", RULE, `${p.name} ${p.version} (${p.license})`, RULE, "");
    out.push(
      p.licenseText ??
        `No licence file in the package. Declared licence: ${p.license}.`,
    );
    if (p.noticeText) out.push("", "NOTICE", "", p.noticeText);
  }
  return `${out.join("\n")}\n`;
}

/** Emits THIRD-PARTY-NOTICES.txt next to index.html, listing the licence text
 * of every npm package that ended up in the bundle. Bundlers strip the
 * licence comments from minified code, which MIT, BSD and Apache-2.0 do not
 * allow on their own; this puts them back where a user can read them. */
export function thirdPartyNotices(): Plugin {
  return {
    name: "third-party-notices",
    apply: "build",
    generateBundle(_options, bundle) {
      const roots = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const id of output.moduleIds) {
          const root = packageRoot(id);
          if (root) roots.add(root);
        }
      }
      const unique = new Map<string, PackageNotice>();
      for (const root of roots) {
        const pkg = readPackage(root);
        unique.set(`${pkg.name}@${pkg.version}`, pkg);
      }
      this.emitFile({
        type: "asset",
        fileName: "THIRD-PARTY-NOTICES.txt",
        source: renderNotices([...unique.values()]),
      });
    },
  };
}
