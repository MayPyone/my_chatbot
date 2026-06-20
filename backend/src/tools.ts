export type CalculateOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo';

export function convertCurrency(input: { from: string; to: string; amount: number }) {
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

export function degreeToCelsius(input: { degree: number; scale: string }) {
  if (!Number.isFinite(input.degree)) {
    throw new Error('Temperature must be a valid number');
  }

  switch (input.scale.toLowerCase()) {
    case 'c':
      return input.degree;
    case 'f':
      return (input.degree - 32) * (5 / 9);
    case 'k':
      return input.degree - 273.15;
    default:
      throw new Error(`Unsupported temperature scale: ${input.scale}`);
  }
}

export function calculate(input: { number1: number; number2: number; operation: CalculateOperation }) {
  if (!Number.isFinite(input.number1) || !Number.isFinite(input.number2)) {
    throw new Error('Calculation parameters must be finite numbers');
  }

  switch (input.operation) {
    case 'add':
      return { ...input, result: input.number1 + input.number2 };
    case 'subtract':
      return { ...input, result: input.number1 - input.number2 };
    case 'multiply':
      return { ...input, result: input.number1 * input.number2 };
    case 'divide':
      if (input.number2 === 0) {
        throw new Error('Cannot divide by zero');
      }

      return { ...input, result: input.number1 / input.number2 };
    case 'modulo':
      if (input.number2 === 0) {
        throw new Error('Cannot modulo by zero');
      }

      return { ...input, result: input.number1 % input.number2 };
  }
}
