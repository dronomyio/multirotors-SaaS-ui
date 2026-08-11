import { logger } from "./logger";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  estimatedPrice: number | null;
}

// Naively extract a price figure from search result content
function extractPrice(text: string): number | null {
  const match = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (match) {
    return parseFloat(match[1].replace(",", ""));
  }
  return null;
}

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    logger.warn("TAVILY_API_KEY not configured — returning empty external search results");
    return [];
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `buy ${query} price`,
        max_results: 6,
        search_depth: "advanced",
        include_answer: false,
        include_domains: [
          "bhphotovideo.com",
          "getfpv.com",
          "racedayquads.com",
          "amazon.com",
          "bestbuy.com",
          "orqafpv.com",
          "rotor.build",
          "oscarliang.com",
        ],
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Tavily API error");
      return [];
    }

    const data = await response.json() as {
      results: Array<{ title: string; url: string; content: string }>;
    };

    return (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content.slice(0, 300),
      estimatedPrice: extractPrice(r.content),
    }));
  } catch (err) {
    logger.error({ err }, "Tavily search failed");
    return [];
  }
}
