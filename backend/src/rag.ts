export interface KnowledgeBaseDocument {
  id: string;
  title: string;
  content: string;
  source: string;
}

export interface KnowledgeBaseMatch extends KnowledgeBaseDocument {
  score: number;
}

const knowledgeBase: KnowledgeBaseDocument[] = [
  {
    id: 'app-overview',
    title: 'Application overview',
    source: 'README.md',
    content:
      'This project is a full-stack OpenRouter chatbot with a React and TypeScript frontend, an Express and TypeScript backend, PostgreSQL message storage, tool calling, and OpenRouter chat completions.'
  },
  {
    id: 'local-setup',
    title: 'Local development setup',
    source: 'README.md',
    content:
      'For local development, start PostgreSQL with docker compose up -d postgres, configure backend and frontend environment files, install dependencies with npm install, and run the app with npm run dev.'
  },
  {
    id: 'runtime-urls',
    title: 'Runtime URLs',
    source: 'README.md',
    content:
      'The frontend runs at http://localhost:5173. The backend runs at http://localhost:3001 by default.'
  },
  {
    id: 'chat-api',
    title: 'Chat API',
    source: 'backend/src/server.ts',
    content:
      'The backend chat endpoint is POST /api/chat. It requires conversation_id and message in the JSON request body, stores messages in PostgreSQL, calls OpenRouter, executes requested tools, and returns the updated conversation with new messages.'
  },
  {
    id: 'agent-loop',
    title: 'Agent loop',
    source: 'backend/src/server.ts',
    content:
      'The chat route uses a bounded agent loop. It calls the model, stores the assistant response, executes any requested tool calls, appends tool results to the conversation history, and repeats until the model stops requesting tools or MAX_STEPS is reached.'
  },
  {
    id: 'available-tools',
    title: 'Available backend tools',
    source: 'backend/src/openrouter.ts',
    content:
      'The backend exposes tools for currency conversion, arithmetic calculation, temperature conversion, and knowledge base search. The model chooses when to call tools using OpenRouter tool calling.'
  },
  {
    id: 'currency-tool',
    title: 'Currency conversion tool',
    source: 'backend/src/tools.ts',
    content:
      'The convertCurrency tool converts between USD, SGD, THB, and MMK using simulated exchange rates. USD is 3500 MMK, SGD is 2600 MMK, THB is 100 MMK, and MMK is the base currency.'
  },
  {
    id: 'calculator-tool',
    title: 'Calculator tool',
    source: 'backend/src/tools.ts',
    content:
      'The calculate tool supports add, subtract, multiply, divide, and modulo operations using number1, number2, and operation arguments.'
  },
  {
    id: 'database-schema',
    title: 'Database schema',
    source: 'backend/db/schema.sql',
    content:
      'The database has conversations and messages tables. Messages include role, content, optional tool_calls JSONB, optional tool_call_id, and created_at. The message roles are system, user, assistant, and tool.'
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
  'i',
  'in',
  'is',
  'it',
  'my',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'what',
  'when',
  'where',
  'with',
  'your'
]);

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function scoreDocument(queryTokens: string[], document: KnowledgeBaseDocument) {
  const titleTokens = new Set(tokenize(document.title));
  const bodyTokens = new Set(tokenize(document.content));

  return queryTokens.reduce((score, token) => {
    if (titleTokens.has(token)) {
      return score + 3;
    }

    if (bodyTokens.has(token)) {
      return score + 1;
    }

    return score;
  }, 0);
}

export function searchKnowledgeBase(input: { query: string; limit?: number }) {
  console.log("searchKnowledgeBase called with input:", input);
  const query = input.query.trim();

  console.log("searchKnowledgeBase called with query:", query, "and limit:", input.limit);

  if (!query) {
    throw new Error('searchKnowledgeBase requires a non-empty query');
  }

  const limit = Math.min(Math.max(input.limit ?? 3, 1), 5);
  const queryTokens = tokenize(query);

  if (!queryTokens.length) {
    return {
      query,
      matches: [],
      answer_instruction:
        'No searchable terms were found in the query. Answer normally if possible, and say when the knowledge base has no matching information.'
    };
  }

  const matches: KnowledgeBaseMatch[] = knowledgeBase
    .map((document) => ({
      ...document,
      score: scoreDocument(queryTokens, document)
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  console.log("Matches", matches);
  console.log("query", query);
  console.log("queryTokens", queryTokens);
  return {
    query,
    matches,
    answer_instruction:
      matches.length > 0
        ? 'Use these knowledge base matches as grounding context. Mention source values when useful.'
        : 'No relevant knowledge base matches were found. Answer from general knowledge only if appropriate, and say when the knowledge base has no match.'
  };
}
