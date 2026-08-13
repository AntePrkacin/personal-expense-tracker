/**
 * Every chart on `docs/showcase/statistics.html`, bundled by `build-charts.mjs`.
 *
 * ## Nothing here contains a figure
 *
 * Every number is read from `window.__SHOWCASE__`, which the build writes from
 * `data/*.json`. That is the constraint the whole vector is built around: the
 * showcase is the same day the code is still being written, so refreshing the
 * statistics has to be one command, and a refresh cannot break a page that
 * holds no figure of its own.
 *
 * ## The palette was computed, not chosen
 *
 * Both modes were run through the `dataviz` skill's validator until every check
 * passed - lightness band, chroma floor, colour-vision separation for adjacent
 * pairs, the normal-vision floor, and contrast against the surface. Two results
 * of that are worth not undoing.
 *
 * **Pink and teal are never adjacent.** They are the classic deutan-confusable
 * pair, and at the lightness the dark surface needs they measured ΔE 3.0, which
 * is indistinguishable. Re-ordering the ramp so indigo and orange sit between
 * them is what fixed it, so the order of `SERIES` is load-bearing rather than
 * aesthetic.
 *
 * **Dark is a different set of steps, not a flip.** The teal that passes on
 * white is too light for the dark surface and the indigo is too dark, so each
 * mode names its own values. Automatically lightening the light palette fails
 * the band check, which is exactly the mistake the skill exists to prevent.
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const DATA = window.__SHOWCASE__ ?? {};

/**
 * The categorical ramp, in fixed order. See the header for why the order is not
 * a preference. Slot 0 and 1 are the two authors everywhere they appear.
 */
const SERIES = {
  light: ['#4f46e5', '#c1519e', '#ea580c', '#0f9184'],
  dark: ['#6963ee', '#c1519e', '#ea580c', '#0f9e90'],
};

const INK = {
  light: { primary: '#131820', muted: '#5b6472', grid: '#edeff2', surface: '#ffffff' },
  dark: { primary: '#ffffff', muted: '#b4bcc9', grid: '#232c38', surface: '#18202b' },
};

function useMode() {
  const read = () => {
    const explicit = document.documentElement.dataset.theme;
    if (explicit === 'dark' || explicit === 'light') {
      return explicit;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  };

  const [mode, setMode] = useState(read);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setMode(read());
    media.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true });
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);

  return mode;
}

const number = (value) =>
  value === null || value === undefined ? '—' : value.toLocaleString('en-GB');

const share = (value, total) =>
  total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`;

/** Values wear ink tokens, never the series colour. */
function Card({ title, note, children, wide }) {
  return (
    <section className={`card${wide ? ' card--wide' : ''}`}>
      <h2>{title}</h2>
      {note ? <p className="note">{note}</p> : null}
      {children}
    </section>
  );
}

function Tiles() {
  const { repo, delivery, tickets, shape, tests, deps } = DATA;

  const tiles = [
    { label: 'Active days', value: repo?.activity.activeDays },
    { label: 'Commits', value: repo?.activity.commits },
    { label: 'Merged PRs', value: delivery?.merged },
    { label: 'Jira tickets', value: tickets?.total },
    { label: 'Database tables', value: shape?.tables.total },
    { label: 'API operations', value: shape?.api.operations },
    { label: 'Tests', value: tests?.total },
    { label: 'Packages installed', value: deps?.totalNow },
  ];

  return (
    <div className="tiles">
      {tiles.map((tile) => (
        <div className="tile" key={tile.label}>
          <div className="tile__value">{number(tile.value)}</div>
          <div className="tile__label">{tile.label}</div>
        </div>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, mode, suffix = '' }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className={`tip tip--${mode}`}>
      {label !== undefined ? <div className="tip__label">{label}</div> : null}
      {payload.map((entry) => (
        <div className="tip__row" key={entry.name}>
          <span className="tip__swatch" style={{ background: entry.color }} />
          <span className="tip__name">{entry.name}</span>
          <span className="tip__value">
            {number(entry.value)}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Commits across the calendar: the shape over time is the point. */
function CommitsOverTime({ mode }) {
  const series = DATA.repo?.activity.commitsPerDay ?? [];
  const ink = INK[mode];
  const colour = SERIES[mode][0];

  return (
    <Card
      title="Commits across the calendar"
      note={`${number(DATA.repo?.activity.commits)} commits over ${number(DATA.repo?.activity.activeDays)} active days, ${DATA.repo?.activity.firstCommit} to ${DATA.repo?.activity.lastCommit}. Days with no commits are drawn as zero rather than skipped.`}
      wide
    >
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="commitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={ink.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: ink.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: ink.grid }}
            tickFormatter={(value) => value.slice(5)}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: ink.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip mode={mode} />}
            cursor={{ stroke: ink.muted, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="commits"
            name="Commits"
            stroke={colour}
            strokeWidth={2}
            fill="url(#commitFill)"
            // Off for the same reason as every other mark here, and this one
            // was found by screenshotting rather than by reading: an animating
            // area renders as an empty axis until it finishes, so a page
            // captured - or projected - in its first moment shows no data at
            // all. Nothing on a slide should depend on having waited.
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

/**
 * One pie per metric, two slices, the same two colours throughout.
 *
 * A two-slice part-of-a-whole is the one thing a pie does well. Everything on
 * this page that is a *comparison* is a bar instead.
 */
function AuthorPie({ metric, title, mode, authors }) {
  const data = authors.map((author) => ({
    name: author.name,
    value: author[metric] ?? 0,
  }));
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={0}
            outerRadius={72}
            // The 2px surface ring is the spacer between slices.
            stroke={INK[mode].surface}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((slice, index) => (
              <Cell key={slice.name} fill={SERIES[mode][index]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip mode={mode} />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="legend">
        {data.map((slice, index) => (
          <li key={slice.name}>
            <span
              className="legend__swatch"
              style={{ background: SERIES[mode][index] }}
            />
            <span className="legend__name">{slice.name}</span>
            <span className="legend__value">
              {number(slice.value)} · {share(slice.value, total)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const AREAS = [
  { key: 'backend', label: 'Backend' },
  { key: 'frontend', label: 'Frontend' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'tooling', label: 'Tooling' },
];

/** The one chart nobody can predict from the others. */
function WorkByArea({ mode, authors }) {
  const data = authors.map((author) => ({
    name: author.name,
    ...author.areas,
  }));
  const ink = INK[mode];

  return (
    <Card
      title="Work by area, per author"
      note="Lines added, generated files excluded. Measured on additions rather than on surviving lines, because this chart is about where each person spent their time - and work that was later replaced is still work that was done."
      wide
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke={ink.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: ink.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: ink.grid }}
            tickFormatter={(value) => `${Math.round(value / 1000)}k`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: ink.primary, fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip
            content={<ChartTooltip mode={mode} />}
            cursor={{ fill: ink.grid, fillOpacity: 0.4 }}
          />
          {AREAS.map((area, index) => (
            <Bar
              key={area.key}
              dataKey={area.key}
              name={area.label}
              stackId="area"
              fill={SERIES[mode][index]}
              // A 2px surface gap between stacked segments.
              stroke={ink.surface}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/*
        Hand-rendered rather than Recharts' <Legend>, which sorts its own items:
        it listed Backend, Documentation, Frontend against segments stacked
        Backend, Frontend, Documentation, so the legend and the bar disagreed
        about which colour came next. This also matches the legends every other
        chart on the page uses.
      */}
      <ul className="legend legend--row">
        {AREAS.map((area, index) => (
          <li key={area.key}>
            <span
              className="legend__swatch"
              style={{ background: SERIES[mode][index] }}
            />
            <span className="legend__name">{area.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A genuine part-of-a-whole with three slices. */
function LineBuckets({ mode }) {
  const lines = DATA.repo?.lines;
  if (!lines) {
    return null;
  }

  const data = [
    { name: 'Hand-written code', value: lines.code.code, colour: 0 },
    { name: 'Documentation', value: lines.documentation.code, colour: 2 },
    { name: 'Generated or vendored', value: lines.generated.code, colour: 3 },
  ];
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <Card
      title="Lines today, by kind"
      note="A snapshot with comments and blanks excluded, which is the figure that can be measured accurately. Generated and vendored files are their own bucket rather than a subtraction - folded in, the three lockfiles alone dwarf everything else."
    >
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={54}
            outerRadius={84}
            stroke={INK[mode].surface}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={SERIES[mode][slice.colour]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip mode={mode} />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="legend">
        {data.map((slice) => (
          <li key={slice.name}>
            <span
              className="legend__swatch"
              style={{ background: SERIES[mode][slice.colour] }}
            />
            <span className="legend__name">{slice.name}</span>
            <span className="legend__value">
              {number(slice.value)} · {share(slice.value, total)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Comparing magnitudes: length is easy to compare, angle is not. */
function SimpleBars({ title, note, data, mode, colourIndex = 0, height = 220 }) {
  const ink = INK[mode];

  return (
    <Card title={title} note={note}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 48, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke={ink.grid} horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: ink.primary, fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={150}
          />
          <Tooltip
            content={<ChartTooltip mode={mode} />}
            cursor={{ fill: ink.grid, fillOpacity: 0.4 }}
          />
          <Bar
            dataKey="value"
            name={title}
            fill={SERIES[mode][colourIndex]}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            label={{
              position: 'right',
              fill: ink.muted,
              fontSize: 12,
              formatter: number,
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

/** Two series, so a legend is mandatory. */
function Packages({ mode }) {
  const deps = DATA.deps;
  if (!deps) {
    return null;
  }

  const data = deps.trees.map((tree) => ({
    name: tree.tree,
    then: tree.atInitialCommit ?? 0,
    now: tree.now ?? 0,
  }));
  const ink = INK[mode];

  return (
    <Card
      title="Packages per tree"
      note={`Counted from the three package-lock.json files, never from node_modules - which is the only method that also works at the initial commit, where nothing is installed. ${number(deps.totalAtInitialCommit)} in the template, ${number(deps.totalNow)} today.`}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={ink.grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: ink.primary, fontSize: 13 }}
            tickLine={false}
            axisLine={{ stroke: ink.grid }}
          />
          <YAxis
            tick={{ fill: ink.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            content={<ChartTooltip mode={mode} />}
            cursor={{ fill: ink.grid, fillOpacity: 0.4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 13, color: ink.muted, paddingTop: 8 }}
          />
          <Bar
            dataKey="then"
            name="At the initial commit"
            fill={SERIES[mode][3]}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="now"
            name="Today"
            fill={SERIES[mode][0]}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function App() {
  const mode = useMode();
  const authors = DATA.authors?.authors ?? [];
  const repo = DATA.repo;

  const docSplit = repo
    ? [
        { name: 'Plans', value: repo.documentationSplit.plans.lines },
        { name: 'Agent files', value: repo.documentationSplit.agents.lines },
        { name: 'Everything else', value: repo.documentationSplit.other.lines },
      ]
    : [];

  const density = repo
    ? [
        { name: 'Code', value: repo.lines.code.code },
        { name: 'Comments', value: repo.lines.code.comment },
      ]
    : [];

  return (
    <>
      <Tiles />

      <CommitsOverTime mode={mode} />

      <div className="grid grid--three">
        <AuthorPie
          metric="commits"
          title="Commits"
          mode={mode}
          authors={authors}
        />
        <AuthorPie
          metric="mergedPullRequests"
          title="Merged pull requests"
          mode={mode}
          authors={authors}
        />
        <AuthorPie
          metric="survivingLines"
          title="Surviving lines"
          mode={mode}
          authors={authors}
        />
      </div>

      <WorkByArea mode={mode} authors={authors} />

      <div className="grid grid--two">
        <LineBuckets mode={mode} />
        <SimpleBars
          title="Comment density"
          note={`${repo?.commentDensity.per100 ?? '—'} comment lines for every 100 lines of code. This repository comments deliberately heavily, and that is a fact about how it was built rather than an accident.`}
          data={density}
          mode={mode}
          colourIndex={0}
          height={160}
        />
      </div>

      <div className="grid grid--two">
        <SimpleBars
          title="Documentation, split three ways"
          note="One plan per ticket, the agent files that tell Claude Code how this repository works, and everything else."
          data={docSplit}
          mode={mode}
          colourIndex={2}
          height={200}
        />
        <Packages mode={mode} />
      </div>
    </>
  );
}

createRoot(document.getElementById('charts')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
