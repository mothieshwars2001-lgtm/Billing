# 🐾 Paws & Claws Pet Clinic — Management System

A full-stack clinic management system with **SQLite database**, REST API, and web frontend.

---

## 📁 Project Structure

```
pawsclaws/
├── server.js          ← Express REST API server
├── db.js              ← SQLite database schema & queries
├── package.json       ← Node.js dependencies
├── clinic.db          ← SQLite database (auto-created on first run)
└── public/
    └── index.html     ← Frontend web app
```

---

## 🚀 Setup & Run

### 1. Install Node.js
Download from https://nodejs.org (v18+ recommended)

### 2. Install dependencies
```bash
cd pawsclaws
npm install
```

### 3. Start the server
```bash
node server.js
```

### 4. Open in browser
Navigate to: **http://localhost:3000**

---

## 🗄️ Database (SQLite)

The database file `clinic.db` is automatically created on first run.

### Tables
| Table           | Description                              |
|-----------------|------------------------------------------|
| `patients`      | Pet + owner details                      |
| `checkins`      | SOAP notes & visit records               |
| `invoices`      | Billing invoices                         |
| `invoice_items` | Line items per invoice                   |
| `counters`      | Auto-increment counters for IDs          |

### View/Edit the database
Use **DB Browser for SQLite** (free): https://sqlitebrowser.org

---

## 🔌 REST API Endpoints

### Patients
| Method | Endpoint              | Description              |
|--------|-----------------------|--------------------------|
| GET    | /api/patients         | List all (supports ?q=)  |
| GET    | /api/patients/:id     | Get single patient       |
| POST   | /api/patients         | Create patient           |
| PUT    | /api/patients/:id     | Update patient           |
| DELETE | /api/patients/:id     | Delete patient           |

### Check-ins / SOAP
| Method | Endpoint                     | Description          |
|--------|------------------------------|----------------------|
| GET    | /api/checkins                | List all             |
| POST   | /api/checkins                | Create check-in      |
| PATCH  | /api/checkins/:id/status     | Update status        |
| DELETE | /api/checkins/:id            | Delete               |

### Invoices
| Method | Endpoint                      | Description          |
|--------|-------------------------------|----------------------|
| GET    | /api/invoices                 | List (filter/sort)   |
| GET    | /api/invoices/:ref            | Get with line items  |
| POST   | /api/invoices                 | Create invoice       |
| PATCH  | /api/invoices/:ref/status     | Update status        |
| DELETE | /api/invoices/:ref            | Delete               |

### Stats
| Method | Endpoint    | Description           |
|--------|-------------|-----------------------|
| GET    | /api/stats  | Dashboard aggregates  |

---

## 💾 Backup

Simply copy `clinic.db` to back up all your data.

---

## 🌐 Deploy to a Server (optional)

To access from multiple devices on your network:

```bash
# Find your local IP
ipconfig   # Windows
ifconfig   # Mac/Linux

# Then open http://YOUR_IP:3000 from any device on the same network
```

For cloud deployment, use services like Railway, Render, or a VPS.
