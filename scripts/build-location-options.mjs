/**
 * Regenerates public/data/locations.json, the option list behind the Country/City
 * picker.
 *
 * This is a verbatim copy of FastApply's browse-and-apply location list — the set
 * BrowseApplyView builds as:
 *
 *   Array.from(new Set([
 *     ...jobSearchOptions.locations,
 *     ...Object.entries(COUNTRY_CITIES).flatMap(([country, cities]) => [country, ...cities]),
 *   ]))
 *
 * so Scout offers exactly what FastApply offers, in the same order, and a member
 * who has used both sees the same choices. Nothing is filtered, renamed, or added
 * here: the previous version of this script curated the list and drifted from the
 * source, which is what put "New York City" in the picker while the boards write
 * "New York".
 *
 * Values are flat strings ("New York", "California", "United Kingdom", "Remote"),
 * matching how FastApply stores and searches them.
 *
 * Usage: node scripts/build-location-options.mjs [path-to-fastapply-repo]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const fastApplyRoot = process.argv[2] || resolve(process.env.HOME || "", "fastapply");
const constants = resolve(fastApplyRoot, "src/lib/constants");
const target = resolve(import.meta.dirname, "../public/data/locations.json");

const stripComments = (text) => text.replace(/^\s*\/\/.*$/gm, "");
const quoted = (text) => [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1].replace(/\\"/g, '"'));

// jobSearchOptions.locations — countries, major cities, remote wordings, regions.
const optionsSource = stripComments(readFileSync(resolve(constants, "jobSearchOptions.ts"), "utf8"));
const locationsBlock = optionsSource.match(/locations\s*:\s*\[([\s\S]*?)\]/);
if (!locationsBlock) throw new Error("jobSearchOptions.locations not found — the source format changed.");
const baseLocations = quoted(locationsBlock[1]);

// COUNTRY_CITIES — each country followed by its states/provinces and cities.
const citiesSource = stripComments(readFileSync(resolve(constants, "countryCities.ts"), "utf8"));
const citiesBlock = citiesSource.slice(
  citiesSource.indexOf("COUNTRY_CITIES"),
  citiesSource.indexOf("COUNTRY_ALIASES") === -1 ? undefined : citiesSource.indexOf("COUNTRY_ALIASES"),
);
const countryEntries = [...citiesBlock.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*\[([\s\S]*?)\]/g)]
  .map(([, country, body]) => [country.replace(/\\"/g, '"'), quoted(body)]);
if (countryEntries.length < 100) throw new Error(`Only parsed ${countryEntries.length} countries — the source format changed.`);

const imported = [
  ...baseLocations,
  ...countryEntries.flatMap(([country, cities]) => [country, ...cities]),
];

/**
 * The one change made to the imported list: administrative qualifiers are dropped,
 * so the picker offers the plain name.
 *
 * Postings write "New York, NY, United States" and "Lagos, Nigeria" — never "New
 * York State" or "Lagos State" — so a qualified option matches nothing and reads
 * as Scout having no jobs there. Most are already exact duplicates of the bare
 * name ("New York State" alongside "New York"); the rest ("Rivers State") become
 * it once trimmed.
 *
 * Only these suffixes are trimmed. Names that merely end in a similar word —
 * "Salt Lake City", "Mexico City", "Greater Noida", "City of Westminster" — are
 * genuine place names and are left alone. "Territory" is never trimmed
 * ("Northern Territory", "Australian Capital Territory" are the real names), and
 * "Free State" is South Africa's province, not a qualified "Free".
 */
const QUALIFIER = /\s+(State|Province|Prefecture|Region|County|FCT|Governorate)$/i;
const INTRINSIC = new Set(["Free State"]);
const plainName = (value) => (INTRINSIC.has(value) ? value : value.replace(QUALIFIER, "").trim() || value);

const locations = [...new Set(imported.map(plainName))];

writeFileSync(target, JSON.stringify(locations));
const trimmed = imported.filter((value) => plainName(value) !== value);
console.log(`locations: ${locations.length} (from ${new Set(imported).size} imported)`);
console.log(`  qualifiers trimmed: ${trimmed.length} (e.g. ${trimmed.slice(0, 3).join(", ")})`);
console.log(`  from jobSearchOptions.locations: ${baseLocations.length}`);
console.log(`  from COUNTRY_CITIES: ${countryEntries.length} countries`);
