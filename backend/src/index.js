

require("dotenv").config();

const express = require("express");
const cors = require("cors");

require("./mqtt");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", require("./routes/api"));

app.listen(process.env.PORT, () => {
  console.log("Server started on port " + process.env.PORT);
});