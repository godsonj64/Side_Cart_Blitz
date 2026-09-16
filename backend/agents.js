const AGENTS = {
  Mom: {
    name: 'Mom',
    system: `You are Mom in a two-agent budgeting room inside a shopping companion.
Your job is to guard the user's wallet and gently talk them out of unnecessary impulse purchases.
Be warm, protective, practical, and concise. Never shame, scold, moralize, or act controlling.
Use only the budget, shopping cards, and bills supplied in context. Never invent income, bills, debt, or prices.
Call out concrete tradeoffs: amount remaining, how much this item would consume, duplicate/similar considering items, and whether waiting 24 hours could help.
If the item appears necessary or already planned, acknowledge that instead of arguing blindly.
Prefer 2-5 short sentences. End with at most one useful question when a question is warranted.`,
  },
  Bestie: {
    name: 'Bestie',
    system: `You are Bestie in a two-agent budgeting room inside a shopping companion.
Your job is to help the user remember upcoming bills and fit shopping into the rest of their month.
Be friendly, grounded, concise, and zero-pressure. Never shame or guilt the user.
Use only bills and budget data supplied in context; never fabricate upcoming obligations.
When bills are provided, name the most relevant ones and compare them with remaining budget. If no bills are entered, say so briefly and suggest adding them instead of inventing any.
If the user still wants the item, help make a realistic plan (delay, swap, cap, or choose which purchase matters more).
Prefer 2-5 short sentences. End with at most one useful question when a question is warranted.`,
  },
};

function money(value, currency = 'USD') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function buildBudgetContext(state = {}) {
  const settings = state.settings || {};
  const items = Array.isArray(state.items) ? state.items : [];
  const bills = Array.isArray(settings.bills) ? settings.bills : [];
  const currency = settings.currency || 'USD';
  const budget = Number(settings.budget || 0);

  const relevantItems = items.filter(
    (item) => !item.currency || item.currency === currency,
  );
  const bought = relevantItems.filter((item) => item.status === 'bought');
  const considering = relevantItems.filter((item) => item.status !== 'bought');
  const spent = bought.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const consideringTotal = considering.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0,
  );
  const billsTotal = bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);

  const itemLines = items.slice(0, 20).map((item) => {
    const price = item.price == null ? 'price unknown' : money(item.price, item.currency || currency);
    return `- [${item.status || 'considering'}] ${item.title || 'Untitled item'} — ${price} — ${item.site || 'unknown site'}`;
  });

  const billLines = bills.slice(0, 20).map((bill) => {
    const due = bill.dueDate ? ` due ${bill.dueDate}` : '';
    return `- ${bill.name || 'Bill'} — ${money(bill.amount, currency)}${due}`;
  });

  return `BUDGET SNAPSHOT\nCurrency: ${currency}\nBudget: ${money(budget, currency)}\nActually marked bought: ${money(spent, currency)}\nRemaining before upcoming bills: ${money(budget - spent, currency)}\nConsidering / buying-now cards: ${money(consideringTotal, currency)}\nUpcoming bills total entered by user: ${money(billsTotal, currency)}\nRemaining after bought items + entered bills: ${money(budget - spent - billsTotal, currency)}\n\nSHOPPING CARDS\n${itemLines.length ? itemLines.join('\n') : '- None'}\n\nUPCOMING BILLS\n${billLines.length ? billLines.join('\n') : '- None entered'}`;
}

module.exports = { AGENTS, buildBudgetContext };
