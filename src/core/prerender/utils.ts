import { colors } from "consola/utils";
import type { PrerenderRoute } from "nitropack/types";
import { parseURL } from "ufo";
import { parse as parseHTML, walk } from "ultrahtml";

const allowedExtensions = new Set(["", ".json"]);

const linkParents = new Map<string, Set<string>>();

const HTML_ENTITIES = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&apos;": "'",
  "&quot;": '"',
} as Record<string, string>;

function escapeHtml(text: string) {
  return text.replace(
    /&(lt|gt|amp|apos|quot);/g,
    (ch) => HTML_ENTITIES[ch] || ch
  );
}

export async function extractLinks(
  html: string,
  from: string,
  res: Response,
  crawlLinks: boolean
) {
  const links: string[] = [];
  const _links: string[] = [];

  // Extract from any <TAG href=""> to crawl
  if (crawlLinks) {
    await walk(parseHTML(html), (node) => {
      if (!node.attributes?.href) {
        return;
      }

      const link = escapeHtml(node.attributes.href);
      if (
        !decodeURIComponent(link).startsWith("#") &&
        allowedExtensions.has(getExtension(link))
      ) {
        _links.push(link);
      }
    });
  }

  // Extract from x-nitro-prerender headers
  const header = res.headers.get("x-nitro-prerender") || "";
  _links.push(...header.split(",").map((i) => decodeURIComponent(i.trim())));

  for (const link of _links.filter(Boolean)) {
    const _link = parseURL(link);
    if (_link.protocol || _link.host) {
      continue;
    }
    if (!_link.pathname.startsWith("/")) {
      const fromURL = new URL(from, "http://localhost");
      _link.pathname = new URL(_link.pathname, fromURL).pathname;
    }
    links.push(_link.pathname + _link.search);
  }
  for (const link of links) {
    // Keyed by the decoded route
    let decodedLink: string;
    try {
      decodedLink = decodeURI(link);
    } catch {
      continue;
    }
    const _parents = linkParents.get(decodedLink);
    if (_parents) {
      _parents.add(from);
    } else {
      linkParents.set(decodedLink, new Set([from]));
    }
  }
  return links;
}

const EXT_REGEX = /\.[\da-z]+$/;

function getExtension(link: string): string {
  const pathname = parseURL(link).pathname;
  return (pathname.match(EXT_REGEX) || [])[0] || "";
}

export function getLinkParents(route: string): string[] {
  return [...(linkParents.get(route) ?? [])];
}

export function clearLinkParents() {
  linkParents.clear();
}

export function formatPrerenderRoute(route: PrerenderRoute) {
  let str = `  ├─ ${route.route} (${route.generateTimeMS}ms)`;

  if (route.error) {
    const parents = route.linkedFrom ?? [];
    const errorColor =
      colors[route.error.statusCode === 404 ? "yellow" : "red"];
    const errorLead = parents.length > 0 ? "├──" : "└──";
    str += `\n  │ ${errorLead} ${errorColor(route.error.message)}`;

    if (parents.length > 0) {
      str += `\n${parents
        .map((link) => `  │ └── Linked from ${link}`)
        .join("\n")}`;
    }
  }

  if (route.skip) {
    str += colors.gray(" (skipped)");
  }

  return colors.gray(str);
}

// prettier-ignore
type IgnorePattern =
  | string
  | RegExp
  | ((path: string) => undefined | null | boolean);
export function matchesIgnorePattern(path: string, pattern: IgnorePattern) {
  if (typeof pattern === "string") {
    // TODO: support radix3 patterns
    return path.startsWith(pattern as string);
  }

  if (typeof pattern === "function") {
    return pattern(path) === true;
  }

  if (pattern instanceof RegExp) {
    return pattern.test(path);
  }

  return false;
}
