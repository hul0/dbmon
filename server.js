// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.APP_PORT || 3000;

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, // default DB, can still query others
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true // allow multi‑statement SQL like phpMyAdmin
});

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Helper to run queries safely
async function runQuery(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// List databases
app.get('/api/databases', async (req, res) => {
  try {
    const rows = await runQuery('SHOW DATABASES');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// List tables in a database
app.get('/api/tables', async (req, res) => {
  const db = req.query.database || process.env.DB_NAME;
  if (!db) {
    return res.status(400).json({ error: 'database is required' });
  }

  try {
    await runQuery(`USE \`${db}\``);
    const rows = await runQuery('SHOW TABLES');
    res.json({ database: db, tables: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Table structure
app.get('/api/table/:table/structure', async (req, res) => {
  const db = req.query.database || process.env.DB_NAME;
  const table = req.params.table;

  try {
    await runQuery(`USE \`${db}\``);
    const columns = await runQuery(`DESCRIBE \`${table}\``);
    res.json({ database: db, table, columns });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Browse rows with simple pagination
app.get('/api/table/:table/rows', async (req, res) => {
  const db = req.query.database || process.env.DB_NAME;
  const table = req.params.table;
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);

  try {
    await runQuery(`USE \`${db}\``);
    const rows = await runQuery(
      `SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const countResult = await runQuery(
      `SELECT COUNT(*) as total FROM \`${table}\``
    );
    res.json({
      database: db,
      table,
      rows,
      total: countResult[0].total,
      limit,
      offset
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Insert row
app.post('/api/table/:table/rows', async (req, res) => {
  const db = req.query.database || process.env.DB_NAME;
  const table = req.params.table;
  const data = req.body;

  try {
    await runQuery(`USE \`${db}\``);
    const [result] = await pool.query(
      `INSERT INTO \`${table}\` SET ?`,
      data
    );
    res.json({ success: true, insertedId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update row (assumes 'id' primary key for simplicity)
app.put('/api/table/:table/rows/:id', async (req, res) => {
  const db = req.query.database || process.env.DB_NAME;
  const table = req.params.table;
  const id = req.params.id;
  const data = req.body;

  try {
    await runQuery(`USE \`${db}\``);
    const [result] = await pool.query(
      `UPDATE \`${table}\` SET ? WHERE id = ?`,
      [data, id]
    );
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete row (assumes 'id' primary key)
app.delete('/api/table/:table/rows/:id', async (req, res) => {
  const db = req.query.database || process.env.DB_NAME;
  const table = req.params.table;
  const id = req.params.id;

  try {
    await runQuery(`USE \`${db}\``);
    const [result] = await pool.query(
      `DELETE FROM \`${table}\` WHERE id = ?`,
      [id]
    );
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Raw SQL execution
app.post('/api/query', async (req, res) => {
  const db = req.body.database || process.env.DB_NAME;
  const sql = req.body.sql;

  if (!sql) {
    return res.status(400).json({ error: 'sql is required' });
  }

  try {
    if (db) {
      await runQuery(`USE \`${db}\``);
    }
    const [rows, fields] = await pool.query(sql);
    res.json({ database: db, rows, fields });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Awesome DB Admin running on http://localhost:${PORT}`);
});
