// csv-reader-speed-01-run-20261121 — a fast drop-in for csv-reader 1.0.0.
//
// Single-pass scanner built on charCodeAt and slice: unquoted fields are
// sliced out of the text in one piece (a stray CR only splits the field
// into segments), quoted fields are sliced when they hold no doubled quote
// or line break and rebuilt from segments only when they do. The reading
// follows csv-reader 1.0.0's broken-row policy exactly: a BOM is dropped,
// empty lines are skipped, stray CRs are dropped with an error, a quoted
// field runs to the next undoubled quote with "" as one quote and CR/LF
// inside it as LF, junk after a closing quote is appended with an error,
// a quote that never closes is read again as unquoted, and rows are padded
// or cut to the first record's width. No clock, no randomness, no locale,
// nothing kept from one call to the next.

const COMMA = 44; // ','
const QUOTE = 34; // '"'
const LF = 10; // '\n'
const CR = 13; // '\r'
const BOM = 0xFEFF;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === BOM) pos = 1;

  // The record being read: the line it starts on, the index in rows it takes.
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, whether the record goes on (a comma),
  // and how many characters the unquoted reader appended (for quote_junk).
  let fval = '';
  let fmore = false;
  let fadded = 0;

  // Reads an unquoted field from pos, starting from `init`. Sets fval and
  // fmore; advances pos and line; records stray_cr errors. `track` asks
  // for fadded (how many characters were appended) — only the junk path
  // after a closing quote needs it, so the hot path skips the counting.
  function unquoted(init, track) {
    let start = pos;
    let parts = init === '' ? null : [init];
    let added = 0;
    let term; // 0 comma, 1 LF, 2 CRLF, 3 end of text
    for (;;) {
      while (pos < len) {
        const c = text.charCodeAt(pos);
        if (c === COMMA || c === LF || c === CR) break;
        pos++;
      }
      if (pos >= len) { term = 3; break; }
      const c = text.charCodeAt(pos);
      if (c === COMMA) { term = 0; break; }
      if (c === LF) { term = 1; break; }
      if (pos + 1 < len && text.charCodeAt(pos + 1) === LF) { term = 2; break; }
      // A CR not followed by LF: dropped, with an error, and the field goes on.
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (parts === null) parts = [text.slice(start, pos)];
      else parts.push(text.slice(start, pos));
      if (track) added += pos - start;
      pos++;
      start = pos;
    }
    if (track) added += pos - start;
    if (parts === null) fval = text.slice(start, pos);
    else { parts.push(text.slice(start, pos)); fval = parts.join(''); }
    fadded = added;
    if (term === 0) { pos++; fmore = true; }
    else if (term === 1) { pos++; line++; fmore = false; }
    else if (term === 2) { pos += 2; line++; fmore = false; }
    else fmore = false;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fval and fmore.
  function quoted() {
    const open = pos;
    const openLine = line;
    pos++;
    let start = pos;
    let parts = null;
    let closed = false;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === QUOTE) {
        if (pos + 1 < len && text.charCodeAt(pos + 1) === QUOTE) {
          if (parts === null) parts = [text.slice(start, pos)];
          else parts.push(text.slice(start, pos));
          parts.push('"');
          pos += 2;
          start = pos;
          continue;
        }
        closed = true;
        break;
      }
      if (c === CR || c === LF) {
        // CRLF and a lone CR inside quotes are each one LF.
        if (parts === null) parts = [text.slice(start, pos)];
        else parts.push(text.slice(start, pos));
        parts.push('\n');
        line++;
        pos += (c === CR && pos + 1 < len && text.charCodeAt(pos + 1) === LF) ? 2 : 1;
        start = pos;
        continue;
      }
      pos++;
    }
    if (!closed) {
      // The quote never closes: it is literal, the text after it unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      unquoted('"', false);
      return;
    }
    let value;
    if (parts === null) value = text.slice(start, pos);
    else { parts.push(text.slice(start, pos)); value = parts.join(''); }
    pos++; // the closing quote
    if (pos >= len) { fval = value; fmore = false; return; }
    const c = text.charCodeAt(pos);
    if (c === COMMA) { pos++; fval = value; fmore = true; return; }
    if (c === LF) { pos++; line++; fval = value; fmore = false; return; }
    if (c === CR && pos + 1 < len && text.charCodeAt(pos + 1) === LF) { pos += 2; line++; fval = value; fmore = false; return; }
    // What follows the closing quote is appended as it stands.
    unquoted(value, true);
    if (fadded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === LF) { pos++; line++; }
      else if (c === CR && pos + 1 < len && text.charCodeAt(pos + 1) === LF) { pos += 2; line++; }
      else break;
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quotedFlag = false;
    do {
      if (text.charCodeAt(pos) === QUOTE) {
        quotedFlag = true;
        quoted();
      } else {
        quotedFlag = false;
        unquoted('', false);
      }
      fields.push(fval);
    } while (fmore);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quotedFlag) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
