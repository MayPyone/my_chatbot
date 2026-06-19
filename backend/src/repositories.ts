import { query } from './db.js';
import type { Conversation, MessageRole, OpenRouterMessage, StoredMessage } from './types.js';

export async function createConversation() {
  const result = await query<Conversation>(
    `INSERT INTO conversations DEFAULT VALUES
     RETURNING id, title, created_at`
  );

  return result.rows[0];
}

export async function listConversations() {
  const result = await query<Conversation>(
    `SELECT id, title, created_at
     FROM conversations
     ORDER BY created_at DESC`
  );

  return result.rows;
}

export async function getConversation(id: string) {
  const result = await query<Conversation>(
    `SELECT id, title, created_at
     FROM conversations
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}

export async function getMessages(conversationId: string) {
  const result = await query<StoredMessage>(
    `SELECT id, conversation_id, role, content, tool_calls, tool_call_id, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );

  return result.rows;
}

export async function insertMessage(input: {
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls?: unknown | null;
  toolCallId?: string | null;
}) {
  const toolCalls = input.toolCalls == null ? null : JSON.stringify(input.toolCalls);

  //return array of messages inserted, but in our case, it will always be one message, so we return the first element of the array
  const result = await query<StoredMessage>(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, tool_call_id)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id, conversation_id, role, content, tool_calls, tool_call_id, created_at`,
    [input.conversationId, input.role, input.content, toolCalls, input.toolCallId ?? null]
  );

  console.log('Inserted message:', result.rows);

  return result.rows[0];
}

export async function updateConversationTitle(conversationId: string, title: string) {
  const result = await query<Conversation>(
    `UPDATE conversations
     SET title = $2
     WHERE id = $1 AND title = 'New Chat'
     RETURNING id, title, created_at`,
    [conversationId, title]
  );

  return result.rows[0] ?? null;
}

export function toOpenRouterMessages(messages: StoredMessage[]): OpenRouterMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}), //if there is tool_calls in db, include, else, don't include
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {})
  }));
}
