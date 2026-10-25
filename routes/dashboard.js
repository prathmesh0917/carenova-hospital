// routes/dashboard.js - GET /api/dashboard: stat cards, 7 day trend, status split, today's list.
const express = require("express");
const { getDb } = require("../db");
const { sendError, dateStr } = require("./helpers");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const today = dateStr(0);
    const monthStart = today.slice(0, 8) + "01";               // e.g. 2026-10-01
    const weekStart = dateStr(-6);

    // Run all the independent queries at the same time
    const [patients, doctors, todayCount, completedMonth, trendRows, statusRows, todayList] = await Promise.all([
      db.collection("patients").estimatedDocumentCount(),
      db.collection("doctors").estimatedDocumentCount(),
      db.collection("appointments").countDocuments({ date: today }),
      db.collection("appointments").countDocuments({ status: "Completed", date: { $gte: monthStart, $lte: today } }),

      // appointments per day for the last 7 days
      db.collection("appointments").aggregate([
        { $match: { date: { $gte: weekStart, $lte: today } } },
        { $group: { _id: "$date", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]).toArray(),

      // appointment status split
      db.collection("appointments").aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),

      // today's appointments with patient and doctor names
      db.collection("appointments").aggregate([
        { $match: { date: today } },
        { $sort: { timeSlot: 1 } },
        { $lookup: { from: "patients", localField: "patientId", foreignField: "_id", as: "patient" } },
        { $lookup: { from: "doctors", localField: "doctorId", foreignField: "_id", as: "doctor" } },
        { $unwind: "$patient" },
        { $unwind: "$doctor" },
        { $project: { timeSlot: 1, status: 1, patientName: "$patient.name", doctorName: "$doctor.name" } }
      ]).toArray()
    ]);

    // Fill days with no appointments with 0 so the line chart always has 7 points
    const counts = {};
    trendRows.forEach((r) => (counts[r._id] = r.count));
    const trend = [];
    for (let i = -6; i <= 0; i++) trend.push({ date: dateStr(i), count: counts[dateStr(i)] || 0 });

    res.json({
      stats: { patients, doctors, todayAppointments: todayCount, completedThisMonth: completedMonth },
      trend,
      statusSplit: statusRows.map((r) => ({ status: r._id, count: r.count })),
      today: todayList
    });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
