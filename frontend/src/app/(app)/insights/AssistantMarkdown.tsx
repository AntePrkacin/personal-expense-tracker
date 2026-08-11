import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// An assistant reply's markdown, rendered (PET-76).
//
// **The defect this fixes is that the model was already answering in markdown and the bubble
// printed it.** `**July 2026**` reached the screen as four asterisks and a month. The prompt did
// forbid markdown - `backend/src/assistant/assistant-context.builder.ts` said "Answer in plain
// prose. Do not use markdown tables or headings" - and a model asked not to emit markup emits it
// anyway, which is a fact about models rather than about that sentence. So the sentence is gone and
// this renders what arrives.
//
// **To React elements, never through `dangerouslySetInnerHTML`, and with no `rehype-raw`.** The
// reply is not trusted input: it is a model's output over the user's own merchant names, either of
// which could carry `<script>` or an `onerror`. Without `rehype-raw`, react-markdown turns every
// raw HTML node into a **text** node (`react-markdown/lib/index.js`'s `transform`, verified rather
// than assumed), so markup arrives on screen as the characters the model typed and nothing is
// parsed. Do not add `rehype-raw`, and do not reach for `skipHtml` either - that one deletes the
// text instead of showing it, which silently swallows part of an answer.
//
// URLs get react-markdown's own `defaultUrlTransform`, which drops every protocol outside
// `http(s)`, `irc(s)`, `mailto` and `xmpp` - so a `javascript:` href cannot survive the pass. An
// anchor is close to unreachable here (the model answers from a transaction list), and it is mapped
// anyway with `rel="noreferrer"`, on this repo's standing rule that a state a caller cannot produce
// is still a state to handle.
//
// **Route-local rather than in `components/`**, per that folder's rule of three: one consumer.
//
// **Not `@tailwindcss/typography`.** That is a ninth dependency for what fifteen class literals
// do, and `globals.css` is closed to anything but the theme blocks, the font tokens, the
// field-focus rules and the `-orange` modifiers - so there is nowhere for its `prose` rules to be
// registered even if it were wanted.

/**
 * Whole Tailwind class literals per tag, which is the `ui/categoryColour.ts` convention and is
 * mandatory rather than stylistic: the scanner reads source as raw text, so anything interpolated
 * compiles to nothing with no build error.
 *
 * Every one of these has to be written out because Tailwind's preflight resets margins, list
 * styles and heading sizes to nothing - so an unmapped `<h2>` renders at body size with no space
 * around it, which reads as a paragraph that lost its full stop rather than as a missing class.
 *
 * The block rhythm is the wrapper's `space-y-2` rather than a margin per tag, so a tag added later
 * is spaced correctly before anybody thinks about it.
 */
const COMPONENTS: Components = {
  // `leading-relaxed` because a bubble is a narrow column and the default line height reads tight
  // in one; `last:mb-0` is unnecessary here for the same reason the wrapper owns the rhythm.
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,

  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through">{children}</del>,

  // `list-outside` with padding rather than `list-inside`, so a wrapped line aligns under the first
  // line's text instead of under its bullet.
  ul: ({ children }) => <ul className="list-outside list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-outside list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  // Six levels onto three sizes, because a bubble has no room for six and a model's choice of
  // level is arbitrary anyway - what matters is that a heading reads as one.
  h1: ({ children }) => <h1 className="text-base font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold">{children}</h4>,
  h5: ({ children }) => <h5 className="text-sm font-semibold">{children}</h5>,
  h6: ({ children }) => <h6 className="text-sm font-semibold">{children}</h6>,

  a: ({ href, children }) => (
    <a href={href} rel="noreferrer" className="link link-hover font-medium">
      {children}
    </a>
  ),

  // `bg-base-content/10` rather than `bg-base-200`: the assistant's bubble *is* `base-200`, so the
  // stock code tint would be the bubble's own colour. This is the same class of mistake as the
  // composer on the page canvas - see `frontend/CLAUDE.md`, Where daisyUI and Tailwind fight.
  code: ({ children }) => (
    <code className="bg-base-content/10 rounded px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  // A fenced block scrolls inside the bubble for the same reason a table does. The `code` mapping
  // above nests inside this one, and its own background is harmless over this one.
  pre: ({ children }) => (
    <pre className="bg-base-content/10 overflow-x-auto rounded p-2 text-xs">{children}</pre>
  ),

  blockquote: ({ children }) => (
    <blockquote className="border-base-content/20 space-y-2 border-l-2 pl-3">{children}</blockquote>
  ),
  hr: () => <hr className="border-base-content/20" />,

  /**
   * **The table carries a wrapper, and that is the one thing in this file that is a requirement
   * rather than a treatment.**
   *
   * Permitting tables at all puts arbitrarily wide content inside a `chat-bubble`, and a bubble is
   * a flex item in a column sized by its content - so a six-column table pushes the whole chat
   * column sideways and takes the page's horizontal scrollbar with it. The wrapper scrolls the
   * table **inside** the bubble instead. `w-full` on the table itself is what makes a narrow table
   * still fill the bubble rather than huddling at its left edge.
   */
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="table-zebra table table-sm w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="text-left font-semibold">{children}</th>,
  td: ({ children }) => <td>{children}</td>,
};

/**
 * One assistant reply.
 *
 * A Server Component, like `AssistantMessageList` above it: react-markdown's default `Markdown`
 * export is hook-free and synchronous, and it is only its `MarkdownHooks` sibling that needs the
 * client. (Both are in fact rendered from inside a client component today, so this buys
 * correctness of structure rather than a bundle saving.)
 */
export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </Markdown>
    </div>
  );
}
