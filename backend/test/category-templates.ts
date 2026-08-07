import type { INestApplication } from '@nestjs/common';
import { TemplatesService } from './../src/templates/templates.service';

/**
 * The `category_templates.id`s a registration has to send, looked up by name.
 *
 * Every e2e suite that registers needs these, because `RegisterDto.categories`
 * takes ids rather than names as of PET-64 and an unknown one is a 400. They
 * cannot be constants: the ids are UUIDv7 values minted by the boot seed into
 * whatever temp `DATABASE_DIR` this run got, so they differ per run.
 *
 * Reading them through `TemplatesService` rather than over HTTP keeps this
 * usable from a `beforeAll` that has not yet built a request, and it is the
 * same read `GET /api/templates/categories` serves.
 *
 * It **throws on a miss** rather than filtering, because a suite naming a
 * template that is not there is a suite whose fixtures have drifted from the
 * seed - and the failure this replaces was a silent 400 on every register in
 * the file, reported as eighty unrelated assertion failures.
 */
export async function categoryTemplateIds(
  app: INestApplication,
  names: readonly string[],
): Promise<string[]> {
  const { categories } = await app.get(TemplatesService).categories();

  return names.map((name) => {
    const found = categories.find((template) => template.name === name);

    if (!found) {
      throw new Error(
        `No category template named "${name}". Seeded: ` +
          `${categories.map((template) => template.name).join(', ')}.`,
      );
    }

    return found.id;
  });
}
