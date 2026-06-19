import type { ToolCall } from './openrouter.js';
import { searchKnowledgeBase } from './rag.js';

function convertCurrency(input: { from: string; to: string; amount: number }) {
  // Keep rates in one place so the conversion math below stays easy to audit.
  const ratesToMmk: Record<string, number> = {
    USD: 3500,
    SGD: 2600,
    THB: 100,
    MMK: 1
  };

  // Normalize currency codes because users and models may provide lowercase values.
  const from = input.from.toUpperCase();
  const to = input.to.toUpperCase();
  const amount = Number(input.amount);

  // Reject invalid numbers before doing any conversion math.
  if (!Number.isFinite(amount)) {
    throw new Error('Currency amount must be a valid number');
  }

  // Make unsupported currencies explicit so the assistant can explain the limitation.
  if (!ratesToMmk[from]) {
    throw new Error(`Unsupported source currency: ${input.from}`);
  }

  if (!ratesToMmk[to]) {
    throw new Error(`Unsupported target currency: ${input.to}`);
  }

  // Convert through MMK as the shared base currency.
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

function calculate(input: { expression: string }) {
  // Trim whitespace so validation and evaluation use the same expression.
  const expression = input.expression.trim();

  if (!expression) {
    throw new Error('Calculation expression is required');
  }

  // Keep tool input bounded so accidental long prompts are not evaluated.
  if (expression.length > 200) {
    throw new Error('Calculation expression is too long');
  }

  // Allow only simple arithmetic characters before evaluating the expression.
  if (!/^[\d+\-*/().%\s]+$/.test(expression)) {
    throw new Error('Calculation expression contains unsupported characters');
  }

  // Evaluate the already-validated arithmetic expression.
  const result = Function(`"use strict"; return (${expression});`)() as unknown;

  // Ensure the model receives a normal finite number, not Infinity, NaN, or another type.
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Calculation result must be a finite number');
  }

  return {
    expression,
    result
  };
}

function parseToolArguments(value: string | Record<string, unknown>) {
  // OpenRouter usually sends function arguments as a JSON string.
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Invalid tool arguments: ${value}`);
  }
}

function assertObjectArguments(value: unknown) {
  // Every tool in this app expects a JSON object.
  if (!value || typeof value !== 'object') {
    throw new Error('Tool arguments must be an object');
  }

  return value as Record<string, unknown>;
}

function executeConvertCurrency(args: Record<string, unknown>) {
  // Validate each required field before calling the currency implementation.
  if (typeof args.from !== 'string' || typeof args.to !== 'string' || typeof args.amount !== 'number') {
    throw new Error('convertCurrency requires from, to, and amount');
  }

  return convertCurrency({
    from: args.from,
    to: args.to,
    amount: args.amount
  });
}

function executeCalculate(args: Record<string, unknown>) {
  // Validate the expression type before evaluating it.
  if (typeof args.expression !== 'string') {
    throw new Error('calculate requires expression');
  }

  return calculate({
    expression: args.expression
  });
}

function executeSearchKnowledgeBase(args: Record<string, unknown>) {
  // Validate the user's search query before passing it to retrieval.
  if (typeof args.query !== 'string') {
    throw new Error('searchKnowledgeBase requires query');
  }

  // The model may omit limit; when present it must be numeric.
  if (args.limit !== undefined && typeof args.limit !== 'number') {
    throw new Error('searchKnowledgeBase limit must be a number');
  }

  return searchKnowledgeBase({
    query: args.query,
    limit: args.limit
  });
}

export function executeToolCall(toolCall: ToolCall) {
  // Convert the raw OpenRouter tool arguments into a plain object.
  const args = assertObjectArguments(parseToolArguments(toolCall.function.arguments));

  // Dispatch by tool name so each implementation can keep its own validation small.
  if (toolCall.function.name === 'convertCurrency') {
    return executeConvertCurrency(args);
  }

  if (toolCall.function.name === 'calculate') {
    return executeCalculate(args);
  }

  if (toolCall.function.name === 'searchKnowledgeBase') {
    return executeSearchKnowledgeBase(args);
  }

  throw new Error(`Unsupported tool call: ${toolCall.function.name}`);
}
