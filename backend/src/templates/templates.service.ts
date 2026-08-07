import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import {
  categoryTemplates,
  colourTemplates,
  iconTemplates,
} from '../database/central/schema';
import { APP_DB } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';
import { CategoryTemplatesResponseDto } from './dto/category-templates-response.dto';
import { PaletteResponseDto } from './dto/palette-response.dto';

/**
 * What a category template resolves to at provisioning time.
 *
 * Exported for `VerificationService`, which copies these four fields into the
 * user's own `categories` row - name, colour, icon and the description that
 * becomes their `note`. Not a DTO: nothing serializes it.
 */
export interface ResolvedCategoryTemplate {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
}

/**
 * Reads of central's three template tables.
 *
 * **Deliberately not part of `CategoriesModule`.** That module is user-scope: it
 * opens the caller's own database and every row it touches belongs to one
 * person. These tables belong to nobody and are the same for everybody, which
 * is the distinction `backend/src/database/CLAUDE.md` draws for the fourth
 * sanctioned central exception.
 *
 * Every read filters `deletedAt` with `isNull`, like every other read in this
 * app. Two of the three also filter `enabled`, which is a different thing: a
 * tombstone is gone and a disabled row is merely not being offered right now.
 * `resolve()` filters **neither** flag, for the reason on that method.
 */
@Injectable()
export class TemplatesService {
  constructor(@Inject(APP_DB) private readonly db: CentralDatabase) {}

  /**
   * The select and the two joins both resolving reads share, parameterised by
   * the predicate that is genuinely different between them.
   *
   * Written once because it was written twice: the two callers differed in
   * their `where` and in nothing else, so a column added to one and not the
   * other would have provisioned a category the picker never showed.
   *
   * The joins are plain equality on `colour_id` / `icon_id`, and an inner join
   * rather than a left one: a template whose colour was tombstoned has no
   * colour to draw, and a chip with no colour is worse than a chip that is not
   * offered. The partial unique indexes keep those joins single-valued. Note
   * what that costs `resolve()`, which is why `exists()` below does not use
   * this - see its own note.
   */
  private resolvedTemplates(where: SQL | undefined) {
    return this.db
      .select({
        id: categoryTemplates.id,
        name: categoryTemplates.name,
        color: colourTemplates.token,
        icon: iconTemplates.name,
        description: categoryTemplates.description,
      })
      .from(categoryTemplates)
      .innerJoin(
        colourTemplates,
        and(
          eq(colourTemplates.id, categoryTemplates.colourId),
          isNull(colourTemplates.deletedAt),
        ),
      )
      .innerJoin(
        iconTemplates,
        and(
          eq(iconTemplates.id, categoryTemplates.iconId),
          isNull(iconTemplates.deletedAt),
        ),
      )
      .where(where)
      .orderBy(asc(categoryTemplates.sortOrder));
  }

  /**
   * The enabled category templates with their colour and icon resolved, in the
   * order an admin put them in.
   */
  async categories(): Promise<CategoryTemplatesResponseDto> {
    const rows = await this.resolvedTemplates(
      and(
        isNull(categoryTemplates.deletedAt),
        eq(categoryTemplates.enabled, true),
      ),
    );

    return { categories: rows };
  }

  /**
   * The picked templates, for provisioning.
   *
   * **Neither `enabled` nor the caller's order is honoured here**, and both are
   * deliberate. A registration stashed before an admin disabled a template must
   * still provision the category the user was shown and agreed to; and the rows
   * come back in `sort_order`, so a seeded account's categories are in the
   * canonical order rather than the order the chips were clicked.
   *
   * Tombstones **are** excluded, which is what makes this the membership check
   * registration validates against: an id that is not a live template comes back
   * missing, and the caller answers 400.
   *
   * An empty `ids` short-circuits rather than issuing `IN ()`, which is legal
   * SQL in SQLite but a query for nothing.
   */
  async resolve(ids: readonly string[]): Promise<ResolvedCategoryTemplate[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.resolvedTemplates(
      and(
        isNull(categoryTemplates.deletedAt),
        inArray(categoryTemplates.id, [...ids]),
      ),
    );
  }

  /**
   * Which of `ids` are live category templates, for a membership check.
   *
   * **Deliberately not `resolve()`, and the difference is the joins.** That one
   * inner-joins its colour and its icon, so a template whose *colour* was
   * tombstoned comes back missing - correct there, because a category with no
   * colour cannot be drawn, and `seedStarterCategories` is documented to skip
   * it. Reused as a membership check it conflates two different answers: the
   * caller cannot tell "this id is not a template" from "this template lost its
   * colour", and registration would answer 400 naming an id the picker had just
   * offered, on a screen with no error state for it (A29).
   *
   * So this reads `category_templates` alone and filters only the tombstone.
   * The consequence is deliberate: a registration naming a colourless template
   * is accepted, and the template is dropped at verification with a warning -
   * which is the arm that already exists for a template that vanished between
   * the form and the click, and is far better than refusing the registration.
   *
   * `enabled` is not filtered, for the reason `resolve()` gives: a pick stashed
   * before an admin disabled a template must still be honoured.
   *
   * One indexed read over the primary key, and it selects the id alone - the
   * caller only ever compares a set.
   */
  async exists(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({ id: categoryTemplates.id })
      .from(categoryTemplates)
      .where(
        and(
          isNull(categoryTemplates.deletedAt),
          inArray(categoryTemplates.id, [...ids]),
        ),
      );

    return rows.map((row) => row.id);
  }

  /** The enabled colours and icons a category picker may offer. */
  async palette(): Promise<PaletteResponseDto> {
    const [colors, icons] = await Promise.all([
      this.db
        .select({ token: colourTemplates.token, label: colourTemplates.label })
        .from(colourTemplates)
        .where(
          and(
            isNull(colourTemplates.deletedAt),
            eq(colourTemplates.enabled, true),
          ),
        )
        .orderBy(asc(colourTemplates.sortOrder)),
      this.db
        .select({ name: iconTemplates.name, label: iconTemplates.label })
        .from(iconTemplates)
        .where(
          and(isNull(iconTemplates.deletedAt), eq(iconTemplates.enabled, true)),
        )
        .orderBy(asc(iconTemplates.sortOrder)),
    ]);

    return { colors, icons };
  }
}
