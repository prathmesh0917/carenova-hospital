// db.js - connects to MongoDB once and shares the database object with all routes.
require("dotenv").config({ quiet: true });
const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const client = new MongoClient(uri);
let db = null;

// Connect to the carenova_db database (called once when the server starts)
async function connect() {
  await client.connect();
  db = client.db("carenova_db");
  console.log("MongoDB connected");
  return db;
}

// Routes call getDb() to get the database object
function getDb() {
  if (!db) throw new Error("Database not connected yet");
  return db;
}

// Used by setup scripts to close the connection when they finish
async function close() {
  await client.close();
}

module.exports = { connect, getDb, close };
