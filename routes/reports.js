// routes/reports.js - aggregation pipelines (Section 7) and the Index Proof demo.
// Every report is described once: which collection, which pipeline, and how to tidy the rows.
// The API also sends the pipeline as text, so the "Show pipeline" button shows the real code.
const express = require("express");
const { getDb } = require("../db");
const { sendError, dateStr } = require("./helpers");
const router = express.Router();

// Each report: title, collection, pipeline() and optional format(rows)
const reports = {
  // 1. Patients per doctor: $group -> $lookup -> $unwind -> $project -> $sort
  "patients-per-doctor": {
    title: "Patients per doctor",
    collection: "appointments",
    pipeline: () => [
      { $match: { status: { $ne: "Cancelled" } } },
      { $group: { _id: "$doctorId", total: { $sum: 1 }, patients: { $addToSet: "$patientId" } } },
      { $lookup: { from: "doctors", localField: "_id", foreignField: "_id", as: "doctor" } },
      { $unwind: "$doctor" },
      { $project: { _id: 0, doctor: "$doctor.name", specialization: "$doctor.specialization",
                    total: 1, uniquePatients: { $size: "$patients" } } },
      { $sort: { uniquePatients: -1 } }
    ]
  },

  // 2. Appointments per day (last 7 days): $match -> $group -> $sort
  "per-day": {
    title: "Appointments per day (last 7 days)",
    collection: "appointments",
    pipeline: () => [
      { $match: { date: { $gte: dateStr(-6), $lte: dateStr(0) } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ],
    format: (rows) => {                                   // add 0 for days with no appointments
      const counts = {};
      rows.forEach((r) => (counts[r._id] = r.count));
      const out = [];
      for (let i = -6; i <= 0; i++) out.push({ date: dateStr(i), count: counts[dateStr(i)] || 0 });
      return out;
    }
  },

  // 3. Top 5 diagnoses: $match -> $group -> $sort -> $limit
  "top-diagnoses": {
    title: "Top 5 diagnoses",
    collection: "appointments",
    pipeline: () => [
      { $match: { status: "Completed", diagnosis: { $exists: true } } },
      { $group: { _id: "$diagnosis", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, diagnosis: "$_id", count: 1 } }
    ]
  },

  // 4. Appointment status split: $group
  "status-split": {
    title: "Appointment status split",
    collection: "appointments",
    pipeline: () => [
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
      { $sort: { count: -1 } }
    ]
  },

  // 5. Patients per department: $lookup doctors -> $lookup departments -> $group
  "per-department": {
    title: "Patients per department",
    collection: "appointments",
    pipeline: () => [
      { $match: { status: { $ne: "Cancelled" } } },
      { $lookup: { from: "doctors", localField: "doctorId", foreignField: "_id", as: "doctor" } },
      { $unwind: "$doctor" },
      { $lookup: { from: "departments", localField: "doctor.departmentId", foreignField: "_id", as: "dept" } },
      { $unwind: "$dept" },
      { $group: { _id: "$dept.name", appointments: { $sum: 1 }, patients: { $addToSet: "$patientId" } } },
      { $project: { _id: 0, department: "$_id", appointments: 1, uniquePatients: { $size: "$patients" } } },
      { $sort: { uniquePatients: -1 } }
    ]
  },

  // 6. Patients by age group: $bucket
  "age-groups": {
    title: "Patients by age group",
    collection: "patients",
    pipeline: () => [
      { $bucket: { groupBy: "$age", boundaries: [0, 13, 20, 40, 60, 121], default: "Other",
                   output: { count: { $sum: 1 } } } }
    ],
    format: (rows) => {                                   // turn bucket start ages into labels
      const labels = { 0: "0-12", 13: "13-19", 20: "20-39", 40: "40-59", 60: "60+" };
      return rows.map((r) => ({ group: labels[r._id] || String(r._id), count: r.count }));
    }
  },

  // 7. Revenue per doctor: $match Completed -> $lookup -> $group sum of fee
  "revenue": {
    title: "Revenue per doctor",
    collection: "appointments",
    pipeline: () => [
      { $match: { status: "Completed" } },
      { $lookup: { from: "doctors", localField: "doctorId", foreignField: "_id", as: "doctor" } },
      { $unwind: "$doctor" },
      { $group: { _id: "$doctor.name", visits: { $sum: 1 }, revenue: { $sum: "$doctor.fee" } } },
      { $project: { _id: 0, doctor: "$_id", visits: 1, revenue: 1 } },
      { $sort: { revenue: -1 } }
    ]
  },

  // 8. Extra: new patients per month. Shows $dateToString on a real Date field (createdAt)
  "registrations": {
    title: "New patients per month",
    collection: "patients",
    pipeline: () => [
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, month: "$_id", count: 1 } }
    ]
  }
};

// Text version of the pipeline, shown in the "Show pipeline" modal
function pipelineText(r) {
  return "db." + r.collection + ".aggregate(" + JSON.stringify(r.pipeline(), null, 2) + ")";
}

// GET /api/reports/index-proof - same query with and without an index, using explain()
// (declared before "/:name" so that "index-proof" is not treated as a report name)
router.get("/index-proof", async (req, res) => {
  try {
    const col = getDb().collection("patients");
    const total = await col.estimatedDocumentCount();
    const sample = await col.find({}, { projection: { phone: 1 } }).sort({ _id: -1 }).limit(1).toArray();
    if (!sample.length) return res.status(404).json({ error: "No patients found. Run npm run seed first." });
    const query = { phone: sample[0].phone };

    // Collect the numbers we want from an explain() result
    const stats = async (hint) => {
      const ex = await col.find(query).hint(hint).explain("executionStats");
      const s = ex.executionStats;
      let plan = ex.queryPlanner.winningPlan;
      if (plan.queryPlan) plan = plan.queryPlan;           // newer MongoDB versions wrap the plan
      while (plan.inputStage) plan = plan.inputStage;      // go down to the first stage (COLLSCAN / IXSCAN)
      return { stage: plan.stage, docsExamined: s.totalDocsExamined, keysExamined: s.totalKeysExamined,
               returned: s.nReturned, timeMs: s.executionTimeMillis };
    };
    const withoutIndex = await stats({ $natural: 1 });     // forces a full collection scan
    const withIndex = await stats({ phone: 1 });           // uses the unique phone index

    // "x times faster": use time when it is measurable, otherwise compare documents examined
    let speedup, basis;
    if (withoutIndex.timeMs > 0 && withIndex.timeMs > 0) { speedup = withoutIndex.timeMs / withIndex.timeMs; basis = "time"; }
    else { speedup = withoutIndex.docsExamined / Math.max(withIndex.docsExamined, 1); basis = "docsExamined"; }

    res.json({
      totalPatients: total,
      query: "db.patients.find(" + JSON.stringify(query) + ")",
      withoutIndex, withIndex,
      speedup: Math.round(speedup * 10) / 10, basis
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/reports/:name
router.get("/:name", async (req, res) => {
  try {
    const report = reports[req.params.name];
    if (!report) return res.status(404).json({ error: "Unknown report: " + req.params.name });
    let rows = await getDb().collection(report.collection).aggregate(report.pipeline()).toArray();
    if (report.format) rows = report.format(rows);
    res.json({ title: report.title, data: rows, pipeline: pipelineText(report) });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
