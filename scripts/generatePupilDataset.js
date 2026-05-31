#!/usr/bin/env node
/**
 * Deterministic fictitious pupil dataset generator for NamingLens.
 * Seed: naminglens-southwest-3000-v1
 * Produces: src/data/pupilDataset.json
 *
 * All names are synthetic. No live pupil data is used.
 */

import { writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, "../src/data/pupilDataset.json")

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32
// ---------------------------------------------------------------------------
function mulberry32(seedStr) {
  // Hash the string seed to a 32-bit integer
  let h = 0x12345678
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 0x9e3779b9)
    h ^= h >>> 16
  }
  let s = h >>> 0

  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32("naminglens-southwest-3000-v1")

function pick(arr) {
  return arr[Math.floor(rng() * arr.length)]
}

// Weighted pick: pairs of [item, weight]
function weightedPick(weighted) {
  const total = weighted.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [item, weight] of weighted) {
    r -= weight
    if (r <= 0) return item
  }
  return weighted[weighted.length - 1][0]
}

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

// Girls' first names — contemporary British, weighted by relative frequency,
// with South West / Celtic / diverse community names included.
const GIRLS_FIRST = [
  // Very common contemporary
  ["Olivia", 12], ["Amelia", 11], ["Isla", 10], ["Ava", 10], ["Mia", 9],
  ["Grace", 9],   ["Poppy", 9],   ["Lily", 8],  ["Emily", 8], ["Ella", 8],
  ["Sophia", 8],  ["Isabella", 7],["Freya", 7], ["Evie", 7],  ["Charlotte", 7],
  ["Phoebe", 6],  ["Imogen", 6],  ["Scarlett", 6],["Ruby", 6],["Florence", 6],
  ["Chloe", 6],   ["Daisy", 6],   ["Rosie", 5], ["Sophie", 5],["Jessica", 5],
  ["Emma", 5],    ["Alice", 5],   ["Hannah", 5],["Molly", 5], ["Ellie", 5],
  ["Lola", 4],    ["Harriet", 4], ["Lucy", 4],  ["Eva", 4],   ["Maisie", 4],
  ["Jasmine", 4], ["Violet", 4],  ["Layla", 4], ["Maya", 4],  ["Zoe", 4],
  ["Amber", 3],   ["Caitlin", 3], ["Bethany", 3],["Lexi", 3], ["Millie", 3],
  ["Abigail", 3], ["Leah", 3],    ["Paige", 3], ["Tilly", 3], ["Lilly", 3],
  ["Georgia", 3], ["Sienna", 3],  ["Luna", 3],  ["Aurora", 3],["Thea", 3],
  // Celtic / Cornish / Welsh
  ["Siân", 2], ["Ffion", 2], ["Nia", 2], ["Bronwen", 2], ["Lowenna", 2],
  ["Elowen", 2], ["Kerenza", 2], ["Morwenna", 2], ["Niamh", 2], ["Aoife", 2],
  ["Saoirse", 1], ["Caoimhe", 1], ["Eilidh", 1], ["Fionnuala", 1], ["Kezia", 1],
  // South Asian / diverse
  ["Aisha", 3], ["Fatima", 3], ["Zara", 3], ["Priya", 3], ["Ananya", 2],
  ["Shreya", 2], ["Amara", 2], ["Nadia", 2], ["Laila", 2], ["Sara", 2],
  ["Meera", 2], ["Riya", 2], ["Kavya", 2], ["Diya", 2], ["Asha", 2],
  // Hyphenated / double first names
  ["Lily-Rose", 2], ["Mary-Anne", 2], ["Anna-Belle", 1], ["Ella-Grace", 1],
  ["Rosie-Mae", 1], ["Lily-May", 1], ["Ellie-Mae", 1], ["Grace-Anne", 1],
]

// Boys' first names
const BOYS_FIRST = [
  // Very common contemporary
  ["Oliver", 12], ["George", 11], ["Noah", 10], ["Arthur", 10], ["Harry", 10],
  ["Jack", 9],    ["Charlie", 9], ["Oscar", 9], ["Jacob", 8],   ["Freddie", 8],
  ["Alfie", 8],   ["Archie", 8],  ["Leo", 8],  ["Theo", 7],    ["Henry", 7],
  ["Ethan", 7],   ["James", 7],   ["William", 7],["Logan", 6],  ["Thomas", 6],
  ["Joshua", 6],  ["Samuel", 6],  ["Daniel", 6],["Alexander", 5],["Benjamin", 5],
  ["Elijah", 5],  ["Sebastian", 5],["Max", 5],  ["Isaac", 5],   ["Finley", 5],
  ["Toby", 4],    ["Luca", 4],    ["Edward", 4],["Reuben", 4],  ["Adam", 4],
  ["Lucas", 4],   ["Ryan", 4],    ["Tyler", 4], ["Dylan", 4],   ["Callum", 4],
  ["Jake", 3],    ["Nathan", 3],  ["Cameron", 3],["Aaron", 3],  ["Evan", 3],
  ["Jayden", 3],  ["Mason", 3],   ["Zac", 3],   ["Lewis", 3],   ["Elliot", 3],
  ["Jude", 3],    ["Felix", 3],   ["Rory", 3],  ["Magnus", 2],  ["Barnaby", 2],
  // Celtic / Cornish
  ["Cai", 2], ["Trystan", 2], ["Jago", 2], ["Caius", 1], ["Piran", 2],
  ["Ewan", 2], ["Hamish", 2], ["Fergus", 2], ["Declan", 2], ["Cillian", 2],
  ["Oisín", 1], ["Fionn", 1], ["Lorcan", 1], ["Seamus", 1], ["Tadhg", 1],
  // South Asian / diverse
  ["Mohammed", 3], ["Muhammad", 3], ["Amir", 3], ["Aryan", 2], ["Rohan", 2],
  ["Sami", 2], ["Ali", 3], ["Omar", 2], ["Ibrahim", 2], ["Adam", 3],
  ["Zayn", 2], ["Rayan", 2], ["Kian", 2], ["Dion", 1], ["Elias", 2],
  // Hyphenated
  ["Billy-Joe", 1], ["Lee-Roy", 1], ["D'Angelo", 1],
]

// Surnames — heavily weighted on high-frequency British names to ensure
// meaningful collision pressure. South West and diverse surnames included.
const SURNAMES = [
  // Top-frequency British surnames (very high weight)
  ["Smith", 30],   ["Jones", 28],   ["Williams", 26], ["Brown", 24],  ["Taylor", 22],
  ["Davies", 20],  ["Evans", 20],   ["Wilson", 18],   ["Thomas", 18], ["Roberts", 16],
  ["Johnson", 16], ["White", 14],   ["Lewis", 14],    ["Harris", 14], ["Martin", 12],
  ["Thompson", 12],["Jackson", 12], ["Clarke", 12],   ["Clark", 10],  ["Walker", 10],
  ["Hall", 10],    ["Wood", 10],    ["Robinson", 10], ["Lee", 10],    ["Edwards", 10],
  ["Hughes", 10],  ["Green", 10],   ["Adams", 8],     ["Turner", 8],  ["Hill", 8],
  ["Phillips", 8], ["Carter", 8],   ["Mitchell", 8],  ["Baker", 8],   ["Collins", 8],
  ["Campbell", 8], ["Moore", 8],    ["Rogers", 6],    ["Morris", 6],  ["Price", 6],
  ["Ward", 6],     ["Morgan", 6],   ["Cooper", 6],    ["Watson", 6],  ["King", 6],
  ["Bailey", 6],   ["Bennett", 6],  ["Cook", 6],      ["Barnes", 6],  ["Bell", 6],
  // South West / Cornish / Devon surnames
  ["Pengelly", 4], ["Trevithick", 3], ["Pascoe", 4], ["Trewin", 3], ["Rowe", 4],
  ["Bray", 4],     ["Hocking", 3],    ["Treloar", 3],["Vivian", 3],  ["Tregothnan", 2],
  ["Penrose", 3],  ["Nancarrow", 2],  ["Polglase", 2],["Bosanko", 2],["Chegwin", 2],
  ["Opie", 2],     ["Hoskin", 3],     ["Pearce", 4], ["Murch", 2],   ["Honeychurch", 2],
  // Diverse / South Asian
  ["Patel", 12],   ["Khan", 10],      ["Singh", 10], ["Ali", 8],     ["Ahmed", 8],
  ["Begum", 6],    ["Hussain", 6],    ["Islam", 4],  ["Malik", 4],   ["Rahman", 4],
  ["Sharma", 4],   ["Gupta", 4],      ["Shah", 4],   ["Rao", 3],     ["Nair", 3],
  ["Kapoor", 3],   ["Verma", 3],      ["Kumar", 4],  ["Iqbal", 3],   ["Chowdhury", 3],
  ["Costa", 3],    ["Santos", 3],     ["Ferreira", 2],["Silva", 3],  ["Rodrigues", 2],
  // Double-barrelled
  ["Smith-Jones", 3],  ["Lloyd-Hughes", 3], ["Evans-Williams", 2], ["Davies-Thomas", 2],
  ["Morgan-Jones", 2], ["Price-Williams", 2],["Taylor-Brown", 2],  ["Roberts-Davies", 2],
  ["Harris-Brown", 2], ["Wilson-Smith", 2],
  // Apostrophe names
  ["O'Brien", 4],  ["O'Neill", 4], ["O'Connor", 3], ["O'Sullivan", 3], ["O'Reilly", 2],
  ["O'Donnell", 2],["MacDonald", 3],["Mac Donald", 2],["St John", 2], ["D'Souza", 2],
]

// ---------------------------------------------------------------------------
// Middle name pools — traditional British, gender-appropriate.
// Weighted by frequency as middle names (distinct from first-name popularity).
// ---------------------------------------------------------------------------

const GIRLS_MIDDLE = [
  // Very common girls' middle names in England & Wales
  ["Rose", 18],     ["Grace", 16],    ["Louise", 14],   ["Elizabeth", 12], ["May", 12],
  ["Marie", 10],    ["Jane", 10],     ["Anne", 9],       ["Ann", 7],        ["Faith", 8],
  ["Hope", 7],      ["Eve", 6],       ["Kate", 6],       ["Ruth", 5],       ["Joy", 5],
  ["Alice", 6],     ["Lily", 6],      ["Florence", 5],   ["Eleanor", 5],    ["Victoria", 5],
  ["Charlotte", 5], ["Isabella", 4],  ["Sophia", 4],     ["Emily", 4],      ["Sarah", 4],
  ["Frances", 4],   ["Beatrice", 4],  ["Harriet", 3],    ["Clara", 3],      ["Elise", 3],
  ["Edith", 3],     ["Violet", 3],    ["Ruby", 3],       ["Pearl", 2],      ["Iris", 2],
  ["Diana", 2],     ["Margaret", 2],  ["Catherine", 2],  ["Matilda", 2],    ["Penelope", 2],
  // Celtic / Cornish
  ["Lowenna", 1],   ["Elowen", 1],    ["Kerenza", 1],    ["Niamh", 2],      ["Siân", 1],
]

const BOYS_MIDDLE = [
  // Very common boys' middle names in England & Wales
  ["James", 22],    ["John", 16],     ["William", 14],   ["Thomas", 12],    ["Edward", 11],
  ["George", 10],   ["Henry", 9],     ["Robert", 9],     ["Charles", 8],    ["Alexander", 8],
  ["Joseph", 8],    ["Matthew", 7],   ["Daniel", 7],     ["Michael", 7],    ["David", 7],
  ["Andrew", 6],    ["Peter", 6],     ["Paul", 6],       ["Samuel", 6],     ["Christopher", 5],
  ["Richard", 5],   ["Anthony", 4],   ["Francis", 4],    ["Patrick", 4],    ["Arthur", 5],
  ["Frederick", 3], ["Leonard", 3],   ["Alfred", 3],     ["Albert", 3],     ["Lawrence", 3],
  ["Oliver", 4],    ["Harry", 4],     ["Jack", 3],       ["Luke", 3],       ["Mark", 3],
  ["Lewis", 2],     ["Owen", 2],      ["Evan", 2],       ["Rhys", 2],       ["Jude", 2],
  // Celtic / Cornish
  ["Piran", 1],     ["Jago", 1],      ["Trystan", 1],    ["Declan", 2],     ["Ewan", 1],
]

// ---------------------------------------------------------------------------
// School pools — [code, weight]
// Secondary schools are larger; distribution is deliberately uneven.
// ---------------------------------------------------------------------------
const SCHOOLS = [
  // Secondary (larger)
  ["sdc", 120], ["ivy", 115], ["cds", 110], ["pls", 140], ["hls", 105],
  ["ecc",  95], ["cal", 100], ["sjs",  90],
  // Primary (smaller but varied)
  ["ash",  55], ["afa",  40], ["bps",  48], ["buc",  35], ["cmf",  50],
  ["cha",  42], ["erm",  38], ["gps",  44], ["hol",  52], ["man",  46],
  ["mmp",  36], ["ore",  41], ["ott",  39], ["psm",  43], ["svs",  37],
  ["brw",  45], ["sto",  48], ["tea",  40], ["ugb",  53], ["wem",  47],
  ["wfd",  35], ["wpp",  42], ["yea",  38],
]

// Intake years: children aged 5–18 in 2026 entered school between 2013 and 2026.
// Slight variation in weight — older year groups thin out a little.
const INTAKE_YEARS = [
  [2013, 6], [2014, 7], [2015, 8], [2016, 8], [2017, 8],
  [2018, 9], [2019, 9], [2020, 9], [2021, 9], [2022, 8],
  [2023, 8], [2024, 7], [2025, 7], [2026, 7],
]

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
const TOTAL = 16500

// ~55% of children in southwest England aged 5–18 have a middle name.
const MIDDLE_NAME_PROBABILITY = 0.55

function pickFirstAndGender() {
  const isFemale = rng() < 0.505
  return {
    first:  isFemale ? weightedPick(GIRLS_FIRST) : weightedPick(BOYS_FIRST),
    gender: isFemale ? "F" : "M",
  }
}

const pupils = []
for (let id = 1; id <= TOTAL; id++) {
  const { first, gender } = pickFirstAndGender()
  const middlePool = gender === "F" ? GIRLS_MIDDLE : BOYS_MIDDLE
  const middle = rng() < MIDDLE_NAME_PROBABILITY ? weightedPick(middlePool) : null
  pupils.push({
    id,
    gender,
    first,
    middle,
    last: weightedPick(SURNAMES),
    year: weightedPick(INTAKE_YEARS),
    school: weightedPick(SCHOOLS),
  })
}

// ---------------------------------------------------------------------------
// Write JSON
// ---------------------------------------------------------------------------
writeFileSync(OUT_PATH, JSON.stringify(pupils, null, 2), "utf8")

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const firstNames  = new Set(pupils.map(p => p.first))
const lastNames   = new Set(pupils.map(p => p.last))
const withMiddle  = pupils.filter(p => p.middle !== null).length
const fullNames   = pupils.map(p => `${p.first} ${p.last}`)
const fullNameMap = {}
for (const n of fullNames) fullNameMap[n] = (fullNameMap[n] ?? 0) + 1
const uniqueFull = Object.keys(fullNameMap).length
const dupFull    = Object.values(fullNameMap).filter(c => c > 1).length
const maxDup     = Math.max(...Object.values(fullNameMap))

const bySchool = {}
for (const p of pupils) bySchool[p.school] = (bySchool[p.school] ?? 0) + 1
const byYear = {}
for (const p of pupils) byYear[p.year] = (byYear[p.year] ?? 0) + 1

console.log("\n=== NamingLens dataset generation complete ===\n")
console.log(`Total records:          ${pupils.length}`)
console.log(`With middle name:       ${withMiddle} (${((withMiddle/pupils.length)*100).toFixed(1)}%)`)
console.log(`Unique first names:     ${firstNames.size}`)
console.log(`Unique surnames:        ${lastNames.size}`)
console.log(`Unique full names:      ${uniqueFull}`)
console.log(`Duplicate full names:   ${dupFull} combinations appear more than once`)
console.log(`Largest duplicate:      ${maxDup} pupils share the same full name`)
console.log(`\nBy intake year:`)
for (const y of Object.keys(byYear).sort()) {
  console.log(`  ${y}: ${byYear[y]}`)
}
console.log(`\nBy school (top 10):`)
const sortedSchools = Object.entries(bySchool).sort((a, b) => b[1] - a[1])
for (const [code, count] of sortedSchools.slice(0, 10)) {
  console.log(`  ${code.padEnd(6)}: ${count}`)
}
if (sortedSchools.length > 10) {
  console.log(`  ... and ${sortedSchools.length - 10} more schools`)
}
console.log(`\nOutput: ${OUT_PATH}\n`)
