// server.js - Express app: connects to MongoDB, mounts the API routes, serves /public
require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const path = require("path");
const { connect } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

(async () => {
  try {
    await connect();
  } catch (err) {
    console.error("Could not connect to MongoDB. Is it running?", err.message);
    process.exit(1);
  }

  app.use("/api/patients", require("./routes/patients"));
  app.use("/api/doctors", require("./routes/doctors"));
  app.use("/api/appointments", require("./routes/appointments"));
  app.use("/api/departments", require("./routes/departments"));
  app.use("/api/dashboard", require("./routes/dashboard"));
  app.use("/api/reports", require("./routes/reports"));

  // Unknown API route -> JSON 404
  app.use("/api", (req, res) => res.status(404).json({ error: "API route not found" }));

  // Last-resort error handler so the server never sends HTML errors
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Server error: " + err.message });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("CareNova running on http://localhost:" + port));
})();
