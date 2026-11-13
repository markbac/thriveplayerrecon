import { defineConfig } from 'vite';

/** Build date and time in UK time, for example 13/11/2026 11:26, shown as "created ..." in the app. */
function buildDateTime(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export default defineConfig({
  base: './',
  define: {
    __BUILD_DATETIME__: JSON.stringify(buildDateTime()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    // The Excel library (~950 kB) is loaded on demand for exports and inside the worker
    chunkSizeWarningLimit: 1100,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
