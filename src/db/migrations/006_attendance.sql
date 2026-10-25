CREATE TABLE IF NOT EXISTS staff_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL CHECK(start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time TEXT NOT NULL CHECK(end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, day_of_week),
  CHECK(end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_staff_schedules_user_active
ON staff_schedules(user_id, active, day_of_week);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attendance_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL CHECK(status IN ('Presente', 'Tarde', 'Ausente', 'Permiso', 'Incapacidad')),
  justification TEXT,
  registered_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, attendance_date),
  CHECK(check_out IS NULL OR check_in IS NOT NULL),
  CHECK(check_out IS NULL OR check_out >= check_in)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date_status
ON attendance_records(attendance_date, status);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date
ON attendance_records(user_id, attendance_date);
