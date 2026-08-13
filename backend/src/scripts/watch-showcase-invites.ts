// MUST stay first, for the reason invite-showcase.ts gives at the same line.
import { SEED_MODE } from './seed-showcase.env';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { inArray } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../app.module';
import { hashToken } from '../auth/login-token.service';
import { newId } from '../common/ids';
import { loginLinks } from '../database/central/schema';
import { APP_DB } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';
import { renderShowcaseInviteEmail } from './showcase/invite.template';

/**
 * Watches the links `invite-showcase.ts` minted, and repairs the ones that
 * break.
 *
 * Run it through `mise run showcase:watch:cloud` right after the invite run,
 * which prints the exact command with the ledger path already filled in.
 *
 * ## What it is for
 *
 * Two things, and the second is why it sends rather than only reports.
 *
 * It is a **live dashboard of who has actually got in**, which is otherwise
 * completely invisible: `used_at` is a column nobody can see from the app, so
 * without this the only signal that a participant is stuck is that participant
 * saying so, out loud, during the talk.
 *
 * And it is the **recovery** for the one hazard the whole design has. Somebody
 * submitting the login form for the demo address calls `LoginTokenService.issue()`,
 * which supersedes every unused link for the account in one statement - so one
 * person trying to help themselves silently kills the link of everybody who has
 * not clicked yet. That failure is invisible to its victims until they click, at
 * which point the answer is a 409 and a screen telling them to open a newer
 * email that does not exist. Repairing it by hand means noticing, re-minting and
 * re-mailing N people while presenting. This does it unattended, because the
 * send is MailPace rather than a human at a keyboard.
 *
 * ## The two guards
 *
 * An auto-sender that loops is worse than a dead link, so: **at most
 * `MAX_RESENDS` re-sends per address**, and **every send is logged with the
 * reason that triggered it**. The cap is per address rather than per run,
 * because the pathological case is one participant repeatedly using the login
 * form - which supersedes everybody, which triggers a re-send to everybody, and
 * would otherwise be a mail loop with a room in it.
 *
 * ## Re-minting has the same rule as minting
 *
 * A replacement row is INSERTed directly, never issued. `issue()` here would
 * supersede the links of every participant who has not clicked yet, which is
 * precisely the failure being repaired - a repair that causes the fault it fixes
 * would turn one broken link into N and then re-send to all of them, forever.
 *
 * ## It has an ending
 *
 * When the last ledger row shows `used_at`, it prints
 * `ALL PARTICIPANTS LOGGED IN SUCCESSFULLY` and exits zero. That is a
 * product-owner request kept verbatim, and the point is that the room sees it.
 */

const POLL_INTERVAL_MS = 30_000;

/** Per address, not per run. See the header. */
const MAX_RESENDS = 2;

/**
 * Only a fallback. The lifetime a replacement gets is the one **the invite run
 * chose**, read from the ledger, so repairing a 4-day link does not quietly hand
 * somebody a 24-hour one and lock them out three days early. This value covers a
 * ledger written before `ttlHours` was recorded.
 */
const FALLBACK_TTL_HOURS = 24;
const TOKEN_BYTES = 32;
const LEDGER_DIR = join(homedir(), '.spendifico');
const MAILPACE_SEND_URL = 'https://app.mailpace.com/api/v1/send';
const SEND_TIMEOUT_MS = 10_000;

interface LedgerEntry {
  address: string;
  loginLinkId: string;
  link: string;
  sent: boolean;
  error: string | null;
  resends: number;
}

interface Ledger {
  createdAt: string;
  mode: string;
  account: string;
  userId: string;
  frontendUrl: string;
  expiresAt: string;
  /** Optional: ledgers written before this was recorded fall back. */
  ttlHours?: number;
  participants: LedgerEntry[];
}

/** The lifetime a replacement link gets: whatever the invite run chose. */
function ttlHoursOf(ledger: Ledger): number {
  return ledger.ttlHours ?? FALLBACK_TTL_HOURS;
}

/** What a row says about its participant right now. */
type Status = 'waiting' | 'logged-in' | 'broken' | 'missing';

/**
 * The ledger to watch: `--ledger=` if given, otherwise the newest one written.
 *
 * Defaulting to the newest is deliberate rather than lazy - the invite run and
 * this one happen minutes apart, and asking somebody to copy a timestamped path
 * correctly while a room waits is exactly the kind of step that goes wrong.
 */
function resolveLedgerPath(argv: readonly string[]): string {
  const flag = argv.find((arg) => arg.startsWith('--ledger='));
  if (flag) {
    return resolve(flag.slice('--ledger='.length).trim());
  }

  let names: string[];
  try {
    names = readdirSync(LEDGER_DIR)
      .filter(
        (name) =>
          name.startsWith('showcase-invites-') && name.endsWith('.json'),
      )
      .sort();
  } catch {
    throw new Error(
      `No ledger directory at ${LEDGER_DIR}. Run the invite script first.`,
    );
  }

  const newest = names.at(-1);
  if (!newest) {
    throw new Error(
      `No ledger in ${LEDGER_DIR}. Run the invite script first, or pass ` +
        '--ledger=<path>.',
    );
  }

  return join(LEDGER_DIR, newest);
}

function readLedger(path: string): Ledger {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Ledger;
  } catch (error) {
    throw new Error(
      `Could not read the ledger at ${path}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeLedger(path: string, ledger: Ledger): void {
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Reads every watched row in one query and classifies it.
 *
 * **An expired-and-unused row counts as broken**, which the ticket's three
 * states did not name. The remedy is identical - mint a replacement and re-send
 * - and to the participant holding it the two are the same event: a link that
 * does not work. Distinguishing them would only mean a state the script reports
 * and does nothing about.
 *
 * `missing` should be unreachable and is reported rather than ignored, because
 * the only ways to reach it are a ledger from a database that has since been
 * reset and a ledger for a different target - both of which mean every other
 * reading on the screen is about somebody else's rows.
 */
async function readStatuses(
  centralDb: CentralDatabase,
  entries: LedgerEntry[],
): Promise<Map<string, Status>> {
  const rows = await centralDb
    .select({
      id: loginLinks.id,
      usedAt: loginLinks.usedAt,
      supersededAt: loginLinks.supersededAt,
      expiresAt: loginLinks.expiresAt,
      deletedAt: loginLinks.deletedAt,
    })
    .from(loginLinks)
    .where(
      inArray(
        loginLinks.id,
        entries.map((entry) => entry.loginLinkId),
      ),
    );

  const now = new Date();
  const byId = new Map(rows.map((row) => [row.id, row]));

  return new Map(
    entries.map((entry) => {
      const row = byId.get(entry.loginLinkId);
      if (!row) {
        return [entry.loginLinkId, 'missing'];
      }
      if (row.usedAt !== null) {
        return [entry.loginLinkId, 'logged-in'];
      }
      if (
        row.supersededAt !== null ||
        row.deletedAt !== null ||
        row.expiresAt <= now
      ) {
        return [entry.loginLinkId, 'broken'];
      }
      return [entry.loginLinkId, 'waiting'];
    }),
  );
}

/**
 * A replacement row for one participant, INSERTed directly for the reason the
 * header gives. Returns the new raw token; the caller updates the ledger.
 */
async function remint(
  centralDb: CentralDatabase,
  ledger: Ledger,
  entry: LedgerEntry,
): Promise<string> {
  const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
  const id = newId();

  await centralDb.insert(loginLinks).values({
    id,
    userId: ledger.userId,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + ttlHoursOf(ledger) * 60 * 60 * 1000),
  });

  entry.loginLinkId = id;
  entry.link = `${ledger.frontendUrl.replace(/\/+$/, '')}/auth/verify?token=${encodeURIComponent(rawToken)}`;
  entry.resends += 1;

  return rawToken;
}

async function send(
  ledger: Ledger,
  entry: LedgerEntry,
  rawToken: string,
  token: string,
  from: string,
): Promise<void> {
  const email = renderShowcaseInviteEmail(
    ledger.frontendUrl,
    rawToken,
    ttlHoursOf(ledger),
  );

  const response = await fetch(MAILPACE_SEND_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'MailPace-Server-Token': token,
    },
    body: JSON.stringify({
      from,
      to: entry.address,
      subject: email.subject,
      htmlbody: email.htmlbody,
      textbody: email.textbody,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `${response.status} ${await response.text().catch(() => '')}`.trim(),
    );
  }
}

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

async function watch(app: INestApplicationContext): Promise<void> {
  const argv = process.argv.slice(2);
  const ledgerPath = resolveLedgerPath(argv);
  const ledger = readLedger(ledgerPath);
  const centralDb = app.get<CentralDatabase>(APP_DB);
  const config = app.get(ConfigService);

  const canSend = SEED_MODE === 'cloud' && !!config.get('MAILPACE_API_TOKEN');
  const mailToken = canSend
    ? config.getOrThrow<string>('MAILPACE_API_TOKEN')
    : '';
  const fromAddress = canSend ? config.getOrThrow<string>('MAIL_FROM') : '';
  const fromName = config
    .get<string>('MAIL_FROM_NAME')
    ?.replace(/["\\]/g, '')
    .trim();
  const from = fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;

  console.log(
    `Watching ${ledger.participants.length} links from ${ledgerPath}`,
  );
  console.log(
    `Account ${ledger.account} (${ledger.userId}), ${ledger.mode} mode`,
  );
  if (!canSend) {
    // Stated once, loudly, rather than discovered when the first repair is
    // needed: a watcher that reports a broken link and silently cannot fix it
    // is worse than one that never claimed it would.
    console.log(
      'No mail credentials: breakages will be reported but NOT re-sent.',
    );
  }
  console.log('');

  for (;;) {
    const statuses = await readStatuses(centralDb, ledger.participants);

    let dirty = false;

    for (const entry of ledger.participants) {
      const status = statuses.get(entry.loginLinkId);
      if (status !== 'broken') {
        continue;
      }

      if (entry.resends >= MAX_RESENDS) {
        console.log(
          `${stamp()}  ${entry.address}  broken, re-send cap reached ` +
            `(${MAX_RESENDS}) - fix this one by hand`,
        );
        continue;
      }

      if (!canSend) {
        console.log(`${stamp()}  ${entry.address}  broken, cannot re-send`);
        continue;
      }

      // The reason is logged with the send, which is the second of the two
      // guards: an unattended mailer whose sends cannot be accounted for after
      // the fact is not auditable at all.
      console.log(
        `${stamp()}  ${entry.address}  broken - re-minting and re-sending ` +
          `(attempt ${entry.resends + 1}/${MAX_RESENDS})`,
      );

      try {
        const rawToken = await remint(centralDb, ledger, entry);
        dirty = true;
        await send(ledger, entry, rawToken, mailToken, from);
        entry.sent = true;
        entry.error = null;
        console.log(`${stamp()}  ${entry.address}  re-sent`);
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        console.error(
          `${stamp()}  ${entry.address}  re-send failed: ${entry.error}`,
        );
      }
    }

    if (dirty) {
      // Written whenever a row was re-minted, including when the send that
      // followed it failed: the ledger's job is to name the rows that are ours,
      // and after a re-mint the old id is not one of them.
      writeLedger(ledgerPath, ledger);
    }

    const fresh = await readStatuses(centralDb, ledger.participants);
    const counts = { 'logged-in': 0, waiting: 0, broken: 0, missing: 0 };
    for (const entry of ledger.participants) {
      counts[fresh.get(entry.loginLinkId) ?? 'missing'] += 1;
    }

    console.log(
      `${stamp()}  ${counts['logged-in']} logged in, ${counts.waiting} waiting` +
        (counts.broken > 0 ? `, ${counts.broken} broken` : '') +
        (counts.missing > 0 ? `, ${counts.missing} MISSING` : ''),
    );

    if (counts['logged-in'] === ledger.participants.length) {
      console.log('');
      console.log('ALL PARTICIPANTS LOGGED IN SUCCESSFULLY');
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    if (
      SEED_MODE === 'cloud' &&
      !app.get(ConfigService).get('TURSO_ORG_TOKEN')
    ) {
      throw new Error(
        'Cloud mode needs the four TURSO_* variables in backend/.env. ' +
          'See docs/guides/configuration.md.',
      );
    }
    await watch(app);
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Watching failed.', error);
  process.exitCode = 1;
});
