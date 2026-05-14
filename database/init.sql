DROP TABLE IF EXISTS device_events;
DROP TABLE IF EXISTS soil_readings;
DROP TABLE IF EXISTS sensor_data;
DROP TABLE IF EXISTS managed_devices;
DROP TABLE IF EXISTS soil_sensors;

CREATE TABLE sensor_data (
  id BIGSERIAL PRIMARY KEY,
  device_login TEXT NOT NULL,
  esp_device_id TEXT NOT NULL,
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  pressure DOUBLE PRECISION,
  rtc_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE soil_sensors (
  id BIGSERIAL PRIMARY KEY,
  device_login TEXT NOT NULL,
  esp_device_id TEXT NOT NULL,
  sensor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pin INTEGER,
  raw_value INTEGER,
  percent_value DOUBLE PRECISION,
  dry_value INTEGER,
  wet_value INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_login, esp_device_id, sensor_id)
);

CREATE TABLE soil_readings (
  id BIGSERIAL PRIMARY KEY,
  soil_sensor_db_id BIGINT NOT NULL REFERENCES soil_sensors(id) ON DELETE CASCADE,
  raw_value INTEGER,
  percent_value DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE managed_devices (
  id BIGSERIAL PRIMARY KEY,
  device_login TEXT NOT NULL,
  esp_device_id TEXT NOT NULL,
  managed_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  state TEXT NOT NULL DEFAULT 'OFF',
  mode TEXT,
  turn_on_time TEXT,
  turn_off_time TEXT,
  last_turn_on_date TEXT,
  repeat_every_days INTEGER,
  pin INTEGER,
  active_high BOOLEAN,
  ip TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_login, esp_device_id, managed_id)
);

CREATE TABLE device_events (
  id BIGSERIAL PRIMARY KEY,
  managed_device_db_id BIGINT NOT NULL REFERENCES managed_devices(id) ON DELETE CASCADE,
  previous_state TEXT,
  new_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensor_data_login_time ON sensor_data(device_login, created_at DESC);
CREATE INDEX idx_soil_sensors_login ON soil_sensors(device_login, sensor_id);
CREATE INDEX idx_soil_readings_sensor_time ON soil_readings(soil_sensor_db_id, created_at DESC);
CREATE INDEX idx_managed_devices_login ON managed_devices(device_login, managed_id);
CREATE INDEX idx_device_events_device_time ON device_events(managed_device_db_id, created_at DESC);