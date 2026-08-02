import Link from 'next/link';

// Section header (Figma "Components", node 13:27).
//
// A card title with an optional action on the right, e.g. "Recent transactions"
// paired with "View all" (04 Dashboard, node 23:82).

type SectionHeaderProps = {
  title: string;
  /**
   * Figma models this as two properties, "Action" and "Show action", because
   * Figma component properties cannot be optional. React has `undefined`, so
   * presence is the switch: pass an action and it renders, omit it and only the
   * title shows. Collapsing the pair also removes the state where they
   * contradict each other.
   *
   * `href` has no Figma counterpart and could not have one - Figma has no
   * concept of a destination - but the action is a link, so it needs one.
   */
  action?: { label: string; href: string };
  /**
   * Also absent from Figma, which has no notion of document outline. A real
   * heading is what puts these titles in the screen-reader heading rotor, and
   * the level has to move when a header nests inside a card that already has
   * one.
   */
  headingLevel?: 2 | 3 | 4;
};

export function SectionHeader({ title, action, headingLevel = 2 }: SectionHeaderProps) {
  // Types as 'h2' | 'h3' | 'h4' from the prop union, so no cast is needed.
  const Heading = `h${headingLevel}` as const;

  return (
    <div className="flex w-full items-center justify-between">
      <Heading className="text-heading-m text-text-primary">{title}</Heading>
      {action ? (
        <Link href={action.href} className="text-strong-s text-brand-accent">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
