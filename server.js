import { join } from "path";
import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { createRouteHandler, createUploadthing } from "uploadthing/express";

// Load environment variables
config();

const f = createUploadthing();
export const uploadRouter = {
  imageUploader: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  }).onUploadComplete((data) => {
    console.log("upload complete", data);
  }),

  canvasSaver: f({
    image: {
      maxFileSize: "10MB", // Increased max file size for canvas images, adjust as needed
      maxFileCount: 1,
    },
  }).onUploadComplete((data) => {
    console.log("Canvas snapshot upload complete:", data);
    // You can add additional logic here, like saving metadata to a database
  }),
};

const __dirname = import.meta.dirname;

const app = express();
const port = process.env.PORT || 3000;
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use("/static", express.static("static"));

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "static", "index.html"));
});

app.use("/api/uploadthing", createRouteHandler({ router: uploadRouter }));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
