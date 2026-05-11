const crypto = require("crypto");

const SECRET = "haus-local-secret";

function validCredentials(login, password) {
  return login === process.env.APP_LOGIN && password === process.env.APP_PASSWORD;
}

function createToken(login) {
  const payload = `${login}:${Date.now()}`;
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");

  return Buffer.from(`${payload}:${signature}`).toString("base64");
}

function verifyToken(token) {
  if (!token) return null;

  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [login, timestamp, signature] = decoded.split(":");

    const payload = `${login}:${timestamp}`;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");

    if (signature !== expected) return null;

    return login;
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");

  const login = verifyToken(token);

  if (!login) {
    return res.status(401).json({ error: "unauthorized" });
  }

  req.login = login;
  next();
}

module.exports = {
  validCredentials,
  createToken,
  authMiddleware,
};