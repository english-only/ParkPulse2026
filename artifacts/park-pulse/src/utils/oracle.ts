/**
 * PRD Phase 6 — Oracle search (FR6.7): boolean query parsing and execution
 * over the `JobIndex` contract.
 *
 * Grammar (documented, deliberately small):
 *
 *   expr   := and (OR and)*            // OR binds loosest
 *   and    := not (AND not | not)*      // explicit AND, and implicit AND
 *   not    := NOT not | primary         // NOT binds tightest
 *   primary:= '(' expr ')' | phrase | word
 *
 * - Operators are the uppercase words `AND` `OR` `NOT`; lowercase `and` is a
 *   literal search term.
 *   Adjacent terms are AND-ed implicitly ("nurse teacher").
 * - Phrases are double-quoted and match as substrings; matching is
 *   case-insensitive substring against company, title, suburb, council,
 *   sector and industry (substring, not word-boundary — documented behaviour,
 *   so "java" also finds "javascript").
 * - The parser never throws: dangling operators keep their left operand,
 *   unbalanced parentheses are ignored, a blank query parses to `null`, which
 *   means "no text constraint".
 *
 * Security note (§3.7-3 / /security-scan): the query string is only ever
 * compared as data — it is never interpolated into HTML, a URL, or a regex.
 */

import { filterListings, type JobIndex, type JobListing, type ListingFilterState } from "./jobIndex";

export type QueryNode =
  | { kind: "term"; value: string }
  | { kind: "phrase"; value: string }
  | { kind: "and"; left: QueryNode; right: QueryNode }
  | { kind: "or"; left: QueryNode; right: QueryNode }
  | { kind: "not"; operand: QueryNode };

type Token =
  | { type: "word"; value: string }
  | { type: "phrase"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "and" }
  | { type: "or" }
  | { type: "not" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (char === '"') {
      const end = input.indexOf('"', i + 1);
      const value = end === -1 ? input.slice(i + 1) : input.slice(i + 1, end);
      i = end === -1 ? input.length : end + 1;
      if (value.trim().length > 0) tokens.push({ type: "phrase", value: value.trim() });
      continue;
    }
    let j = i;
    while (j < input.length && !/[\s()"]/.test(input[j])) j++;
    const word = input.slice(i, j);
    i = j;
    if (word === "AND") tokens.push({ type: "and" });
    else if (word === "OR") tokens.push({ type: "or" });
    else if (word === "NOT") tokens.push({ type: "not" });
    else if (word.length > 0) tokens.push({ type: "word", value: word });
  }
  return tokens;
}

/**
 * Parse a query into an AST. Returns `null` when there is nothing to search
 * for (blank input, or only operators/punctuation). Never throws.
 */
export function parseQuery(input: string): QueryNode | null {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = () => tokens[pos];

  function parsePrimary(): QueryNode | null {
    const token = peek();
    if (!token) return null;
    if (token.type === "word") {
      pos++;
      return { kind: "term", value: token.value };
    }
    if (token.type === "phrase") {
      pos++;
      return { kind: "phrase", value: token.value };
    }
    if (token.type === "lparen") {
      pos++;
      const inner = parseOr();
      if (peek()?.type === "rparen") pos++;
      return inner;
    }
    return null; // rparen / AND / OR in operand position → no node
  }

  function parseNot(): QueryNode | null {
    if (peek()?.type === "not") {
      pos++;
      const operand = parseNot();
      return operand ? { kind: "not", operand } : null;
    }
    return parsePrimary();
  }

  function parseAnd(): QueryNode | null {
    let node = parseNot();
    for (;;) {
      const token = peek();
      if (token?.type === "and") {
        pos++;
        const right = parseNot();
        if (!right) break; // dangling AND: keep the left operand
        node = node ? { kind: "and", left: node, right } : right;
        continue;
      }
      // Implicit AND between adjacent terms / phrases / groups / NOT.
      if (token && (token.type === "word" || token.type === "phrase" || token.type === "lparen" || token.type === "not")) {
        const right = parseNot();
        if (!right) break;
        node = node ? { kind: "and", left: node, right } : right;
        continue;
      }
      break;
    }
    return node;
  }

  function parseOr(): QueryNode | null {
    let node = parseAnd();
    while (peek()?.type === "or") {
      pos++;
      const right = parseAnd();
      if (!right) break; // dangling OR: keep the left operand
      node = node ? { kind: "or", left: node, right } : right;
    }
    return node;
  }

  const ast = parseOr();
  // Anything left over is unmatched punctuation (e.g. a stray ")"); ignore it.
  return ast;
}

/** Lowercased haystack the query is matched against. */
export function listingHaystack(listing: JobListing): string {
  return [listing.company, listing.title, listing.suburb, listing.council, listing.sector, listing.industry]
    .join(" ")
    .toLowerCase();
}

/** Evaluate an AST against a haystack; `null` AST = no text constraint. */
export function matchesQuery(node: QueryNode | null, haystack: string): boolean {
  if (!node) return true;
  switch (node.kind) {
    case "term":
    case "phrase":
      return haystack.includes(node.value.toLowerCase());
    case "and":
      return matchesQuery(node.left, haystack) && matchesQuery(node.right, haystack);
    case "or":
      return matchesQuery(node.left, haystack) || matchesQuery(node.right, haystack);
    case "not":
      return !matchesQuery(node.operand, haystack);
    default:
      return true;
  }
}

export interface OracleSearch {
  query: string;
  filters: ListingFilterState;
  /**
   * Display names of the selected councils (FR6.3 — the query composes with
   * FR1.6 selection). Empty = network-wide, exactly like Explore.
   */
  councilNames?: readonly string[];
}

/** FR6.7 execution: filter grid ∩ council scope ∩ boolean query. */
export function searchJobs(index: JobIndex, search: OracleSearch): JobListing[] {
  const ast = parseQuery(search.query);
  const councilNames = (search.councilNames ?? []).map(name => name.toLowerCase());
  return filterListings(index, search.filters).filter(listing => {
    if (councilNames.length > 0 && !councilNames.includes(listing.council.toLowerCase())) return false;
    if (!ast) return true;
    return matchesQuery(ast, listingHaystack(listing));
  });
}
