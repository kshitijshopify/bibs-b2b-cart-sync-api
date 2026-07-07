/**
 * B2B company cart: resolve customer → company, persist custom.company_cart JSON.
 */

export type CompanyCartLine = {
  variant_id: number;
  quantity: number;
};

export type CompanyCartPayload = {
  lines: CompanyCartLine[];
};

export type CompanyCartWriteRequest = CompanyCartPayload & {
  compareDigest?: string | null;
};

export type CompanyCartSnapshot = CompanyCartPayload & {
  compareDigest: string | null;
  updatedAt: string | null;
};

const METAFIELD_NAMESPACE = "custom";
const METAFIELD_KEY = "company_cart";

const DIGEST_CONFLICT_PATTERNS = [
  "compare digest",
  "compareDigest",
  "modified since it was last read",
];

function isDigestConflictMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return DIGEST_CONFLICT_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function parseCompanyCartBody(body: unknown): CompanyCartWriteRequest | null {
  if (!body || typeof body !== "object") return null;
  const { lines, compareDigest } = body as {
    lines?: unknown;
    compareDigest?: unknown;
  };
  if (!Array.isArray(lines)) return null;

  const parsed: CompanyCartLine[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const { variant_id, quantity } = line as {
      variant_id?: unknown;
      quantity?: unknown;
    };
    const vid = Number(variant_id);
    const qty = Number(quantity);
    if (!Number.isFinite(vid) || vid <= 0) continue;
    if (!Number.isFinite(qty) || qty < 1) continue;
    parsed.push({ variant_id: Math.trunc(vid), quantity: Math.trunc(qty) });
  }

  const request: CompanyCartWriteRequest = { lines: parsed };
  if (typeof compareDigest === "string" && compareDigest.length > 0) {
    request.compareDigest = compareDigest;
  } else if (compareDigest === null) {
    request.compareDigest = null;
  }

  return request;
}

function parseStoredCartValue(raw: string | undefined): CompanyCartPayload {
  if (!raw) return { lines: [] };

  try {
    const parsed = JSON.parse(raw) as { lines?: unknown };
    if (Array.isArray(parsed?.lines)) {
      return parseCompanyCartBody({ lines: parsed.lines }) ?? { lines: [] };
    }
    if (Array.isArray(parsed)) {
      return parseCompanyCartBody({ lines: parsed }) ?? { lines: [] };
    }
  } catch {
    /* ignore */
  }

  return { lines: [] };
}

export async function getCompanyIdForCustomer(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  customerGid: string,
): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
      query CompanyCartCustomer($id: ID!) {
        customer(id: $id) {
          companyContactProfiles {
            company {
              id
            }
          }
        }
      }
    `,
    { variables: { id: customerGid } },
  );

  const json = await response.json();
  const profiles =
    json?.data?.customer?.companyContactProfiles as
      | Array<{ company?: { id?: string } }>
      | undefined;

  const companyId = profiles?.[0]?.company?.id;
  return companyId ?? null;
}

export async function getCompanyCartMetafield(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  companyId: string,
): Promise<CompanyCartSnapshot> {
  const response = await admin.graphql(
    `#graphql
      query CompanyCartMetafield($id: ID!) {
        company(id: $id) {
          metafield(namespace: "custom", key: "company_cart") {
            value
            compareDigest
            updatedAt
          }
        }
      }
    `,
    { variables: { id: companyId } },
  );

  const json = await response.json();
  const metafield = json?.data?.company?.metafield as
    | { value?: string; compareDigest?: string; updatedAt?: string }
    | undefined;

  const cart = parseStoredCartValue(metafield?.value);
  return {
    lines: cart.lines,
    compareDigest: metafield?.compareDigest ?? null,
    updatedAt: metafield?.updatedAt ?? null,
  };
}

export async function setCompanyCartMetafield(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  companyId: string,
  payload: CompanyCartPayload,
  compareDigest?: string | null,
): Promise<{
  ok: boolean;
  errors: string[];
  conflict?: boolean;
  snapshot?: CompanyCartSnapshot;
}> {
  const metafieldInput: Record<string, unknown> = {
    ownerId: companyId,
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
    type: "json",
    value: JSON.stringify({ lines: payload.lines }),
  };

  if (typeof compareDigest === "string" && compareDigest.length > 0) {
    metafieldInput.compareDigest = compareDigest;
  }

  const response = await admin.graphql(
    `#graphql
      mutation SetCompanyCart($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            compareDigest
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        metafields: [metafieldInput],
      },
    },
  );

  const json = await response.json();
  const userErrors =
    (json?.data?.metafieldsSet?.userErrors as Array<{ message?: string }>) ??
    [];

  if (userErrors.length > 0) {
    const messages = userErrors.map((e) => e.message ?? "Unknown error");
    const conflict = messages.some((message) => isDigestConflictMessage(message));

    if (conflict) {
      const current = await getCompanyCartMetafield(admin, companyId);
      return { ok: false, errors: messages, conflict: true, snapshot: current };
    }

    return { ok: false, errors: messages };
  }

  const graphQLErrors = (json?.errors as Array<{ message?: string }>) ?? [];
  if (graphQLErrors.length > 0) {
    return {
      ok: false,
      errors: graphQLErrors.map((e) => e.message ?? "GraphQL error"),
    };
  }

  const savedMetafield = json?.data?.metafieldsSet?.metafields?.[0] as
    | { compareDigest?: string; updatedAt?: string }
    | undefined;

  return {
    ok: true,
    errors: [],
    snapshot: {
      lines: payload.lines,
      compareDigest: savedMetafield?.compareDigest ?? null,
      updatedAt: savedMetafield?.updatedAt ?? null,
    },
  };
}

export async function getCompanyCartForCustomer(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  customerGid: string,
): Promise<{ companyId: string | null; cart: CompanyCartSnapshot }> {
  const companyId = await getCompanyIdForCustomer(admin, customerGid);
  if (!companyId) return { companyId: null, cart: { lines: [], compareDigest: null, updatedAt: null } };
  const cart = await getCompanyCartMetafield(admin, companyId);
  return { companyId, cart };
}
