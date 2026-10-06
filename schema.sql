CREATE TABLE IF NOT EXISTS bands (
  id TEXT PRIMARY KEY,
  activation_code_hash TEXT,
  activated INTEGER NOT NULL DEFAULT 0,
  owner_name TEXT,
  blood_group TEXT,
  allergies TEXT,
  conditions TEXT,
  medications TEXT,
  medical_notes TEXT,
  doctor_info TEXT,
  home_location TEXT,
  show_location INTEGER NOT NULL DEFAULT 0,
  vault_pin_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  band_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT NOT NULL,
  FOREIGN KEY (band_id) REFERENCES bands(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacts_band ON emergency_contacts(band_id);

CREATE TABLE IF NOT EXISTS vault_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  band_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  document_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (band_id) REFERENCES bands(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vault_items_band ON vault_items(band_id);
