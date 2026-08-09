'use client';

import { Pencil, Trash2 } from 'lucide-react';

import type { Category } from '@/lib/categories';

import { PopoverMenu, PopoverMenuItem } from '../../PopoverMenu';
import { useDeleteCategory } from './DeleteCategoryProvider';
import { useEditCategory } from './EditCategoryProvider';

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
// directive here is that both items call into a context.
//
// **Neither item is conditional any more, and the card decides who gets a menu.** PET-39 shipped
// this with an `offersDelete` guard, because `Uncategorized` cannot be deleted and its card still
// drew a kebab holding one disabled "Edit" - a menu with nothing operable in it, which that ticket
// recorded as the consequence to fix here. PET-38 fixes it a level up: `CategoryCard` renders no
// menu at all for the fallback, so this component is only ever mounted for a category with both
// actions and the guard has nothing left to decide. `lib/deleteCategory.ts` and
// `lib/updateCategory.ts` still classify their 409s, because a control that is not drawn is not an
// enforcement.

type CategoryCardMenuProps = {
  category: Category;
};

export function CategoryCardMenu({ category }: CategoryCardMenuProps) {
  const { open: openDelete } = useDeleteCategory();
  const { open: openEdit } = useEditCategory();

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
      {/* **PET-38 made this live, and the whole of the change is that `disabled` is gone.** It
          shipped disabled because the Edit category modal did not exist, and that paragraph
          predicted it would become live by "deleting `disabled` and adding its own `onSelect`",
          which is exactly what happened.

          **The whole category, where Delete below hands over three fields.** A prefilled form
          cannot do without the cap, the colour and the note; a confirmation has no business
          rendering any of them. The same asymmetry the transaction menu already has, and the
          reason `useEditCategory().open` takes a `Category` while `useDeleteCategory().open` takes
          a target shape of its own.

          No `focus` option: the kebab's "Edit" is an unspecific invitation, so the modal opens on
          its first field. `SetLimitBanner` is the trigger that asks for the budget instead. */}
      <PopoverMenuItem
        label="Edit"
        icon={<Pencil className="size-4" aria-hidden="true" />}
        onSelect={() => openEdit(category)}
      />

      <PopoverMenuItem
        label="Delete"
        icon={<Trash2 className="size-4" aria-hidden="true" />}
        className="text-error"
        onSelect={() =>
          openDelete({
            id: category.id,
            name: category.name,
            transactionCount: category.transactionCount,
          })
        }
      />
    </PopoverMenu>
  );
}
