'use client';

import { Pencil, Trash2 } from 'lucide-react';

import type { Category } from '@/lib/categories';

import { PopoverMenu, PopoverMenuItem } from '../../PopoverMenu';
import { useDeleteCategory } from './DeleteCategoryProvider';

// 18 Categories - Row menu (node 75:806): the kebab on a category card, and the two actions behind
// it (CED-1, CED-2, A19).
//
// **The popover, the anchor pairing, `aria-expanded` and the focus hand-back are all
// `(app)/PopoverMenu.tsx`'s.** This file shipped as a copy of `transactions/TransactionRowMenu.tsx`,
// which put a code-review fix - the trigger refocus - into a second place with a second copy of its
// explanation; that file records what moved and why it moved at the second consumer rather than the
// third. **What is left here is which two items this card offers and what they do.**
//
// **`CategoryCard` stays a Server Component**, exactly as `TransactionRow` did when its own menu
// came out of it: the popover means there is no open state to hold, so the only reason for the
// directive here is that Delete calls into a context.

type CategoryCardMenuProps = {
  category: Category;
};

export function CategoryCardMenu({ category }: CategoryCardMenuProps) {
  const { open } = useDeleteCategory();

  /**
   * AC6: the fallback category offers no Delete.
   *
   * **Decided here from `isFallback` rather than by letting the backend answer 409.** That row is
   * where deleting any *other* category sends its transactions, so the endpoint refuses to remove
   * it, and offering a control whose only outcome is an error message is the failure every inert
   * control on this screen was built to avoid. `lib/deleteCategory.ts` still classifies the 409,
   * because a hidden control is not an enforcement.
   *
   * One consequence, recorded rather than hidden: until PET-38 lands, this card's menu is a single
   * disabled "Edit", i.e. a menu with nothing operable in it. That is still better than a kebab
   * that opens nothing, and it announces its condition.
   */
  const offersDelete = !category.isFallback;

  return (
    // The `aria-label` and the trigger's `shrink-0` are byte-identical to what PET-36 shipped on
    // the inert version, so the two suites that name this control did not have to change their
    // query. The `aria-disabled` PET-36 put on it is **gone**, which is the whole of this ticket's
    // change to the card. Note this menu's glyph carries no `text-base-content/40` where the
    // transaction row's does - a difference nobody decided, kept rather than silently unified; see
    // `PopoverMenu`'s `glyphClassName`.
    <PopoverMenu
      id={`category-menu-${category.id}`}
      label={`Actions for ${category.name}`}
      triggerClassName="shrink-0"
    >
      {/* **Edit ships disabled, which amends AC1 and is PET-33's call for the same control one
          screen over.** PET-38's Edit category modal does not exist, and the alternatives were both
          worse: a live item that does nothing is the failure every inert control on this screen
          exists to avoid, and dropping the item makes frame 18 a different design. PET-38 makes it
          live by deleting `disabled` and adding its own `onSelect`. */}
      <PopoverMenuItem
        label="Edit"
        icon={<Pencil className="size-4" aria-hidden="true" />}
        disabled
      />

      {offersDelete ? (
        <PopoverMenuItem
          label="Delete"
          icon={<Trash2 className="size-4" aria-hidden="true" />}
          className="text-error"
          onSelect={() =>
            // **Three fields, where PET-38's Edit will hand over the whole category.** A
            // confirmation quoting a cap, a colour or a note would be rendering things it has no
            // business knowing; the same asymmetry the transaction menu already has.
            open({
              id: category.id,
              name: category.name,
              transactionCount: category.transactionCount,
            })
          }
        />
      ) : null}
    </PopoverMenu>
  );
}
