'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Layout primitives shared by the four Foundations reference stories, shaped to
// mirror the Figma "Foundations" page (node 5-2) so the two can be diffed side
// by side.

/**
 * Reads a custom property's resolved value off :root.
 *
 * This is why the stories do not carry a second copy of the hex values: they
 * display whatever globals.css actually declares. It works because the tokens
 * are declared under `@theme static`, which stops Tailwind tree-shaking the
 * ones nothing has used yet.
 *
 * The stylesheet is an external store rather than React state, so it is read
 * through useSyncExternalStore. Reading it in an effect and calling setState
 * would work too, but only by triggering a second render pass for every swatch.
 * Nothing mutates the tokens at runtime, hence the no-op subscribe.
 *
 * One consequence of that no-op: if you edit a token value while a story is
 * open, Vite swaps the stylesheet but nothing re-runs the snapshot, so the hex
 * label keeps the old value until the next render. Navigate away and back, or
 * reload, to see it update.
 */
function useTokenValue(property: string) {
  const subscribe = useCallback(() => () => {}, []);
  const getSnapshot = useCallback(
    () => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    [property],
  );

  // Server snapshot is empty: there is no computed style to read without a DOM.
  return useSyncExternalStore(subscribe, getSnapshot, () => '');
}

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface-canvas min-h-screen p-16">{children}</div>;
}

export function Section({ title, subtitle, children }: SectionProps) {
  return (
    <section className="bg-surface-card border-border-default rounded-xl border p-8">
      <p className="text-overline text-text-tertiary">{title.toUpperCase()}</p>
      {subtitle ? <p className="text-body-m mt-3 text-text-secondary">{subtitle}</p> : null}
      <div className="mt-8 flex flex-col gap-10">{children}</div>
    </section>
  );
}

type SectionProps = { title: string; subtitle?: string; children: React.ReactNode };

export function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-strong-s text-text-primary">{label}</p>
      <div className="mt-6 flex flex-wrap gap-8">{children}</div>
    </div>
  );
}

/**
 * One colour swatch, sized to match the Figma tile.
 *
 * The fill comes from an inline `var(--color-*)` rather than a `bg-*` class
 * because a class built from a template string would never be found by
 * Tailwind's source scanner. The utilities themselves are covered by the
 * compile assertions in src/app/globals.test.ts; this surface is here to prove
 * the *values* match the design.
 */
export function Swatch({ token, label }: { token: string; label: string }) {
  const value = useTokenValue(`--color-${token}`);

  return (
    <div className="w-[126px]">
      <div
        className="border-border-subtle h-[52px] rounded-md border"
        style={{ backgroundColor: `var(--color-${token})` }}
      />
      <p className="text-strong-s mt-4 text-text-primary">{label}</p>
      <p className="text-caption mt-1 text-text-tertiary">
        {value.toUpperCase() || 'not declared'}
      </p>
    </div>
  );
}

/** A type specimen: the style rendered in itself, with its Figma spec alongside. */
export function TypeRow({
  label,
  utility,
  spec,
}: {
  label: string;
  utility: string;
  spec: string;
}) {
  return (
    <div className="border-border-subtle flex items-center justify-between gap-8 border-b pb-6">
      <p className={`${utility} text-text-primary`}>{label}</p>
      <div className="shrink-0 text-right">
        <p className="text-caption text-text-secondary">{spec}</p>
        <p className="text-caption text-text-tertiary mt-1">{utility}</p>
      </div>
    </div>
  );
}

export function ScaleRow({ label, bar, utility, value }: ScaleRowProps) {
  return (
    <div className="flex items-center gap-8">
      <p className="text-label-m w-24 shrink-0 text-text-primary">{label}</p>
      {/* No corner radius: an 8px one would swallow the 2px and 4px steps and
          make them read as slivers rather than as measurable bars. */}
      <div className={`${bar} bg-brand-accent h-3.5 shrink-0`} />
      <p className="text-caption w-16 shrink-0 text-text-secondary">{value}</p>
      <p className="text-caption text-text-tertiary">{utility}</p>
    </div>
  );
}

type ScaleRowProps = { label: string; bar: string; utility: string; value: string };

/** A radius tile, 72px square like the Figma sample. */
export function RadiusTile({
  label,
  utility,
  value,
}: {
  label: string;
  utility: string;
  value: string;
}) {
  return (
    <div className="w-[100px]">
      <div className={`${utility} bg-brand-accent-soft border-brand-accent size-[72px] border`} />
      <p className="text-label-m mt-5 text-text-primary">{label}</p>
      <p className="text-caption mt-1 text-text-tertiary">{value}</p>
    </div>
  );
}
