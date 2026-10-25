// routes/appointments.js - booking, listing, status update and free/booked slots.
// patientId and doctorId are REFERENCES; names are joined with $lookup.
// Double booking is stopped by the unique partial index (error code 11000 -> HTTP 409).
const express = require("express");
const { getDb } = require("../db");
const { toId, sendError, toInt } = require("./helpers");
const router = express.Router();

// 30 minute slots from 09:00 to 16:30
const SLOTS = [];
for (let h = 9; h <= 16; h++) {
  SLOTS.push(String(h).padStart(2, "0") + ":00");
  SLOTS.push(String(h).padStart(2, "0") + ":30");
}
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOUBLE_BOOKED = "This doctor is already booked for that time slot.";

// GET /api/appointments?date=&status=&doctorId=
router.get("/", async (req, res) => {
  try {
    const match = {};
    if (req.query.date) match.date = req.query.date;
    if (req.query.status) match.status = req.query.status;
    if (req.query.doctorId) {
      const id = toId(req.query.doctorId);
      if (!id) return res.status(400).json({ error: "Invalid doctor id" });
      match.doctorId = id;
    }
    const list = await getDb().collection("appointments").aggregate([
      { $match: match },
      { $sort: { date: -1, timeSlot: 1 } },
      { $limit: 300 },
      { $lookup: { from: "patients", localField: "patientId", foreignField: "_id", as: "patient" } },
      { $lookup: { from: "doctors", localField: "doctorId", foreignField: "_id", as: "doctor" } },
      { $unwind: { path: "$patient", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$doctor", preserveNullAndEmptyArrays: true } },
      { $project: {
          date: 1, timeSlot: 1, reason: 1, status: 1, diagnosis: 1, prescription: 1,
          patientId: 1, doctorId: 1,
          patientName: "$patient.name", patientCode: "$patient.patientCode",
          doctorName: "$doctor.name", specialization: "$doctor.specialization" } }
    ]).toArray();
    res.json(list);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/appointments/slots?doctorId=&date=  (must be above "/:id" routes)
router.get("/slots", async (req, res) => {
  try {
    const doctorId = toId(req.query.doctorId);
    const date = req.query.date;
    if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
      return res.status(400).json({ error: "doctorId and date (YYYY-MM-DD) are required" });
    }
    const db = getDb();
    const doctor = await db.collection("doctors").findOne({ _id: doctorId });
    if (!doctor) return res.status(404).json({ error: "Doctor not found" });

    // Only SCHEDULED appointments block a slot (same rule as the partial index)
    const booked = await db.collection("appointments")
      .find({ doctorId, date, status: "Scheduled" }, { projection: { timeSlot: 1 } }).toArray();
    const bookedSet = new Set(booked.map((b) => b.timeSlot));

    const weekday = DAY_NAMES[new Date(date + "T00:00:00").getDay()];
    res.json({
      doctorStatus: doctor.status,
      weekday,
      worksThatDay: (doctor.availableDays || []).includes(weekday),
      slots: SLOTS.map((time) => ({ time, booked: bookedSet.has(time) }))
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/appointments - book an appointment
router.post("/", async (req, res) => {
  try {
    const db = getDb();
    const patientId = toId(req.body.patientId);
    const doctorId = toId(req.body.doctorId);
    if (!patientId) return res.status(400).json({ error: "Please choose a patient" });
    if (!doctorId) return res.status(400).json({ error: "Please choose a doctor" });

    // MongoDB does not check references for us, so we check that both exist
    const [patient, doctor] = await Promise.all([
      db.collection("patients").findOne({ _id: patientId }, { projection: { _id: 1 } }),
      db.collection("doctors").findOne({ _id: doctorId }, { projection: { status: 1 } })
    ]);
    if (!patient) return res.status(400).json({ error: "Patient does not exist" });
    if (!doctor) return res.status(400).json({ error: "Doctor does not exist" });
    if (doctor.status === "OnLeave") return res.status(400).json({ error: "This doctor is on leave" });

    const doc = {
      patientId, doctorId,
      date: (req.body.date || "").trim(),
      timeSlot: (req.body.timeSlot || "").trim(),
      reason: (req.body.reason || "").trim(),
      status: "Scheduled",
      createdAt: new Date()
    };
    const result = await db.collection("appointments").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: DOUBLE_BOOKED });
    sendError(res, err);
  }
});

// PUT /api/appointments/:id - change status; Completed also saves diagnosis + prescription
router.put("/:id", async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid appointment id" });
    const { status } = req.body;
    if (!["Scheduled", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({ error: "Status must be Scheduled, Completed or Cancelled" });
    }
    const set = { status };
    if (status === "Completed") {
      const diagnosis = (req.body.diagnosis || "").trim();
      if (!diagnosis) return res.status(400).json({ error: "Diagnosis is required to complete an appointment" });
      set.diagnosis = diagnosis;
      // prescription is EMBEDDED inside the appointment document
      set.prescription = (Array.isArray(req.body.prescription) ? req.body.prescription : [])
        .filter((p) => p && String(p.medicine || "").trim())
        .map((p) => {
          const item = { medicine: String(p.medicine).trim(), dosage: String(p.dosage || "").trim() };
          if (p.days !== "" && p.days !== undefined) item.days = toInt(p.days);
          return item;
        });
    }
    const result = await getDb().collection("appointments").updateOne({ _id: id }, { $set: set });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Appointment updated" });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: DOUBLE_BOOKED });
    sendError(res, err);
  }
});

// DELETE /api/appointments/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid appointment id" });
    const result = await getDb().collection("appointments").deleteOne({ _id: id });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Appointment deleted" });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
