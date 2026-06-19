export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tool_calls: unknown | null;
  tool_call_id: string | null;
  created_at: string;
}

export interface OpenRouterMessage {
  role: MessageRole;
  content: string;
  tool_calls?: unknown;
  tool_call_id?: string;
}

