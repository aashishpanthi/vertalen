#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ENDPOINT = "https://tmt.ilprl.ku.edu.np/lang-translate";
const TARGETS = [
  { code: "ne", key: "ne", label: "Nepali" },
  { code: "tmg", key: "tmg", label: "Tamang" },
];

const VOCAB_PATH = path.join(
  __dirname,
  "..",
  "extension",
  "lib",
  "vocab.json",
);

const SEED = [
  // Greetings / social — level 1
  ["hello", "greetings", 1],
  ["goodbye", "greetings", 1],
  ["thank you", "greetings", 1],
  ["please", "greetings", 1],
  ["sorry", "greetings", 1],
  ["yes", "greetings", 1],
  ["no", "greetings", 1],
  ["welcome", "greetings", 1],
  ["okay", "greetings", 1],
  ["friend", "greetings", 1],
  ["good morning", "greetings", 1],
  ["good night", "greetings", 1],

  // Pronouns / determiners
  ["I", "pronoun", 1],
  ["you", "pronoun", 1],
  ["he", "pronoun", 1],
  ["she", "pronoun", 1],
  ["we", "pronoun", 1],
  ["they", "pronoun", 1],
  ["this", "pronoun", 1],
  ["that", "pronoun", 1],
  ["who", "pronoun", 1],
  ["what", "pronoun", 1],
  ["where", "pronoun", 1],
  ["when", "pronoun", 1],

  // Numbers
  ["one", "number", 1],
  ["two", "number", 1],
  ["three", "number", 1],
  ["four", "number", 1],
  ["five", "number", 1],
  ["six", "number", 1],
  ["seven", "number", 1],
  ["eight", "number", 1],
  ["nine", "number", 1],
  ["ten", "number", 1],
  ["twenty", "number", 2],
  ["fifty", "number", 2],
  ["hundred", "number", 2],
  ["first", "number", 2],
  ["last", "number", 2],

  // Time
  ["today", "time", 1],
  ["tomorrow", "time", 1],
  ["yesterday", "time", 1],
  ["morning", "time", 1],
  ["evening", "time", 1],
  ["night", "time", 1],
  ["day", "time", 1],
  ["week", "time", 1],
  ["month", "time", 1],
  ["year", "time", 1],
  ["hour", "time", 2],
  ["minute", "time", 2],
  ["now", "time", 1],
  ["later", "time", 2],
  ["soon", "time", 2],

  // Family
  ["mother", "family", 1],
  ["father", "family", 1],
  ["brother", "family", 1],
  ["sister", "family", 1],
  ["son", "family", 1],
  ["daughter", "family", 1],
  ["family", "family", 1],
  ["child", "family", 1],
  ["baby", "family", 1],
  ["husband", "family", 2],
  ["wife", "family", 2],
  ["man", "family", 1],
  ["woman", "family", 1],

  // Body
  ["head", "body", 1],
  ["eye", "body", 1],
  ["ear", "body", 1],
  ["mouth", "body", 1],
  ["nose", "body", 1],
  ["hand", "body", 1],
  ["foot", "body", 1],
  ["heart", "body", 1],
  ["hair", "body", 1],
  ["face", "body", 1],

  // Food
  ["water", "food", 1],
  ["rice", "food", 1],
  ["bread", "food", 1],
  ["milk", "food", 1],
  ["tea", "food", 1],
  ["coffee", "food", 1],
  ["food", "food", 1],
  ["sugar", "food", 2],
  ["salt", "food", 2],
  ["oil", "food", 2],
  ["vegetable", "food", 2],
  ["fruit", "food", 2],
  ["egg", "food", 1],
  ["fish", "food", 1],
  ["chicken", "food", 1],
  ["apple", "food", 1],
  ["banana", "food", 1],
  ["mango", "food", 1],
  ["potato", "food", 2],

  // House / objects
  ["house", "house", 1],
  ["door", "house", 1],
  ["window", "house", 1],
  ["room", "house", 1],
  ["bed", "house", 1],
  ["table", "house", 1],
  ["chair", "house", 1],
  ["kitchen", "house", 2],
  ["book", "house", 1],
  ["paper", "house", 1],
  ["pen", "house", 1],

  // Verbs
  ["go", "verb", 1],
  ["come", "verb", 1],
  ["eat", "verb", 1],
  ["drink", "verb", 1],
  ["see", "verb", 1],
  ["hear", "verb", 1],
  ["speak", "verb", 1],
  ["walk", "verb", 1],
  ["run", "verb", 1],
  ["sit", "verb", 1],
  ["stand", "verb", 1],
  ["sleep", "verb", 1],
  ["work", "verb", 1],
  ["play", "verb", 1],
  ["learn", "verb", 1],
  ["read", "verb", 1],
  ["write", "verb", 1],
  ["study", "verb", 2],
  ["teach", "verb", 2],
  ["buy", "verb", 2],
  ["give", "verb", 1],
  ["take", "verb", 1],
  ["make", "verb", 1],
  ["open", "verb", 1],
  ["close", "verb", 1],
  ["want", "verb", 1],
  ["need", "verb", 1],
  ["like", "verb", 1],
  ["love", "verb", 1],
  ["know", "verb", 1],
  ["think", "verb", 2],
  ["remember", "verb", 2],

  // Adjectives
  ["good", "adjective", 1],
  ["bad", "adjective", 1],
  ["big", "adjective", 1],
  ["small", "adjective", 1],
  ["tall", "adjective", 1],
  ["short", "adjective", 1],
  ["long", "adjective", 2],
  ["hot", "adjective", 1],
  ["cold", "adjective", 1],
  ["warm", "adjective", 2],
  ["new", "adjective", 1],
  ["old", "adjective", 1],
  ["young", "adjective", 1],
  ["beautiful", "adjective", 2],
  ["easy", "adjective", 2],
  ["hard", "adjective", 2],
  ["fast", "adjective", 1],
  ["slow", "adjective", 1],
  ["happy", "adjective", 1],
  ["sad", "adjective", 1],
  ["tired", "adjective", 2],
  ["hungry", "adjective", 1],
  ["clean", "adjective", 2],

  // Places / nature
  ["home", "place", 1],
  ["school", "place", 1],
  ["market", "place", 1],
  ["hospital", "place", 2],
  ["temple", "place", 2],
  ["road", "place", 1],
  ["city", "place", 1],
  ["village", "place", 1],
  ["country", "place", 1],
  ["mountain", "place", 1],
  ["river", "place", 1],
  ["sky", "place", 1],
  ["sun", "place", 1],
  ["moon", "place", 1],

  // Colors
  ["red", "color", 1],
  ["blue", "color", 1],
  ["green", "color", 1],
  ["yellow", "color", 1],
  ["black", "color", 1],
  ["white", "color", 1],
  ["orange", "color", 2],

  // Weather / nature
  ["rain", "weather", 1],
  ["wind", "weather", 2],
  ["snow", "weather", 2],
  ["cloud", "weather", 2],
  ["tree", "nature", 1],
  ["flower", "nature", 1],
  ["stone", "nature", 2],

  // Common nouns
  ["name", "common", 1],
  ["time", "common", 1],
  ["money", "common", 1],
  ["story", "common", 2],
  ["music", "common", 2],
  ["phone", "common", 1],
  ["computer", "common", 2],
  ["world", "common", 1],
  ["life", "common", 1],
  ["language", "common", 2],
  ["word", "common", 2],
  ["question", "common", 2],
  ["answer", "common", 2],
];

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function translate(apiKey, text, src, tgt, attempt = 0) {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ text, src_lang: src, tgt_lang: tgt }),
  });
  if (resp.status === 429) {
    if (attempt > 5) throw new Error("Rate limited too many times");
    const waitMs = 8000 * (attempt + 1);
    process.stdout.write(`  rate-limited, waiting ${waitMs / 1000}s… `);
    await delay(waitMs);
    return translate(apiKey, text, src, tgt, attempt + 1);
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${body}`);
  }
  const data = await resp.json();
  if (data.message_type !== "SUCCESS") {
    throw new Error(data.message || "Unknown failure");
  }
  return data.output || "";
}

function loadExisting() {
  if (!fs.existsSync(VOCAB_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveAll(entries) {
  fs.writeFileSync(VOCAB_PATH, JSON.stringify(entries, null, 2) + "\n");
}

async function main() {
  const apiKey = process.env.TMT_API_KEY;
  if (!apiKey || !apiKey.startsWith("team_")) {
    console.error(
      "error: set TMT_API_KEY to your team token, e.g. TMT_API_KEY=team_xxxx node scripts/build-vocab.js",
    );
    process.exit(1);
  }

  const existing = loadExisting();
  const doneKeys = new Set(existing.map((e) => e.en.toLowerCase()));
  console.log(
    `Resuming with ${existing.length} existing entries; ${SEED.length - existing.length} to fetch.`,
  );

  const out = existing.slice();
  let calls = 0;
  const startTs = Date.now();
  const reqGapMs = 1100;

  for (const [word, category, level] of SEED) {
    if (doneKeys.has(word.toLowerCase())) continue;
    const entry = { en: word, category, level };
    let ok = true;
    for (const tgt of TARGETS) {
      try {
        await delay(reqGapMs);
        const output = await translate(apiKey, word, "en", tgt.code);
        entry[tgt.key] = output.trim();
        calls += 1;
      } catch (err) {
        console.warn(`  ! ${word} -> ${tgt.label}: ${err.message}`);
        entry[tgt.key] = "";
        ok = false;
      }
    }
    entry.flagged = !ok || !entry.ne || !entry.tmg;
    out.push(entry);
    saveAll(out);
    const pct = Math.round((out.length / SEED.length) * 100);
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
    console.log(
      `[${pct}%] ${word.padEnd(14)} ne="${entry.ne || "?"}"  tmg="${entry.tmg || "?"}"  (${elapsed}s, ${calls} calls)`,
    );
  }

  const flagged = out.filter((e) => e.flagged).length;
  console.log(
    `\nDone. ${out.length} entries (${flagged} flagged for review). API calls this run: ${calls}.`,
  );
  console.log(`Wrote ${VOCAB_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
