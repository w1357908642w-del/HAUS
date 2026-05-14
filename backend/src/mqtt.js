const mqtt = require("mqtt");
const db = require("./db");
const { validCredentials } = require("./auth");

const client = mqtt.connect(process.env.MQTT_URL);
const deviceStatus = {};

function isValidAuth(auth) {
  return auth && validCredentials(auth.login, auth.password);
}

function touchDevice(login, espDeviceId) {
  deviceStatus[login] = {
    online: true,
    espDeviceId,
    lastSeen: new Date(),
  };
}

function isEspOnline(login) {
  const status = deviceStatus[login];
  if (!status?.lastSeen) return false;
  return Date.now() - new Date(status.lastSeen).getTime() < 30000;
}

function getEspStatus(login) {
  return deviceStatus[login] || {
    online: false,
    espDeviceId: null,
    lastSeen: null,
  };
}

client.on("connect", () => {
  console.log("MQTT connected");

  client.subscribe("home/esp32/status");
  client.subscribe("home/esp32/sensors");
  client.subscribe("home/esp32/devices/list");
  client.subscribe("home/esp32/devices/state");
  client.subscribe("home/esp32/soil/list");
  client.subscribe("home/esp32/soil/state");
});

client.on("message", async (topic, message) => {
  try {
    const payload = message.toString();
    console.log("MQTT RAW:", topic, payload);

    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      return;
    }

    if (!isValidAuth(data.auth)) return;

    const login = data.auth.login;
    const espDeviceId = data.device || login;

    touchDevice(login, espDeviceId);

    if (topic === "home/esp32/status") return;

    if (topic === "home/esp32/sensors") {
      await db.query(
        `
        INSERT INTO sensor_data(
          device_login,
          esp_device_id,
          temperature,
          humidity,
          pressure,
          rtc_time
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          login,
          espDeviceId,
          data.temperature ?? null,
          data.humidity ?? null,
          data.pressure ?? null,
          data.time ?? null,
        ]
      );
    }

    if (topic === "home/esp32/devices/list") {
      const devices = data.devices || [];
      for (const device of devices) {
        await upsertDevice(login, espDeviceId, device, false);
      }
    }

    if (topic === "home/esp32/devices/state") {
      await upsertDevice(login, espDeviceId, data.deviceData, true);
    }

    if (topic === "home/esp32/soil/list") {
      const sensors = data.sensors || [];
      for (const sensor of sensors) {
        await upsertSoilSensor(login, espDeviceId, sensor, false);
      }
    }

    if (topic === "home/esp32/soil/state") {
      await upsertSoilSensor(login, espDeviceId, data.sensor, true);
    }
  } catch (error) {
    console.error("MQTT error:", error.message);
  }
});

async function upsertSoilSensor(login, espDeviceId, sensor, saveReading) {
  if (!sensor?.id) return;

  const result = await db.query(
    `
    INSERT INTO soil_sensors(
      device_login,
      esp_device_id,
      sensor_id,
      name,
      pin,
      raw_value,
      percent_value,
      dry_value,
      wet_value,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT(device_login, esp_device_id, sensor_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      pin = EXCLUDED.pin,
      raw_value = EXCLUDED.raw_value,
      percent_value = EXCLUDED.percent_value,
      dry_value = EXCLUDED.dry_value,
      wet_value = EXCLUDED.wet_value,
      updated_at = NOW()
    RETURNING id
    `,
    [
      login,
      espDeviceId,
      sensor.id,
      sensor.name || sensor.id,
      sensor.pin ?? null,
      sensor.rawValue ?? null,
      sensor.percentValue ?? null,
      sensor.dryValue ?? null,
      sensor.wetValue ?? null,
    ]
  );

  if (saveReading) {
    await db.query(
      `
      INSERT INTO soil_readings(
        soil_sensor_db_id,
        raw_value,
        percent_value
      )
      VALUES ($1,$2,$3)
      `,
      [
        result.rows[0].id,
        sensor.rawValue ?? null,
        sensor.percentValue ?? null,
      ]
    );
  }
}

async function upsertDevice(login, espDeviceId, device, saveEvent) {
  if (!device?.id) return;

  const oldResult = await db.query(
    `
    SELECT id, state
    FROM managed_devices
    WHERE device_login = $1
      AND esp_device_id = $2
      AND managed_id = $3
    `,
    [login, espDeviceId, device.id]
  );

  const previousState = oldResult.rows[0]?.state || null;
  const newState = device.state || "OFF";

  const result = await db.query(
    `
    INSERT INTO managed_devices(
      device_login,
      esp_device_id,
      managed_id,
      name,
      type,
      state,
      mode,
      turn_on_time,
      turn_off_time,
      last_turn_on_date,
      repeat_every_days,
      pin,
      active_high,
      ip,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
    ON CONFLICT(device_login, esp_device_id, managed_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      state = EXCLUDED.state,
      mode = EXCLUDED.mode,
      turn_on_time = EXCLUDED.turn_on_time,
      turn_off_time = EXCLUDED.turn_off_time,
      last_turn_on_date = EXCLUDED.last_turn_on_date,
      repeat_every_days = EXCLUDED.repeat_every_days,
      pin = EXCLUDED.pin,
      active_high = EXCLUDED.active_high,
      ip = EXCLUDED.ip,
      updated_at = NOW()
    RETURNING id
    `,
    [
      login,
      espDeviceId,
      device.id,
      device.name || device.id,
      device.type || null,
      newState,
      device.mode || "AUTO",
      device.turnOnTime || null,
      device.turnOffTime || null,
      device.lastTurnOnDate || null,
      device.repeatEveryDays || 1,
      device.pin ?? null,
      device.activeHigh ?? null,
      device.ip || null,
    ]
  );

  if (saveEvent && previousState !== newState) {
    await db.query(
      `
      INSERT INTO device_events(
        managed_device_db_id,
        previous_state,
        new_state
      )
      VALUES ($1,$2,$3)
      `,
      [result.rows[0].id, previousState, newState]
    );
  }
}

function publishToEsp(login, topic, payload = {}) {
  const credentials = JSON.parse(process.env.DEVICE_CREDENTIALS || "{}");

  const message = JSON.stringify({
    auth: {
      login,
      password: credentials[login],
    },
    ...payload,
  });

  console.log("MQTT SEND:", topic, message);
  client.publish(topic, message, { qos: 1 });
}

module.exports = {
  client,
  publishToEsp,
  isEspOnline,
  getEspStatus,
};