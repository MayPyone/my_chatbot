import type { Conversation, Message } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed with status ${response.status}`);
  }

  return data as T;
}

export function fetchConversations() {
  return request<Conversation[]>('/api/conversations');
}

export function createConversation() {
  return request<Conversation>('/api/conversations', {
    method: 'POST'
  });
}

export function fetchConversationMessages(conversationId: string) {
  return request<{ conversation: Conversation; messages: Message[] }>(
    `/api/conversations/${conversationId}/messages`
  );
}

export function sendChatMessage(conversationId: string, message: string) {
  return request<{ conversation: Conversation; messages: Message[] }>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: conversationId,
      message
    })
  });
}
