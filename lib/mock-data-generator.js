// lib/mock-data-generator.js
// programmatically generates mock historical records from Jan 2023 to June 2026

const PARTIES = [
  "BEARING TRADING COMPANY",
  "MAHALAXMI BEARINGS (SECUNDERABAD)",
  "SINGLA BEARING CO.",
  "DEE ESS TRADERS",
  "HINDUSTAN BEARINGS",
  "APEX INDUSTRIES",
  "ROYAL TRACTOR PARTS",
  "GALAXY MACHINERY SPARES"
];

const UNITS = ["Unit-1", "Unit-2", "Unit-3"];

export const BEARING_CATALOG = [
  { no: "22211 K", category: "SPHERICAL ROLLER BEARING" },
  { no: "22212 K", category: "SPHERICAL ROLLER BEARING" },
  { no: "22215", category: "SPHERICAL ROLLER BEARING" },
  { no: "22213 K", category: "SPHERICAL ROLLER BEARING" },
  { no: "22213", category: "SPHERICAL ROLLER BEARING" },
  { no: "22310 K", category: "SPHERICAL ROLLER BEARING" },
  { no: "22313", category: "SPHERICAL ROLLER BEARING" },
  { no: "22207", category: "SPHERICAL ROLLER BEARING" },
  { no: "22308", category: "SPHERICAL ROLLER BEARING" },
  { no: "22212-MBW", category: "SPHERICAL ROLLER BEARING" },
  { no: "22216 K", category: "SPHERICAL ROLLER BEARING" },
  { no: "22218 MBW33C3", category: "SPHERICAL ROLLER BEARING" },
  { no: "22211", category: "SPHERICAL ROLLER BEARING" },
  { no: "22218 K", category: "SPHERICAL ROLLER BEARING" },
  { no: "6307-ZZ", category: "BALL BEARING" },
  { no: "6315-2RS", category: "BALL BEARING" },
  { no: "6317", category: "BALL BEARING" },
  { no: "6320", category: "BALL BEARING" },
  { no: "6015", category: "BALL BEARING" },
  { no: "6203-2RS", category: "BALL BEARING" },
  { no: "6210-2RS", category: "BALL BEARING" },
  { no: "6213", category: "BALL BEARING" },
  { no: "6213-2RS", category: "BALL BEARING" },
  { no: "6304-2RS", category: "BALL BEARING" },
  { no: "6305", category: "BALL BEARING" },
  { no: "6209-ZZ", category: "BALL BEARING" },
  { no: "6211-ZZ", category: "BALL BEARING" },
  { no: "6214-ZZ", category: "BALL BEARING" },
  { no: "6303-ZZ", category: "BALL BEARING" },
  { no: "6310-ZZ", category: "BALL BEARING" },
  { no: "NJ-204", category: "CYLINDRICAL ROLLER BEARING" },
  { no: "NJ-205", category: "CYLINDRICAL ROLLER BEARING" },
  { no: "2203", category: "SELF ALIGNING & ANGULAR CONTACT BALL BEARING" },
  { no: "1212", category: "SELF ALIGNING & ANGULAR CONTACT BALL BEARING" },
  { no: "6205-2RS (KIT)", category: "BALL BEARING KIT" }
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getQuarter(monthNum) {
  if (monthNum >= 1 && monthNum <= 3) return "Q1";
  if (monthNum >= 4 && monthNum <= 6) return "Q2";
  if (monthNum >= 7 && monthNum <= 9) return "Q3";
  return "Q4";
}

let seed = 123456789;
function random() {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function getRandomRange(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function generateHistoricalRecords() {
  const records = [];
  const startYear = 2023;
  const endYear = 2026;
  const endMonth = 6; // June 2026

  for (let year = startYear; year <= endYear; year++) {
    const maxMonth = (year === endYear) ? endMonth : 12;
    
    for (let month = 1; month <= maxMonth; month++) {
      const quarter = getQuarter(month);
      const monthName = MONTH_NAMES[month - 1];
      
      const yearTrend = 1 + (year - startYear) * 0.09;
      
      let seasonalFactor = 1.0;
      if (quarter === "Q3") seasonalFactor = 1.15;
      if (quarter === "Q1") seasonalFactor = 0.90;

      UNITS.forEach(unit => {
        BEARING_CATALOG.forEach(bearing => {
          const probability = bearing.category === "SPHERICAL ROLLER BEARING" || bearing.category === "BALL BEARING" ? 0.85 : 0.5;
          if (random() > probability) return;

          const customerCount = getRandomRange(1, 3);
          const chosenParties = [];
          
          while (chosenParties.length < customerCount) {
            const party = PARTIES[getRandomRange(0, PARTIES.length - 1)];
            if (!chosenParties.includes(party)) {
              chosenParties.push(party);
            }
          }

          chosenParties.forEach(party => {
            let baseQty = 40;
            if (bearing.category === "BALL BEARING") baseQty = 120;
            if (bearing.category === "BALL BEARING KIT") baseQty = 60;
            if (bearing.no === "6203-2RS") baseQty = 600;
            if (bearing.no === "6303-ZZ") baseQty = 450;
            
            let randomMultiplier = random() * 0.6 + 0.7; // 0.7 to 1.3
            
            let qty = Math.round(baseQty * yearTrend * seasonalFactor * randomMultiplier);
            if (qty < 1) qty = 1;

            let basePrice = 100;
            if (bearing.category === "SPHERICAL ROLLER BEARING") basePrice = 1000;
            else if (bearing.category === "BALL BEARING") basePrice = 150;
            else if (bearing.category === "CYLINDRICAL ROLLER BEARING") basePrice = 180;
            else if (bearing.category === "SELF ALIGNING & ANGULAR CONTACT BALL BEARING") basePrice = 500;
            else if (bearing.category === "BALL BEARING KIT") basePrice = 180;
            
            let price = basePrice * (random() * 0.2 + 0.9);
            let basicValue = Math.round(qty * price);
            let withGstValue = Math.round(basicValue * 1.18);

            records.push({
              unit,
              month: monthName,
              year,
              quarter,
              partyName: party,
              bearingNo: bearing.no,
              category: bearing.category,
              quantity: qty,
              basicValue,
              withGstValue
            });
          });
        });
      });
    }
  }
  return records;
}
