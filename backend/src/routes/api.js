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

router.delete("/devices/:id", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/devices/delete", {
    id: req.params.id,
  });

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

router.delete("/soil/:id", (req, res) => {
  if (!isEspOnline(req.login)) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp(req.login, "home/esp32/soil/delete", {
    id: req.params.id,
  });

  res.json({ ok: true });
});



module.exports = router;