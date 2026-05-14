const API = "http://localhost:3000/api";

function token() {
  return localStorage.getItem("token");
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token()}`,
  };
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  document.getElementById(id).classList.add("active");

  if (id === "dashboard") loadDashboard();
  if (id === "tables") loadTables();
}

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function login() {
  loginError.textContent = "";

  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: loginInput.value,
      password: passwordInput.value,
    }),
  });

  if (!res.ok) {
    loginError.textContent = "Неверный логин или пароль";
    return;
  }

  const data = await res.json();

  localStorage.setItem("token", data.token);

  nav.classList.remove("hidden");
  showPage("dashboard");
}

function logout() {
  localStorage.removeItem("token");
  nav.classList.add("hidden");
  showPage("loginPage");
}

async function loadDashboard() {
  const res = await fetch(`${API}/dashboard`, {
    headers: headers(),
  });

  if (res.status === 401) {
    logout();
    return;
  }

  const data = await res.json();

  espId.textContent = data.esp_device_id || "-";
  espOnline.textContent = data.online ? "онлайн" : "оффлайн";
  lastSeen.textContent = formatDate(data.last_seen);

  if (data.sensor) {
    temperature.textContent = data.sensor.temperature ?? "-";
    humidity.textContent = data.sensor.humidity ?? "-";
    pressure.textContent = data.sensor.pressure ?? "-";
    rtcTime.textContent = data.sensor.rtc_time ?? "-";
  }

  renderDevices(data.devices || []);
  renderSoilSensors(data.soil_sensors || []);
}

function renderDevices(devices) {
  devicesGrid.innerHTML = devices.map(dev => `
    <div class="card">
      <h3>${dev.name}</h3>

      <p>ID: <b>${dev.managed_id}</b></p>
      <p>Тип: <b>${dev.type}</b></p>
      <p>Состояние: <b>${dev.state}</b></p>
      <p>Режим: <b>${dev.mode}</b></p>
      <p>Включать: <b>${dev.turn_on_time ?? "-"}</b></p>
      <p>Выключать: <b>${dev.turn_off_time ?? "-"}</b></p>
      <p>Раз в дней: <b>${dev.repeat_every_days}</b></p>

      <div class="device-actions">
        <button onclick="setDeviceState('${dev.managed_id}', 'ON')">ON</button>
        <button onclick="setDeviceState('${dev.managed_id}', 'OFF')">OFF</button>
      </div>

      <button onclick='fillEditForm(${JSON.stringify(dev)})'>Редактировать</button>
      <button class="delete-btn" onclick="deleteDevice('${dev.managed_id}')">Удалить</button>
    </div>
  `).join("");
}

function fillEditForm(dev) {
  deviceId.value = dev.managed_id;
  deviceName.value = dev.name;
  deviceType.value = dev.type;
  deviceMode.value = dev.mode;
  deviceTurnOn.value = dev.turn_on_time || "";
  deviceTurnOff.value = dev.turn_off_time || "";
  deviceRepeat.value = dev.repeat_every_days || 1;
  devicePin.value = dev.pin || "";
  deviceActiveHigh.checked = dev.active_high !== false;
  deviceIp.value = dev.ip || "";

  toggleDeviceFields();
}

function clearDeviceForm() {
  deviceId.value = "";
  deviceName.value = "";
  deviceType.value = "GPIO";
  deviceMode.value = "AUTO";
  deviceTurnOn.value = "";
  deviceTurnOff.value = "";
  deviceRepeat.value = 1;
  devicePin.value = "";
  deviceActiveHigh.checked = true;
  deviceIp.value = "";

  toggleDeviceFields();
}

function toggleDeviceFields() {
  if (deviceType.value === "GPIO") {
    gpioFields.classList.remove("hidden");
    wifiFields.classList.add("hidden");
  } else {
    gpioFields.classList.add("hidden");
    wifiFields.classList.remove("hidden");
  }
}

function collectDeviceForm() {
  const device = {
    id: deviceId.value.trim(),
    name: deviceName.value.trim(),
    type: deviceType.value,
    state: "OFF",
    mode: deviceMode.value,
    turnOnTime: deviceTurnOn.value,
    turnOffTime: deviceTurnOff.value,
    lastTurnOnDate: "",
    repeatEveryDays: Number(deviceRepeat.value),
  };

  if (device.type === "GPIO") {
    device.pin = Number(devicePin.value);
    device.activeHigh = deviceActiveHigh.checked;
  }

  if (device.type === "WIFI_RELAY") {
    device.ip = deviceIp.value.trim();
  }

  return device;
}

async function saveDevice() {
  const device = collectDeviceForm();

  if (!device.id || !device.name) {
    alert("Заполни ID и название устройства");
    return;
  }

  const existing = [...document.querySelectorAll("#devicesGrid .card")]
    .some(card => card.innerText.includes(`ID: ${device.id}`));

  await fetch(existing ? `${API}/devices/${device.id}` : `${API}/devices`, {
    method: existing ? "PUT" : "POST",
    headers: headers(),
    body: JSON.stringify(device),
  });

  setTimeout(async () => {
    await requestDeviceList();
    await loadDashboard();
  }, 700);
}

async function setDeviceState(id, state) {
  await fetch(`${API}/devices/${id}/state`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ state }),
  });

  setTimeout(loadDashboard, 700);
}

async function deleteDevice(id) {
  await fetch(`${API}/devices/${id}`, {
    method: "DELETE",
    headers: headers(),
  });

  setTimeout(loadDashboard, 700);
}

async function requestDeviceList() {
  await fetch(`${API}/devices/request-list`, {
    method: "POST",
    headers: headers(),
  });

  setTimeout(loadDashboard, 700);
}

function renderSoilSensors(sensors) {
  soilSensorsGrid.innerHTML = sensors.map(sensor => `
    <div class="card">
      <h3>${sensor.name}</h3>

      <p>ID: <b>${sensor.sensor_id}</b></p>
      <p>Пин: <b>${sensor.pin}</b></p>
      <p>RAW: <b>${sensor.raw_value ?? "-"}</b></p>
      <p>Влажность: <b>${sensor.percent_value ?? "-"}</b> %</p>
      <p>Dry: <b>${sensor.dry_value ?? "-"}</b></p>
      <p>Wet: <b>${sensor.wet_value ?? "-"}</b></p>

      <button onclick='fillSoilForm(${JSON.stringify(sensor)})'>Редактировать</button>
      <button class="delete-btn" onclick="deleteSoilSensor('${sensor.sensor_id}')">Удалить</button>
    </div>
  `).join("");
}

function fillSoilForm(sensor) {
  soilId.value = sensor.sensor_id;
  soilName.value = sensor.name;
  soilPin.value = sensor.pin;
  soilDry.value = sensor.dry_value ?? 3200;
  soilWet.value = sensor.wet_value ?? 1200;
}

function clearSoilForm() {
  soilId.value = "";
  soilName.value = "";
  soilPin.value = "34";
  soilDry.value = 3200;
  soilWet.value = 1200;
}

function collectSoilForm() {
  return {
    id: soilId.value.trim(),
    name: soilName.value.trim(),
    pin: Number(soilPin.value),
    dryValue: Number(soilDry.value),
    wetValue: Number(soilWet.value),
  };
}

async function saveSoilSensor() {
  const sensor = collectSoilForm();

  if (!sensor.id || !sensor.name) {
    alert("Заполни ID и название датчика");
    return;
  }

  const allowedPins = [32, 33, 34, 35, 36, 39];

  if (!allowedPins.includes(sensor.pin)) {
    alert("Для датчика почвы можно использовать только ADC1: 32, 33, 34, 35, 36, 39");
    return;
  }

  const existing = [...document.querySelectorAll("#soilSensorsGrid .card")]
    .some(card => card.innerText.includes(`ID: ${sensor.id}`));

  await fetch(existing ? `${API}/soil/${sensor.id}` : `${API}/soil`, {
    method: existing ? "PUT" : "POST",
    headers: headers(),
    body: JSON.stringify(sensor),
  });

  setTimeout(async () => {
    await requestSoilList();
    await loadDashboard();
  }, 700);
}

async function deleteSoilSensor(id) {
  await fetch(`${API}/soil/${id}`, {
    method: "DELETE",
    headers: headers(),
  });

  setTimeout(loadDashboard, 700);
}

async function requestSoilList() {
  await fetch(`${API}/soil/request-list`, {
    method: "POST",
    headers: headers(),
  });

  setTimeout(loadDashboard, 700);
}

async function loadTables() {
  const container = document.getElementById("tables");

  container.innerHTML = `
    <h2>История</h2>

    <div class="tabs">
      <button onclick="loadHistoryTab('soil')">Почва</button>
      <button onclick="loadHistoryTab('devices')">Устройства</button>
      <button onclick="loadHistoryTab('climate')">Климат</button>
    </div>

    <div id="historyContent"></div>
  `;

  await loadHistoryTab("soil");
}

async function loadHistoryTab(type) {
  const content = document.getElementById("historyContent");

  if (type === "soil") {
    const res = await fetch(`${API}/history/soil`, { headers: headers() });
    const sensors = await res.json();

    content.innerHTML = `
      <div class="history-layout">
        <div class="history-list">
          ${sensors.map(sensor => `
            <button class="history-item" onclick="loadSoilHistory(${sensor.id}, '${sensor.name}', '${sensor.sensor_id}')">
              <b>${sensor.name}</b>
              <span>ID: ${sensor.sensor_id}</span>
              <small>Последнее: ${sensor.percent_value ?? "-"}%</small>
            </button>
          `).join("")}
        </div>

        <div class="history-panel">
          <h3>Выберите датчик почвы</h3>
          <table>
            <tbody id="historyRows"></tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (type === "devices") {
    const res = await fetch(`${API}/history/devices`, { headers: headers() });
    const devices = await res.json();

    content.innerHTML = `
      <div class="history-layout">
        <div class="history-list">
          ${devices.map(device => `
            <button class="history-item" onclick="loadDeviceHistory(${device.id}, '${device.name}', '${device.managed_id}')">
              <b>${device.name}</b>
              <span>ID: ${device.managed_id}</span>
              <small>Состояние: ${device.state}</small>
            </button>
          `).join("")}
        </div>

        <div class="history-panel">
          <h3>Выберите устройство</h3>
          <table>
            <tbody id="historyRows"></tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (type === "climate") {
    const res = await fetch(`${API}/history/climate`, { headers: headers() });
    const rows = await res.json();

    content.innerHTML = `
      <div class="history-panel">
        <h3>История климата</h3>
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Температура</th>
              <th>Влажность</th>
              <th>Давление</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${formatDate(row.created_at)}</td>
                <td>${row.temperature ?? "-"}</td>
                <td>${row.humidity ?? "-"}</td>
                <td>${row.pressure ?? "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
}

async function loadSoilHistory(id, name, sensorId) {
  const res = await fetch(`${API}/history/soil/${id}`, { headers: headers() });
  const rows = await res.json();

  document.querySelector(".history-panel h3").textContent = `${name} / ${sensorId}`;

  document.getElementById("historyRows").innerHTML = `
    <tr>
      <th>Время</th>
      <th>Влажность</th>
      <th>RAW</th>
    </tr>
    ${rows.map(row => `
      <tr>
        <td>${formatDate(row.created_at)}</td>
        <td>${row.percent_value ?? "-"}%</td>
        <td>${row.raw_value ?? "-"}</td>
      </tr>
    `).join("")}
  `;
}

async function loadDeviceHistory(id, name, managedId) {
  const res = await fetch(`${API}/history/devices/${id}`, { headers: headers() });
  const rows = await res.json();

  document.querySelector(".history-panel h3").textContent = `${name} / ${managedId}`;

  document.getElementById("historyRows").innerHTML = `
    <tr>
      <th>Время</th>
      <th>Событие</th>
    </tr>
    ${rows.map(row => `
      <tr>
        <td>${formatDate(row.created_at)}</td>
        <td>${row.previous_state || "—"} → ${row.new_state}</td>
      </tr>
    `).join("")}
  `;
}

if (token()) {
  nav.classList.remove("hidden");
  showPage("dashboard");
} else {
  showPage("loginPage");
}

setInterval(() => {
  if (token() && document.getElementById("dashboard").classList.contains("active")) {
    loadDashboard();
  }
}, 3000);