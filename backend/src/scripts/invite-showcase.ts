// MUST stay first. It picks the target and scrubs the environment before
// app.module.ts is loaded, and app.module.ts reads its configuration the moment
// it is imported. See the comment in seed-showcase.env.ts.
//
// Shared with the seed script rather than copied: the variable it sets is called
// SEED_LOCAL and the mode it exports is called SEED_MODE, which read oddly here,
// but "which database does this script talk to, and does `--local` really stay
// local" is exactly the same question in both files and deserves exactly one
// answer.
import { SEED_MODE } from './seed-showcase.env';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../app.module';
import { hashToken } from '../auth/login-token.service';
import { newId } from '../common/ids';
import { loginLinks } from '../database/central/schema';
import { APP_DB } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';
import { UsersService } from '../users/users.service';
import { renderShowcaseInviteEmail } from './showcase/invite.template';

/**
 * Mails every showcase participant their own 24-hour login link into the one
 * shared demo account, so a room full of people can open the app on their own
 * phones at the same time.
 *
 * Run it through `mise run showcase:invite` (dry run, local) or
 * `mise run showcase:invite:cloud -- --send` (the real thing);
 * `docs/showcase/README.md` is the procedure.
 *
 * ## Why the rows are inserted rather than issued
 *
 * **`LoginTokenService.issue()` must never be called here, and this is the one
 * comment in the file that cannot be dropped.** `issue()` supersedes *every*
 * unused link for the account in a single UPDATE before inserting its own, so
 * calling it once per participant would leave exactly one working link - the
 * last one - and nine people holding dead ones, with every row looking correct
 * and the script reporting complete success. So the rows go in directly, all in
 * one INSERT.
 *
 * That is safe because the three facts the design rests on are properties of the
 * schema rather than of the service. `consume()` marks only the row whose hash
 * matched and touches no sibling, so many simultaneously valid links for one
 * account are fine and each stays independently single-use. Clicking one does
 * not invalidate anybody else's, so the whole room can log in in the same second
 * and nothing needs serializing. And the 24-hour lifetime is just a value in
 * `expires_at`, which `consume()` compares against now - so it needs no config
 * change and `LOGIN_LINK_TTL_M` stays at its 15-minute default for every real
 * login.
 *
 * The same statement is also the hazard the whole run has to be protected from
 * afterwards: anybody submitting the **login form** for the demo address calls
 * `issue()` and silently kills every link nobody has clicked yet. That is why
 * the email asks people to reply rather than request a new link, and why the
 * login flow is demonstrated on a plus-address such as
 * `spendifico+demo@gmail.com` if it is demonstrated at all.
 *
 * ## Why the plan block names two settings and pauses
 *
 * **The database this writes to and the base URL it builds links from are
 * independent, and nothing downstream can catch a mismatch.** A run that mints
 * rows in Turso Cloud while building `http://localhost:4200` links succeeds
 * completely and delivers ten links that authenticate nobody; the reverse fails
 * identically. Neither shows up as an error anywhere - not in the insert, not in
 * the send, not in MailPace's response - so the two are printed together and
 * confirmed by a human before anything is written. That confirmation is the only
 * check there is.
 *
 * ## The five phases
 *
 * 1. **Preflight.** Reads everything, writes nothing, stops on the first fault.
 *    Participants file, demo account, mail credentials, then the plan block and
 *    the pause. Every failure caught here is one a participant would otherwise
 *    catch by being unable to log in.
 * 2. **Mint.** One transaction, all participants, or nothing. Atomic because a
 *    half-finished mint is worse than a half-finished send: an unreceived link
 *    merely expires, while a missing row is a person with no way in and no error
 *    to explain it.
 * 3. **Ledger**, written before the first email, outside the working tree
 *    because it holds live credentials. It makes a crash mid-send resumable and
 *    it is what the watcher reads to know which rows are ours.
 * 4. **Send.** Sequential, and one rejected address does not stop the rest -
 *    aborting the batch over one bounce leaves the room half-invited with no
 *    record of which half.
 * 5. **Report**, ending with the exact watcher command to paste next.
 *
 * Without `--send`, phases 2 to 4 do not happen: the dry run does the full
 * preflight, renders one complete email with an obviously fake token, lists every
 * recipient and writes nothing anywhere. It is the default, and it is what
 * replaces a draft-review step.
 */

/**
 * The default link lifetime, as a value written into `expires_at` rather than as
 * configuration. Long enough that links minted on the morning of the event
 * comfortably outlast it, short enough that a leaked mail is not a permanent
 * door.
 *
 * `--hours=` overrides it, because the event was never the only reason to hand
 * somebody a link: a reviewer, an examiner or a teammate needs one that outlasts
 * a working day, and the alternative is minting a fresh 24-hour link every
 * morning. The ceiling is what keeps that from drifting into "a permanent door
 * nobody remembers issuing" - a link is a bearer credential in an inbox, and the
 * only thing bounding its blast radius is how soon it stops working.
 */
const DEFAULT_LINK_TTL_HOURS = 24;

/** Two weeks. Past this, issue a second link rather than a longer one. */
const MAX_LINK_TTL_HOURS = 336;

/** 256 bits, the same width and encoding `LoginTokenService.issue()` uses. */
const TOKEN_BYTES = 32;

/**
 * Resolved from this file rather than from `process.cwd()`, because mise runs
 * the task with `dir = "backend"` and a human debugging it runs it from wherever
 * they happen to be standing.
 */
const PARTICIPANTS_FILE = resolve(
  __dirname,
  '../../../docs/showcase/.participants',
);

/**
 * The ledger lives outside the repository, not merely gitignored: it holds
 * working credentials for a live account, and a gitignored secret is still a
 * secret sitting in a directory people screen-share from.
 */
const LEDGER_DIR = join(homedir(), '.spendifico');

const MAILPACE_SEND_URL = 'https://app.mailpace.com/api/v1/send';
const SEND_TIMEOUT_MS = 10_000;

/** Shape only. Deliverability is MailPace's answer, not a regex's. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_SHOWCASE_EMAIL = 'slavko@spendifico.eu';

interface Flags {
  /** Off by default: minting and mailing real people has to be asked for. */
  send: boolean;
  /**
   * Mint the rows and write the ledger, then stop before the first email.
   *
   * This exists because otherwise phases 2 and 3 are unreachable except on the
   * one run that matters: `--send` is what triggers them and local mode refuses
   * `--send` by design, so the transaction, the hash and the ledger would first
   * execute against production with a room waiting. With this flag they can be
   * exercised end to end against local files, including checking that a minted
   * token really does authenticate.
   */
  mintOnly: boolean;
  /** The demo account every link points at. */
  email: string;
  /**
   * The invite list. Overridable so a rehearsal can run against a list of one
   * without touching the real file - which matters more than it looks, because
   * the real file is written by hand shortly before the run and a test that
   * overwrites it destroys the only copy.
   */
  participantsFile: string;
  /** How long the minted links last, in hours. See `DEFAULT_LINK_TTL_HOURS`. */
  ttlHours: number;
}

/** One participant's row and link, as written to the ledger. */
interface LedgerEntry {
  address: string;
  loginLinkId: string;
  link: string;
  sent: boolean;
  error: string | null;
  /** Bumped by the watcher, which is capped at two re-sends per address. */
  resends: number;
}

interface Ledger {
  createdAt: string;
  mode: string;
  account: string;
  userId: string;
  frontendUrl: string;
  expiresAt: string;
  /**
   * Recorded so the watcher re-mints a replacement with the **same** lifetime
   * this run chose. Without it a broken 4-day link would be repaired with a
   * 24-hour one, quietly, and the person holding it would be locked out three
   * days early with nothing to explain why.
   */
  ttlHours: number;
  participants: LedgerEntry[];
}

function parseFlags(argv: readonly string[]): Flags {
  const emailFlag = argv.find((arg) => arg.startsWith('--email='));
  const email = emailFlag
    ? emailFlag.slice('--email='.length).trim().toLowerCase()
    : DEFAULT_SHOWCASE_EMAIL;

  if (email === '') {
    throw new Error('--email= was given with no address.');
  }

  const listFlag = argv.find((arg) => arg.startsWith('--participants='));
  const participantsFile = listFlag
    ? resolve(listFlag.slice('--participants='.length).trim())
    : PARTICIPANTS_FILE;

  return {
    send: argv.includes('--send'),
    mintOnly: argv.includes('--mint-only'),
    email,
    participantsFile,
    ttlHours: parseTtlHours(argv),
  };
}

/**
 * `--hours=`, defaulting to a day and refused outside 1 to `MAX_LINK_TTL_HOURS`.
 *
 * Validated rather than trusted, because every failure here is silent at the
 * call site and loud a week later. A typo'd `--hours=9600` reads as a plausible
 * number and mints a credential lasting thirteen months; `--hours=0` mints rows
 * that `consume()` rejects on sight, which looks exactly like a delivery
 * problem. Both are cheaper to refuse than to explain.
 */
function parseTtlHours(argv: readonly string[]): number {
  const flag = argv.find((arg) => arg.startsWith('--hours='));
  if (!flag) {
    return DEFAULT_LINK_TTL_HOURS;
  }

  const hours = Number(flag.slice('--hours='.length).trim());
  if (!Number.isFinite(hours) || !Number.isInteger(hours)) {
    throw new Error(`--hours= must be a whole number of hours, got "${flag}".`);
  }
  if (hours < 1 || hours > MAX_LINK_TTL_HOURS) {
    throw new Error(
      `--hours=${hours} is outside 1 to ${MAX_LINK_TTL_HOURS}. Past two weeks, ` +
        'issue a second link rather than a longer one.',
    );
  }

  return hours;
}

/**
 * The invite list: one address per line, blanks and `#` comments ignored.
 *
 * De-duplicated because two identical addresses would mint two rows and send two
 * mails to one person, and the second would look to them like the first had
 * failed.
 */
function readParticipants(path: string): string[] {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `No participants file at ${path}. Write one address per line; it is ` +
        'gitignored by docs/.gitignore and must never be committed.',
    );
  }

  const addresses = contents
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== '' && !line.startsWith('#'));

  const malformed = addresses.filter((line) => !EMAIL_SHAPE.test(line));
  if (malformed.length > 0) {
    throw new Error(
      `These lines are not addresses: ${malformed.join(', ')}. ` +
        'Fix them rather than letting the run mail nine of ten people.',
    );
  }

  const unique = [...new Set(addresses)];
  if (unique.length === 0) {
    throw new Error(`${path} lists no addresses.`);
  }

  return unique;
}

/** Whether this run reaches phase 2 at all. */
function willMint(flags: Flags): boolean {
  return flags.send || flags.mintOnly;
}

/**
 * The plan block, and the pause.
 *
 * Prints the database target and the link base URL together, for the reason the
 * file header gives: they are independent settings and a mismatch is a complete
 * success that delivers nothing usable.
 */
async function confirmPlan(
  flags: Flags,
  addresses: string[],
  userId: string,
  frontendUrl: string,
  expiresAt: Date,
  from: string,
): Promise<void> {
  console.log('');
  console.log('  List           ', flags.participantsFile);
  console.log('  Participants   ', addresses.length);
  for (const address of addresses) {
    console.log('                 ', address);
  }
  console.log('  Demo account   ', `${flags.email}  (${userId})`);
  console.log(
    '  Database       ',
    SEED_MODE === 'cloud' ? 'TURSO CLOUD' : 'local files',
  );
  console.log('  Links point at ', frontendUrl);
  console.log(
    '  Links expire   ',
    expiresAt.toISOString(),
    `(in ${flags.ttlHours}h)`,
  );
  console.log('  Mail from      ', flags.send ? from : '(nothing sent)');
  console.log('');

  if (!willMint(flags)) {
    // Nothing to confirm: a dry run writes no row and sends no mail, so a
    // prompt here would train the operator to hit Enter on the one block that
    // matters.
    return;
  }

  console.log(
    '  Check the database and the base URL against each other before ' +
      'continuing:\n  cloud rows with localhost links is a run that succeeds ' +
      'and delivers nothing.',
  );
  console.log('');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      flags.send
        ? `Mint ${addresses.length} links and email them? [y/N] `
        : `Mint ${addresses.length} links, without emailing anybody? [y/N] `,
    );
    if (answer.trim().toLowerCase() !== 'y') {
      throw new Error('Cancelled. Nothing was written.');
    }
  } finally {
    rl.close();
  }
}

/**
 * Phase 2: every participant's row, in one transaction.
 *
 * The raw token exists only here and in the ledger - `token_hash` is all the
 * database gets, exactly as it would from `issue()`, so a link created here is
 * indistinguishable to `consume()` from one the app sent.
 */
async function mint(
  centralDb: CentralDatabase,
  userId: string,
  addresses: string[],
  frontendUrl: string,
  expiresAt: Date,
): Promise<LedgerEntry[]> {
  const base = frontendUrl.replace(/\/+$/, '');

  const minted = addresses.map((address) => {
    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
    return {
      address,
      loginLinkId: newId(),
      rawToken,
      link: `${base}/auth/verify?token=${encodeURIComponent(rawToken)}`,
    };
  });

  // One transaction: all the rows or none of them. The usual objection to
  // db.transaction() - the embedded driver refuses overlapping transactions -
  // does not apply to a one-shot script with nothing else on the connection.
  await centralDb.transaction(async (tx) => {
    await tx.insert(loginLinks).values(
      minted.map((entry) => ({
        id: entry.loginLinkId,
        userId,
        tokenHash: hashToken(entry.rawToken),
        expiresAt,
      })),
    );
  });

  return minted.map((entry) => ({
    address: entry.address,
    loginLinkId: entry.loginLinkId,
    link: entry.link,
    sent: false,
    error: null,
    resends: 0,
  }));
}

/** Phase 3. Mode 0600, because the links in it are working credentials. */
function writeLedger(ledger: Ledger): string {
  mkdirSync(LEDGER_DIR, { recursive: true, mode: 0o700 });

  const stamp = ledger.createdAt.replace(/[:.]/g, '-');
  const path = join(LEDGER_DIR, `showcase-invites-${stamp}.json`);

  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);

  return path;
}

/**
 * Phase 4. Sequential, and a rejected address is recorded rather than thrown:
 * aborting the batch over one bounce leaves the room half-invited with no record
 * of which half.
 */
async function sendAll(
  ledger: Ledger,
  ledgerPath: string,
  token: string,
  from: string,
): Promise<void> {
  for (const entry of ledger.participants) {
    const rawToken = new URL(entry.link).searchParams.get('token') ?? '';
    const email = renderShowcaseInviteEmail(
      ledger.frontendUrl,
      rawToken,
      ledger.ttlHours,
    );

    try {
      const response = await fetch(MAILPACE_SEND_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          // Required, not decorative: Node's fetch sends `Accept: */*` and
          // MailPace answers that with a 406 naming the content type, which is
          // fine. See MailPaceMailer, which learned this against the live API.
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
        entry.error =
          `${response.status} ${await response.text().catch(() => '')}`.trim();
        console.error(`  failed  ${entry.address}  ${entry.error}`);
      } else {
        entry.sent = true;
        entry.error = null;
        console.log(`  sent    ${entry.address}`);
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
      console.error(`  failed  ${entry.address}  ${entry.error}`);
    }

    // Rewritten after every attempt rather than once at the end, so a crash
    // mid-batch leaves a ledger that says exactly who was already mailed.
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, {
      mode: 0o600,
    });
  }
}

async function invite(app: INestApplicationContext): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const config = app.get(ConfigService);

  // Phase 1: preflight.
  if (flags.send && SEED_MODE === 'local') {
    throw new Error(
      'Local mode cannot send: seed-showcase.env.ts drops MAILPACE_API_TOKEN ' +
        'and MAIL_FROM in local mode by design, and local links point at ' +
        'localhost anyway. Use `mise run showcase:invite:cloud -- --send`.',
    );
  }

  const addresses = readParticipants(flags.participantsFile);

  const user = await app.get(UsersService).findByEmail(flags.email);
  if (!user) {
    throw new Error(
      `No account for ${flags.email} in the ${SEED_MODE} database. Links for a ` +
        'user that does not exist authenticate nothing - seed the account first.',
    );
  }

  const verifiable = await app.get(UsersService).findById(user.id);
  if (SEED_MODE === 'cloud' && verifiable?.dbUrl === null) {
    throw new Error(
      `${flags.email} exists but has no database, so it was never verified in ` +
        'cloud mode. Ten participants clicking at once would each race the ' +
        'provisioning. Run `mise run seed:cloud` first.',
    );
  }

  const token = flags.send
    ? config.getOrThrow<string>('MAILPACE_API_TOKEN')
    : '';
  const fromAddress = flags.send ? config.getOrThrow<string>('MAIL_FROM') : '';
  const fromName = config
    .get<string>('MAIL_FROM_NAME')
    ?.replace(/["\\]/g, '')
    .trim();
  const from = fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;

  const frontendUrl = config.get<string>(
    'FRONTEND_URL',
    'http://localhost:4200',
  );
  const expiresAt = new Date(Date.now() + flags.ttlHours * 60 * 60 * 1000);

  await confirmPlan(flags, addresses, user.id, frontendUrl, expiresAt, from);

  if (!willMint(flags)) {
    const sample = renderShowcaseInviteEmail(
      frontendUrl,
      'THIS-IS-NOT-A-REAL-TOKEN',
      flags.ttlHours,
    );
    console.log('Dry run. This is the mail each of them would receive:');
    console.log('');
    console.log(`  Subject: ${sample.subject}`);
    console.log('');
    console.log(sample.textbody.replace(/^/gm, '  '));
    console.log('');
    console.log(
      `Nothing was written. Re-run with --send to mint ${addresses.length} ` +
        'links and mail them.',
    );
    return;
  }

  // Phase 2: mint.
  const entries = await mint(
    app.get<CentralDatabase>(APP_DB),
    user.id,
    addresses,
    frontendUrl,
    expiresAt,
  );
  console.log(`Minted ${entries.length} links.`);

  // Phase 3: the ledger, before the first email.
  const ledger: Ledger = {
    createdAt: new Date().toISOString(),
    mode: SEED_MODE,
    account: flags.email,
    userId: user.id,
    frontendUrl,
    expiresAt: expiresAt.toISOString(),
    ttlHours: flags.ttlHours,
    participants: entries,
  };
  const ledgerPath = writeLedger(ledger);
  console.log(`Ledger written to ${ledgerPath}`);

  if (!flags.send) {
    console.log('');
    console.log(
      `--mint-only: ${entries.length} rows are live and nothing was emailed. ` +
        'The links are in the ledger.',
    );
    return;
  }

  // Phase 4: send.
  console.log('');
  await sendAll(ledger, ledgerPath, token, from);

  // Phase 5: report.
  const sent = ledger.participants.filter((entry) => entry.sent).length;
  console.log('');
  console.log(
    `  ${addresses.length} addresses, ${entries.length} links minted, ${sent} sent.`,
  );
  console.log(`  Links expire ${expiresAt.toISOString()}.`);
  console.log('');
  console.log(
    '  Nobody may submit the login form for this account from now on: one ' +
      'submission\n  supersedes every link that has not been clicked yet. ' +
      'Demonstrate the login flow\n  on a plus-address such as ' +
      'spendifico+demo@gmail.com instead.',
  );
  console.log('');
  console.log('  Watch who gets in, and re-send anything that breaks:');
  console.log(`  mise run showcase:watch:cloud -- --ledger=${ledgerPath}`);

  if (sent < entries.length) {
    // A non-zero exit, because a partially delivered batch needs somebody to
    // look at it rather than to read "done" and walk away.
    process.exitCode = 1;
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
    await invite(app);
  } finally {
    // Closes every open replica, each with a final push in cloud mode. Skipping
    // it is how a locally-committed row never reaches Turso - which here would
    // mean ten links that exist nowhere the deployed backend can see them.
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Inviting failed.', error);
  process.exitCode = 1;
});
