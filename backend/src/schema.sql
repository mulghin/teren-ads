-- Teren Ads — DB Schema

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT
);

INSERT INTO settings (key, value) VALUES
  ('source_url', ''),
  ('icecast_host', 'localhost'),
  ('icecast_port', '8000'),
  ('icecast_source_password', 'hackme'),
  ('tone_start_hz', '17500'),
  ('tone_stop_hz', '18500'),
  ('tone_duration_ms', '500'),
  ('tone_detection_enabled', 'true'),
  ('default_crossfade_sec', '3')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS regions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  icecast_mount VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'stopped',
  crossfade_sec INT DEFAULT 3,
  return_mode VARCHAR(20) DEFAULT 'signal',
  return_timer_sec INT DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) DEFAULT 'ad',
  shuffle BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id SERIAL PRIMARY KEY,
  playlist_id INT REFERENCES playlists(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  filepath VARCHAR(500) NOT NULL,
  duration_sec FLOAT DEFAULT 0,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS region_assignments (
  id SERIAL PRIMARY KEY,
  region_id INT REFERENCES regions(id) ON DELETE CASCADE,
  playlist_id INT REFERENCES playlists(id) ON DELETE CASCADE,
  filler_playlist_id INT REFERENCES playlists(id) ON DELETE SET NULL,
  priority INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  region_id INT REFERENCES regions(id) ON DELETE CASCADE,
  playlist_id INT REFERENCES playlists(id) ON DELETE CASCADE,
  days VARCHAR(50) DEFAULT 'all',
  times TEXT DEFAULT '[]',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_logs (
  id SERIAL PRIMARY KEY,
  region_id INT REFERENCES regions(id) ON DELETE SET NULL,
  playlist_id INT,
  trigger_type VARCHAR(20),
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT NOW(),
  level VARCHAR(10) NOT NULL,
  region_id INT REFERENCES regions(id) ON DELETE SET NULL,
  region_name VARCHAR(100),
  message TEXT NOT NULL
);

-- Per-region playlists (nullable = global playlist)
DO $$ BEGIN
  ALTER TABLE playlists ADD COLUMN region_id INTEGER REFERENCES regions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Time-window schedule: when tone fires near this time → use this playlist
CREATE TABLE IF NOT EXISTS region_schedules (
  id SERIAL PRIMARY KEY,
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  time_hhmm TEXT NOT NULL,
  tolerance_minutes INTEGER NOT NULL DEFAULT 10,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  filler_playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
  days TEXT NOT NULL DEFAULT '1234567',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
