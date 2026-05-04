import { useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // We can pass shop context down to tie to a PulseGrid workspace
  return { shop: session.shop, accessToken: session.accessToken };
};

export default function Index() {
  const { shop, accessToken } = useLoaderData<typeof loader>();

  useEffect(() => {
    // Dynamically import the SDK on client side to avoid SSR issues
    const loadPulseGrid = async () => {
      // Import registers the Custom Elements automatically on the window
      await import("@pulsegrid/sdk");
    };
    loadPulseGrid();
  }, []);

  return (
    <Page>
      <TitleBar title="PulseGrid Automation" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  PulseGrid Flows
                </Text>
                <Text as="p" variant="bodyMd">
                  Manage your store automations seamlessly.
                </Text>
                
                {/* Embed the PulseGrid Web Component */}
                <div style={{ marginTop: '20px', minHeight: '400px' }}>
                  {/* @ts-ignore - React does not know about custom elements natively yet in types */}
                  <pulse-panel workspace-id={shop} api-key={accessToken} theme="light"></pulse-panel>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Pre-installed Templates
                  </Text>
                  <Text as="p" variant="bodyMd" color="subdued">
                    The following PulseGrid flows are pre-configured for your store:
                  </Text>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Badge tone="success">New Order → Slack</Badge>
                    <Badge tone="warning">Low Inventory Alert</Badge>
                    <Badge tone="info">Customer Win-Back</Badge>
                    <Badge tone="attention">High-Risk Order Review</Badge>
                    <Badge tone="new">Refund Processed</Badge>
                  </div>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
