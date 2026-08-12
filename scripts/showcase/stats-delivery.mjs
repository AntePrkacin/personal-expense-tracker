/**
 * Pull requests: how many were merged, and how many were opened in total.
 *
 * Both figures rather than only the first, because "N merged of M opened" says
 * something about how the work was reviewed that either number alone does not.
 *
 * Degrades to nulls rather than failing, for the reason `stats-authors.mjs`
 * gives: this is a networked generator, and a refresh minutes before a talk must
 * not die on a captive portal and leave every other figure stale.
 */

import { execFileSync } from 'node:child_process';
import { REPO_ROOT, writeData } from './lib.mjs';

function pulls(state) {
  return JSON.parse(
    execFileSync(
      'gh',
      ['pr', 'list', '--state', state, '--limit', '500', '--json', 'number,state'],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    ),
  );
}

let payload;

try {
  const all = pulls('all');
  const merged = all.filter((pr) => pr.state === 'MERGED');

  payload = {
    merged: merged.length,
    opened: all.length,
    closedUnmerged: all.filter((pr) => pr.state === 'CLOSED').length,
    open: all.filter((pr) => pr.state === 'OPEN').length,
  };
} catch (error) {
  console.warn(`gh unavailable, pull-request figures omitted: ${error.message}`);
  payload = { merged: null, opened: null, closedUnmerged: null, open: null };
}

writeData('delivery', payload);
