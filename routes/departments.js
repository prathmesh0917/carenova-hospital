// routes/departments.js - GET /api/departments
const express = require("express");
const { getDb } = require("../db");
const { sendError } = require("./helpers");
const router = express.Router();

// List all departments (used by the dropdowns), sorted by name
router.get("/", async (req, res) => {
  try {
    const list = await getDb().collection("departments").find().sort({ name: 1 }).toArray();
    res.json(list);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
