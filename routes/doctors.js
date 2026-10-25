// routes/doctors.js - CRUD for doctors.
// A doctor only stores departmentId (a REFERENCE); the department name is joined with $lookup.
const express = require("express");
const { getDb } = require("../db");
const { toId, sendError, toInt, clean } = require("./helpers");
const router = express.Router();

// Build a doctor document from the request body (also converts types)
function buildDoctor(body) {
  return clean({
    name: (body.name || "").trim(),
    departmentId: toId(body.departmentId),
    specialization: (body.specialization || "").trim(),
    experienceYears: toInt(body.experienceYears),
    phone: (body.phone || "").trim(),
    email: (body.email || "").trim(),
    fee: toInt(body.fee),
    availableDays: Array.isArray(body.availableDays) ? body.availableDays : [],
    status: body.status || "Active"
  });
}

// GET /api/doctors?dept=<departmentId>&q=<name>
router.get("/", async (req, res) => {
  try {
    const match = {};
    if (req.query.dept) {
      const id = toId(req.query.dept);
      if (!id) return res.status(400).json({ error: "Invalid department id" });
      match.departmentId = id;               // uses the compound index (departmentId, specialization)
    }
    if (req.query.q) {
      // escape special regex characters, then search the name (case-insensitive)
      const safe = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      match.name = { $regex: safe, $options: "i" };
    }
    const doctors = await getDb().collection("doctors").aggregate([
      { $match: match },
      { $lookup: { from: "departments", localField: "departmentId", foreignField: "_id", as: "dept" } },
      { $unwind: "$dept" },
      { $addFields: { department: "$dept.name" } },
      { $project: { dept: 0 } },
      { $sort: { name: 1 } }
    ]).toArray();
    res.json(doctors);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/doctors - add a doctor
router.post("/", async (req, res) => {
  try {
    const doc = buildDoctor(req.body);
    if (!doc.departmentId) return res.status(400).json({ error: "Please choose a department" });
    const dept = await getDb().collection("departments").findOne({ _id: doc.departmentId });
    if (!dept) return res.status(400).json({ error: "Department does not exist" });
    const result = await getDb().collection("doctors").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A doctor with this phone number already exists" });
    sendError(res, err);
  }
});

// PUT /api/doctors/:id - update a doctor
router.put("/:id", async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid doctor id" });
    const doc = buildDoctor(req.body);
    if (!doc.departmentId) return res.status(400).json({ error: "Please choose a department" });
    // $set the given fields; $unset email if it was cleared
    const update = { $set: doc };
    if (!doc.email) update.$unset = { email: "" };
    const result = await getDb().collection("doctors").updateOne({ _id: id }, update);
    if (result.matchedCount === 0) return res.status(404).json({ error: "Doctor not found" });
    res.json({ message: "Doctor updated" });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A doctor with this phone number already exists" });
    sendError(res, err);
  }
});

// DELETE /api/doctors/:id - blocked if the doctor still has scheduled appointments
router.delete("/:id", async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid doctor id" });
    const db = getDb();
    const busy = await db.collection("appointments").countDocuments({ doctorId: id, status: "Scheduled" });
    if (busy > 0) {
      return res.status(409).json({ error: "Cannot delete: this doctor has " + busy + " scheduled appointment(s)" });
    }
    const result = await db.collection("doctors").deleteOne({ _id: id });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Doctor not found" });
    res.json({ message: "Doctor deleted" });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
