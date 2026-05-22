import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, BlockStack, Banner } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { hasOfflineSession } from "../lib/single-shop-session-storage.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { sessionReady: hasOfflineSession() };
};

export default function Index() {
  const { sessionReady } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="BIBS B2B Company Cart" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {sessionReady ? (
              <Banner tone="success">
                Connected to <strong>bibs-b2b.myshopify.com</strong>. Storefront
                sync: <code>/apps/company-cart/sync</code>
              </Banner>
            ) : (
              <Banner tone="warning">
                Open this app in Admin after install to connect to{" "}
                <strong>bibs-b2b.myshopify.com</strong>.
              </Banner>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
