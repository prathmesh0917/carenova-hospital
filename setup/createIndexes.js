// setup/createIndexes.js
// Creates every index from Section 6 of the project spec.
// createIndex does nothing if the same index already exists, so it is safe to re-run.
const { connect, close } = require("../db");

async function run() {
  const db = await connect();

  // ---- departments ----
  // Department names must be unique
  await db.collection("departments").createIndex({ name: 1 }, { unique: true });

  // ---- patients ----
  // Unique phone: no duplicate patients, fast lookup by phone
  await db.collection("patients").createIndex({ phone: 1 }, { unique: true });
  // Unique hospital ID like CN-0001
  await db.collection("patients").createIndex({ patientCode: 1 }, { unique: true });
  // Text index: powers the search box on the Patients page
  await db.collection("patients").createIndex({ name: "text" });

  // ---- doctors ----
  // Compound index: filter doctors by department (and specialization)
  await db.collection("doctors").createIndex({ departmentId: 1, specialization: 1 });
  // Unique phone: no duplicate doctors
  await db.collection("doctors").createIndex({ phone: 1 }, { unique: true });

  // ---- appointments ----
  // Prevents double booking: one doctor cannot have two SCHEDULED appointments
  // in the same slot. Cancelled / Completed ones are ignored (partial index).
  await db.collection("appointments").createIndex(
    { doctorId: 1, date: 1, timeSlot: 1 },
    { unique: true, partialFilterExpression: { status: "Scheduled" } }
  );
  // Patient history, newest first
  await db.collection("appointments").createIndex({ patientId: 1, date: -1 });
  // Today's appointments and appointments-per-day report
  await db.collection("appointments").createIndex({ date: 1 });

  // Print what we created so it can be shown in the viva
  for (const name of ["departments", "patients", "doctors", "appointments"]) {
    const list = await db.collection(name).indexes();
    console.log("\n" + name + " indexes:");
    list.forEach((i) => console.log("  -", i.name));
  }
  await close();
  console.log("\nIndexes ready.");
}

run().catch((err) => {
  console.error("Index creation failed:", err.message);
  process.exit(1);
});
