import {
  buildPrompt,
  compressTransactions,
  deriveSessionTitle,
  sanitizeField,
  toCompactDate,
  type AssistantPromptContext,
  type AssistantTransactionRow,
} from './assistant-context.builder';
import { MAX_NAME_CHARS, MAX_SESSION_TITLE_CHARS } from './assistant.constants';

const row = (
  overrides: Partial<AssistantTransactionRow> = {},
): AssistantTransactionRow => ({
  date: '2026-08-11',
  merchant: 'Konzum',
  amountCents: 1234,
  categoryName: 'Groceries',
  ...overrides,
});

const context = (
  overrides: Partial<AssistantPromptContext> = {},
): AssistantPromptContext => ({
  today: '2026-08-11',
  currency: 'EUR',
  period: { start: '2026-08-01', end: '2026-09-01', label: 'August 2026' },
  budgetCents: 150_000,
  categories: [{ name: 'Groceries', cap: 400 }],
  transactions: [row()],
  truncation: null,
  ...overrides,
});

describe('sanitizeField', () => {
  // The delimiter strip is the one thing in this file whose absence produces a
  // confidently wrong answer rather than an error, so it is pinned from every
  // direction rather than sampled.
  it('strips the row delimiter', () => {
    expect(sanitizeField('Bar | Grill')).toBe('Bar Grill');
  });

  it('strips carriage returns and newlines', () => {
    expect(sanitizeField('Two\r\nLines')).toBe('Two Lines');
  });

  it('collapses runs of whitespace to one space and trims', () => {
    expect(sanitizeField('  Konzum   Super  ')).toBe('Konzum Super');
  });

  it('collapses a run made of mixed delimiters', () => {
    expect(sanitizeField('A|\n|B')).toBe('A B');
  });

  it('caps a pathological name', () => {
    expect(sanitizeField('x'.repeat(500))).toHaveLength(MAX_NAME_CHARS);
  });

  it('leaves an ordinary name verbatim', () => {
    // Merchant names are deliberately not shortened; see MAX_NAME_CHARS.
    expect(sanitizeField('Konzum Superkonzum')).toBe('Konzum Superkonzum');
  });
});

describe('toCompactDate', () => {
  it('converts by string work', () => {
    expect(toCompactDate('2026-08-11')).toBe('260811');
  });

  it('keeps a leading-zero month and day', () => {
    expect(toCompactDate('2026-01-05')).toBe('260105');
  });
});

describe('compressTransactions', () => {
  it('writes one row per line in the documented format', () => {
    expect(compressTransactions([row()])).toBe('260811|Konzum|12.34|Groceries');
  });

  it('separates rows with a newline', () => {
    expect(compressTransactions([row(), row({ merchant: 'Tisak' })])).toBe(
      '260811|Konzum|12.34|Groceries\n260811|Tisak|12.34|Groceries',
    );
  });

  it('sanitises a merchant carrying the delimiter, so the row keeps four fields', () => {
    const line = compressTransactions([row({ merchant: 'Bar | Grill' })]);

    expect(line.split('|')).toHaveLength(4);
    expect(line).toBe('260811|Bar Grill|12.34|Groceries');
  });

  it('sanitises a category name too', () => {
    expect(compressTransactions([row({ categoryName: 'Food|Drink' })])).toBe(
      '260811|Konzum|12.34|Food Drink',
    );
  });

  it('takes money through fromCents and always writes two decimals', () => {
    expect(compressTransactions([row({ amountCents: 402 })])).toContain(
      '|4.02|',
    );
    expect(compressTransactions([row({ amountCents: 1000 })])).toContain(
      '|10.00|',
    );
    expect(compressTransactions([row({ amountCents: 0 })])).toContain('|0.00|');
  });

  it('is empty for no rows', () => {
    expect(compressTransactions([])).toBe('');
  });
});

describe('buildPrompt', () => {
  it('names the period its budget and caps belong to', () => {
    const prompt = buildPrompt(context());

    expect(prompt).toContain('August 2026');
    expect(prompt).toContain('2026-08-01');
    expect(prompt).toContain('1500.00');
  });

  it('states the currency once rather than per row', () => {
    const prompt = buildPrompt(context({ currency: 'GBP' }));

    expect(prompt).toContain('in GBP');
    expect(prompt).not.toContain('GBP|');
  });

  it('says a category with no cap is a deliberate choice', () => {
    const prompt = buildPrompt(
      context({ categories: [{ name: 'Coffee', cap: null }] }),
    );

    expect(prompt).toContain('Coffee: no cap');
  });

  it('says so when no caps are set at all', () => {
    const prompt = buildPrompt(context({ categories: [] }));

    expect(prompt).toContain('no per-category caps');
  });

  it('states the dates are in the 2000s, which is what YYMMDD costs', () => {
    expect(buildPrompt(context())).toContain('2000s');
  });

  it('claims a complete history when nothing was truncated', () => {
    expect(buildPrompt(context())).toContain('complete transaction history');
  });

  it('tells the model it was truncated, with the counts and the oldest date', () => {
    // The ceiling is unreachable on every account this project has, so this
    // case is constructed rather than seeded - see MAX_PROMPT_TRANSACTIONS.
    const prompt = buildPrompt(
      context({
        truncation: {
          included: 3000,
          total: 4210,
          oldestIncludedDate: '2024-02-09',
        },
      }),
    );

    expect(prompt).toContain('most recent 3000 of 4210');
    expect(prompt).toContain('2024-02-09');
    expect(prompt).not.toContain('complete transaction history');
  });

  it('carries the digest itself', () => {
    expect(buildPrompt(context())).toContain('260811|Konzum|12.34|Groceries');
  });

  it('asks for markdown and says it is rendered', () => {
    // PET-76. The rule this replaces forbade markdown, the model emitted it
    // anyway, and the bubble printed the asterisks - so the instruction was
    // both ignored and, once the frontend started rendering, false. Pinned
    // because the sentence is only correct while
    // `frontend/src/app/(app)/insights/AssistantMarkdown.tsx` exists to render
    // it: the two are one decision stated in two repositories' worth of files.
    const prompt = buildPrompt(context());

    expect(prompt).toContain('markdown, which is rendered');
    expect(prompt).toContain('table');
    // Raw HTML is escaped rather than parsed on the way out, so a reply full of
    // tags would be shown as tags. Asking for none is what avoids that.
    expect(prompt).toContain('no raw HTML');
    expect(prompt).not.toContain('Answer in plain prose');
  });

  it('sends no category id, so nothing identifying travels with a name', () => {
    const prompt = buildPrompt(context());

    expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

describe('deriveSessionTitle', () => {
  it('keeps a short message whole', () => {
    expect(deriveSessionTitle('Where did my money go?')).toBe(
      'Where did my money go?',
    );
  });

  it('collapses whitespace', () => {
    expect(deriveSessionTitle('  How   much\non food? ')).toBe(
      'How much on food?',
    );
  });

  it('cuts a long message on a word boundary', () => {
    const title = deriveSessionTitle(
      'Tell me everything about how much I have been spending on groceries this year and last',
    );

    expect(title.length).toBeLessThanOrEqual(MAX_SESSION_TITLE_CHARS + 1);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toContain('  ');
  });

  it('cuts a long unbroken string rather than returning nothing', () => {
    const title = deriveSessionTitle('x'.repeat(200));

    expect(title).toBe(`${'x'.repeat(MAX_SESSION_TITLE_CHARS)}…`);
  });
});
