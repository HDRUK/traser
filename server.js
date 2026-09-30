import path from "node:path";

import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";

import * as build from "./build/server/index.js";

const port = Number(process.env.PORT ?? 3001);
const clientDir = path.join(import.meta.dirname, "build", "client");

const app = express();

app.set("trust proxy", true);
app.disable("x-powered-by");

app.use(compression());
app.use(
  "/assets",
  express.static(path.join(clientDir, "assets"), {
    immutable: true,
    maxAge: "1y",
  })
);
app.use(express.static(clientDir, { maxAge: "1h" }));
app.use(morgan("tiny"));
app.use(createRequestHandler({ build, mode: process.env.NODE_ENV }));

const server = app.listen(port, () => {
  console.log(`[traser] listening on http://localhost:${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => server.close(console.error));
}
