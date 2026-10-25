// setup/seed.js - fills carenova_db with sample data (Section 10 of the spec).
// Run:  node setup/seed.js          (small data set)
//       node setup/seed.js --big    (also adds 5000 dummy patients for the Index Proof demo)
// It deletes old data first, so it can be run many times safely.
const { connect, close } = require("../db");

// ---- tiny seeded random generator so every run gives the same data ----
let seed = 12345;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

// format a Date as YYYY-MM-DD (local time)
function fmt(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }

const SLOTS = [];
for (let h = 9; h <= 16; h++) { SLOTS.push(String(h).padStart(2, "0") + ":00"); SLOTS.push(String(h).padStart(2, "0") + ":30"); }

// ---------------- departments ----------------
const departments = [
  { name: "General Medicine", floor: 1 }, { name: "Cardiology", floor: 2 },
  { name: "Orthopedics", floor: 2 }, { name: "Pediatrics", floor: 1 },
  { name: "Neurology", floor: 3 }, { name: "Dermatology", floor: 3 }
];

// ---------------- doctors (dept, name, specialization, exp, fee, days, status) ----------------
const D = (dept, name, spec, exp, fee, days, status) => ({ dept, name, spec, exp, fee, days, status: status || "Active" });
const doctorList = [
  D("General Medicine", "Dr. Ajit Hande", "General Physician", 2, 15, ["Mon", "Tue", "Wed", "Thu", "Fri"]),
  D("General Medicine", "Dr. Param Mavani", "Internal Medicine", 3, 50, ["Mon", "Wed", "Fri", "Sat"]),
  D("Cardiology", "Dr. Omkar Anna Dhas", "Cardiologist", 3, 51, ["Mon", "Tue", "Thu"]),
  D("Cardiology", "Dr. Samarth Bugad", "Interventional Cardiologist", 2, 11, ["Tue", "Thu", "Sat"]),
  D("Orthopedics", "Dr. Vaibhav Missal", "Orthopedic Surgeon", 4, 101, ["Mon", "Wed", "Fri"]),
  D("Orthopedics", "Dr. Shivshankar Gond", "Sports Injury Specialist", 1, 5, ["Tue", "Thu", "Sat"], "OnLeave"),
  D("Dermatology", "Dr. Vinod Kolte", "Darmatologist", 2, 99, ["Wed", "Fri", "Sat"]),
  D("Neurology", "Dr. Prathmesh Hanwate", "Neurologist", 20, 2000, ["Wed", "Fri", "Sat"])
];

// ---------------- patients ----------------
const maleNames = ["Rahul", "Amit", "Sanjay", "Prakash", "Ganesh", "Omkar", "Suresh", "Nitin", "Akash", "Mahesh", "Yash", "Tushar", "Ajay", "Pratik", "Dinesh", "Harsh", "Vivek", "Sagar", "Kunal", "Manoj"];
const femaleNames = ["Sneha", "Anjali", "Pallavi", "Rutuja", "Swati", "Komal", "Shweta", "Mayuri", "Nisha", "Aarti", "Priyanka", "Sakshi", "Rekha", "Vaishali", "Divya", "Madhuri", "Tejaswini", "Asmita", "Kiran", "Sunanda"];
const surnames = ["Patil", "Jadhav", "More", "Gaikwad", "Kale", "Sawant", "Pawar", "Deshpande", "Kulkarni", "Joshi", "Thakur", "Mane", "Shinde", "Bhosale", "Wagh", "Salunke", "Lokhande", "Mishra", "Sharma", "Khan"];
const cities = [["Pune", "411001"], ["Mumbai", "400001"], ["Nashik", "422001"], ["Nagpur", "440001"], ["Pimpri", "411018"]];
const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const allergyList = ["Penicillin", "Peanuts", "Dust", "Pollen", "Sulfa drugs", "Shellfish"];
const conditionList = ["Diabetes", "Hypertension", "Asthma", "Thyroid", "Arthritis", "Migraine"];
const streets = ["MG Road", "FC Road", "Station Road", "Nehru Nagar", "Shivaji Chowk", "Gandhi Path", "Lake View Colony"];

let phoneCounter = 9000000000;       // unique 10 digit phones
function makePatient(i, createdDaysAgo) {
  const male = rand() < 0.5;
  const city = pick(cities);
  const p = {
    patientCode: "CN-" + String(i).padStart(4, "0"),
    name: pick(male ? maleNames : femaleNames) + " " + pick(surnames),
    age: between(2, 85),
    gender: rand() < 0.04 ? "Other" : male ? "Male" : "Female",
    bloodGroup: pick(bloodGroups),
    phone: String(phoneCounter++),
    address: { line: between(1, 120) + ", " + pick(streets), city: city[0], state: "Maharashtra", pincode: city[1] },
    allergies: [],
    medicalHistory: [],
    createdAt: addDays(-createdDaysAgo)
  };
  if (rand() < 0.3) p.allergies.push(pick(allergyList));
  if (p.age > 35 && rand() < 0.5) p.medicalHistory.push({ condition: pick(conditionList), since: between(2005, 2023) });
  return p;
}

// ---------------- diagnoses ----------------
// For each diagnosis: which departments treat it, a typical reason, and medicines.
const diagnoses = {
  "Fever": { depts: ["General Medicine", "Pediatrics"], reason: "High fever and body ache", meds: [["Paracetamol 500mg", "1 tablet twice a day", 3], ["Vitamin C", "1 tablet daily", 5]] },
  "Hypertension": { depts: ["Cardiology", "General Medicine"], reason: "High blood pressure check", meds: [["Amlodipine 5mg", "1 tablet morning", 30], ["Telmisartan 40mg", "1 tablet night", 30]] },
  "Diabetes": { depts: ["General Medicine"], reason: "Sugar level follow-up", meds: [["Metformin 500mg", "1 tablet after meals", 30], ["Glimepiride 1mg", "1 tablet morning", 30]] },
  "Migraine": { depts: ["Neurology"], reason: "Severe headache with nausea", meds: [["Sumatriptan 50mg", "1 tablet when needed", 10], ["Naproxen 250mg", "1 tablet twice a day", 5]] },
  "Fracture": { depts: ["Orthopedics"], reason: "Pain and swelling after a fall", meds: [["Calcium + D3", "1 tablet daily", 60], ["Diclofenac 50mg", "1 tablet twice a day", 7], ["Pantoprazole 40mg", "1 tablet before breakfast", 7]] },
  "Skin Allergy": { depts: ["Dermatology"], reason: "Itching and red rashes", meds: [["Cetirizine 10mg", "1 tablet night", 7], ["Calamine lotion", "Apply twice a day", 10]] },
  "Viral Infection": { depts: ["General Medicine", "Pediatrics"], reason: "Cold, cough and sore throat", meds: [["Azithromycin 500mg", "1 tablet daily", 3], ["Cough syrup", "10 ml three times a day", 5], ["Paracetamol 500mg", "1 tablet when needed", 3]] },
  "Asthma": { depts: ["Pediatrics", "General Medicine"], reason: "Breathing difficulty and wheezing", meds: [["Salbutamol inhaler", "2 puffs when needed", 30], ["Montelukast 10mg", "1 tablet night", 30]] }
};

async function run() {
  const big = process.argv.includes("--big");
  const db = await connect();

  // 1. Remove old data (keeps validators and indexes in place)
  for (const c of ["appointments", "patients", "doctors", "departments"]) await db.collection(c).deleteMany({});

  // 2. Departments
  const deptRes = await db.collection("departments").insertMany(departments);
  const deptId = {};
  departments.forEach((d, i) => (deptId[d.name] = deptRes.insertedIds[i]));

  // 3. Doctors (each one references its department by _id)
  const doctors = doctorList.map((d, i) => ({
    name: d.name, departmentId: deptId[d.dept], specialization: d.spec, experienceYears: d.exp,
    phone: "98" + String(10000000 + i * 1111), email: d.name.toLowerCase().replace(/[^a-z]/g, "") + "@carenova.in",
    fee: d.fee, availableDays: d.days, status: d.status
  }));
  const docRes = await db.collection("doctors").insertMany(doctors);
  doctors.forEach((d, i) => (d._id = docRes.insertedIds[i]));
  const deptNameById = {};
  Object.entries(deptId).forEach(([name, id]) => (deptNameById[id.toString()] = name));

  // 4. Patients (40 realistic ones)
  const patients = [];
  for (let i = 1; i <= 40; i++) patients.push(makePatient(i, between(0, 60)));
  const patRes = await db.collection("patients").insertMany(patients);
  patients.forEach((p, i) => (p._id = patRes.insertedIds[i]));

  // 5. Appointments: 80, from 10 days ago to 5 days ahead
  const activeDoctors = doctors.filter((d) => d.status === "Active");
  const used = new Set();                       // doctor|date|slot, so no two appointments clash
  const appointments = [];
  let tries = 0;
  while (appointments.length < 80 && tries++ < 5000) {
    const offset = appointments.length < 8 ? 0 : between(-10, 5);    // make sure today has some visits
    const date = fmt(addDays(offset));
    const doctor = pick(activeDoctors);
    const slot = pick(SLOTS);
    const key = doctor._id + "|" + date + "|" + slot;
    if (used.has(key)) continue;
    used.add(key);

    let status;
    if (offset < 0) status = rand() < 0.8 ? "Completed" : "Cancelled";
    else if (offset === 0) status = rand() < 0.4 ? "Completed" : "Scheduled";
    else status = rand() < 0.85 ? "Scheduled" : "Cancelled";

    // choose a diagnosis that this doctor's department treats
    const deptName = deptNameById[doctor.departmentId.toString()];
    const options = Object.keys(diagnoses).filter((k) => diagnoses[k].depts.includes(deptName));
    const diag = pick(options);
    const appt = {
      patientId: pick(patients)._id, doctorId: doctor._id, date, timeSlot: slot,
      reason: diagnoses[diag].reason, status, createdAt: addDays(offset - between(1, 5))
    };
    if (status === "Completed") {
      appt.diagnosis = diag;
      appt.prescription = diagnoses[diag].meds.slice(0, between(1, 3)).map((m) => ({ medicine: m[0], dosage: m[1], days: m[2] }));
    }
    appointments.push(appt);
  }
  await db.collection("appointments").insertMany(appointments);

  // 6. Optional: 5000 dummy patients so the Index Proof shows a clear difference
  if (big) {
    console.log("Adding 5000 dummy patients (this takes a few seconds)...");
    const extra = [];
    for (let i = 41; i < 5041; i++) extra.push(makePatient(i, between(0, 365)));
    await db.collection("patients").insertMany(extra);
  }

  console.log("Seeded: " + departments.length + " departments, " + doctors.length + " doctors, " +
    (await db.collection("patients").countDocuments()) + " patients, " + appointments.length + " appointments");
  await close();
}

run().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
