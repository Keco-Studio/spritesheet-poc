import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { fs: { allow: [".."] } }, // permit importing ../src/* (core + mapcompiler)
  build: {
    target: "es2022", // top-level await / es2022 features
    rollupOptions: {
      input: { main: "index.html", mapwalk: "mapwalk.html" },
    },
  },
});
