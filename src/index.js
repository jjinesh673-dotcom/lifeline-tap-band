const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json;charset=UTF-8", "cache-control": "no-store" }
});

function hashText(text) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(buf =>
    [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("")
  );
}

async function getBand(env, id) {
  if (!env.DB) return null;
  return env.DB.prepare("SELECT * FROM bands WHERE id = ?").bind(id).first();
}

async function handleApi(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/band") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing band id" }, 400);
    const band = await getBand(env, id);
    if (!band) return json({ exists: false });
    const contacts = await env.DB.prepare("SELECT id,name,relationship,phone FROM emergency_contacts WHERE band_id = ? ORDER BY id").bind(id).all();
    return json({ exists: true, activated: !!band.activated, band: { id: band.id, owner_name: band.owner_name, blood_group: band.blood_group, allergies: band.allergies, conditions: band.conditions, medications: band.medications, medical_notes: band.medical_notes, doctor_info: band.doctor_info, home_location: band.show_location ? band.home_location : null, show_location: !!band.show_location }, contacts: contacts.results || [] });
  }

  if (request.method === "POST" && url.pathname === "/api/activate") {
    if (!env.DB) return json({ error: "D1 is not connected yet." }, 503);
    const body = await request.json();
    const id = String(body.bandId || "").trim();
    const activationCode = String(body.activationCode || "").trim();
    const ownerName = String(body.ownerName || "").trim();
    const pin = String(body.pin || "");
    if (!id || !activationCode || !ownerName || !/^\d{6,}$/.test(pin)) return json({ error: "Band confirmation, activation code, name and a 6+ digit PIN are required." }, 400);
    const band = await getBand(env, id);
    if (!band) return json({ error: "Band not found." }, 404);
    if (band.activated) return json({ error: "This band is already activated." }, 409);
    if (!band.activation_code_hash) return json({ error: "This band has not been securely provisioned yet." }, 503);
    const activationHash = await hashText(activationCode);
    if (activationHash !== band.activation_code_hash) return json({ error: "Invalid activation code." }, 403);
    const pinHash = await hashText(pin);
    await env.DB.prepare(`UPDATE bands SET activated=1,owner_name=?,blood_group=?,allergies=?,conditions=?,medications=?,medical_notes=?,doctor_info=?,home_location=?,show_location=?,vault_pin_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(ownerName, body.bloodGroup || "", body.allergies || "", body.conditions || "", body.medications || "", body.medicalNotes || "", body.doctorInfo || "", body.homeLocation || "", body.showLocation ? 1 : 0, pinHash, id).run();
    await env.DB.prepare("DELETE FROM emergency_contacts WHERE band_id = ?").bind(id).run();
    for (const c of Array.isArray(body.contacts) ? body.contacts.slice(0, 5) : []) {
      if (c.name && c.phone) await env.DB.prepare("INSERT INTO emergency_contacts (band_id,name,relationship,phone) VALUES (?,?,?,?)").bind(id, String(c.name), String(c.relationship || ""), String(c.phone)).run();
    }
    return json({ ok: true, permanentUrl: `${url.origin}/b/${encodeURIComponent(id)}` });
  }

  if (request.method === "POST" && url.pathname === "/api/vault/unlock") {
    if (!env.DB) return json({ error: "D1 is not connected yet." }, 503);
    const body = await request.json();
    const band = await getBand(env, String(body.bandId || ""));
    if (!band || !band.activated) return json({ error: "Band is not activated." }, 404);
    const pinHash = await hashText(String(body.pin || ""));
    if (!band.vault_pin_hash || pinHash !== band.vault_pin_hash) return json({ error: "Incorrect PIN." }, 403);
    const docs = await env.DB.prepare("SELECT id,category,title,document_number,notes,created_at,updated_at FROM vault_items WHERE band_id = ? ORDER BY category,title").bind(band.id).all();
    const files = await env.DB.prepare("SELECT id,title,category,mime_type,file_size,created_at FROM vault_files WHERE band_id = ? ORDER BY created_at DESC").bind(band.id).all();
    return json({ ok: true, documents: docs.results || [], files: files.results || [] });
  }

  if (request.method === "POST" && url.pathname === "/api/vault/item") {
    if (!env.DB) return json({ error: "D1 is not connected yet." }, 503);
    const body = await request.json();
    const band = await getBand(env, String(body.bandId || ""));
    if (!band || !band.activated) return json({ error: "Band is not activated." }, 404);
    const pinHash = await hashText(String(body.pin || ""));
    if (!band.vault_pin_hash || pinHash !== band.vault_pin_hash) return json({ error: "Incorrect PIN." }, 403);
    const category = String(body.category || "Other").trim().slice(0, 80);
    const title = String(body.title || "").trim().slice(0, 120);
    if (!title) return json({ error: "Title is required." }, 400);
    await env.DB.prepare("INSERT INTO vault_items (band_id,category,title,document_number,notes) VALUES (?,?,?,?,?)")
      .bind(band.id, category, title, String(body.documentNumber || "").trim().slice(0, 120), String(body.notes || "").trim().slice(0, 1000)).run();
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/vault/file") {
    if (!env.DB) return json({ error: "D1 is not connected yet." }, 503);
    const body = await request.json();
    const band = await getBand(env, String(body.bandId || ""));
    if (!band || !band.activated) return json({ error: "Band is not activated." }, 404);
    const pinHash = await hashText(String(body.pin || ""));
    if (!band.vault_pin_hash || pinHash !== band.vault_pin_hash) return json({ error: "Incorrect PIN." }, 403);
    const title = String(body.title || "File").trim().slice(0, 120);
    const category = String(body.category || "Personal Data").trim().slice(0, 80);
    const mimeType = String(body.mimeType || "application/octet-stream").slice(0, 120);
    const fileData = String(body.fileData || "");
    const fileSize = Number(body.fileSize || 0);
    if (!fileData || !fileSize) return json({ error: "File data is required." }, 400);
    if (fileSize > 300000) return json({ error: "Prototype upload limit is 300 KB per file." }, 413);
    if (fileData.length > 450000) return json({ error: "This file is too large for the prototype storage layer." }, 413);
    await env.DB.prepare("INSERT INTO vault_files (band_id,title,category,mime_type,file_size,file_data) VALUES (?,?,?,?,?,?)")
      .bind(band.id, title, category, mimeType, fileSize, fileData).run();
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/vault/file") {
    if (!env.DB) return json({ error: "D1 is not connected yet." }, 503);
    const id = url.searchParams.get("id");
    const pin = url.searchParams.get("pin") || "";
    if (!id || !pin) return json({ error: "Missing file id or PIN." }, 400);
    const file = await env.DB.prepare("SELECT * FROM vault_files WHERE id = ?").bind(id).first();
    if (!file) return json({ error: "File not found." }, 404);
    const band = await getBand(env, file.band_id);
    if (!band || !band.activated) return json({ error: "Band is not activated." }, 404);
    const pinHash = await hashText(pin);
    if (!band.vault_pin_hash || pinHash !== band.vault_pin_hash) return json({ error: "Incorrect PIN." }, 403);
    const bytes = Uint8Array.from(atob(file.file_data), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { "content-type": file.mime_type, "content-disposition": `inline; filename="${encodeURIComponent(file.title)}"`, "cache-control": "no-store" } });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request, env, url); }
      catch (e) { return json({ error: "Server error", detail: e?.message || "Unknown error" }, 500); }
    }
    if (url.pathname === "/health") return json({ ok: true, service: "lifeline-tap-band" });

    // Cloudflare Assets serves files by exact path. Our frontend is a single-page
    // app, so /a/<bandId> and /b/<bandId> must both serve public/index.html.
    // The browser-side app then reads the pathname and loads the correct band.
    if (url.pathname.startsWith("/a/") || url.pathname.startsWith("/b/")) {
      const indexUrl = new URL("/", request.url);
      return env.ASSETS.fetch(new Request(indexUrl, request));
    }

    return env.ASSETS.fetch(request);
  }
};
