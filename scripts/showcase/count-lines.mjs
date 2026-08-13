/**
 * Counts a file's lines as code, comment or blank.
 *
 * **This is why the headline figure is a snapshot rather than a diff.** A whole
 * file can be scanned properly: a block comment is tracked from `/*` to its
 * close, and a `//` inside a string literal is not mistaken for a comment. A
 * diff cannot be, because it shows only the lines that changed - so classifying
 * an added line is guesswork exactly at the edges, and the number that would be
 * called "lines of code" would be the least defensible one on the page.
 *
 * The scanner is deliberately small and its limits are worth stating rather than
 * hiding. It does not parse template literals or regex literals, so a `//`
 * inside a backtick string or a regex counts as a comment; both are rare enough
 * in this codebase to move no figure visibly, and erring toward "comment" makes
 * the comment-density claim conservative rather than flattering, which is the
 * right direction for a number said out loud.
 */

/** How a file's comments are written, by extension. */
const SYNTAX = {
  ts: { line: '//', block: ['/*', '*/'], strings: true },
  tsx: { line: '//', block: ['/*', '*/'], strings: true },
  js: { line: '//', block: ['/*', '*/'], strings: true },
  jsx: { line: '//', block: ['/*', '*/'], strings: true },
  mjs: { line: '//', block: ['/*', '*/'], strings: true },
  cjs: { line: '//', block: ['/*', '*/'], strings: true },
  css: { line: null, block: ['/*', '*/'], strings: false },
  scss: { line: '//', block: ['/*', '*/'], strings: false },
  sql: { line: '--', block: ['/*', '*/'], strings: false },
  sh: { line: '#', block: null, strings: false },
  yml: { line: '#', block: null, strings: false },
  yaml: { line: '#', block: null, strings: false },
  toml: { line: '#', block: null, strings: false },
  mmd: { line: '%%', block: null, strings: false },
  html: { line: null, block: ['<!--', '-->'], strings: false },
  svg: { line: null, block: ['<!--', '-->'], strings: false },
  // JSON has no comment syntax at all, which is worth an entry rather than a
  // fallback: it makes "every line of a JSON file is code" a decision.
  json: { line: null, block: null, strings: false },
};

/**
 * Files with no extension, or whose extension says nothing, that are still
 * hash-commented shell-ish config.
 */
const HASH_COMMENTED = [
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.prettierignore',
  '.nvmrc',
  'Dockerfile',
  '.env.example',
];

function syntaxFor(path) {
  const extension = path.includes('.') ? path.split('.').pop() : '';
  if (SYNTAX[extension]) {
    return SYNTAX[extension];
  }
  if (HASH_COMMENTED.some((name) => path.endsWith(name))) {
    return { line: '#', block: null, strings: false };
  }
  if (path.includes('.husky/')) {
    return { line: '#', block: null, strings: false };
  }
  return null;
}

/**
 * Where the first line comment starts on this line, or -1.
 *
 * Scans character by character rather than using `indexOf`, because the whole
 * point is to know whether the marker is inside a string.
 */
function lineCommentAt(text, marker, trackStrings) {
  let quote = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (trackStrings && (char === '"' || char === "'")) {
      quote = char;
      continue;
    }

    if (text.startsWith(marker, i)) {
      return i;
    }
  }

  return -1;
}

/**
 * Classifies every line of one file.
 *
 * A line holding both code and a trailing comment counts as **code**, not as
 * both: the buckets have to sum to the file's line count or the totals on the
 * page do not reconcile, and "how big is this" is answered by the code half.
 *
 * @returns `{ code, comment, blank, total }`
 */
export function countLines(path, contents) {
  const lines = contents.split('\n');
  // A trailing newline yields one empty final element that is not a line.
  if (lines.at(-1) === '') {
    lines.pop();
  }

  const syntax = syntaxFor(path);
  const counts = { code: 0, comment: 0, blank: 0, total: lines.length };

  // No known comment syntax: every non-blank line is content. Used for JSON and
  // for anything unrecognised, which is why the fallback is the conservative
  // one - it can never inflate the comment figure.
  if (!syntax) {
    for (const line of lines) {
      if (line.trim() === '') {
        counts.blank++;
      } else {
        counts.code++;
      }
    }
    return counts;
  }

  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' && !inBlock) {
      counts.blank++;
      continue;
    }

    if (inBlock) {
      counts.comment++;
      const close = line.indexOf(syntax.block[1]);
      if (close !== -1) {
        inBlock = false;
        // Code after a block comment closes on the same line makes it a code
        // line after all.
        if (line.slice(close + syntax.block[1].length).trim() !== '') {
          counts.comment--;
          counts.code++;
        }
      }
      continue;
    }

    const blockOpen = syntax.block ? line.indexOf(syntax.block[0]) : -1;
    const lineOpen = syntax.line
      ? lineCommentAt(line, syntax.line, syntax.strings)
      : -1;

    // Whichever marker comes first decides the line.
    const isLineComment =
      lineOpen !== -1 && (blockOpen === -1 || lineOpen < blockOpen);

    if (isLineComment) {
      if (line.slice(0, lineOpen).trim() === '') {
        counts.comment++;
      } else {
        counts.code++;
      }
      continue;
    }

    if (blockOpen !== -1) {
      const before = line.slice(0, blockOpen).trim();
      const close = line.indexOf(syntax.block[1], blockOpen + 2);

      if (close === -1) {
        inBlock = true;
      }

      const after =
        close === -1
          ? ''
          : line.slice(close + syntax.block[1].length).trim();

      if (before === '' && after === '') {
        counts.comment++;
      } else {
        counts.code++;
      }
      continue;
    }

    counts.code++;
  }

  return counts;
}
