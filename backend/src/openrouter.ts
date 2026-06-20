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
      name: 'degreeToCelsius',
      description: 'Convert a temperature from Fahrenheit or Kelvin to Celsius.',
      parameters: {
        type: 'object',
        properties: {
          degree: { type: 'number', description: 'The temperature value to convert.' },
          scale: { type: 'string', enum: ['F', 'K'], description: 'The scale of the input temperature, either F for Fahrenheit or K for Kelvin.' }
        },
        required: ['degree', 'scale']
      }
    }
  },
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
        'Calculate basic arithmetic using two numbers and an operation.',
      parameters: {
        type: 'object',
        properties: {
          number1: {
            type: 'number',
            description: 'The first number for a two-parameter calculation.'
          },
          number2: {
            type: 'number',
            description: 'The second number for a two-parameter calculation.'
          },
          operation: {
            type: 'string',
            enum: ['add', 'subtract', 'multiply', 'divide', 'modulo'],
            description: 'The operation to apply to number1 and number2.'
          }
        },
        required: ['number1', 'number2', 'operation']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchKnowledgeBase',
      description:
        'Search the local project knowledge base before answering questions about this app, backend, frontend, setup, APIs, database schema, tools, or runtime behavior.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The user question or focused search phrase to retrieve project-specific context for.'
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
