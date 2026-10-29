// Loads ./.env from the current working directory (if present) before any other module reads process.env.
// Real environment variables win over the file. Import this first.
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
