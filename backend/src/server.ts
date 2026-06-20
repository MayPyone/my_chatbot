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
import { createChatCompletion, type ToolCall } from './openrouter.js';
import { searchKnowledgeBase } from './rag.js';
import { degreeToCelsius } from './tools.js';
import type { OpenRouterMessage } from './types.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);
const systemPrompt =
  'You are a helpful, concise chatbot. Use searchKnowledgeBase before answering questions about this app, backend, frontend, setup, APIs, database schema, tools, or runtime behavior. Answer clearly and ask a follow-up question only when it is necessary.';

function convertCurrency(input: { from: string; to: string; amount: number }) {
  const ratesToMmk: Record<string, number> = {
    USD: 3500,
    SGD: 2600,
    THB: 100,
    MMK: 1
  };

  const from = input.from.toUpperCase();
  const to = input.to.toUpperCase();
  const amount = Number(input.amount);

  if (!Number.isFinite(amount)) {
    throw new Error('Currency amount must be a valid number');
  }

  if (!ratesToMmk[from]) {
    throw new Error(`Unsupported source currency: ${input.from}`);
  }

  if (!ratesToMmk[to]) {
    throw new Error(`Unsupported target currency: ${input.to}`);
  }

  const amountInMmk = amount * ratesToMmk[from];
  const convertedAmount = amountInMmk / ratesToMmk[to];

  return {
    from,
    to,
    amount,
    convertedAmount,
    rate: ratesToMmk[from] / ratesToMmk[to]
  };
}

type CalculateOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo';

function calculate(input: { expression?: string; number1?: number; number2?: number; operation?: CalculateOperation }) {
  if (typeof input.expression === 'string') {
    const expression = input.expression.trim();

    if (!expression) {
      throw new Error('Calculation expression is required');
    }

    if (expression.length > 200) {
      throw new Error('Calculation expression is too long');
    }

    if (!/^[\d+\-*/().%\s]+$/.test(expression)) {
      throw new Error('Calculation expression contains unsupported characters');
    }

    const result = Function(`"use strict"; return (${expression});`)() as unknown;

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error('Calculation result must be a finite number');
    }

    return {
      expression,
      result
    };
  }

  const { number1, number2, operation } = input;

  if (typeof number1 !== 'number' || typeof number2 !== 'number' || !operation) {
    throw new Error('calculate requires expression or number1, number2, and operation');
  }

  if (!Number.isFinite(number1) || !Number.isFinite(number2)) {
    throw new Error('Calculation parameters must be finite numbers');
  }

  let result: number;

  switch (operation) {
    case 'add':
      result = number1 + number2;
      break;
    case 'subtract':
      result = number1 - number2;
      break;
    case 'multiply':
      result = number1 * number2;
      break;
    case 'divide':
      if (number2 === 0) {
        throw new Error('Cannot divide by zero');
      }
      result = number1 / number2;
      break;
    case 'modulo':
      if (number2 === 0) {
        throw new Error('Cannot modulo by zero');
      }
      result = number1 % number2;
      break;
    default:
      throw new Error(`Unsupported calculation operation: ${operation}`);
  }

  return {
    number1,
    number2,
    operation,
    result
  };
}

function parseToolArguments(value: string | Record<string, unknown>) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Invalid tool arguments: ${value}`);
  }
}

function executeToolCall(toolCall: ToolCall) {
  const args = parseToolArguments(toolCall.function.arguments);

  if (!args || typeof args !== 'object') {
    throw new Error('Tool arguments must be an object');
  }

  if (toolCall.function.name === 'degreeToCelsius') {
    const input = args as { degree?: unknown; scale?: unknown };

    if (typeof input.degree !== 'number' || typeof input.scale !== 'string') {
      throw new Error('degreeToCelsius requires degree and scale');
    }

    return degreeToCelsius({
      degree: input.degree,
      scale: input.scale
    });
  }

  if (toolCall.function.name === 'convertCurrency') {
    const input = args as { from?: unknown; to?: unknown; amount?: unknown };

    if (typeof input.from !== 'string' || typeof input.to !== 'string' || typeof input.amount !== 'number') {
      throw new Error('convertCurrency requires from, to, and amount');
    }

    return convertCurrency({
      from: input.from,
      to: input.to,
      amount: input.amount
    });
  }

  if (toolCall.function.name === 'calculate') {
    const input = args as { expression?: unknown; number1?: unknown; number2?: unknown; operation?: unknown };

    if (typeof input.expression === 'string') {
      return calculate({
        expression: input.expression
      });
    }

    if (
      typeof input.number1 !== 'number' ||
      typeof input.number2 !== 'number' ||
      !['add', 'subtract', 'multiply', 'divide', 'modulo'].includes(String(input.operation))
    ) {
      throw new Error('calculate requires expression or number1, number2, and operation');
    }

    return calculate({
      number1: input.number1,
      number2: input.number2,
      operation: input.operation as CalculateOperation
    });
  }

  if (toolCall.function.name === 'searchKnowledgeBase') {
    const input = args as { query?: unknown; limit?: unknown };

    console.log("Executing searchKnowledgeBase with input", input);

    if (typeof input.query !== 'string') {
      throw new Error('searchKnowledgeBase requires query');
    }

    if (input.limit !== undefined && typeof input.limit !== 'number') {
      throw new Error('searchKnowledgeBase limit must be a number');
    }

    return searchKnowledgeBase({
      query: input.query,
      limit: input.limit
    });
  }

  throw new Error(`Unsupported tool call: ${toolCall.function.name}`);
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
    const conversationId = String(req.body.conversation_id ?? '');
    const content = String(req.body.message ?? '').trim();

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

    const previousMessages = await getMessages(conversationId);
    const userMessage = await insertMessage({
      conversationId,
      role: 'user',
      content
    });

    let currentHistory: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      ...toOpenRouterMessages(previousMessages),
      { role: 'user', content }
    ];

    const responseMessages = [userMessage];

    let isFinished = false;
    let steps = 0;
    const MAX_STEPS = 10;
    //agent loop starts
    while (!isFinished && steps < MAX_STEPS) {
      steps++;
      const aiMessage = await createChatCompletion(currentHistory);

      const insertedAssistantMessage = await insertMessage({
        conversationId,
        role: 'assistant',
        content: aiMessage.content,
        toolCalls: aiMessage.tool_calls
      });
      responseMessages.push(insertedAssistantMessage);

      currentHistory.push({
        role: 'assistant',
        content: aiMessage.content,
        tool_calls: aiMessage.tool_calls
      });

      if (aiMessage.tool_calls?.length) {

        const toolMessages = aiMessage.tool_calls.map((toolCall) => {
          try {
            const toolResult = executeToolCall(toolCall);
            return {
              role: 'tool' as const,
              content: JSON.stringify(toolResult),
              tool_call_id: toolCall.id
            };
          } catch (error) {
            return {
              role: 'tool' as const,
              content: JSON.stringify({ error: error instanceof Error ? error.message : 'Tool execution failed' }),
              tool_call_id: toolCall.id
            };
          }
        });

        for (const toolMessage of toolMessages) {
          const insertedToolMessage = await insertMessage({
            conversationId,
            role: 'tool',
            content: toolMessage.content,
            toolCallId: toolMessage.tool_call_id
          });
          responseMessages.push(insertedToolMessage);
          currentHistory.push(toolMessage);
        }



      } else {
        isFinished = true;
      }
    }


    if (steps >= MAX_STEPS) {
      console.warn(`Agent stopped: Max steps (${MAX_STEPS}) reached.`);
    }

    const shouldTitle = conversation.title === 'New Chat' && previousMessages.length === 0;
    const updatedConversation = shouldTitle
      ? await updateConversationTitle(conversationId, content.slice(0, 60))
      : null;

    res.json({
      conversation: updatedConversation ?? conversation,
      messages: responseMessages
    });
  } catch (error) {
    next(error);
  }
});

// app.post('/api/chat', async (req, res, next) => {
//   try {
//     const conversationId = String(req.body.conversation_id ?? '');
//     const content = String(req.body.message ?? '').trim();

//     if (!conversationId) {
//       res.status(400).json({ error: 'conversation_id is required' });
//       return;
//     }

//     if (!content) {
//       res.status(400).json({ error: 'message is required' });
//       return;
//     }

//     const conversation = await getConversation(conversationId);

//     if (!conversation) {
//       res.status(404).json({ error: 'Conversation not found' });
//       return;
//     }
//     //fetch all messages from db for the conversation
//     const previousMessages = await getMessages(conversationId);
//     //insert the user message into db
//     const userMessage = await insertMessage({
//       conversationId,
//       role: 'user',
//       content
//     });

//     const history: OpenRouterMessage[] = [
//       { role: 'system', content: systemPrompt },
//       ...toOpenRouterMessages(previousMessages),
//       { role: 'user', content }
//     ];

//     //console.log("history", history)

//     const aiMessage = await createChatCompletion(history);
//     const responseMessages = [userMessage];

//     //Add ai response to db
//     const assistantMessageWithToolCalls = await insertMessage({
//       conversationId,
//       role: 'assistant',
//       content: aiMessage.content,
//       toolCalls: aiMessage.tool_calls
//     });

//     responseMessages.push(assistantMessageWithToolCalls);

//     let finalAssistantMessage = assistantMessageWithToolCalls;



//     if (aiMessage.tool_calls?.length) {
//       const toolMessages = aiMessage.tool_calls.map((toolCall) => {
//         const toolResult = executeToolCall(toolCall);

//         return {
//           role: 'tool' as const,
//           content: JSON.stringify(toolResult),
//           tool_call_id: toolCall.id
//         };
//       });

//       // Insert tool messages into the database and add them to the response
//       for (const toolMessage of toolMessages) {
//         const insertedToolMessage = await insertMessage({
//           conversationId,
//           role: 'tool',
//           content: toolMessage.content,
//           toolCallId: toolMessage.tool_call_id
//         });

//         responseMessages.push(insertedToolMessage);
//       }

//       // Create a new history for the final AI message, including the tool messages
//      // console.log("toolcall result", toolMessages)
// //      toolcall result [
// //   {
// //     role: 'tool',
// //     content: '{"number1":1,"number2":1,"operation":"add","result":2}',
// //     tool_call_id: 'call_PWTiMkFUYORpER78AKqPZDLK'
// //   },
// //   {
// //     role: 'tool',
// //     content: '{"from":"USD","to":"MMK","amount":100,"convertedAmount":350000,"rate":3500}',
// //     tool_call_id: 'call_6uxix7Jv02S4r1ieEdBFv6g1'
// //   }
// // ]
//       const finalHistory: OpenRouterMessage[] = [
//         ...history,
//         {
//           role: 'assistant',
//           content: aiMessage.content,
//           tool_calls: aiMessage.tool_calls
//         },
//         ...toolMessages
//       ];

//       const finalAiMessage = await createChatCompletion(finalHistory);

//       finalAssistantMessage = await insertMessage({
//         conversationId,
//         role: 'assistant',
//         content: finalAiMessage.content,
//         toolCalls: finalAiMessage.tool_calls
//       });

//       responseMessages.push(finalAssistantMessage);
//     }

//     const shouldTitle = conversation.title === 'New Chat' && previousMessages.length === 0;
//     const updatedConversation = shouldTitle
//       ? await updateConversationTitle(conversationId, content.slice(0, 60))
//       : null;

//     //console.log('Updated conversation:', updatedConversation);
//     //console.log('Returning response with conversation:', updatedConversation ?? conversation);
//     //console.log('Returning response with messages:', responseMessages);

//     res.json({
//       conversation: updatedConversation ?? conversation,
//       messages: responseMessages
//     });
//   } catch (error) {
//     next(error);
//   }
// });



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
