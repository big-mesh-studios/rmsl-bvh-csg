import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: { "rmsl-bvh": "src/index.ts" },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [/^@random-mesh\/rmsl(\/.*)?$/],
    },
  },
  plugins: [
    dts({
      include: ["src"],
      entryRoot: "src",
      exclude: ["src/**/*.test.ts", "src/**/*.test-d.ts"],
      outDirs: ["dist"],
    }),
  ],
});
