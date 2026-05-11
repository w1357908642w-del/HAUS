const mqtt = require("mqtt");
const db = require("./db");

const client = mqtt.connect(process.env.MQTT_URL);

const deviceStatus = {
  online: false,
  lastSeen: null,
};

function isValidAuth(auth) {
  return (
    auth &&
    auth.login === process.env.APP_LOGIN &&
    auth.password === process.env.APP_PASSWORD
  );
}

function touchDevice() {
  deviceStatus.online = true;
  deviceStatus.lastSeen = new Date();
}

client.on("connect", () => {
  console.log("MQTT connected");

  client.subscribe("home/esp32/status");
  client.subscribe("home/esp32/sensors");
  client.subscribe("home/esp32/devices/list");
  client.subscribe("home/esp32/devices/state");
});

client.on("message", async (topic, message) => {
  try {
    const payload = message.toString();

    if (topic === "home/esp32/sensors") {
      console.log(topic, payload);
    }

    const data = JSON.parse(payload);

    if (!isValidAuth(data.auth)) {
      return;
    }

    touchDevice();

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
          data.auth.login,
          data.device || "esp32-smarthome",
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

      for (const dev of devices) {
        await upsertDevice(data.auth.login, data.device || "esp32-smarthome", dev);
      }
    }

    if (topic === "home/esp32/devices/state") {
      await upsertDevice(data.auth.login, data.device || "esp32-smarthome", data.deviceData);
    }
  } catch (error) {
    console.error("MQTT error:", error.message);
  }
});

async function upsertDevice(login, espDeviceId, dev) {
  if (!dev || !dev.id) return;

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
      dev.id,
      dev.name,
      dev.type,
      dev.state || "OFF",
      dev.mode || "AUTO",
      dev.turnOnTime || null,
      dev.turnOffTime || null,
      dev.lastTurnOnDate || null,
      dev.repeatEveryDays || 1,
      dev.pin ?? null,
      dev.activeHigh ?? null,
      dev.ip || null,
    ]
  );
}

function publishToEsp(topic, payload) {
  client.publish(
    topic,
    JSON.stringify({
      auth: {
        login: process.env.APP_LOGIN,
        password: process.env.APP_PASSWORD,
      },
      ...payload,
    })
  );
}

function isEspOnline() {
  if (!deviceStatus.lastSeen) return false;

  const diff = Date.now() - new Date(deviceStatus.lastSeen).getTime();

  return diff < 30000;
}

module.exports = {
  client,
  publishToEsp,
  isEspOnline,
  deviceStatus,
};