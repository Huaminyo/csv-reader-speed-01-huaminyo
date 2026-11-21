# csv-reader-speed-01-huaminyo

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Huaminyo/csv-reader-speed-01-huaminyo/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Huaminyo/csv-reader-speed-01-huaminyo/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0, entered in the
[csv-reader-speed-01-run-20261121 bounty on make.fun](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

## What it does

`solve.js` exports `run(input)`, which returns exactly the answer
csv-reader 1.0.0 returns for `{text, header}`: `{columns, rows, errors}`.
It reads the CSV text once, left to right, under csv-reader's broken-row
policy: a BOM is dropped, empty lines are skipped, stray CRs are dropped
with an error, quoted fields run to the next undoubled quote (`""` is one
quote, CR/LF inside quotes is LF), junk after a closing quote is appended
with an error, a quote that never closes is read again as unquoted, and
rows are padded or cut to the first record's width.

## How it is fast

A single-pass state machine built on `charCodeAt` and `slice`: unquoted
fields are sliced out of the text in one piece, quoted fields are sliced
when they hold no doubled quote or line break and rebuilt from segments
only when they do. No regex, no whole-text `split`, no per-character
string building. `main.ts` turns V8's incremental marking off before
importing `solve.js`, as the house driver does.

## Layout

- `solve.js` — the parser (dependency-free ES module).
- `main.ts` — the driver: reads `/input/cases.json`, writes
  `/output/answers.json`.

## License

MIT — see [LICENSE](LICENSE).
