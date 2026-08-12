import db from "./db";

const publicDir = `${import.meta.dir}/public`;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const POSITIONS = ["front-left", "front-right", "rear-left", "rear-right", "spare"];
const STATUSES = ["good", "monitor", "replace"];

// --- Query helpers -------------------------------------------------------
const listVehicles = db.query("SELECT * FROM vehicles ORDER BY created_at DESC, id DESC");
const getVehicle = db.query("SELECT * FROM vehicles WHERE id = ?");
const listTiresFor = db.query("SELECT * FROM tires WHERE vehicle_id = ? ORDER BY id");
const getTire = db.query("SELECT * FROM tires WHERE id = ?");

function tireStatus(t: any): string {
  // Auto-derive a status if none given, based on tread depth (mm).
  if (t.status && STATUSES.includes(t.status)) return t.status;
  const mm = Number(t.tread_mm);
  if (!mm && mm !== 0) return "good";
  if (mm <= 3.2) return "replace";
  if (mm <= 4.5) return "monitor";
  return "good";
}

async function handleApi(req: Request, path: string): Promise<Response> {
  const method = req.method;
  const parts = path.split("/").filter(Boolean); // ["api", ...]

  // /api/vehicles
  if (parts.length === 2 && parts[1] === "vehicles") {
    if (method === "GET") {
      const vehicles = listVehicles.all() as any[];
      const withTires = vehicles.map((v) => ({
        ...v,
        tires: listTiresFor.all(v.id),
      }));
      return json(withTires);
    }
    if (method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!b.name || !String(b.name).trim())
        return json({ error: "Vehicle name is required" }, 400);
      const row = db
        .query(
          "INSERT INTO vehicles (name, make, model, year, plate) VALUES (?, ?, ?, ?, ?) RETURNING *"
        )
        .get(
          String(b.name).trim(),
          b.make ?? "",
          b.model ?? "",
          b.year ?? "",
          b.plate ?? ""
        );
      return json(row, 201);
    }
  }

  // /api/vehicles/:id
  if (parts.length === 3 && parts[1] === "vehicles") {
    const id = Number(parts[2]);
    const existing = getVehicle.get(id);
    if (!existing) return json({ error: "Vehicle not found" }, 404);

    if (method === "PUT") {
      const b = await req.json().catch(() => ({}));
      const row = db
        .query(
          "UPDATE vehicles SET name = ?, make = ?, model = ?, year = ?, plate = ? WHERE id = ? RETURNING *"
        )
        .get(
          String(b.name ?? (existing as any).name).trim(),
          b.make ?? (existing as any).make,
          b.model ?? (existing as any).model,
          b.year ?? (existing as any).year,
          b.plate ?? (existing as any).plate,
          id
        );
      return json(row);
    }
    if (method === "DELETE") {
      db.query("DELETE FROM vehicles WHERE id = ?").run(id);
      return json({ ok: true });
    }
  }

  // /api/tires
  if (parts.length === 2 && parts[1] === "tires" && method === "POST") {
    const b = await req.json().catch(() => ({}));
    if (!getVehicle.get(Number(b.vehicle_id)))
      return json({ error: "Valid vehicle_id is required" }, 400);
    if (!POSITIONS.includes(b.position))
      return json({ error: "Invalid tire position" }, 400);
    const status = b.status && STATUSES.includes(b.status) ? b.status : tireStatus(b);
    const row = db
      .query(
        `INSERT INTO tires (vehicle_id, position, brand, model, size, install_date, install_mileage, current_mileage, pressure_psi, target_psi, tread_mm, status, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING *`
      )
      .get(
        Number(b.vehicle_id),
        b.position,
        b.brand ?? "",
        b.model ?? "",
        b.size ?? "",
        b.install_date ?? "",
        num(b.install_mileage),
        num(b.current_mileage),
        num(b.pressure_psi),
        num(b.target_psi),
        num(b.tread_mm),
        status,
        b.notes ?? ""
      );
    return json(row, 201);
  }

  // /api/tires/:id
  if (parts.length === 3 && parts[1] === "tires") {
    const id = Number(parts[2]);
    const existing = getTire.get(id) as any;
    if (!existing) return json({ error: "Tire not found" }, 404);

    if (method === "PUT") {
      const b = await req.json().catch(() => ({}));
      const merged = { ...existing, ...b };
      const status =
        b.status && STATUSES.includes(b.status) ? b.status : tireStatus(merged);
      const row = db
        .query(
          `UPDATE tires SET position = ?, brand = ?, model = ?, size = ?, install_date = ?, install_mileage = ?, current_mileage = ?, pressure_psi = ?, target_psi = ?, tread_mm = ?, status = ?, notes = ?, updated_at = datetime('now')
           WHERE id = ? RETURNING *`
        )
        .get(
          POSITIONS.includes(merged.position) ? merged.position : existing.position,
          merged.brand ?? "",
          merged.model ?? "",
          merged.size ?? "",
          merged.install_date ?? "",
          num(merged.install_mileage),
          num(merged.current_mileage),
          num(merged.pressure_psi),
          num(merged.target_psi),
          num(merged.tread_mm),
          status,
          merged.notes ?? "",
          id
        );
      return json(row);
    }
    if (method === "DELETE") {
      db.query("DELETE FROM tires WHERE id = ?").run(id);
      return json({ ok: true });
    }
  }

  return json({ error: "Not found" }, 404);
}

function num(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default {
  port: process.env.PORT || 3000,
  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, pathname);
      } catch (err) {
        console.error(err);
        return json({ error: "Server error" }, 500);
      }
    }

    // Static files
    const rel = pathname === "/" ? "/index.html" : pathname;
    const file = Bun.file(`${publicDir}${rel}`);
    if (await file.exists()) return new Response(file);
    // SPA fallback
    return new Response(Bun.file(`${publicDir}/index.html`));
  },
};
