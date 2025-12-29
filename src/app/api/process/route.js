import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FREE_PROVIDERS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "mail.com",
]);

const ROLE_KEYWORDS = [
  { match: ["founder", "cofounder", "co-founder"], label: "Founder" },
  { match: ["ceo", "chiefexecutiveofficer"], label: "CEO" },
  { match: ["c-suite", "executive"], label: "Executive" },
  { match: ["cfo", "chieffinancialofficer", "financehead", "finance"], label: "Finance Head" },
  {
    match: ["operations", "ops", "headoperations", "operationshead"],
    label: "Operations Head",
  },
];

const FALLBACK_PATTERNS = ["first.last", "first", "firstlast", "firstinitial.last", "first.lastinitial"];

const PATTERN_PRIORITY = {
  "first.last": 5,
  "firstlast": 4,
  "firstinitial.last": 3,
  "first.lastinitial": 3,
  first: 2,
};

const ROLE_PRIORITY = {
  Founder: 5,
  CEO: 4,
  Executive: 3,
  "Operations Head": 2,
  "Finance Head": 2,
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export async function POST(request) {
  try {
    const { entries } = await request.json();

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { results: [], error: "No entries supplied." },
        { status: 400 }
      );
    }

    const results = [];

    for (const entry of entries) {
      const company = (entry?.company || "").trim();
      const website = (entry?.website || "").trim();
      const linkedinProfiles = Array.isArray(entry?.linkedinProfiles)
        ? entry.linkedinProfiles.filter(Boolean)
        : [];

      const domain = deriveDomain(website);
      if (!domain || FREE_PROVIDERS.has(domain.toLowerCase())) {
        continue;
      }

      const patternDiscovery = await discoverPattern(domain);
      const contacts = linkedinProfiles.flatMap((profile) =>
        extractContactFromLinkedIn(profile, company)
      );

      for (const contact of contacts) {
        const emailPattern =
          patternDiscovery.pattern || chooseFallbackPattern(contact);
        if (!emailPattern) {
          continue;
        }

        const email = buildEmail(contact, domain, emailPattern);
        if (!email) {
          continue;
        }

        const confidence = adjustConfidence(
          patternDiscovery.confidence,
          emailPattern,
          contact
        );

        const combinedSource = [contact.source, patternDiscovery.source]
          .filter(Boolean)
          .join(" | ");

        results.push({
          name: contact.fullName,
          role: contact.role,
          company: company || contact.company || "Unknown company",
          email,
          confidence,
          source: combinedSource,
        });
      }
    }

    const uniqueResults = deduplicateResults(results);

    return NextResponse.json({ results: uniqueResults });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}

function deduplicateResults(results) {
  const seen = new Set();
  return results.filter((item) => {
    const signature = `${item.company.toLowerCase()}-${item.email.toLowerCase()}`;
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

function deriveDomain(input) {
  if (!input) return null;
  let value = input.trim();
  if (!value) return null;

  if (!value.startsWith("http")) {
    value = `https://${value}`;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      return host.slice(4);
    }
    return host;
  } catch {
    return null;
  }
}

async function discoverPattern(domain) {
  const urlsToTry = buildDiscoveryUrls(domain);
  let discoveredPattern = null;
  let discoveredFrom = null;

  for (const url of urlsToTry) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const matches = html.match(EMAIL_REGEX) || [];
    const businessEmails = matches
      .map((email) => email.toLowerCase())
      .filter((email) => email.endsWith(`@${domain}`));

    if (businessEmails.length) {
      const pattern = selectPattern(businessEmails);
      if (pattern) {
        discoveredPattern = pattern;
        discoveredFrom = url;
        break;
      }
    }
  }

  if (discoveredPattern) {
    return { pattern: discoveredPattern, confidence: "high", source: discoveredFrom };
  }

  // As a fallback, try to guess pattern based on domain heuristics.
  const heuristicPattern = guessPatternFromDomain(domain);
  if (heuristicPattern) {
    return { pattern: heuristicPattern, confidence: "medium", source: `https://${domain}` };
  }

  return { pattern: null, confidence: "low", source: `https://${domain}` };
}

function buildDiscoveryUrls(domain) {
  const base = `https://${domain}`;
  const withoutWww = domain.startsWith("www.") ? domain.slice(4) : domain;
  const withWww = withoutWww === domain ? `www.${domain}` : domain;

  const candidates = new Set([
    `https://${withoutWww}`,
    `https://${withWww}`,
    `http://${withoutWww}`,
    `http://${withWww}`,
    `${base}/contact`,
    `${base}/team`,
    `${base}/about`,
  ]);

  return Array.from(candidates);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function selectPattern(emails) {
  const patternScores = new Map();

  for (const email of emails) {
    const [local] = email.split("@");
    const pattern = inferPattern(local);
    if (!pattern) continue;
    patternScores.set(
      pattern,
      (patternScores.get(pattern) || 0) + (PATTERN_PRIORITY[pattern] || 1)
    );
  }

  let bestPattern = null;
  let bestScore = -Infinity;

  for (const [pattern, score] of patternScores.entries()) {
    if (score > bestScore) {
      bestPattern = pattern;
      bestScore = score;
    }
  }

  return bestPattern;
}

function inferPattern(localPart) {
  const sanitized = localPart.replace(/[^a-z]/gi, "");
  if (!localPart) return null;

  if (/^[a-z]+\.{1}[a-z]+$/.test(localPart)) {
    return "first.last";
  }
  if (/^[a-z]+[a-z]+$/.test(localPart) && sanitized.length >= 4) {
    return "firstlast";
  }
  if (/^[a-z]\.[a-z]+$/.test(localPart)) {
    return "firstinitial.last";
  }
  if (/^[a-z]+\.{1}[a-z]$/.test(localPart)) {
    return "first.lastinitial";
  }
  if (/^[a-z]+$/.test(localPart)) {
    return "first";
  }

  return null;
}

function guessPatternFromDomain(domain) {
  const hints = [
    { pattern: "first.last", keywords: ["io", "tech", "systems", "labs"] },
    { pattern: "firstinitial.last", keywords: ["finance", "bank", "capital"] },
    { pattern: "firstlast", keywords: ["media", "creative", "studio"] },
  ];

  for (const hint of hints) {
    if (hint.keywords.some((keyword) => domain.includes(keyword))) {
      return hint.pattern;
    }
  }

  return null;
}

function extractContactFromLinkedIn(url, company) {
  if (!url || typeof url !== "string") return [];
  const trimmed = url.trim();
  if (!trimmed) return [];

  let slug = trimmed;

  try {
    const link = new URL(trimmed);
    slug = link.pathname.split("/").filter(Boolean).pop() || trimmed;
  } catch {
    slug = trimmed.split("/").filter(Boolean).pop() || trimmed;
  }

  const tokens = slug
    .toLowerCase()
    .replace(/[^a-z0-9-_\s]/g, " ")
    .split(/[-_\s]+/)
    .filter(Boolean);

  const matchedRoles = new Set();
  const nameTokens = [];

  for (const token of tokens) {
    const match = ROLE_KEYWORDS.find((item) =>
      item.match.includes(token.replace(/[^a-z]/g, ""))
    );
    if (match) {
      matchedRoles.add(match.label);
    } else if (!/^\d+$/.test(token)) {
      nameTokens.push(token);
    }
  }

  if (nameTokens.length === 0) {
    return [];
  }

  const { firstName, lastName } = splitNameTokens(nameTokens);
  if (!firstName) {
    return [];
  }

  const role =
    matchedRoles.size > 0
      ? Array.from(matchedRoles)
          .sort((a, b) => (ROLE_PRIORITY[b] || 0) - (ROLE_PRIORITY[a] || 0))
          .join(" & ")
      : "Decision Maker";

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return [
    {
      firstName,
      lastName,
      fullName,
      role,
      company,
      source: trimmed,
    },
  ];
}

function splitNameTokens(tokens) {
  if (!tokens.length) {
    return { firstName: null, lastName: null };
  }

  const cleanedTokens = tokens
    .map((token) => token.replace(/[^a-z]/g, ""))
    .filter(Boolean);

  if (!cleanedTokens.length) {
    return { firstName: null, lastName: null };
  }

  const firstName = capitalize(cleanedTokens[0]);
  const lastName =
    cleanedTokens.length > 1
      ? capitalize(cleanedTokens[cleanedTokens.length - 1])
      : null;

  return { firstName, lastName };
}

function capitalize(input) {
  if (!input) return "";
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function chooseFallbackPattern(contact) {
  if (!contact.lastName) {
    return "first";
  }
  return FALLBACK_PATTERNS[0];
}

function buildEmail(contact, domain, pattern) {
  const first = sanitizePart(contact.firstName);
  const last = sanitizePart(contact.lastName);

  if (!first) return null;

  const localPart = applyPattern(pattern, first, last);
  if (!localPart) return null;

  return `${localPart}@${domain}`;
}

function sanitizePart(value) {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/gi, "")
    .toLowerCase();
}

function applyPattern(pattern, first, last) {
  switch (pattern) {
    case "first.last":
      if (!last) return null;
      return `${first}.${last}`;
    case "firstlast":
      if (!last) return null;
      return `${first}${last}`;
    case "firstinitial.last":
      if (!last) return null;
      return `${first.charAt(0)}.${last}`;
    case "first.lastinitial":
      if (!last) return null;
      return `${first}.${last.charAt(0)}`;
    case "first":
      return first;
    default:
      return null;
  }
}

function adjustConfidence(base, pattern, contact) {
  let level = base || "low";
  if (!contact.lastName || pattern === "first") {
    level = downgrade(level);
  }
  return level;
}

function downgrade(level) {
  if (level === "high") return "medium";
  if (level === "medium") return "low";
  return "low";
}
