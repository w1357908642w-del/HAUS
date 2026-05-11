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

  espOnline.textContent = data.online ? "онлайн" : "оффлайн";
  lastSeen.textContent = formatDate(data.last_seen);

  if (data.sensor) {
    temperature.textContent = data.sensor.temperature ?? "-";
    humidity.textContent = data.sensor.humidity ?? "-";
    pressure.textContent = data.sensor.pressure ?? "-";
    soilPercent.textContent = data.sensor.soil_percent ?? "-";
    rtcTime.textContent = data.sensor.rtc_time ?? "-";
  }

  renderDevices(data.devices || []);
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
    id: deviceId.value,
    name: deviceName.value,
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
    device.ip = deviceIp.value;
  }

  return device;
}

async function createDevice() {
  const device = collectDeviceForm();

  await fetch(`${API}/devices`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(device),
  });

  await loadDashboard();
}

async function setDeviceState(id, state) {
  await fetch(`${API}/devices/${id}/state`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ state }),
  });

  await loadDashboard();
}

async function deleteDevice(id) {
  await fetch(`${API}/devices/${id}`, {
    method: "DELETE",
    headers: headers(),
  });

  await loadDashboard();
}

async function loadTables() {
  const sensorsRes = await fetch(`${API}/sensors`, {
    headers: headers(),
  });

  const sensors = await sensorsRes.json();

  sensorTable.innerHTML = sensors.map(row => `
    <tr>
      <td>${formatDate(row.created_at)}</td>
      <td>${row.temperature ?? "-"}</td>
      <td>${row.humidity ?? "-"}</td>
      <td>${row.pressure ?? "-"}</td>
      <td>${row.soil_percent ?? "-"}</td>
      <td>${row.rtc_time ?? "-"}</td>
    </tr>
  `).join("");

  const devicesRes = await fetch(`${API}/devices`, {
    headers: headers(),
  });

  const devices = await devicesRes.json();

  deviceTable.innerHTML = devices.map(row => `
    <tr>
      <td>${row.name}</td>
      <td>${row.type}</td>
      <td>${row.state}</td>
      <td>${row.turn_on_time ?? "-"}</td>
      <td>${row.turn_off_time ?? "-"}</td>
      <td>${row.repeat_every_days}</td>
      <td>${formatDate(row.updated_at)}</td>
    </tr>
  `).join("");
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