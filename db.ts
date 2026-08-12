import Database from "bun:sqlite";

const db = new Database(process.env.DATABASE_URL || "./data/app.db");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    make TEXT DEFAULT '',
    model TEXT DEFAULT '',
    year TEXT DEFAULT '',
    plate TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    position TEXT NOT NULL,
    brand TEXT DEFAULT '',
    model TEXT DEFAULT '',
    size TEXT DEFAULT '',
    install_date TEXT DEFAULT '',
    install_mileage INTEGER,
    current_mileage INTEGER,
    pressure_psi REAL,
    target_psi REAL,
    tread_mm REAL,
    status TEXT NOT NULL DEFAULT 'good',
    notes TEXT DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed a sample vehicle with a full set of tires on first run so the app
// never opens to a blank void.
const count = db.query("SELECT COUNT(*) AS n FROM vehicles").get() as { n: number };
if (count.n === 0) {
  const v = db
    .query(
      "INSERT INTO vehicles (name, make, model, year, plate) VALUES (?, ?, ?, ?, ?) RETURNING id"
    )
    .get("My Daily Driver", "Honda", "Civic", "2021", "8XYZ123") as { id: number };

  const seed = [
    ["front-left", "Michelin", "Pilot Sport 4S", "235/40R18", "2024-03-10", 21000, 34200, 34, 35, 6.5, "good"],
    ["front-right", "Michelin", "Pilot Sport 4S", "235/40R18", "2024-03-10", 21000, 34200, 33, 35, 6.2, "good"],
    ["rear-left", "Michelin", "Pilot Sport 4S", "235/40R18", "2024-03-10", 21000, 34200, 35, 35, 4.1, "monitor"],
    ["rear-right", "Michelin", "Pilot Sport 4S", "235/40R18", "2024-03-10", 21000, 34200, 30, 35, 3.2, "replace"],
    ["spare", "Continental", "TrueContact", "T135/70R18", "2021-01-01", 0, 34200, 58, 60, 7.5, "good"],
  ];
  const stmt = db.query(
    `INSERT INTO tires (vehicle_id, position, brand, model, size, install_date, install_mileage, current_mileage, pressure_psi, target_psi, tread_mm, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const t of seed) stmt.run(v.id, ...(t as any[]));
}

export default db;
