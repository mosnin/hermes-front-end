import { EMBEDDING_DIMENSIONS } from "./schema";

/**
 * Compute an embedding for a piece of text.
 *
 * Uses OpenAI text-embedding-3-small when OPENAI_API_KEY is set in the Convex
 * environment (`npx convex env set OPENAI_API_KEY sk-...`). When no key is
 * configured, returns null so the app degrades gracefully to plain text search
 * — semantic search simply stays dormant until you add a key.
 */
export async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const input = text.slice(0, 8000);
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  const vector = data.data?.[0]?.embedding;
  if (!vector || vector.length !== EMBEDDING_DIMENSIONS) return null;
  return vector;
}
