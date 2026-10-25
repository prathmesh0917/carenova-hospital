// setup/createCollections.js
// Creates the 4 collections with $jsonSchema validation (ADBMS: schema validation).
// Safe to run many times: if a collection exists, its validator is updated with collMod.
const { connect, close } = require("../db");

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 30-minute time slots from 09:00 to 16:30
const SLOTS = [];
for (let h = 9; h <= 16; h++) {
  SLOTS.push(String(h).padStart(2, "0") + ":00");
  SLOTS.push(String(h).padStart(2, "0") + ":30");
}

const validators = {
  // ---------- departments ----------
  departments: {
    bsonType: "object",
    required: ["name", "floor"],
    properties: {
      name: { bsonType: "string", minLength: 2 },
      floor: { bsonType: "int", minimum: 0, maximum: 20 }
    }
  },

  // ---------- doctors ----------
  doctors: {
    bsonType: "object",
    required: ["name", "departmentId", "specialization", "phone"],
    properties: {
      name: { bsonType: "string", minLength: 2 },
      departmentId: { bsonType: "objectId" },          // reference to departments._id
      specialization: { bsonType: "string", minLength: 2 },
      experienceYears: { bsonType: "int", minimum: 0, maximum: 60 },
      phone: { bsonType: "string", pattern: "^[0-9]{10}$" },
      email: { bsonType: "string" },
      fee: { bsonType: "int", minimum: 0 },
      availableDays: { bsonType: "array", items: { enum: DAYS } },
      status: { enum: ["Active", "OnLeave"] }
    }
  },

  // ---------- patients ----------
  patients: {
    bsonType: "object",
    required: ["patientCode", "name", "age", "gender", "phone"],
    properties: {
      patientCode: { bsonType: "string", pattern: "^CN-[0-9]{4,}$" },
      name: { bsonType: "string", minLength: 2 },
      age: { bsonType: "int", minimum: 0, maximum: 120 },
      gender: { enum: ["Male", "Female", "Other"] },
      bloodGroup: { enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
      phone: { bsonType: "string", pattern: "^[0-9]{10}$" },
      // embedded address object
      address: {
        bsonType: "object",
        properties: {
          line: { bsonType: "string" },
          city: { bsonType: "string" },
          state: { bsonType: "string" },
          pincode: { bsonType: "string", pattern: "^[0-9]{6}$" }
        }
      },
      // embedded arrays
      allergies: { bsonType: "array", items: { bsonType: "string" } },
      medicalHistory: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["condition"],
          properties: {
            condition: { bsonType: "string" },
            since: { bsonType: "int", minimum: 1900, maximum: 2100 }
          }
        }
      },
      createdAt: { bsonType: "date" }
    }
  },

  // ---------- appointments ----------
  appointments: {
    bsonType: "object",
    required: ["patientId", "doctorId", "date", "timeSlot", "reason", "status"],
    properties: {
      patientId: { bsonType: "objectId" },             // reference to patients._id
      doctorId: { bsonType: "objectId" },              // reference to doctors._id
      date: { bsonType: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
      timeSlot: { enum: SLOTS },
      reason: { bsonType: "string", minLength: 2 },
      status: { enum: ["Scheduled", "Completed", "Cancelled"] },
      diagnosis: { bsonType: "string" },
      // embedded prescription list
      prescription: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["medicine"],
          properties: {
            medicine: { bsonType: "string", minLength: 1 },
            dosage: { bsonType: "string" },
            days: { bsonType: "int", minimum: 1, maximum: 365 }
          }
        }
      },
      createdAt: { bsonType: "date" }
    }
  }
};

async function run() {
  const db = await connect();
  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  for (const name of Object.keys(validators)) {
    const options = {
      validator: { $jsonSchema: validators[name] },
      validationLevel: "strict",
      validationAction: "error"
    };
    if (existing.includes(name)) {
      await db.command({ collMod: name, ...options });   // update rules on existing collection
      console.log("Updated validator for:", name);
    } else {
      await db.createCollection(name, options);
      console.log("Created collection:", name);
    }
  }
  await close();
  console.log("Collections ready.");
}

run().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
