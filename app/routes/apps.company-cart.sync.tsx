import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  getCompanyIdForCustomer,
  parseCompanyCartBody,
  setCompanyCartMetafield,
} from "../lib/company-cart.server";

/**
 * App Proxy: POST https://{shop}/apps/company-cart/sync
 * Theme sends { lines: [{ variant_id, quantity }] }.
 * Shopify adds logged_in_customer_id when the buyer is logged in.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

  if (!loggedInCustomerId) {
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

  const customerGid = `gid://shopify/Customer/${loggedInCustomerId}`;
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

/** App Proxy may probe with GET */
export const loader = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  return json({ ok: true, endpoint: "company-cart-sync" });
};
