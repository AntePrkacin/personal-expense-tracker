/**
 * Activity and size, from `git log` and `git ls-files`.
 *
 * Two different questions live in this one file and are deliberately reported
 * under different names.
 *
 * **Size is a snapshot.** "Total lines today, comments excluded" answers "how big
 * is this thing", and it is the figure that can be measured accurately, because
 * a whole file can be scanned properly - see `count-lines.mjs`.
 *
 * **Churn is activity, never size.** Lines added plus lines deleted over the
 * whole history measures work done: a line written on Tuesday and rewritten on
 * Friday counts three times, which is right for effort and wrong for size. It is
 * published as `linesWrittenAndRewritten` so that no page can accidentally label
 * it "lines of code".
 *
 * **Net is not published at all.** Added minus deleted approximately equals the
 * current size and will not reconcile exactly, because of deleted files, renames
 * and binary content. A number on a slide inviting an audience to check
 * arithmetic that does not quite add up costs more than the number is worth.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countLines } from './count-lines.mjs';
import {
  REPO_ROOT,
  gitLines,
  historyArgs,
  isDocumentation,
  isGenerated,
  trackedFiles,
  trackedSymlinks,
  writeData,
} from './lib.mjs';

function activity() {
  const dates = gitLines([
    'log',
    ...historyArgs(),
    '--format=%ad',
    '--date=short',
  ]);

  const byDate = new Map();
  for (const date of dates) {
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }

  const days = [...byDate.keys()].sort();

  // Every calendar day from the first commit to the last, zero-filled: the area
  // chart draws a continuous axis, and a day with no commits is a real fact
  // about the shape rather than a gap to skip over.
  const series = [];
  if (days.length > 0) {
    const cursor = new Date(`${days[0]}T00:00:00Z`);
    const last = new Date(`${days.at(-1)}T00:00:00Z`);
    while (cursor <= last) {
      const date = cursor.toISOString().slice(0, 10);
      series.push({ date, commits: byDate.get(date) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return {
    commits: dates.length,
    activeDays: byDate.size,
    calendarDays: series.length,
    firstCommit: days[0] ?? null,
    lastCommit: days.at(-1) ?? null,
    commitsPerDay: series,
  };
}

/**
 * Churn, with the generated files taken out separately.
 *
 * A lockfile regeneration is ten thousand lines that nobody wrote, so the
 * headline figure excludes them; the total is published beside it rather than
 * discarded, because "and that is before the lockfiles" is a true and better
 * sentence than either number alone.
 */
function churn() {
  const rows = gitLines([
    'log',
    ...historyArgs(),
    '--numstat',
    '--format=',
    '--no-renames',
  ]);

  let added = 0;
  let deleted = 0;
  let addedExcludingGenerated = 0;
  let deletedExcludingGenerated = 0;

  for (const row of rows) {
    const [insertions, deletions, path] = row.split('\t');
    // A dash means binary, which has no line count to add.
    if (insertions === '-' || deletions === '-') {
      continue;
    }

    const plus = Number(insertions);
    const minus = Number(deletions);
    added += plus;
    deleted += minus;

    if (!isGenerated(path)) {
      addedExcludingGenerated += plus;
      deletedExcludingGenerated += minus;
    }
  }

  return {
    added,
    deleted,
    linesWrittenAndRewritten: added + deleted,
    addedExcludingGenerated,
    deletedExcludingGenerated,
    linesWrittenAndRewrittenExcludingGenerated:
      addedExcludingGenerated + deletedExcludingGenerated,
  };
}

/** Agent files are the CLAUDE.md set plus the cross-cutting guides beside them. */
function isAgentFile(path) {
  return path.endsWith('CLAUDE.md') || path.startsWith('docs/agents/');
}

function size() {
  const buckets = {
    code: { files: 0, code: 0, comment: 0, blank: 0 },
    documentation: { files: 0, code: 0, comment: 0, blank: 0 },
    generated: { files: 0, code: 0, comment: 0, blank: 0 },
  };

  const docs = {
    plans: { files: 0, lines: 0 },
    agents: { files: 0, lines: 0 },
    other: { files: 0, lines: 0 },
  };

  const documents = [];
  const symlinks = trackedSymlinks();

  for (const path of trackedFiles()) {
    // See `trackedSymlinks`: following these counts every agent file three
    // times, under three names.
    if (symlinks.has(path)) {
      continue;
    }

    let contents;
    try {
      contents = readFileSync(join(REPO_ROOT, path), 'utf8');
    } catch {
      // A symlink into node_modules, or a binary. Neither is a line count.
      continue;
    }

    // A NUL byte is the cheap binary test, and it is what keeps a stray asset
    // from being counted as a million lines of code.
    if (contents.includes('\0')) {
      continue;
    }

    const counted = countLines(path, contents);
    const bucket = isGenerated(path)
      ? 'generated'
      : isDocumentation(path)
        ? 'documentation'
        : 'code';

    buckets[bucket].files++;
    buckets[bucket].code += counted.code;
    buckets[bucket].comment += counted.comment;
    buckets[bucket].blank += counted.blank;

    if (bucket === 'documentation') {
      const group = path.startsWith('docs/plans/')
        ? 'plans'
        : isAgentFile(path)
          ? 'agents'
          : 'other';
      docs[group].files++;
      docs[group].lines += counted.code;
      documents.push({ path, lines: counted.code });
    }
  }

  documents.sort((a, b) => b.lines - a.lines);

  return {
    buckets,
    documentationSplit: docs,
    // The biggest single document makes the point better than a total does:
    // docs/TODO.md is most of the non-plan documentation on its own.
    largestDocuments: documents.slice(0, 5),
  };
}

const { buckets, documentationSplit, largestDocuments } = size();

writeData('repo', {
  activity: activity(),
  churn: churn(),
  lines: buckets,
  documentationSplit,
  largestDocuments,
  commentDensity: {
    code: buckets.code.code,
    comment: buckets.code.comment,
    // Comment lines per 100 lines of code. Reported rather than a percentage of
    // the total, because "this repo has N comment lines for every 100 of code"
    // is the claim being made.
    per100:
      buckets.code.code === 0
        ? 0
        : Math.round((buckets.code.comment / buckets.code.code) * 1000) / 10,
  },
});
