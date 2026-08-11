import { scrollToLatest } from './chatScroll';

// jsdom runs no layout, so every offset here is whatever the stub says - which is the same split
// `lib/pickerScroll.test.ts` and `BudgetForm`'s caret restore both live with. What this file can
// prove is that the write happens, that it writes the computed value, and that it touches exactly
// one element. Whether the page really moves is a browser check.

describe('scrollToLatest', () => {
  it('writes scrollHeight onto scrollTop', () => {
    const element = { scrollTop: 0, scrollHeight: 1840 } as unknown as Element;

    scrollToLatest(element);

    expect(element.scrollTop).toBe(1840);
  });

  it('tolerates an absent element, so no caller has to guard', () => {
    // Both spellings, because `document.scrollingElement` is typed `Element | null` and jsdom
    // hands back `undefined` - which a `=== null` check sails past. That is not hypothetical: it
    // failed every case in `AssistantChatScreen.test.tsx` before this was widened.
    expect(() => scrollToLatest(null)).not.toThrow();
    expect(() => scrollToLatest(undefined)).not.toThrow();
  });

  it('touches nothing but scrollTop', () => {
    // The whole reason this is not `scrollIntoView`: that method scrolls every scrollable
    // ancestor, so it is unpredictable about what else moves. This can move one element.
    const written: string[] = [];
    const element = new Proxy(
      { scrollTop: 0, scrollHeight: 100 },
      {
        set(target, prop, value) {
          written.push(String(prop));
          return Reflect.set(target, prop, value);
        },
      },
    ) as unknown as Element;

    scrollToLatest(element);

    expect(written).toEqual(['scrollTop']);
  });

  it('is a no-op in effect when there is nothing to scroll', () => {
    const element = { scrollTop: 0, scrollHeight: 0 } as unknown as Element;

    scrollToLatest(element);

    expect(element.scrollTop).toBe(0);
  });
});
