const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: String(process.env.DB_PASS || ""),
  database: process.env.DB_NAME || "smarthome",
});

module.exports = pool;