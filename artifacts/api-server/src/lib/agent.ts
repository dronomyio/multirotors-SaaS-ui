import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { extractInvoice } from "./invoice-extractor";
import type { Invoice } from "@workspace/api-zod";
import { searchShopifyProducts, listShopifyCollections, getShopifyCollectionProducts } from "./shopify-client";
import { searchWeb } from "./tavily";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

// Invoice and InvoiceItem types are defined in @workspace/api-zod (lib/api-zod/src/invoice.ts)
// and shared between the API server and web/mobile clients.
export type { Invoice } from "@workspace/api-zod";
export type { InvoiceItem } from "@workspace/api-zod";

export interface AgentResult {
  text: string;
  invoice: Invoice | null;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchShopifyCatalog",
      description:
        "Search the multirotors.store Shopify product catalog for drones, robots, sensors, and accessories. Always try this first before searching the web.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'Search term, e.g. "FPV drone", "LiDAR sensor", "quadruped robot"',
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchExternalWeb",
      description:
        "Search the web for products genuinely not found in the multirotors.store catalog after already checking the store. Use ONLY after searchShopifyCatalog and browseCategory have both returned no match for the item. Returns real market prices from third-party retailers.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'Specific product search including brand and model, e.g. "Orqa FPV.One goggles", "TBS Crossfire transmitter"',
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listCategories",
      description:
        "List all product collections/categories available in the multirotors.store catalog. Call this when a brand-specific search returns no results to discover what the store actually carries, then use browseCategory to see those products.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "browseCategory",
      description:
        "Fetch all products in a specific store collection by its handle (e.g. 'fpv-drones', 'quadruped-robots'). Use after listCategories when a direct product search returns nothing, to find real in-store alternatives.",
      parameters: {
        type: "object",
        properties: {
          handle: {
            type: "string",
            description: "The collection handle from listCategories, e.g. 'fpv-drones'",
          },
        },
        required: ["handle"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculateQuoteMetadata",
      description:
        "Calculate the full cost breakdown including subtotal, tax, shipping, and estimated delivery for a list of items.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "All items in the bundle",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                price: { type: "number", description: "Unit price in USD" },
                quantity: { type: "integer" },
                source: { type: "string", enum: ["store", "external"] },
              },
              required: ["title", "price", "quantity", "source"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateProFormaInvoice",
      description:
        "Compile the final structured pro-forma invoice that the UI will render as a Composition Layout. Call this last, after calculating the quote metadata.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                price: { type: "number" },
                quantity: { type: "integer" },
                source: { type: "string", enum: ["store", "external"] },
                variantId: { type: "string" },
                productUrl: { type: "string" },
                imageUrl: { type: "string" },
              },
              required: ["title", "price", "quantity", "source"],
            },
          },
          subtotal: { type: "number" },
          tax: { type: "number" },
          shipping: { type: "number" },
          total: { type: "number" },
          estimatedDeliveryDays: { type: "integer" },
          currency: { type: "string" },
        },
        required: [
          "items",
          "subtotal",
          "tax",
          "shipping",
          "total",
          "estimatedDeliveryDays",
          "currency",
        ],
      },
    },
  },
];

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert drone and robotics sales consultant for multirotors.store — an autonomous drone and robotics reseller specializing in enterprise UAVs, quadruped robots, AMR platforms, LiDAR sensors, and payloads.

When a customer describes what they want, follow this exact sequence:

STEP 1 — Search the store catalog:
  - Call searchShopifyCatalog with the brand/model/keyword the customer asked about.
  - If that returns no results, call listCategories to see all collections, then browseCategory on the most relevant one.
  - Key collection handles to try directly (do NOT wait for listCategories if the query clearly maps to one):
      • FPV drones / quads / GEPRC / Flywoo / Cinebot → "fpv-drones"
      • FPV goggles / video goggles → "fpv-first-person-view-goggles"
      • Enterprise / inspection / Blue UAS drones → "enterprise-drones"
      • Radio controllers / transmitters → "drone-radio-controller"
      • LiDAR sensors → "lidar"
      • Quadruped / legged robots → "educational-robots"
      • Cameras → "camera" or "hd-camera"
  - NEVER conclude the store has nothing without first browsing the relevant category.

STEP 2 — Search the store for EVERY item the customer asked for:
  - For each distinct item type (drone, goggles, controller, battery, charger, etc.), call searchShopifyCatalog or browseCategory.
  - Use the key collection handles above to go directly to the right section (e.g. goggles → "fpv-first-person-view-goggles").
  - Mark an item as source "store" if found; only proceed to external search if the store genuinely has nothing matching that item type.

STEP 3 — Fill remaining gaps with external search:
  - Call searchExternalWeb ONLY for item types where the store returned zero results after checking the catalog and the relevant collection.
  - Do NOT use searchExternalWeb for any item the store carries, even if the customer named a specific brand or model — offer the closest in-store match instead.

STEP 3 — Quote and invoice:
  - Call calculateQuoteMetadata with ALL items (store + external) to compute tax (8.5%), shipping, and delivery estimate.
  - Call generateProFormaInvoice to compile the final structured invoice.

After all tool calls, respond with:
- A brief expert summary (2-4 sentences) of what you found and assembled
- Your professional recommendation, noting which items are in-store vs sourced externally

Be technically precise. Reference actual specs when relevant. Always prefer in-store items over external ones.

IMPORTANT: After your text response, output the invoice JSON on a new line using EXACTLY this format (the UI depends on it):

__INVOICE__
{the complete invoice JSON from generateProFormaInvoice}
__INVOICE__`;

// ─── Tool Execution ───────────────────────────────────────────────────────────

interface QuoteItem {
  title: string;
  price: number;
  quantity: number;
  source: "store" | "external";
}

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "searchShopifyCatalog": {
      const products = await searchShopifyProducts(args.query as string);
      return products.length > 0
        ? products
        : { message: "No matching products found in the catalog" };
    }

    case "listCategories": {
      const collections = await listShopifyCollections();
      return collections.length > 0
        ? collections
        : { message: "No collections found" };
    }

    case "browseCategory": {
      const products = await getShopifyCollectionProducts(args.handle as string);
      return products.length > 0
        ? products
        : { message: `No products found in collection: ${args.handle as string}` };
    }

    case "searchExternalWeb": {
      const results = await searchWeb(args.query as string);
      return results.length > 0
        ? results
        : { message: "No external results found" };
    }

    case "calculateQuoteMetadata": {
      const items = args.items as QuoteItem[];
      const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      const taxRate = 0.085;
      const tax = subtotal * taxRate;
      // Free shipping over $500 (mix of store + external items)
      const shipping = subtotal >= 500 ? 0 : 25;
      const total = subtotal + tax + shipping;
      const hasExternal = items.some((i) => i.source === "external");
      const estimatedDeliveryDays = hasExternal ? 7 : 4;
      return { subtotal, tax, shipping, total, estimatedDeliveryDays, currency: "USD" };
    }

    case "generateProFormaInvoice": {
      // Just return the structured invoice data as-is
      return args;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Agent Runner ─────────────────────────────────────────────────────────────

export async function runDroneAgent(
  conversationHistory: ChatCompletionMessageParam[],
  onStatus?: (msg: string) => void
): Promise<AgentResult> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory,
  ];

  const MAX_ITERATIONS = 8;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 8192,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      // Disable built-in reasoning so function tools work on the terra model
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ reasoning_effort: "none" } as any),
    });

    const msg = response.choices[0].message;
    // Push assistant message before tool results
    messages.push(msg as ChatCompletionMessageParam);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const { text, invoice } = extractInvoice(msg.content ?? "");
      return { text, invoice };
    }

    // Execute all tool calls (sequential to maintain message order)
    for (const tc of msg.tool_calls) {
      const statusMap: Record<string, string> = {
        searchShopifyCatalog: "Searching store catalog...",
        listCategories: "Browsing store collections...",
        browseCategory: "Fetching category products...",
        searchExternalWeb: "Searching the web for external products...",
        calculateQuoteMetadata: "Calculating pricing & shipping...",
        generateProFormaInvoice: "Building pro-forma invoice...",
      };
      onStatus?.(statusMap[tc.function.name] ?? `Running ${tc.function.name}...`);

      let result: unknown;
      try {
        result = await executeTool(
          tc.function.name,
          JSON.parse(tc.function.arguments) as Record<string, unknown>
        );
      } catch (err) {
        logger.error({ err, tool: tc.function.name }, "Tool execution failed");
        result = { error: "Tool execution failed" };
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    text: "I wasn't able to complete your request within the allowed steps. Please try a more specific query.",
    invoice: null,
  };
}
