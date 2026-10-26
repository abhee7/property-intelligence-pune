// Creates the three files used in the live-upload part of the demo (see DEMO.md),
// using the REAL values stored for the demo property.
//
//   npm run demo:docs            → writes demo-docs/*.png
//   npm run demo:docs -- --reset → (server must be running) removes the demo property's
//                                  documents so the live demo can be run again from scratch
//
// Optional: --property pune-0010  to use a different property.

const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, fallback) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : fallback);

const PROPERTY_ID = opt("property", "pune-0002");
const BASE = opt("base", "http://localhost:3000");
const OUT = path.join(process.cwd(), "demo-docs");

async function reset() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "manager@sahyadri-demo.com", password: "Demo@12345" }),
  }).then((r) => r.json());
  const token = login.data?.accessToken || login.data?.tokens?.accessToken;
  if (!token) throw new Error("Couldn't log in — is the dev server running (npm run dev)?");
  const headers = { Authorization: `Bearer ${token}` };

  const list = await fetch(`${BASE}/api/documents?propertyId=${PROPERTY_ID}&limit=50`, { headers }).then((r) => r.json());
  const docs = list.data?.documents ?? [];
  for (const d of docs) await fetch(`${BASE}/api/documents/${d.id}`, { method: "DELETE", headers });
  console.log(`Removed ${docs.length} document(s) from ${PROPERTY_ID}. Its risk score recalculates in the background.`);
}

// English → Marathi for the names the synthetic dataset uses, so a Marathi 7/12 can be drawn for the demo.
// (Only needed to MAKE the sample; reading it needs no such table.)
const MR_FIRST = { Rajesh: "राजेश", Sunil: "सुनील", Amit: "अमित", Vikram: "विक्रम", Sachin: "सचिन", Mahesh: "महेश", Anil: "अनिल", Sanjay: "संजय", Pramod: "प्रमोद", Ramesh: "रमेश", Vinod: "विनोद", Ashok: "अशोक", Deepak: "दीपक", Nitin: "नितीन", Suresh: "सुरेश", Ganesh: "गणेश", Prashant: "प्रशांत", Ravi: "रवी", Manish: "मनीष", Ajay: "अजय", Sunita: "सुनीता", Anita: "अनिता", Rekha: "रेखा", Savita: "सविता", Meena: "मीना", Priya: "प्रिया", Swati: "स्वाती", Jyoti: "ज्योती", Lata: "लता" };
const MR_LAST = { Patil: "पाटील", Deshmukh: "देशमुख", Kulkarni: "कुलकर्णी", Joshi: "जोशी", Deshpande: "देशपांडे", Pawar: "पवार", Jadhav: "जाधव", More: "मोरे", Shinde: "शिंदे", Gaikwad: "गायकवाड", Bhosale: "भोसले", Kadam: "कदम", Salunkhe: "साळुंखे", Mane: "माने", Chavan: "चव्हाण", Kale: "काळे", Sharma: "शर्मा", Gupta: "गुप्ता", Mehta: "मेहता", Shah: "शहा" };
const MR_VILLAGE = { Kharadi: "खराडी", "Pimpri Chinchwad": "पिंपरी चिंचवड", Hinjawadi: "हिंजवडी", Baner: "बाणेर", Wakad: "वाकड", Bavdhan: "बावधन", Balewadi: "बालेवाडी", Mundhwa: "मुंढवा", Undri: "उंड्री", Hadapsar: "हडपसर", Wagholi: "वाघोली", Kondhwa: "कोंढवा", Kothrud: "कोथरूड", Pashan: "पाषाण", Dhanori: "धानोरी", Lohegaon: "लोहगाव", Wanowrie: "वानवडी", Aundh: "औंध", Katraj: "कात्रज", Pirangut: "पिरंगुट", "Talegaon Dabhade": "तळेगाव दाभाडे" };
const MR_DIGITS = "०१२३४५६७८९";
const mrDigits = (str) => String(str).replace(/[0-9]/g, (d) => MR_DIGITS[Number(d)]);

function generate() {
  const Database = require("better-sqlite3");
  const { createCanvas } = require("@napi-rs/canvas");

  const db = new Database(path.join(process.cwd(), "prisma", "dev.db"), { readonly: true });
  const p = db
    .prepare("select p.id, p.title, p.surveyNumber, p.areaSqft, p.metadata, u.firstName, u.lastName from Property p join User u on u.id = p.ownerId where p.id = ?")
    .get(PROPERTY_ID);
  if (!p) throw new Error(`Property ${PROPERTY_ID} not found — run npm run dataset:import first.`);

  const meta = JSON.parse(p.metadata);
  const owner = `${p.firstName} ${p.lastName}`;
  // an owner who is clearly a different person (for the "wrong owner" document)
  const different = db
    .prepare("select firstName, lastName from User u join Role r on r.id = u.roleId where r.name = 'land_owner' and u.id != (select ownerId from Property where id = ?) order by u.id desc limit 1")
    .get(PROPERTY_ID);
  const wrongOwner = `${different.firstName} ${different.lastName}`;

  const area = Math.round(p.areaSqft).toLocaleString("en-US");
  const date = (y, m, d) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;

  const page = (lines) => {
    const c = createCanvas(1240, 1000);
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 1240, 1000);
    x.fillStyle = "#151515";
    let y = 70;
    for (const [text, size = 28, bold = false] of lines) {
      x.font = `${bold ? "bold " : ""}${size}px Arial, "Liberation Sans", "DejaVu Sans", sans-serif`;
      x.fillText(text, 60, y);
      y += size * 1.7;
    }
    return c.toBuffer("image/png");
  };

  const sevenTwelve = (khatedar, areaText) => [
    ["Government of Maharashtra", 38, true],
    ["VILLAGE FORM 7/12 - RECORD OF RIGHTS", 28, true],
    ["", 20],
    [`Village: ${meta.village}`],
    [`Taluka: ${meta.taluka}`],
    ["District: Pune"],
    [`Survey No: ${p.surveyNumber}`],
    [`Area: ${areaText} sq ft`],
    [`Khatedar: Shri ${khatedar}`],
    [`Date: ${date(2025, 3, 14)}`],
  ];

  // A 7/12 in Marathi (Devanagari): the owner and village are the property's real ones, written in
  // Marathi. Verifying it exercises the Marathi → English name matching.
  const mrOwner = MR_FIRST[p.firstName] && MR_LAST[p.lastName] ? `${MR_FIRST[p.firstName]} ${MR_LAST[p.lastName]}` : null;
  const mrVillage = MR_VILLAGE[meta.village] || null;
  const marathiPage = () => {
    const c = createCanvas(1240, 1000);
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 1240, 1000);
    x.fillStyle = "#151515";
    let y = 70;
    const lines = [
      ["महाराष्ट्र शासन", 40, true],
      ["गाव नमुना ७/१२ - अधिकार अभिलेख", 30, true],
      ["", 20],
      [`गाव: ${mrVillage}`],
      ["तालुका: हवेली"],
      ["जिल्हा: पुणे"],
      [`सर्व्हे नंबर: ${mrDigits(p.surveyNumber)}`],
      [`क्षेत्र: ${mrDigits(area)} चौरस फूट`],
      [`खातेदार: श्री ${mrOwner}`],
      [`दिनांक: ${mrDigits(date(2025, 3, 14))}`],
    ];
    for (const [text, size = 30, bold = false] of lines) {
      x.font = `${bold ? "bold " : ""}${size}px "Nirmala UI", "Mangal", "Noto Sans Devanagari", "Lohit Devanagari", "DejaVu Sans", sans-serif`;
      x.fillText(text, 60, y);
      y += size * 1.8;
    }
    return c.toBuffer("image/png");
  };

  fs.mkdirSync(OUT, { recursive: true });
  const files = {
    "1_7-12_CORRECT.png": page(sevenTwelve(owner, area)),
    "2_7-12_WRONG-OWNER.png": page(sevenTwelve(wrongOwner, area)),
    "3_SALE-DEED_uploaded-as-7-12.png": page([
      ["DEED OF SALE (Sale Deed)", 38, true],
      ["", 20],
      ["Registration No: HVL-4521-2025"],
      [`Date: ${date(2025, 2, 3)}`],
      [`Vendor: Shri ${owner}`],
      ["Purchaser: Mr. Anil Kulkarni"],
      [`Property: Survey No. ${p.surveyNumber}, Village: ${meta.village}`],
      [`Area: ${area} sq ft`],
      ["Consideration: Rs. 1,45,00,000"],
    ]),
  };
  if (mrOwner && mrVillage) files["4_7-12_MARATHI.png"] = marathiPage();
  else console.log(`(Skipping the Marathi sample: no Marathi spelling known for "${owner}" / "${meta.village}" — try --property pune-0002.)`);
  for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), buf);

  console.log(`Demo property: ${p.title}  [${p.id}]`);
  console.log(`  Survey ${p.surveyNumber} · ${meta.village} · ${area} sq ft · owner on record: ${owner}`);
  console.log(`  Wrong-owner file names: ${wrongOwner}`);
  console.log(`\nWrote to ${OUT}:`);
  Object.keys(files).forEach((f) => console.log("  " + f));
}

(flag("reset") ? reset() : Promise.resolve(generate())).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
