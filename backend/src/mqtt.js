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
    const espDeviceId = data.device || "esp32";

    touchDevice(login, espDeviceId);

    if (topic === "home/esp32/status") {
      return;
    }

    if (topic === "home/esp32/sensors") {
      await db.query(
        `
        INSERT INTO sensor_data(
          device_login,
          esp_device_id,
          temperature,
          humidity,
          pressure,
          soil_percent,
          rtc_time
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          login,
          espDeviceId,
          data.temperature ?? null,
          data.humidity ?? null,
          data.pressure ?? null,
          data.soil_percent ?? null,
          data.time ?? null,
        ]
      );
    }

    if (topic === "home/esp32/devices/list") {
      const devices = data.devices || [];

      await db.query(
        `
        DELETE FROM managed_devices
        WHERE device_login = $1
          AND esp_device_id = $2
        `,
        [login, espDeviceId]
      );

      for (const device of devices) {
        await upsertDevice(login, espDeviceId, device);
      }
    }

    if (topic === "home/esp32/devices/state") {
      await upsertDevice(login, espDeviceId, data.deviceData);
    }
    if (topic === "home/esp32/soil/list") {
      const sensors = data.sensors || [];

      await db.query(
        `
        DELETE FROM soil_sensors
        WHERE device_login = $1
        AND esp_device_id = $2
        `,
        [login, espDeviceId]
      );

      for (const sensor of sensors) {
        await upsertSoilSensor(login, espDeviceId, sensor);
      }
    }

    if (topic === "home/esp32/soil/state") {
      await upsertSoilSensor(login, espDeviceId, data.sensor);
    }
  } catch (error) {
    console.error("MQTT error:", error.message);
  }
});
async function upsertSoilSensor(login, espDeviceId, sensor) {
  if (!sensor?.id) return;

  await db.query(
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
      name = $4,
      pin = $5,
      raw_value = $6,
      percent_value = $7,
      dry_value = $8,
      wet_value = $9,
      updated_at = NOW()
    `,
    [
      login,
      espDeviceId,
      sensor.id,
      sensor.name,
      sensor.pin,
      sensor.rawValue ?? null,
      sensor.percentValue ?? null,
      sensor.dryValue ?? null,
      sensor.wetValue ?? null,
    ]
  );
}
async function upsertDevice(login, espDeviceId, device) {
  if (!device?.id) return;

  await db.query(
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
      name = $4,
      type = $5,
      state = $6,
      mode = $7,
      turn_on_time = $8,
      turn_off_time = $9,
      last_turn_on_date = $10,
      repeat_every_days = $11,
      pin = $12,
      active_high = $13,
      ip = $14,
      updated_at = NOW()
    `,
    [
      login,
      espDeviceId,
      device.id,
      device.name,
      device.type,
      device.state || "OFF",
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