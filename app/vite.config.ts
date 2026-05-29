import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { fs: { allow: [".."] } }, // permit importing ../src/sheet/*
  build: { target: "es2022" }, // required for top-level await in main.ts
});
