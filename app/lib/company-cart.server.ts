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

const METAFIELD_NAMESPACE = "custom";
const METAFIELD_KEY = "company_cart";

export function parseCompanyCartBody(body: unknown): CompanyCartPayload | null {
  if (!body || typeof body !== "object") return null;
  const { lines } = body as { lines?: unknown };
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

  return { lines: parsed };
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

export async function setCompanyCartMetafield(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  companyId: string,
  payload: CompanyCartPayload,
): Promise<{ ok: boolean; errors: string[] }> {
  const response = await admin.graphql(
    `#graphql
      mutation SetCompanyCart($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
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
        metafields: [
          {
            ownerId: companyId,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(payload),
          },
        ],
      },
    },
  );

  const json = await response.json();
  const userErrors =
    (json?.data?.metafieldsSet?.userErrors as Array<{ message?: string }>) ??
    [];

  if (userErrors.length > 0) {
    return {
      ok: false,
      errors: userErrors.map((e) => e.message ?? "Unknown error"),
    };
  }

  const graphQLErrors = (json?.errors as Array<{ message?: string }>) ?? [];
  if (graphQLErrors.length > 0) {
    return {
      ok: false,
      errors: graphQLErrors.map((e) => e.message ?? "GraphQL error"),
    };
  }

  return { ok: true, errors: [] };
}
