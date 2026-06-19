export interface KnowledgeBaseDocument {
  id: string;
  title: string;
  content: string;
  source: string;
}

export interface KnowledgeBaseMatch {
  id: string;
  title: string;
  content: string;
  source: string;
  score: number;
}

const defaultKnowledgeBase: KnowledgeBaseDocument[] = [
  {
    id: 'app-overview',
    title: 'Application overview',
    source: 'README.md',
    content:
      'This project is a full-stack OpenRouter chatbot with a React and TypeScript frontend, an Express and TypeScript backend, PostgreSQL message storage, and OpenRouter chat completions.'
  },
  {
    id: 'local-setup',
    title: 'Local setup',
    source: 'README.md',
    content:
      'For local development, start PostgreSQL with docker compose up -d postgres, configure backend and frontend environment files, install dependencies with npm install, and run the app with npm run dev.'
  },
  {
    id: 'runtime-urls',
    title: 'Runtime URLs',
    source: 'README.md',
    content: 'The frontend runs at http://localhost:5173 and the backend runs at http://localhost:3001 by default.'
  }
];

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'what',
  'with'
]);

function normalizeText(value: string) {
  // Lowercase first so searches match regardless of user capitalization.
  const lowercased = value.toLowerCase();

  // Replace punctuation with spaces so terms like "OpenRouter," still match "openrouter".
  const withoutPunctuation = lowercased.replace(/[^\p{L}\p{N}]+/gu, ' ');

  // Trim repeated whitespace to keep tokenization predictable.
  return withoutPunctuation.trim();
}

function tokenize(value: string) {
  // Split normalized text into individual searchable terms.
  const rawTokens = normalizeText(value).split(/\s+/).filter(Boolean);

  // Remove very common words because they add noise but no search value.
  return rawTokens.filter((token) => !stopWords.has(token));
}

function countMatches(queryTokens: string[], document: KnowledgeBaseDocument) {
  // Put title and content in the same searchable field for a simple keyword score.
  const documentText = `${document.title} ${document.content}`;
  const documentTokens = new Set(tokenize(documentText));

  // Count how many unique query terms appear in this document.
  return queryTokens.reduce((score, token) => score + (documentTokens.has(token) ? 1 : 0), 0);
}

function rankDocuments(query: string, documents: KnowledgeBaseDocument[]) {
  // Tokenize once so each document is scored against the same normalized query.
  const queryTokens = tokenize(query);

  if (!queryTokens.length) {
    return [];
  }

  return documents
    .map((document) => ({
      ...document,
      score: countMatches(queryTokens, document)
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score);
}

export function searchKnowledgeBase(input: { query: string; limit?: number }) {
  // Validate the query before searching so the model gets a clear tool error for bad calls.
  const query = input.query.trim();

  if (!query) {
    throw new Error('searchKnowledgeBase requires a non-empty query');
  }

  // Clamp the limit to keep tool responses small enough to feed back into the model.
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 5);

  // Rank the local documents and return only the top matches as retrieved context.
  const matches = rankDocuments(query, defaultKnowledgeBase).slice(0, limit);

  return {
    query,
    matches,
    answer_instruction:
      matches.length > 0
        ? 'Use these retrieved knowledge base matches as grounding context. Cite the source values when useful.'
        : 'No relevant knowledge base matches were found. Answer from general knowledge only if appropriate, and say when the knowledge base has no match.'
  };
}
