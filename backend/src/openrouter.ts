import type { OpenRouterMessage } from './types.js';

interface OpenRouterChoice {
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: ToolCall[];
  };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: {
    message?: string;
  };
}

export const tools = [
  {
    type: 'function',
    function: {
      name: 'convertCurrency',
      description:
        'Convert an amount from one currency to another using simulated exchange rates. Supported currencies: USD, SGD, THB, MMK.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'The currency code to convert from, for example USD, SGD, THB, or MMK.' },
          to: { type: 'string', description: 'The currency code to convert to, for example USD, SGD, THB, or MMK.' },
          amount: { type: 'number', description: 'The amount of money to convert.' }
        },
        required: ['from', 'to', 'amount']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description:
        'Calculate a basic arithmetic expression. Supports numbers, parentheses, addition, subtraction, multiplication, division, and modulo.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'The arithmetic expression to calculate, for example: 12 * (5 + 3).'
          }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchKnowledgeBase',
      description:
        'Retrieve relevant knowledge base passages before answering questions about this app, setup, runtime URLs, or project-specific details.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The user question or focused search phrase to retrieve relevant knowledge base context for.'
          },
          limit: {
            type: 'number',
            description: 'Optional maximum number of matching knowledge base passages to return. Defaults to 3.'
          }
        },
        required: ['query']
      }
    }
  }
];

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

export async function createChatCompletion(messages: OpenRouterMessage[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:5173',
      'X-Title': process.env.OPENROUTER_APP_NAME ?? 'Full Stack Chatbot'
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto'
    })
  });


  const data = (await response.json()) as OpenRouterResponse;
  console.log('OpenRouter API response:', data);

  if (!response.ok) {
    throw new Error(data.error?.message ?? `OpenRouter request failed with status ${response.status}`);
  }

  const assistant = data.choices?.[0]?.message;
  const content = assistant?.content ?? '';

  if (!content && !assistant?.tool_calls) {
    throw new Error('OpenRouter returned an empty assistant response');
  }

  return {
    role: 'assistant' as const,
    content,
    tool_calls: assistant?.tool_calls ?? null
  };
}
