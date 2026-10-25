// routes/helpers.js - small shared helpers used by all route files.
const { ObjectId } = require("mongodb");

// Convert a string to ObjectId, or return null if it is not a valid id
function toId(str) {
  return ObjectId.isValid(str) ? new ObjectId(str) : null;
}

// Turn any MongoDB error into a friendly { status, error } pair.
//  11000 = duplicate key (unique index)   121 = $jsonSchema validation failed
function mongoError(err) {
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(", ");
    return { status: 409, error: "Duplicate value for: " + field };
  }
  if (err.code === 121) {
    return { status: 400, error: "Validation failed: " + describeValidation(err) };
  }
  return { status: 500, error: err.message };
}

// Dig the useful reason out of the long $jsonSchema error object
function describeValidation(err) {
  try {
    const rules = err.errInfo.details.schemaRulesNotSatisfied;
    const out = [];
    for (const rule of rules) {
      for (const p of rule.propertiesNotSatisfied || []) {
        out.push(p.propertyName + " is not valid");
      }
      if (rule.missingProperties) out.push("missing: " + rule.missingProperties.join(", "));
    }
    if (out.length) return out.join("; ");
  } catch (e) { /* fall through */ }
  return "document does not match the collection rules";
}

// Send an error response from inside a catch block
function sendError(res, err) {
  const e = mongoError(err);
  res.status(e.status).json({ error: e.error });
}

// MongoDB $jsonSchema "int" needs a real integer, so convert numbers safely.
// Returns the integer, or the original value if it is not numeric (validator will reject it).
function toInt(v) {
  if (v === "" || v === null || v === undefined) return v;
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : v;
}

// Date as "YYYY-MM-DD" in local time. offset = number of days from today (-1 = yesterday)
function dateStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// Remove empty strings / undefined so optional fields are simply left out of the document
function clean(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== "" && obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

module.exports = { toId, sendError, toInt, dateStr, clean };
