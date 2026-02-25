// server.js — Paws & Claws Clinic REST API
const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  nextCounter,
  patientQueries, checkinQueries, invoiceQueries, createInvoice
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function ok(res, data) { res.json({ success: true, data }); }
function err(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

function generatePatientId() {
  const n = nextCounter('patient');
  return 'PaCPC-' + String(n).padStart(5, '0');
}

function generateInvoiceRef() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const n = nextCounter('invoice');
  return `IN:01-${yy}${mm}-${String(n).padStart(4, '0')}`;
}

// ─── PATIENTS ─────────────────────────────────────────────────────────────────

// GET all patients (with optional search)
app.get('/api/patients', (req, res) => {
  try {
    const { q, type } = req.query;
    let patients;
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      patients = patientQueries.search.all(like, like, like);
    } else {
      patients = patientQueries.getAll.all();
    }
    if (type) patients = patients.filter(p => p.type === type);
    ok(res, patients);
  } catch (e) { err(res, e.message, 500); }
});

// GET single patient
app.get('/api/patients/:id', (req, res) => {
  try {
    const p = patientQueries.getById.get(req.params.id, req.params.id);
    if (!p) return err(res, 'Patient not found', 404);
    ok(res, p);
  } catch (e) { err(res, e.message, 500); }
});

// POST create patient
app.post('/api/patients', (req, res) => {
  try {
    const { name, owner_name } = req.body;
    if (!name?.trim()) return err(res, 'Pet name is required');
    if (!owner_name?.trim()) return err(res, 'Owner name is required');

    const patient = {
      id: generatePatientId(),
      name: name.trim(),
      type: req.body.type || null,
      breed: req.body.breed || null,
      colour: req.body.colour || null,
      age: req.body.age || null,
      gender: req.body.gender || null,
      weight: req.body.weight ? parseFloat(req.body.weight) : null,
      owner_name: owner_name.trim(),
      phone: req.body.phone || null,
      email: req.body.email || null,
      address: req.body.address || null
    };

    patientQueries.insert.run(patient);
    ok(res, patientQueries.getById.get(patient.id));
  } catch (e) { err(res, e.message, 500); }
});

// PUT update patient
app.put('/api/patients/:id', (req, res) => {
  try {
    const existing = patientQueries.getById.get(req.params.id, req.params.id);
    if (!existing) return err(res, 'Patient not found', 404);

    patientQueries.update.run({
      id: req.params.id,
      name: req.body.name || existing.name,
      type: req.body.type ?? existing.type,
      breed: req.body.breed ?? existing.breed,
      colour: req.body.colour ?? existing.colour,
      age: req.body.age ?? existing.age,
      gender: req.body.gender ?? existing.gender,
      weight: req.body.weight != null ? parseFloat(req.body.weight) : existing.weight,
      owner_name: req.body.owner_name || existing.owner_name,
      phone: req.body.phone ?? existing.phone,
      email: req.body.email ?? existing.email,
      address: req.body.address ?? existing.address
    });

    ok(res, patientQueries.getById.get(req.params.id));
  } catch (e) { err(res, e.message, 500); }
});

// DELETE patient
app.delete('/api/patients/:id', (req, res) => {
  try {
    const p = patientQueries.getById.get(req.params.id);
    if (!p) return err(res, 'Patient not found', 404);
    patientQueries.delete.run(req.params.id);
    ok(res, { deleted: req.params.id });
  } catch (e) { err(res, e.message, 500); }
});

// ─── CHECKINS ─────────────────────────────────────────────────────────────────

// GET all checkins
app.get('/api/checkins', (req, res) => {
  try {
    let checkins = checkinQueries.getAll.all();
    const { status, q } = req.query;
    if (status) checkins = checkins.filter(c => c.status === status);
    if (q) {
      const lq = q.toLowerCase();
      checkins = checkins.filter(c =>
        (c.patient_name||'').toLowerCase().includes(lq) ||
        (c.doctor||'').toLowerCase().includes(lq)
      );
    }
    ok(res, checkins);
  } catch (e) { err(res, e.message, 500); }
});

// GET single checkin
app.get('/api/checkins/:id', (req, res) => {
  try {
    const c = checkinQueries.getById.get(req.params.id);
    if (!c) return err(res, 'Check-in not found', 404);
    ok(res, c);
  } catch (e) { err(res, e.message, 500); }
});

// POST create checkin
app.post('/api/checkins', (req, res) => {
  try {
    const { patient_id, doctor, date } = req.body;
    if (!doctor?.trim()) return err(res, 'Doctor name is required');
    if (!date) return err(res, 'Date is required');

    let patient_name = req.body.patient_name || '';
    let owner_name = req.body.owner_name || '';

    if (patient_id) {
      const pat = patientQueries.getById.get(patient_id);
      if (pat) { patient_name = pat.name; owner_name = pat.owner_name; }
    }

    const checkin = {
      id: 'CI-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      patient_id: patient_id || null,
      patient_name, owner_name,
      doctor: doctor.trim(),
      date,
      complaint: req.body.complaint || null,
      subjective: req.body.subjective || null,
      objective: req.body.objective || null,
      assessment: req.body.assessment || null,
      plan: req.body.plan || null,
      procedures: req.body.procedures || null,
      medications: req.body.medications || null,
      followup: req.body.followup || null,
      status: 'open'
    };

    checkinQueries.insert.run(checkin);
    ok(res, checkinQueries.getById.get(checkin.id));
  } catch (e) { err(res, e.message, 500); }
});

// PATCH update checkin status
app.patch('/api/checkins/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['open','done'].includes(status)) return err(res, 'Invalid status');
    checkinQueries.updateStatus.run(status, req.params.id);
    ok(res, checkinQueries.getById.get(req.params.id));
  } catch (e) { err(res, e.message, 500); }
});

// DELETE checkin
app.delete('/api/checkins/:id', (req, res) => {
  try {
    checkinQueries.delete.run(req.params.id);
    ok(res, { deleted: req.params.id });
  } catch (e) { err(res, e.message, 500); }
});

// ─── INVOICES ─────────────────────────────────────────────────────────────────

// GET all invoices (with filters)
app.get('/api/invoices', (req, res) => {
  try {
    const { status, from, to, q, sort } = req.query;

    let invoices;
    if (from && to) {
      invoices = invoiceQueries.getByDateRange.all(from, to);
    } else {
      invoices = invoiceQueries.getAll.all();
    }

    if (status) invoices = invoices.filter(i => i.status === status);
    if (q) {
      const lq = q.toLowerCase();
      invoices = invoices.filter(i =>
        (i.patient_name||'').toLowerCase().includes(lq) ||
        (i.owner_name||'').toLowerCase().includes(lq) ||
        (i.ref||'').toLowerCase().includes(lq)
      );
    }

    // Sorting
    if (sort === 'total-desc') invoices.sort((a,b) => b.total - a.total);
    else if (sort === 'total-asc') invoices.sort((a,b) => a.total - b.total);
    else if (sort === 'date-asc') invoices.sort((a,b) => a.date.localeCompare(b.date));
    // default: date-desc already sorted by query

    // Attach items to each invoice
    const result = invoices.map(inv => ({
      ...inv,
      items: invoiceQueries.getItems.all(inv.ref)
    }));

    ok(res, result);
  } catch (e) { err(res, e.message, 500); }
});

// GET single invoice with items
app.get('/api/invoices/:ref', (req, res) => {
  try {
    const inv = invoiceQueries.getById.get(req.params.ref);
    if (!inv) return err(res, 'Invoice not found', 404);
    inv.items = invoiceQueries.getItems.all(inv.ref);
    ok(res, inv);
  } catch (e) { err(res, e.message, 500); }
});

// POST create invoice
app.post('/api/invoices', (req, res) => {
  try {
    const { patient_id, owner_name, date, items } = req.body;
    if (!owner_name?.trim()) return err(res, 'Owner name is required');
    if (!date) return err(res, 'Date is required');
    if (!items?.length) return err(res, 'At least one line item is required');

    let patient_name = req.body.patient_name || '';
    let patient_type = req.body.patient_type || '';
    let phone = req.body.phone || '';

    if (patient_id) {
      const pat = patientQueries.getById.get(patient_id);
      if (pat) { patient_name = pat.name; patient_type = pat.type || ''; phone = pat.phone || ''; }
    }

    // Calculate totals
    const lineItems = items.map(item => ({
      name: item.name,
      quantity: parseFloat(item.quantity) || 1,
      unit_price: parseFloat(item.unit_price) || 0,
      discount: parseFloat(item.discount) || 0,
      total: (parseFloat(item.quantity)||1) * (parseFloat(item.unit_price)||0) - (parseFloat(item.discount)||0)
    }));

    const subtotal = lineItems.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const discount = lineItems.reduce((s, i) => s + i.discount, 0);
    const total = subtotal - discount;
    const paid_amount = parseFloat(req.body.paid_amount) || 0;
    const balance = Math.max(0, total - paid_amount);

    const inv = {
      ref: generateInvoiceRef(),
      patient_id: patient_id || null,
      patient_name, patient_type, owner_name: owner_name.trim(), phone,
      date, subtotal, discount, total, paid_amount, balance,
      method: req.body.method || null,
      status: req.body.status || 'Draft',
      notes: req.body.notes || null
    };

    const saved = createInvoice(inv, lineItems);
    saved.items = invoiceQueries.getItems.all(saved.ref);
    ok(res, saved);
  } catch (e) { err(res, e.message, 500); }
});

// PATCH update invoice status / payment
app.patch('/api/invoices/:ref/status', (req, res) => {
  try {
    const inv = invoiceQueries.getById.get(req.params.ref);
    if (!inv) return err(res, 'Invoice not found', 404);

    const status = req.body.status || inv.status;
    let paid_amount = req.body.paid_amount != null ? parseFloat(req.body.paid_amount) : inv.paid_amount;
    let balance = Math.max(0, inv.total - paid_amount);

    if (status === 'Paid') { paid_amount = inv.total; balance = 0; }
    if (status === 'Draft') { paid_amount = 0; balance = inv.total; }

    invoiceQueries.updateStatus.run({ status, paid_amount, balance, ref: req.params.ref });
    const updated = invoiceQueries.getById.get(req.params.ref);
    updated.items = invoiceQueries.getItems.all(updated.ref);
    ok(res, updated);
  } catch (e) { err(res, e.message, 500); }
});

// DELETE invoice
app.delete('/api/invoices/:ref', (req, res) => {
  try {
    invoiceQueries.delete.run(req.params.ref);
    ok(res, { deleted: req.params.ref });
  } catch (e) { err(res, e.message, 500); }
});

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  try {
    const stats = invoiceQueries.stats.get();
    const patientCount = require('./db').db.prepare('SELECT COUNT(*) as count FROM patients').get().count;
    const checkinCount = require('./db').db.prepare('SELECT COUNT(*) as count FROM checkins WHERE status="open"').get().count;
    ok(res, { ...stats, patient_count: patientCount, open_checkins: checkinCount });
  } catch (e) { err(res, e.message, 500); }
});

// ─── SERVE FRONTEND ──────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🐾 Paws & Claws Clinic Server running at http://localhost:${PORT}`);
  console.log(`   Database: ${path.join(__dirname, 'clinic.db')}\n`);
});

// ─── EXTENDED API ROUTES (from CSV import) ──────────────────────────────────

// Pet parents
app.get('/api/pet-parents', (req, res) => {
  try {
    const { q } = req.query;
    let rows;
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      rows = require('./db').db.prepare(`SELECT * FROM pet_parents WHERE lower(name) LIKE ? OR mobile_no LIKE ? ORDER BY name`).all(like, like);
    } else {
      rows = require('./db').db.prepare('SELECT * FROM pet_parents ORDER BY name').all();
    }
    ok(res, rows);
  } catch(e) { err(res, e.message, 500); }
});

// Vaccinations for a patient
app.get('/api/vaccinations/:patient_id', (req, res) => {
  try {
    const rows = require('./db').db.prepare('SELECT * FROM vaccinations WHERE patient_id=? ORDER BY created_at DESC').all(req.params.patient_id);
    ok(res, rows);
  } catch(e) { err(res, e.message, 500); }
});

// SOAP records for a patient
app.get('/api/soap/:patient_id', (req, res) => {
  try {
    const db = require('./db').db;
    const records = db.prepare(`
      SELECT r.*,
        s.chief_complaint, s.appetite, s.attitude, s.addnotes, s.chief_complaint as complaint,
        o.temp, o.pulse, o.weight, o.resprate, o.mucmemb, o.hydration, o.visual_exam,
        a.diagnosis,
        p.plan
      FROM records r
      LEFT JOIN soap_subjective s ON r.subject_id = s.subject_id
      LEFT JOIN soap_objective o ON r.objective_id = o.objective_id
      LEFT JOIN soap_assessment a ON r.assess_id = a.assess_id
      LEFT JOIN soap_plan p ON r.plan_id = p.plan_id
      WHERE r.patient_id = ?
      ORDER BY r.created_at DESC
      LIMIT 50
    `).all(req.params.patient_id);
    ok(res, records);
  } catch(e) { err(res, e.message, 500); }
});

// Prescriptions for a patient
app.get('/api/prescriptions/:patient_id', (req, res) => {
  try {
    const rows = require('./db').db.prepare('SELECT * FROM prescriptions WHERE patient_id=? ORDER BY created_at DESC').all(req.params.patient_id);
    ok(res, rows);
  } catch(e) { err(res, e.message, 500); }
});

// Patient full profile (aggregated)
app.get('/api/patients/:id/profile', (req, res) => {
  try {
    const db = require('./db').db;
    const patient = db.prepare('SELECT * FROM patients WHERE id=? OR CAST(patient_id AS TEXT)=?').get(req.params.id, req.params.id);
    if (!patient) return err(res, 'Not found', 404);
    const pid = patient.patient_id;
    const invoices_list = db.prepare('SELECT * FROM invoices WHERE patient_id=? ORDER BY date DESC LIMIT 20').all(pid);
    const vacc = db.prepare('SELECT * FROM vaccinations WHERE patient_id=? ORDER BY created_at DESC').all(pid);
    const soap = db.prepare('SELECT r.created_at, s.chief_complaint, a.diagnosis, p.plan, o.weight, o.temp FROM records r LEFT JOIN soap_subjective s ON r.subject_id=s.subject_id LEFT JOIN soap_assessment a ON r.assess_id=a.assess_id LEFT JOIN soap_plan p ON r.plan_id=p.plan_id LEFT JOIN soap_objective o ON r.objective_id=o.objective_id WHERE r.patient_id=? ORDER BY r.created_at DESC LIMIT 10').all(pid);
    ok(res, { patient, invoices: invoices_list, vaccinations: vacc, soap_history: soap });
  } catch(e) { err(res, e.message, 500); }
});

// Enhanced stats
app.get('/api/stats', (req, res) => {
  try {
    const db = require('./db').db;
    const inv = db.prepare(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status='Paid' THEN 1 ELSE 0 END) as paid_count,
      SUM(CASE WHEN status='Draft' THEN 1 ELSE 0 END) as draft_count,
      SUM(CASE WHEN status='Outstanding' THEN 1 ELSE 0 END) as outstanding_count,
      SUM(CASE WHEN status='Paid' THEN total ELSE 0 END) as paid_amount,
      SUM(CASE WHEN status='Draft' THEN balance ELSE 0 END) as draft_balance,
      SUM(CASE WHEN status='Outstanding' THEN balance ELSE 0 END) as outstanding_balance,
      SUM(total) as gross_revenue FROM invoices WHERE status != 'Deleted'`).get();
    const patientCount = db.prepare('SELECT COUNT(*) as count FROM patients').get().count;
    const checkinCount = db.prepare("SELECT COUNT(*) as count FROM checkins WHERE status='open'").get().count;
    const parentCount  = db.prepare('SELECT COUNT(*) as count FROM pet_parents').get().count;
    const vaccCount    = db.prepare('SELECT COUNT(*) as count FROM vaccinations').get().count;
    ok(res, { ...inv, patient_count: patientCount, open_checkins: checkinCount, owner_count: parentCount, vaccination_count: vaccCount });
  } catch(e) { err(res, e.message, 500); }
});
