import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { initializeDatabase } from './db.js';
import {
  createConversation,
  getConversation,
  getMessages,
  insertMessage,
  listConversations,
  toOpenRouterMessages,
  updateConversationTitle
} from './repositories.js';
import { createChatCompletion } from './openrouter.js';
import { executeToolCall } from './toolHandlers.js';
import type { Conversation, OpenRouterMessage, StoredMessage } from './types.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);
const systemPrompt =
  'You are a helpful, concise chatbot. Use searchKnowledgeBase before answering questions about this app, setup, runtime URLs, or project-specific details. Answer clearly and ask a follow-up question only when it is necessary.';

function readChatRequestBody(body: unknown) {
  // Express gives us an untyped request body, so pull out only the fields this route supports.
  const rawBody = body as { conversation_id?: unknown; message?: unknown };

  // Normalize both values once so every later step can rely on clean strings.
  const conversationId = String(rawBody.conversation_id ?? '');
  const content = String(rawBody.message ?? '').trim();

  return {
    conversationId,
    content
  };
}

function buildInitialHistory(previousMessages: StoredMessage[], content: string): OpenRouterMessage[] {
  // Start with system instructions so the model knows when to use RAG.
  return [
    { role: 'system', content: systemPrompt },
    // Replay saved conversation messages so the model has conversational context.
    ...toOpenRouterMessages(previousMessages),
    // Add the newest user message last because it is the turn we are answering.
    { role: 'user', content }
  ];
}

function buildToolMessages(aiMessage: Awaited<ReturnType<typeof createChatCompletion>>) {
  // If the model did not request tools, there is nothing to execute.
  if (!aiMessage.tool_calls?.length) {
    return [];
  }

  // Execute each requested tool and wrap the result in OpenAI/OpenRouter's tool-message shape.
  return aiMessage.tool_calls.map((toolCall) => ({
    role: 'tool' as const,
    content: JSON.stringify(executeToolCall(toolCall)),
    tool_call_id: toolCall.id
  }));
}

async function saveToolMessages(conversationId: string, toolMessages: OpenRouterMessage[]) {
  // Persist tool results so future turns can reconstruct exactly what the model saw.
  const savedMessages: StoredMessage[] = [];

  for (const toolMessage of toolMessages) {
    const savedMessage = await insertMessage({
      conversationId,
      role: 'tool',
      content: toolMessage.content,
      toolCallId: toolMessage.tool_call_id
    });

    savedMessages.push(savedMessage);
  }

  return savedMessages;
}

function buildFinalHistory(
  initialHistory: OpenRouterMessage[],
  aiMessage: Awaited<ReturnType<typeof createChatCompletion>>,
  toolMessages: OpenRouterMessage[]
) {
  // The second model call includes the assistant tool request plus the tool results.
  return [
    ...initialHistory,
    {
      role: 'assistant' as const,
      content: aiMessage.content,
      tool_calls: aiMessage.tool_calls
    },
    ...toolMessages
  ];
}

async function updateTitleForFirstMessage(conversation: Conversation, previousMessages: StoredMessage[], content: string) {
  // Only rename brand-new conversations, leaving existing custom titles untouched.
  const shouldTitle = conversation.title === 'New Chat' && previousMessages.length === 0;

  if (!shouldTitle) {
    return null;
  }

  return updateConversationTitle(conversation.id, content.slice(0, 60));
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173'
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/conversations', async (_req, res, next) => {
  try {
    const conversation = await createConversation();
    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
});

app.get('/api/conversations', async (_req, res, next) => {
  try {
    const conversations = await listConversations();
    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

app.get('/api/conversations/:id/messages', async (req, res, next) => {
  try {
    const conversation = await getConversation(req.params.id);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = await getMessages(req.params.id);
    res.json({ conversation, messages });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat', async (req, res, next) => {
  try {
    const { conversationId, content } = readChatRequestBody(req.body);

    if (!conversationId) {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }

    if (!content) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const conversation = await getConversation(conversationId);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Load saved messages before inserting the new user message so the first-turn title check is accurate.
    const previousMessages = await getMessages(conversationId);

    // Persist the user's message immediately so the UI can display the accepted input.
    const userMessage = await insertMessage({
      conversationId,
      role: 'user',
      content
    });

    // Build the first model request from system instructions, prior chat history, and this user message.
    const history = buildInitialHistory(previousMessages, content);

    // Let the model answer directly or request tools such as searchKnowledgeBase.
    const aiMessage = await createChatCompletion(history);
    const responseMessages = [userMessage];

    // Store the assistant's first response, including any tool calls it requested.
    const assistantMessageWithToolCalls = await insertMessage({
      conversationId,
      role: 'assistant',
      content: aiMessage.content,
      toolCalls: aiMessage.tool_calls
    });

    responseMessages.push(assistantMessageWithToolCalls);

    // Execute requested tools and persist their outputs so the final answer can be grounded.
    const toolMessages = buildToolMessages(aiMessage);

    if (toolMessages.length) {
      responseMessages.push(...(await saveToolMessages(conversationId, toolMessages)));

      // Ask the model for the final answer after it has seen the retrieved/tool context.
      const finalHistory = buildFinalHistory(history, aiMessage, toolMessages);
      const finalAiMessage = await createChatCompletion(finalHistory);

      const finalAssistantMessage = await insertMessage({
        conversationId,
        role: 'assistant',
        content: finalAiMessage.content,
        toolCalls: finalAiMessage.tool_calls
      });

      responseMessages.push(finalAssistantMessage);
    }

    // Give new conversations a useful title based on the first user message.
    const updatedConversation = await updateTitleForFirstMessage(conversation, previousMessages, content);

    res.json({
      conversation: updatedConversation ?? conversation,
      messages: responseMessages
    });
  } catch (error) {
    next(error);
  }
});



app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  console.error(error);
  res.status(500).json({ error: message });
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database');
    console.error(error);
    process.exit(1);
  });
