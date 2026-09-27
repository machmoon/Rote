// searchTerm: the words sent to the routed API must be the content words, not filler or the site's own name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { termFrom } from "../src/gbrain.ts";

const HN = "hn https://hn.algolia.com/ Hacker News Search powered by Algolia";
const YC = "yc https://www.ycombinator.com/companies The YC Startup Directory | Y Combinator";

test("termFrom drops filler, generic nouns and the site's own words", () => {
  assert.equal(termFrom("hacker news posts about gbrain", HN), "gbrain");
  assert.equal(termFrom("what is Hacker News saying about river ai?", HN), "river ai");
});

test("termFrom keeps the content word for a directory question", () => {
  assert.equal(termFrom("find dental startups", YC), "dental");
  assert.equal(termFrom("which YC companies are doing warehouse robotics", YC), "warehouse robotics");
});

test("termFrom falls back to the last meaningful word when everything is filler or site words", () => {
  assert.equal(termFrom("show me the top hacker news stories", HN), "news");
  assert.equal(termFrom("latest posts", HN), "posts");
});
