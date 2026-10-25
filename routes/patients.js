// routes/patients.js - CRUD, text search and pagination for patients.
// Address, allergies and medical history are EMBEDDED inside the patient document.
const express = require("express");
const { getDb } = require("../db");
const { toId, sendError, toInt, clean } = require("./helpers");
const router = express.Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Build the embedded parts and the patient document from the request body
function buildPatient(body) {
  const a = body.address || {};
  const address = clean({
    line: (a.line || "").trim(), city: (a.city || "").trim(),
    state: (a.state || "").trim(), pincode: (a.pincode || "").trim()
  });
  const allergies = (Array.isArray(body.allergies) ? body.allergies : [])
    .map((x) => String(x).trim()).filter(Boolean);
  const medicalHistory = (Array.isArray(body.medicalHistory) ? body.medicalHistory : [])
    .filter((h) => h && String(h.condition || "").trim())
    .map((h) => clean({ condition: String(h.condition).trim(), since: toInt(h.since) }));

  return clean({
    name: (body.name || "").trim(),
    age: toInt(body.age),
    gender: body.gender,
    bloodGroup: body.bloodGroup,
    phone: (body.phone || "").trim(),
    address,
    allergies,
    medicalHistory
  });
}

// Next hospital ID: finds the highest CN-xxxx and adds 1 (numericOrdering sorts CN-9 < CN-10)
async function nextPatientCode() {
  const last = await getDb().collection("patients")
    .find({}, { projection: { patientCode: 1 } })
    .collation({ locale: "en", numericOrdering: true })
    .sort({ patientCode: -1 }).limit(1).toArray();
  const n = last.length ? parseInt(last[0].patientCode.replace("CN-", ""), 10) : 0;
  return "CN-" + String(n + 1).padStart(4, "0");
}

// GET /api/patients?q=&page=&limit=  -> { data, total, page }
router.get("/", async (req, res) => {
  try {
    const col = getDb().collection("patients");
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const q = (req.query.q || "").trim();

    let filter = {};
    let sort = { createdAt: -1, _id: -1 };
    if (q) {
      if (/^\d+$/.test(q)) filter = { phone: { $regex: "^" + q } };                 // digits -> phone
      else if (/^cn-/i.test(q)) filter = { patientCode: { $regex: "^" + escapeRegex(q), $options: "i" } };
      else {
        filter = { $text: { $search: q } };                                          // uses the text index
        if ((await col.countDocuments(filter)) === 0) {
          // text search only matches whole words, so fall back to a partial name match
          filter = { name: { $regex: escapeRegex(q), $options: "i" } };
        }
      }
    }
    const total = await col.countDocuments(filter);
    const data = await col.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).toArray();
    res.json({ data, total, page });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/patients/:id -> one patient + full appointment history (joined with $lookup)
router.get("/:id", async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid patient id" });
    const result = await getDb().collection("patients").aggregate([
      { $match: { _id: id } },
      { $lookup: {
          from: "appointments", localField: "_id", foreignField: "patientId",
          pipeline: [
            { $sort: { date: -1, timeSlot: -1 } },
            { $lookup: { from: "doctors", localField: "doctorId", foreignField: "_id", as: "doctor" } },
            { $unwind: "$doctor" },
            { $project: { date: 1, timeSlot: 1, reason: 1, status: 1, diagnosis: 1, prescription: 1,
                          doctorName: "$doctor.name", specialization: "$doctor.specialization" } }
          ],
          as: "appointments" } }
    ]).toArray();
    if (result.length === 0) return res.status(404).json({ error: "Patient not found" });
    res.json(result[0]);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/patients - server creates patientCode and createdAt
router.post("/", async (req, res) => {
  try {
    const doc = buildPatient(req.body);
    doc.createdAt = new Date();
    // Retry a few times in case two people register at the same moment (duplicate code)
    for (let attempt = 0; attempt < 5; attempt++) {
      doc.patientCode = await nextPatientCode();
      try {
        const result = await getDb().collection("patients").insertOne({ ...doc });
        return res.status(201).json({ _id: result.insertedId, ...doc });
      } catch (err) {
        const field = Object.keys(err.keyPattern || {})[0];
        if (err.code === 11000 && field === "patientCode") continue;   // try the next code
        throw err;
      }
    }
    res.status(500).json({ error: "Could not generate a patient code, try again" });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A patient with this phone number already exists" });
    sendError(res, err);
  }
});

// PUT /api/patients/:id - update (patientCode and createdAt never change)
router.put("/:id", async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid patient id" });
    const doc = buildPatient(req.body);
    const update = { $set: doc };
    const unset = {};
    if (!doc.bloodGroup) unset.bloodGroup = "";            // cleared fields are removed
    if (!doc.address) unset.address = "";
    if (Object.keys(unset).length) update.$unset = unset;
    const result = await getDb().collection("patients").updateOne({ _id: id }, update);
    if (result.matchedCount === 0) return res.status(404).json({ error: "Patient not found" });
    res.json({ message: "Patient updated" });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A patient with this phone number already exists" });
    sendError(res, err);
  }
});

// DELETE /api/patients/:id - blocked if the patient has scheduled appointments
router.delete("/:id", async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid patient id" });
    const db = getDb();
    const busy = await db.collection("appointments").countDocuments({ patientId: id, status: "Scheduled" });
    if (busy > 0) {
      return res.status(409).json({ error: "Cannot delete: this patient has " + busy + " scheduled appointment(s)" });
    }
    const result = await db.collection("patients").deleteOne({ _id: id });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Patient not found" });
    res.json({ message: "Patient deleted" });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
