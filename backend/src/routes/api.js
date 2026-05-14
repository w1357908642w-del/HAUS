const express = require("express");
const router = express.Router();

const db = require("../db");
const { validCredentials, createToken, authMiddleware } = require("../auth");
const { publishToEsp, isEspOnline, getEspStatus } = require("../mqtt");


router.post("/login", (req, res) => {
  const { login, password } = req.body;

  if (!validCredentials(login, password)) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }

  res.json({ token: createToken(login) });
});

router.use(authMiddleware);

router.get("/dashboard", async (req, res) => {
  const soilSensors = await db.query(
    `
    SELECT *
    FROM soil_sensors
    WHERE device_login = $1
    ORDER BY sensor_id ASC
    `,
    [req.login]
  );

  const sensor = await db.query(
    `
    SELECT *
    FROM sensor_data
    WHERE device_login = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [req.login]
  );

  const devices = await db.query(
    `
    SELECT *
    FROM managed_devices
    WHERE device_login = $1
    ORDER BY managed_id ASC
    `,
    [req.login]
  );

  const status = getEspStatus(req.login);

  res.json({
    online: isEspOnline(req.login),
    last_seen: status.lastSeen,
    esp_device_id: status.espDeviceId,
    sensor: sensor.rows[0] || null,
    devices: devices.rows,
    soil_sensors: soilSensors.rows,
  });
});

router.get("/sensors", async (req, res) => {
  const result = await db.query(
    `
    SELECT *
    FROM sensor_data
    WHERE device_login = $1
    ORDER BY created_at DESC
    LIMIT 100
    `,
    [req.login]
  );

  res.json(result.rows);
});

router.get("/devices", async (req, res) => {
  const result = await db.query(
    `
    SELECT *
    FROM managed_devices
    WHERE device_login = $1
    ORDER BY managed_id ASC
    `,
    [req.login]
  );

  res.json(result.rows);
});

router.post("/devices/request-list", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/devices/request-list");

  res.json({ ok: true });
});

router.post("/devices", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/devices/create", {
    device: req.body,
  });

  res.json({ ok: true });
});

router.put("/devices/:id", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/devices/update", {
    device: {
      ...req.body,
      id: req.params.id,
    },
  });

  res.json({ ok: true });
});

router.delete("/devices/:id", async (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  const device = await db.query(
    `
    SELECT id, managed_id
    FROM managed_devices
    WHERE device_login = $1
      AND (id::text = $2 OR managed_id = $2)
    `,
    [req.login, req.params.id]
  );

  if (!device.rows.length) {
    return res.status(404).json({ error: "device not found" });
  }

  publishToEsp(req.login, "home/esp32/devices/delete", {
    id: device.rows[0].managed_id,
  });

  await db.query(
    `
    DELETE FROM managed_devices
    WHERE id = $1 AND device_login = $2
    `,
    [device.rows[0].id, req.login]
  );

  res.json({ ok: true });
});

router.post("/devices/:id/state", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/devices/set", {
    id: req.params.id,
    state: req.body.state,
  });

  res.json({ ok: true });
});

router.get("/soil", async (req, res) => {
  const result = await db.query(
    `
    SELECT *
    FROM soil_sensors
    WHERE device_login = $1
    ORDER BY sensor_id ASC
    `,
    [req.login]
  );

  res.json(result.rows);
});

router.post("/soil/request-list", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/soil/request-list");

  res.json({ ok: true });
});

router.post("/soil", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/soil/create", {
    sensor: req.body,
  });

  res.json({ ok: true });
});

router.put("/soil/:id", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/soil/update", {
    sensor: {
      ...req.body,
      id: req.params.id,
    },
  });

  res.json({ ok: true });
});

router.delete("/soil/:id", async (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  const sensor = await db.query(
    `
    SELECT id, sensor_id
    FROM soil_sensors
    WHERE device_login = $1
      AND (id::text = $2 OR sensor_id = $2)
    `,
    [req.login, req.params.id]
  );

  if (!sensor.rows.length) {
    return res.status(404).json({ error: "soil sensor not found" });
  }

  publishToEsp(req.login, "home/esp32/soil/delete", {
    id: sensor.rows[0].sensor_id,
  });

  await db.query(
    `
    DELETE FROM soil_sensors
    WHERE id = $1 AND device_login = $2
    `,
    [sensor.rows[0].id, req.login]
  );

  res.json({ ok: true });
});

router.get("/history/soil", async (req, res) => {
  const result = await db.query(
    `
    SELECT
      id,
      sensor_id,
      name,
      pin,
      raw_value,
      percent_value,
      dry_value,
      wet_value,
      updated_at
    FROM soil_sensors
    WHERE device_login = $1
    ORDER BY sensor_id ASC
    `,
    [req.login]
  );

  res.json(result.rows);
});

router.get("/history/soil/:id", async (req, res) => {
  const result = await db.query(
    `
    SELECT
      r.id,
      r.raw_value,
      r.percent_value,
      r.created_at
    FROM soil_readings r
    JOIN soil_sensors s ON s.id = r.soil_sensor_db_id
    WHERE s.id = $1
      AND s.device_login = $2
    ORDER BY r.created_at DESC
    LIMIT 300
    `,
    [req.params.id, req.login]
  );

  res.json(result.rows);
});

router.get("/history/devices", async (req, res) => {
  const result = await db.query(
    `
    SELECT
      id,
      managed_id,
      name,
      type,
      state,
      mode,
      updated_at
    FROM managed_devices
    WHERE device_login = $1
    ORDER BY managed_id ASC
    `,
    [req.login]
  );

  res.json(result.rows);
});

router.get("/history/devices/:id", async (req, res) => {
  const result = await db.query(
    `
    SELECT
      e.id,
      e.previous_state,
      e.new_state,
      e.created_at
    FROM device_events e
    JOIN managed_devices d ON d.id = e.managed_device_db_id
    WHERE d.id = $1
      AND d.device_login = $2
    ORDER BY e.created_at DESC
    LIMIT 300
    `,
    [req.params.id, req.login]
  );

  res.json(result.rows);
});

router.get("/history/climate", async (req, res) => {
  const result = await db.query(
    `
    SELECT
      id,
      temperature,
      humidity,
      pressure,
      rtc_time,
      created_at
    FROM sensor_data
    WHERE device_login = $1
    ORDER BY created_at DESC
    LIMIT 300
    `,
    [req.login]
  );

  res.json(result.rows);
});

module.exports = router;