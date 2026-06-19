export async function convertCurrency(input: { from: string; to: string; amount: number }) {
    const { from, to, amount } = input;

    const mockRates: Record<string, number> = {
        'USD_MMK': 4500,
        'SGD_MMK': 3300,
        'THB_MMK': 120
    };

    const key = `${from.toUpperCase()}_${to.toUpperCase()}`;
    const rate = mockRates[key];

    if (!rate) {
        return { error: `Sorry, exchange rate for ${from} to ${to} is not supported.` };
    }

    const result = amount * rate;
    return {
        from,
        to,
        amount,
        exchange_rate: rate,
        converted_result: result,
        date: new Date().toISOString()
    };
}