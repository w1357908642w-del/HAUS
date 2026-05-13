DROP TABLE IF EXISTS managed_devices;
DROP TABLE IF EXISTS sensor_data;
DROP TABLE IF EXISTS soil_sensors;

CREATE TABLE sensor_data (
  id SERIAL PRIMARY KEY,
  device_login TEXT NOT NULL,
  esp_device_id TEXT NOT NULL,
  temperature REAL,
  humidity REAL,
  pressure REAL,
  soil_percent INTEGER,
  rtc_time TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE managed_devices (
  id SERIAL PRIMARY KEY,
  device_login TEXT NOT NULL,
  esp_device_id TEXT NOT NULL,
  managed_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  state TEXT DEFAULT 'OFF',
  mode TEXT DEFAULT 'AUTO',
  turn_on_time TEXT,
  turn_off_time TEXT,
  last_turn_on_date TEXT,
  repeat_every_days INTEGER DEFAULT 1,
  pin INTEGER,
  active_high BOOLEAN,
  ip TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(device_login, esp_device_id, managed_id)
);

CREATE TABLE soil_sensors (
  id SERIAL PRIMARY KEY,
  device_login TEXT NOT NULL,
  esp_device_id TEXT NOT NULL,
  sensor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pin INTEGER NOT NULL,
  raw_value INTEGER,
  percent_value INTEGER,
  dry_value INTEGER,
  wet_value INTEGER,
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(device_login, esp_device_id, sensor_id)
);