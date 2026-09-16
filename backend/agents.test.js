const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBudgetContext } = require('./agents');

test('budget context separates bought, considering, and bills', () => {
  const context = buildBudgetContext({
    settings: {
      budget: 500,
      currency: 'USD',
      bills: [{ name: 'Phone', amount: 60, dueDate: '2026-09-20' }],
    },
    items: [
      { title: 'Shoes', price: 80, status: 'bought', currency: 'USD' },
      { title: 'Lamp', price: 40, status: 'considering', currency: 'USD' },
    ],
  });

  assert.match(context, /Actually marked bought: \$80\.00/);
  assert.match(context, /Considering \/ buying-now cards: \$40\.00/);
  assert.match(context, /Upcoming bills total entered by user: \$60\.00/);
  assert.match(context, /Remaining after bought items \+ entered bills: \$360\.00/);
});
