// db.js — SQLite database setup using better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'clinic.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── CREATE TABLES ───────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS patients (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT,          -- Canine / Feline / Other
    breed       TEXT,
    colour      TEXT,
    age         TEXT,
    gender      TEXT,
    weight      REAL,
    owner_name  TEXT NOT NULL,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    created_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id           TEXT PRIMARY KEY,
    patient_id   TEXT REFERENCES patients(id) ON DELETE CASCADE,
    patient_name TEXT,
    owner_name   TEXT,
    doctor       TEXT NOT NULL,
    date         TEXT NOT NULL,
    complaint    TEXT,
    subjective   TEXT,
    objective    TEXT,
    assessment   TEXT,
    plan         TEXT,
    procedures   TEXT,
    medications  TEXT,
    followup     TEXT,
    status       TEXT DEFAULT 'open',   -- open / done
    created_at   TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS invoices (
    ref          TEXT PRIMARY KEY,
    patient_id   TEXT REFERENCES patients(id) ON DELETE SET NULL,
    patient_name TEXT NOT NULL,
    patient_type TEXT,
    owner_name   TEXT NOT NULL,
    phone        TEXT,
    date         TEXT NOT NULL,
    subtotal     REAL DEFAULT 0,
    discount     REAL DEFAULT 0,
    total        REAL DEFAULT 0,
    paid_amount  REAL DEFAULT 0,
    balance      REAL DEFAULT 0,
    method       TEXT,          -- Cash / UPI / Card
    status       TEXT DEFAULT 'Draft',  -- Paid / Draft / Outstanding
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_ref TEXT REFERENCES invoices(ref) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    quantity    REAL DEFAULT 1,
    unit_price  REAL DEFAULT 0,
    discount    REAL DEFAULT 0,
    total       REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS counters (
    key   TEXT PRIMARY KEY,
    value INTEGER DEFAULT 1
  );
`);

// Initialize counters if not present
const initCounter = db.prepare(`INSERT OR IGNORE INTO counters (key, value) VALUES (?, ?)`);
initCounter.run('invoice', 1);
initCounter.run('patient', 10000);

// ─── COUNTER HELPERS ─────────────────────────────────────────────────────────

function nextCounter(key) {
  const row = db.prepare('SELECT value FROM counters WHERE key = ?').get(key);
  const val = row.value;
  db.prepare('UPDATE counters SET value = value + 1 WHERE key = ?').run(key);
  return val;
}

// ─── PATIENT QUERIES ─────────────────────────────────────────────────────────

const patientQueries = {
  getAll: db.prepare('SELECT * FROM patients ORDER BY created_at DESC'),
  getById: db.prepare('SELECT * FROM patients WHERE id = ? OR CAST(patient_id AS TEXT) = ?'),
  search: db.prepare(`SELECT * FROM patients WHERE
    lower(name) LIKE ? OR lower(owner_name) LIKE ? OR lower(breed) LIKE ?
    ORDER BY created_at DESC`),

  insert: db.prepare(`INSERT INTO patients
    (id, name, type, breed, colour, age, gender, weight, owner_name, phone, email, address)
    VALUES (@id, @name, @type, @breed, @colour, @age, @gender, @weight, @owner_name, @phone, @email, @address)`),

  update: db.prepare(`UPDATE patients SET
    name=@name, type=@type, breed=@breed, colour=@colour, age=@age,
    gender=@gender, weight=@weight, owner_name=@owner_name, phone=@phone,
    email=@email, address=@address WHERE id=@id`),

  delete: db.prepare('DELETE FROM patients WHERE id = ?')
};

// ─── CHECKIN QUERIES ─────────────────────────────────────────────────────────

const checkinQueries = {
  getAll: db.prepare('SELECT * FROM checkins ORDER BY date DESC, created_at DESC'),
  getById: db.prepare('SELECT * FROM checkins WHERE id = ?'),

  insert: db.prepare(`INSERT INTO checkins
    (id, patient_id, patient_name, owner_name, doctor, date, complaint,
     subjective, objective, assessment, plan, procedures, medications, followup, status)
    VALUES (@id, @patient_id, @patient_name, @owner_name, @doctor, @date, @complaint,
     @subjective, @objective, @assessment, @plan, @procedures, @medications, @followup, @status)`),

  updateStatus: db.prepare('UPDATE checkins SET status = ? WHERE id = ?'),
  delete: db.prepare('DELETE FROM checkins WHERE id = ?')
};

// ─── INVOICE QUERIES ─────────────────────────────────────────────────────────

const invoiceQueries = {
  getAll: db.prepare('SELECT * FROM invoices ORDER BY date DESC, created_at DESC'),
  getById: db.prepare('SELECT * FROM invoices WHERE ref = ?'),
  getItems: db.prepare('SELECT * FROM invoice_items WHERE invoice_ref = ? ORDER BY id'),

  insert: db.prepare(`INSERT INTO invoices
    (ref, patient_id, patient_name, patient_type, owner_name, phone, date,
     subtotal, discount, total, paid_amount, balance, method, status, notes)
    VALUES (@ref, @patient_id, @patient_name, @patient_type, @owner_name, @phone, @date,
     @subtotal, @discount, @total, @paid_amount, @balance, @method, @status, @notes)`),

  insertItem: db.prepare(`INSERT INTO invoice_items
    (invoice_ref, name, quantity, unit_price, discount, total)
    VALUES (@invoice_ref, @name, @quantity, @unit_price, @discount, @total)`),

  updateStatus: db.prepare('UPDATE invoices SET status=@status, paid_amount=@paid_amount, balance=@balance WHERE ref=@ref'),

  delete: db.prepare('DELETE FROM invoices WHERE ref = ?'),

  // Range queries for reports
  getByDateRange: db.prepare('SELECT * FROM invoices WHERE date >= ? AND date <= ? ORDER BY date DESC'),
  getByStatus: db.prepare('SELECT * FROM invoices WHERE status = ? ORDER BY date DESC'),

  // Aggregates for dashboard
  stats: db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status='Paid' THEN 1 ELSE 0 END) as paid_count,
    SUM(CASE WHEN status='Draft' THEN 1 ELSE 0 END) as draft_count,
    SUM(CASE WHEN status='Outstanding' THEN 1 ELSE 0 END) as outstanding_count,
    SUM(CASE WHEN status='Paid' THEN total ELSE 0 END) as paid_amount,
    SUM(CASE WHEN status='Draft' THEN balance ELSE 0 END) as draft_balance,
    SUM(CASE WHEN status='Outstanding' THEN balance ELSE 0 END) as outstanding_balance,
    SUM(total) as gross_revenue
  FROM invoices`)
};

// ─── TRANSACTION HELPERS ─────────────────────────────────────────────────────

const createInvoice = db.transaction((inv, items) => {
  invoiceQueries.insert.run(inv);
  for (const item of items) {
    invoiceQueries.insertItem.run({ ...item, invoice_ref: inv.ref });
  }
  return invoiceQueries.getById.get(inv.ref);
});

module.exports = {
  db, nextCounter,
  patientQueries, checkinQueries, invoiceQueries, createInvoice
};
