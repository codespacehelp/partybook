import express from "express";
const __dirname = import.meta.dirname;
import { join } from "path";

const app = express();
app.use("/static", express.static("static"));
const port = 3000;

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "static", "index.html"));
});

app.listen(port, () => {});
