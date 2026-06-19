import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, Plus, Send } from 'lucide-react';
import {
  createConversation,
  fetchConversationMessages,
  fetchConversations,
  sendChatMessage
} from './api';
import type { Conversation, Message } from './types';

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canSend = Boolean(activeConversation && input.trim() && !isSending);

  useEffect(() => {
    fetchConversations()
      .then(setConversations)
      .catch((caught) => setError(caught.message))
      .finally(() => setIsLoadingConversations(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const activeTitle = useMemo(() => activeConversation?.title ?? 'New Conversation', [activeConversation]);

  async function handleNewConversation() {
    setError(null);
    setIsLoadingMessages(true);

    try {
      const conversation = await createConversation();
      setConversations((current) => [conversation, ...current]);
      setActiveConversation(conversation);
      setMessages([]);
      setInput('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create conversation');
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function handleSelectConversation(conversation: Conversation) {
    setError(null);
    setActiveConversation(conversation);
    setIsLoadingMessages(true);

    try {
      const result = await fetchConversationMessages(conversation.id);
      setActiveConversation(result.conversation);
      setMessages(result.messages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSend || !activeConversation) {
      return;
    }

    const text = input.trim();
    setInput('');
    setError(null);
    setIsSending(true);

    try {
      const result = await sendChatMessage(activeConversation.id, text);
      setMessages((current) => [...current, ...result.messages]);
      setActiveConversation(result.conversation);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === result.conversation.id ? result.conversation : conversation
        )
      );
    } catch (caught) {
      setInput(text);
      setError(caught instanceof Error ? caught.message : 'Could not send message');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex h-16 items-center justify-between border-b border-zinc-800 px-4">
          <div className="flex items-center gap-2 font-semibold">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
            Chatbot
          </div>
          <button
            type="button"
            onClick={handleNewConversation}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 text-zinc-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            aria-label="New conversation"
            title="New conversation"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoadingConversations ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-2 py-3 text-sm text-zinc-400">No conversations yet.</div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conversation) => {
                const isActive = activeConversation?.id === conversation.id;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelectConversation(conversation)}
                    className={`w-full rounded-md px-3 py-2 text-left transition ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-50'
                        : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-50'
                    }`}
                  >
                    <div className="truncate text-sm font-medium">{conversation.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">{formatDate(conversation.created_at)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center border-b border-zinc-800 px-6">
          <h1 className="truncate text-base font-semibold">{activeTitle}</h1>
        </header>

        <section className="flex-1 overflow-y-auto px-6 py-6">
          {error ? (
            <div className="mb-4 rounded-md border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {!activeConversation ? (
            <div className="flex h-full items-center justify-center">
              <button
                type="button"
                onClick={handleNewConversation}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-emerald-500 hover:text-emerald-300"
              >
                <Plus className="h-4 w-4" />
                New Conversation
              </button>
            </div>
          ) : isLoadingMessages ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              {messages.length === 0 ? (
                <div className="py-20 text-center text-sm text-zinc-500">Start this conversation below.</div>
              ) : (
                messages
                  .filter((message) => message.role !== 'tool' && message.content.trim())
                  .map((message) => (
                    <article
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 ${
                          message.role === 'user'
                            ? 'bg-emerald-500 text-zinc-950'
                            : 'bg-zinc-850 border border-zinc-800 text-zinc-100'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">{message.content}</div>
                      </div>
                    </article>
                  ))
              )}
              {isSending ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={activeConversation ? 'Message the assistant' : 'Create a conversation to start'}
              disabled={!activeConversation || isSending}
              rows={1}
              className="min-h-12 flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-emerald-500 text-zinc-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
              title="Send message"
            >
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default App;
