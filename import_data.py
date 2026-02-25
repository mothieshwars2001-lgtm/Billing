#!/usr/bin/env python3
"""
import_data.py
Imports all Paws & Claws clinic CSV exports into clinic.db (SQLite)
Run: python3 import_data.py
"""

import sqlite3
import pandas as pd
import os, sys, re
from pathlib import Path

# ─── CONFIG ───────────────────────────────────────────────────────────────────
CSV_DIR = Path(__file__).parent / "csvdata"
DB_PATH = Path(__file__).parent / "clinic.db"

def clean(val):
    """Return None for NULL strings and NaN."""
    if val is None: return None
    if isinstance(val, float):
        import math
        if math.isnan(val): return None
    s = str(val).strip()
    if s.lower() in ('null', 'none', 'nan', ''): return None
    return s

def run():
    print(f"\n🐾 Paws & Claws — CSV Import Tool")
    print(f"   Database : {DB_PATH}")
    print(f"   CSV Dir  : {CSV_DIR}\n")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = OFF")   # disable during bulk import
    conn.execute("PRAGMA journal_mode = WAL")
    cur = conn.cursor()

    # ── 1. EXTEND / CREATE TABLES ────────────────────────────────────────────

    cur.executescript("""
        -- Pet parents / owners
        CREATE TABLE IF NOT EXISTS pet_parents (
            pet_parent_id   INTEGER PRIMARY KEY,
            name            TEXT NOT NULL,
            mobile_no       TEXT,
            email_id        TEXT,
            created_at      TEXT
        );

        -- Patients (full schema)
        CREATE TABLE IF NOT EXISTS patients (
            id              TEXT PRIMARY KEY,
            patient_id      INTEGER UNIQUE,
            name            TEXT NOT NULL,
            sex             TEXT,
            type            TEXT,          -- Canine/Feline/Others
            breed           TEXT,
            age             TEXT,          -- age_dob
            colour          TEXT,
            microchip_no    TEXT,
            identify_mark   TEXT,
            owner_name      TEXT,
            phone           TEXT,
            email           TEXT,
            address         TEXT,
            pet_parent_id   INTEGER REFERENCES pet_parents(pet_parent_id),
            status          TEXT,
            created_at      TEXT
        );

        -- SOAP: Subjective
        CREATE TABLE IF NOT EXISTS soap_subjective (
            subject_id      INTEGER PRIMARY KEY,
            patient_id      INTEGER,
            addnotes        TEXT,
            appetite        TEXT,
            attitude        TEXT,
            drinking        TEXT,
            notice          TEXT,
            pooping         TEXT,
            urinating       TEXT,
            chief_complaint TEXT,
            duration        TEXT,
            created_at      TEXT
        );

        -- SOAP: Objective (vitals)
        CREATE TABLE IF NOT EXISTS soap_objective (
            objective_id    INTEGER PRIMARY KEY,
            patient_id      INTEGER,
            temp            TEXT,
            pulse           TEXT,
            resprate        TEXT,
            weight          TEXT,
            mucmemb         TEXT,
            lymnodes        TEXT,
            hydration       TEXT,
            crt             TEXT,
            bcs             TEXT,
            visual_exam     TEXT,
            created_at      TEXT
        );

        -- SOAP: Assessment
        CREATE TABLE IF NOT EXISTS soap_assessment (
            assess_id       INTEGER PRIMARY KEY,
            patient_id      INTEGER,
            diagnosis       TEXT,
            created_at      TEXT
        );

        -- SOAP: Plan
        CREATE TABLE IF NOT EXISTS soap_plan (
            plan_id         INTEGER PRIMARY KEY,
            patient_id      INTEGER,
            plan            TEXT,
            created_at      TEXT
        );

        -- Visit records (links all SOAP parts)
        CREATE TABLE IF NOT EXISTS records (
            record_id       INTEGER PRIMARY KEY,
            patient_id      INTEGER,
            subject_id      INTEGER REFERENCES soap_subjective(subject_id),
            objective_id    INTEGER REFERENCES soap_objective(objective_id),
            assess_id       INTEGER REFERENCES soap_assessment(assess_id),
            plan_id         INTEGER REFERENCES soap_plan(plan_id),
            prescription_id INTEGER,
            user_id         INTEGER,
            created_at      TEXT
        );

        -- Prescriptions / medications
        CREATE TABLE IF NOT EXISTS prescriptions (
            presmeds_id     INTEGER PRIMARY KEY,
            patient_id      INTEGER,
            prescription_id INTEGER,
            med_name        TEXT,
            prefix          TEXT,
            quantity        TEXT,
            quantity_type   TEXT,
            duration        TEXT,
            duration_type   TEXT,
            frequency       TEXT,
            instruction     TEXT,
            created_at      TEXT
        );

        -- Vaccinations / preventive care
        CREATE TABLE IF NOT EXISTS vaccinations (
            pchistory_id    INTEGER PRIMARY KEY,
            preventive_id   INTEGER,
            patient_id      INTEGER,
            date            TEXT,
            age             TEXT,
            veterinarian    TEXT,
            type_care       TEXT,
            treatment       TEXT,
            created_at      TEXT
        );

        -- Invoices (full)
        CREATE TABLE IF NOT EXISTS invoices (
            ref             TEXT PRIMARY KEY,
            invoice_id      INTEGER UNIQUE,
            date            TEXT,
            patient_id      INTEGER,
            patient_name    TEXT,
            patient_type    TEXT,
            owner_name      TEXT,
            phone           TEXT,
            pet_parent_id   INTEGER,
            payment_type    TEXT,
            method          TEXT,   -- normalised
            discount        REAL DEFAULT 0,
            total           REAL DEFAULT 0,
            paid_amount     REAL DEFAULT 0,
            balance         REAL DEFAULT 0,
            status          TEXT DEFAULT 'Draft',
            plan_id         INTEGER,
            preventive_id   INTEGER,
            subtotal        REAL DEFAULT 0,
            created_at      TEXT
        );

        -- Invoice line items
        CREATE TABLE IF NOT EXISTS invoice_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_ref     TEXT REFERENCES invoices(ref) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            quantity        REAL DEFAULT 1,
            unit_price      REAL DEFAULT 0,
            discount        REAL DEFAULT 0,
            total           REAL DEFAULT 0
        );

        -- Counters (keep existing)
        CREATE TABLE IF NOT EXISTS counters (
            key   TEXT PRIMARY KEY,
            value INTEGER DEFAULT 1
        );
        INSERT OR IGNORE INTO counters(key,value) VALUES('invoice',1),('patient',10000);

        -- Keep checkins table from original schema
        CREATE TABLE IF NOT EXISTS checkins (
            id           TEXT PRIMARY KEY,
            patient_id   TEXT,
            patient_name TEXT,
            owner_name   TEXT,
            doctor       TEXT,
            date         TEXT,
            complaint    TEXT,
            subjective   TEXT,
            objective    TEXT,
            assessment   TEXT,
            plan         TEXT,
            procedures   TEXT,
            medications  TEXT,
            followup     TEXT,
            status       TEXT DEFAULT 'open',
            created_at   TEXT DEFAULT (datetime('now','localtime'))
        );
    """)
    conn.commit()
    print("✓ Schema created / verified")

    # ── 2. PET PARENTS ───────────────────────────────────────────────────────
    print("\n📥 Importing pet_parents…")
    df = pd.read_csv(CSV_DIR / "pet_parents.csv", on_bad_lines='skip', engine='python')
    inserted = 0
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT OR IGNORE INTO pet_parents(pet_parent_id, name, mobile_no, email_id, created_at)
                VALUES (?,?,?,?,?)
            """, (
                int(row['pet_parent_id']),
                clean(row['name']) or 'Unknown',
                clean(row['mobile_no']),
                clean(row['email_id']),
                clean(row['timestamp'])
            ))
            inserted += cur.rowcount
        except Exception as e:
            pass
    conn.commit()
    print(f"   ✓ {inserted:,} pet parents imported")

    # ── 3. PATIENTS ──────────────────────────────────────────────────────────
    print("\n📥 Importing patients…")
    df = pd.read_csv(CSV_DIR / "patients.csv", on_bad_lines='skip', engine='python')
    parents_map = {r['pet_parent_id']: r for _, r in pd.read_csv(CSV_DIR / "pet_parents.csv", on_bad_lines='skip', engine='python').iterrows()}
    inserted = 0
    for _, row in df.iterrows():
        pid = int(row['patient_id'])
        uid = f"PaCPC-{pid:05d}"
        parent = parents_map.get(row.get('pet_parent_id'))

        species = clean(row.get('species')) or ''
        if species == '0': species = 'Other'

        try:
            cur.execute("""
                INSERT OR IGNORE INTO patients(
                    id, patient_id, name, sex, type, breed, age, colour,
                    microchip_no, identify_mark, owner_name, phone, email,
                    pet_parent_id, status, created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                uid, pid,
                clean(row['name']) or 'Unknown',
                clean(row.get('sex')),
                species or None,
                clean(row.get('breed')),
                clean(row.get('age_dob')),
                clean(row.get('color')),
                clean(row.get('microchip_no')),
                clean(row.get('identify_mark')),
                clean(parent['name']) if parent is not None else None,
                clean(parent['mobile_no']) if parent is not None else None,
                clean(parent['email_id']) if parent is not None else None,
                int(row['pet_parent_id']) if pd.notna(row.get('pet_parent_id')) else None,
                clean(row.get('status')),
                clean(row.get('timestamp'))
            ))
            inserted += cur.rowcount
        except Exception as e:
            pass
    conn.commit()
    print(f"   ✓ {inserted:,} patients imported")

    # ── 4. SOAP SUBJECTIVE ───────────────────────────────────────────────────
    print("\n📥 Importing SOAP Subjective…")
    df = pd.read_csv(CSV_DIR / "subjective.csv", on_bad_lines='skip', engine='python')
    inserted = 0
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT OR IGNORE INTO soap_subjective(
                    subject_id, patient_id, addnotes, appetite, attitude,
                    drinking, notice, pooping, urinating, chief_complaint, duration, created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                int(row['subject_id']),
                int(row['patient_id']),
                clean(row.get('addnotes')),
                clean(row.get('appetite')),
                clean(row.get('attid')),
                clean(row.get('drinking')),
                clean(row.get('notice')),
                clean(row.get('poopng')),
                clean(row.get('urnatng')),
                clean(row.get('cheifcom')),
                clean(row.get('duration')),
                clean(row.get('timestamp'))
            ))
            inserted += cur.rowcount
        except: pass
    conn.commit()
    print(f"   ✓ {inserted:,} subjective records imported")

    # ── 5. SOAP OBJECTIVE ────────────────────────────────────────────────────
    print("\n📥 Importing SOAP Objective (vitals)…")
    df = pd.read_csv(CSV_DIR / "objective.csv", on_bad_lines='skip', engine='python')
    inserted = 0
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT OR IGNORE INTO soap_objective(
                    objective_id, patient_id, temp, pulse, resprate, weight,
                    mucmemb, lymnodes, hydration, crt, bcs, visual_exam, created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                int(row['objective_id']),
                int(row['patient_id']),
                clean(row.get('temp')),
                clean(row.get('pulse')),
                clean(row.get('resprate')),
                clean(row.get('weight')),
                clean(row.get('mucmemb')),
                clean(row.get('lymnodes')),
                clean(row.get('hydration')),
                clean(row.get('crt')),
                clean(row.get('bcs')),
                clean(row.get('visual_exam')),
                clean(row.get('timestamp'))
            ))
            inserted += cur.rowcount
        except: pass
    conn.commit()
    print(f"   ✓ {inserted:,} objective/vitals records imported")

    # ── 6. SOAP ASSESSMENT ───────────────────────────────────────────────────
    print("\n📥 Importing SOAP Assessment…")
    df = pd.read_csv(CSV_DIR / "assessment.csv", on_bad_lines='skip', engine='python')
    inserted = 0
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT OR IGNORE INTO soap_assessment(assess_id, patient_id, diagnosis, created_at)
                VALUES(?,?,?,?)
            """, (
                int(row['assess_id']),
                int(row['patient_id']),
                clean(row.get('diagnosis')),
                clean(row.get('timestamp'))
            ))
            inserted += cur.rowcount
        except: pass
    conn.commit()
    print(f"   ✓ {inserted:,} assessment records imported")

    # ── 7. SOAP PLAN ─────────────────────────────────────────────────────────
    print("\n📥 Importing SOAP Plan…")
    df = pd.read_csv(CSV_DIR / "plan.csv", on_bad_lines='skip', engine='python')
    inserted = 0
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT OR IGNORE INTO soap_plan(plan_id, patient_id, plan, created_at)
                VALUES(?,?,?,?)
            """, (
                int(row['plan_id']),
                int(row['patient_id']),
                clean(row.get('plan')),
                clean(row.get('timestamp'))
            ))
            inserted += cur.rowcount
        except: pass
    conn.commit()
    print(f"   ✓ {inserted:,} plan records imported")

    # ── 8. RECORDS (visit links) ──────────────────────────────────────────────
    print("\n📥 Importing Visit Records…")
    df = pd.read_csv(CSV_DIR / "records.csv", on_bad_lines='skip', engine='python')
    inserted = 0
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT OR IGNORE INTO records(
                    record_id, patient_id, subject_id, objective_id,
                    assess_id, plan_id, prescription_id, user_id, created_at)
                VALUES(?,?,?,?,?,?,?,?,?)
            """, (
                int(row['record_id']),
                int(row['patient_id']),
                int(row['subject_id']) if pd.notna(row.get('subject_id')) else None,
                int(row['objective_id']) if pd.notna(row.get('objective_id')) else None,
                int(row['assess_id']) if pd.notna(row.get('assess_id')) else None,
                int(row['plan_id']) if pd.notna(row.get('plan_id')) else None,
                int(row['prescription_id']) if pd.notna(row.get('prescription_id')) else None,
                int(row['user_id']) if pd.notna(row.get('user_id')) else None,
                clean(row.get('timestamp'))
            ))
            inserted += cur.rowcount
        except: pass
    conn.commit()
    print(f"   ✓ {inserted:,} visit records imported")

    # ── 9. PRESCRIPTIONS ─────────────────────────────────────────────────────
    print("\n📥 Importing Prescriptions…")
    df = pd.read_csv(CSV_DIR / "prescription.csv", on_bad_lines='skip', engine='python')
    # Fix duplicate column name 'prescription_id'
    df.columns = [f"{c}_{i}" if list(df.columns).count(c) > 1 and i > 0 else c
                  for i, c in enumerate(df.columns)]
    inserted = 0
    for _, row in df.iterrows():
        try:
            pres_col = 'prescription_id' if 'prescription_id' in row else df.columns[9]
            cur.execute("""
                INSERT OR IGNORE INTO prescriptions(
                    presmeds_id, patient_id, prescription_id, med_name, prefix,
                    quantity, quantity_type, duration, duration_type, frequency, instruction, created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                int(row['presmeds_id']),
                int(row['patient_id']),
                int(row[df.columns[9]]) if pd.notna(row[df.columns[9]]) else None,
                clean(row.get('med_name')),
                clean(row.get('prefix')),
                clean(row.get('quan')),
                clean(row.get('quan_type')),
                clean(row.get('dur')),
                clean(row.get('dur_type')),
                clean(row.get('freq')),
                clean(row.get('instruction')),
                clean(row.get('timestamp'))
            ))
            inserted += cur.rowcount
        except: pass
    conn.commit()
    print(f"   ✓ {inserted:,} prescription items imported")

    # ── 10. VACCINATIONS ─────────────────────────────────────────────────────
    print("\n📥 Importing Vaccinations…")
    df = pd.read_csv(CSV_DIR / "vaccinations.csv", on_bad_lines='skip', engine='python')
    inserted = 0
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT OR IGNORE INTO vaccinations(
                    pchistory_id, preventive_id, patient_id, date, age,
                    veterinarian, type_care, treatment, created_at)
                VALUES(?,?,?,?,?,?,?,?,?)
            """, (
                int(row['pchistory_id']),
                int(row['preventive_id']),
                int(row['patient_id']),
                clean(row.get('date')),
                clean(row.get('age')),
                clean(row.get('veterinarian')),
                clean(row.get('type_care')),
                clean(row.get('treatment')),
                clean(row.get('timestamp'))
            ))
            inserted += cur.rowcount
        except: pass
    conn.commit()
    print(f"   ✓ {inserted:,} vaccination records imported")

    # ── 11. INVOICES ─────────────────────────────────────────────────────────
    print("\n📥 Importing Invoices…")
    df = pd.read_csv(CSV_DIR / "Invoices.csv", on_bad_lines='skip', engine='python')

    # Build patient lookup: patient_id -> name, type, pet_parent_id
    pat_lookup = {}
    for _, row in pd.read_csv(CSV_DIR / "patients.csv", on_bad_lines='skip', engine='python').iterrows():
        pat_lookup[int(row['patient_id'])] = {
            'name': clean(row.get('name')) or '',
            'type': clean(row.get('species')) or '',
            'pet_parent_id': int(row['pet_parent_id']) if pd.notna(row.get('pet_parent_id')) else None
        }

    # Normalize payment method
    method_map = {
        'cash': 'Cash', 'debit card': 'Card', 'credit card': 'Card',
        'googlepay': 'UPI', 'paytm': 'UPI', 'upi': 'UPI',
        'neft': 'Bank Transfer', 'imps': 'Bank Transfer', 'rtgs': 'Bank Transfer',
        'cheque': 'Cheque', 'credits': 'Credits'
    }

    inserted = 0
    for _, row in df.iterrows():
        try:
            pid = int(row['patient_id']) if pd.notna(row.get('patient_id')) else None
            pat = pat_lookup.get(pid, {})
            ppid = int(row['pet_parent_id']) if pd.notna(row.get('pet_parent_id')) else None
            parent = parents_map.get(ppid)

            pt = clean(row.get('payment_type')) or ''
            method = method_map.get(pt.lower(), pt) if pt else None

            total = float(row['total']) if pd.notna(row.get('total')) else 0
            disc  = float(row['final_discount']) if pd.notna(row.get('final_discount')) else 0
            status = clean(row.get('status')) or 'Draft'
            paid_amt = total if status == 'Paid' else 0
            balance  = 0 if status == 'Paid' else total

            ref = clean(row.get('ref'))
            if not ref: continue

            cur.execute("""
                INSERT OR IGNORE INTO invoices(
                    ref, invoice_id, date, patient_id, patient_name, patient_type,
                    owner_name, phone, pet_parent_id, payment_type, method,
                    discount, total, paid_amount, balance, status,
                    plan_id, preventive_id, subtotal, created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                ref,
                int(row['invoice_id']),
                clean(row.get('date')),
                pid,
                pat.get('name', ''),
                pat.get('type', ''),
                clean(parent['name']) if parent is not None else None,
                clean(parent['mobile_no']) if parent is not None else None,
                ppid,
                pt or None,
                method,
                disc,
                total,
                paid_amt,
                balance,
                status,
                int(row['plan_id']) if pd.notna(row.get('plan_id')) else None,
                int(row['preventive_id']) if pd.notna(row.get('preventive_id')) else None,
                total + disc,
                clean(row.get('timestamp'))
            ))
            if cur.rowcount:
                # Add a default line item for the invoice total
                cur.execute("""
                    INSERT INTO invoice_items(invoice_ref, name, quantity, unit_price, discount, total)
                    VALUES(?,?,?,?,?,?)
                """, (ref, 'Consultation / Treatment', 1, total + disc, disc, total))
            inserted += cur.rowcount
        except Exception as e:
            pass

    conn.commit()
    print(f"   ✓ {inserted:,} invoices imported")

    # ── 12. UPDATE COUNTERS ───────────────────────────────────────────────────
    max_pat = cur.execute("SELECT MAX(patient_id) FROM patients").fetchone()[0] or 10000
    cur.execute("UPDATE counters SET value=? WHERE key='patient'", (max_pat + 1,))

    max_inv_num = cur.execute("""
        SELECT MAX(CAST(REPLACE(SUBSTR(ref, INSTR(ref,'-')+5), '-', '') AS INTEGER))
        FROM invoices WHERE ref LIKE 'IN:%'
    """).fetchone()[0] or 0
    cur.execute("UPDATE counters SET value=? WHERE key='invoice'", (max_inv_num + 1,))

    conn.commit()

    # ── 13. SUMMARY ──────────────────────────────────────────────────────────
    print("\n" + "─"*50)
    print("📊 IMPORT SUMMARY")
    print("─"*50)
    for table in ['pet_parents','patients','soap_subjective','soap_objective',
                  'soap_assessment','soap_plan','records','prescriptions',
                  'vaccinations','invoices','invoice_items']:
        count = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"   {table:<22} {count:>8,} rows")

    conn.close()
    print("\n✅ All data imported successfully into clinic.db\n")

if __name__ == '__main__':
    run()
