import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  getCompanyCartForCustomer,
  getCompanyIdForCustomer,
  parseCompanyCartBody,
  setCompanyCartMetafield,
} from "../lib/company-cart.server";

function customerGidFromProxy(url: URL): string | null {
  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");
  if (!loggedInCustomerId) return null;
  return `gid://shopify/Customer/${loggedInCustomerId}`;
}

/**
 * GET  /apps/company-cart/sync — read company cart metafield (for theme prefill)
 * POST /apps/company-cart/sync — write company cart metafield (after user cart change)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const customerGid = customerGidFromProxy(url);

  if (!customerGid) {
    return json(
      { error: "Not logged in or missing logged_in_customer_id" },
      { status: 401 },
    );
  }

  const { companyId, cart } = await getCompanyCartForCustomer(admin, customerGid);

  if (!companyId) {
    return json(
      { error: "Customer is not associated with a B2B company" },
      { status: 404 },
    );
  }

  return json({ ok: true, lines: cart.lines });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const customerGid = customerGidFromProxy(url);

  if (!customerGid) {
    return json(
      { error: "Not logged in or missing logged_in_customer_id" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = parseCompanyCartBody(body);
  if (!payload) {
    return json(
      { error: "Expected body.lines as array of { variant_id, quantity }" },
      { status: 400 },
    );
  }

  const companyId = await getCompanyIdForCustomer(admin, customerGid);

  if (!companyId) {
    return json(
      { error: "Customer is not associated with a B2B company" },
      { status: 404 },
    );
  }

  const result = await setCompanyCartMetafield(admin, companyId, payload);

  if (!result.ok) {
    return json({ error: "Failed to save company cart", details: result.errors }, { status: 422 });
  }

  return json({ ok: true, lineCount: payload.lines.length });
};
