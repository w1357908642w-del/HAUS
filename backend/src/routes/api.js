const express = require("express");
const router = express.Router();

const db = require("../db");
const { validCredentials, createToken, authMiddleware } = require("../auth");
const { publishToEsp, isEspOnline, deviceStatus } = require("../mqtt");

router.post("/login", (req, res) => {
  const { login, password } = req.body;

  if (!validCredentials(login, password)) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }

  res.json({
    token: createToken(login),
  });
});

router.use(authMiddleware);

router.get("/dashboard", async (req, res) => {
  const sensors = await db.query(
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
    ORDER BY updated_at DESC
    `,
    [req.login]
  );

  res.json({
    online: isEspOnline(),
    last_seen: deviceStatus.lastSeen,
    sensor: sensors.rows[0] || null,
    devices: devices.rows,
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
    ORDER BY updated_at DESC
    `,
    [req.login]
  );

  res.json(result.rows);
});

router.post("/devices/request-list", (req, res) => {
  if (!isEspOnline()) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp("home/esp32/devices/request-list", {});

  res.json({ ok: true });
});

router.post("/devices", (req, res) => {
  if (!isEspOnline()) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp("home/esp32/devices/create", {
    device: req.body,
  });

  res.json({ ok: true });
});

router.put("/devices/:id", (req, res) => {
  if (!isEspOnline()) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp("home/esp32/devices/update", {
    device: {
      ...req.body,
      id: req.params.id,
    },
  });

  res.json({ ok: true });
});

router.delete("/devices/:id", (req, res) => {
  if (!isEspOnline()) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp("home/esp32/devices/delete", {
    id: req.params.id,
  });

  res.json({ ok: true });
});

router.post("/devices/:id/state", (req, res) => {
  if (!isEspOnline()) {
    return res.status(400).json({ error: "ESP32 offline" });
  }

  publishToEsp("home/esp32/devices/set", {
    id: req.params.id,
    state: req.body.state,
  });

  res.json({ ok: true });
});

module.exports = router;