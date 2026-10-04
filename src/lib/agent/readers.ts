import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";

/** Keeps prompts a sensible size; a job posting or resume never needs more. */
const MAX_CHARS = 24_000;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function findEmails(text: string): string[] {
  return text.match(EMAIL_PATTERN) ?? [];
}

export function uniqueEmails(emails: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of emails) {
    const email = raw.trim().replace(/^mailto:/i, "").replace(/[.,;:)]+$/, "");
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !seen.has(email.toLowerCase())) {
      seen.set(email.toLowerCase(), email);
    }
  }
  return [...seen.values()];
}

/** Trims every line, drops runs of blank lines and caps the length. */
export function tidy(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}

// ---------------------------------------------------------------------------
// Job posting links
// ---------------------------------------------------------------------------

/** Best-effort guard so the server can't be pointed at its own network. */
function isPrivateHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("[")
  );
}

type JobPostingLd = {
  title?: string;
  description: string;
  hiringOrganization?: string | { name?: string };
};

/** Most job boards (Greenhouse, Lever, Workday, LinkedIn, Indeed...) embed schema.org JobPosting data. */
function findJobPosting(node: unknown): JobPostingLd | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const isPosting = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
  if (isPosting && typeof obj.description === "string") return obj as JobPostingLd;
  return findJobPosting(obj["@graph"]);
}

/** Text of an HTML fragment with block elements on their own lines and list items bulleted. */
function htmlToText(html: string): string {
  // Some sites HTML-escape the description inside the JSON-LD.
  const source = /&lt;\w/.test(html) ? cheerio.load(html).text() : html;
  const $ = cheerio.load(source);
  $("script, style, noscript, svg, iframe, nav, footer, form").remove();
  $("br").replaceWith("\n");
  $("li").prepend("• ");
  $("p, div, li, ul, ol, section, article, tr, h1, h2, h3, h4, h5, h6").append("\n");
  return $.root().text();
}

export async function fetchJobPage(rawUrl: string): Promise<{ text: string; source: string }> {
  const url = new URL(rawUrl);
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) {
    throw new Error("Only public http(s) job links are supported.");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
    });
  } catch {
    throw new Error(`Couldn't reach ${url.hostname}. Upload a screenshot of the posting instead.`);
  }
  if (!response.ok) {
    throw new Error(
      `${url.hostname} answered ${response.status}; the page may need a login. Upload a screenshot of the posting instead.`,
    );
  }

  const $ = cheerio.load(await response.text());
  const emails = $('a[href^="mailto:"]')
    .map((_, a) => ($(a).attr("href") ?? "").slice("mailto:".length).split("?")[0])
    .get();

  let posting: JobPostingLd | undefined;
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      posting = findJobPosting(JSON.parse($(script).text()));
    } catch {
      // Malformed JSON-LD is common; fall through to the page text.
    }
    if (posting) break;
  }

  let text: string;
  let source: string;
  if (posting) {
    const org = posting.hiringOrganization;
    const company = typeof org === "string" ? org : org?.name;
    text = [posting.title, company, htmlToText(posting.description)].filter(Boolean).join("\n\n");
    source = "structured job data";
  } else {
    const main = $("main, article, [role=main]").first();
    text = [$("title").text(), htmlToText((main.length ? main : $("body")).html() ?? "")].join("\n\n");
    source = "page text";
  }
  if (emails.length > 0) text += `\n\nEmail addresses on the page: ${uniqueEmails(emails).join(", ")}`;

  text = tidy(text);
  if (text.length < 200) {
    throw new Error(
      `${url.hostname} didn't return a readable job description (it probably renders with JavaScript). Upload a screenshot of the posting instead.`,
    );
  }
  return { text, source };
}

// ---------------------------------------------------------------------------
// Resume PDFs
// ---------------------------------------------------------------------------

export async function extractPdfText(base64: string): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
    const { text } = await extractText(pdf, { mergePages: true });
    return tidy(text);
  } catch {
    throw new Error("Couldn't open the resume. Make sure it's a valid, unencrypted PDF.");
  }
}
