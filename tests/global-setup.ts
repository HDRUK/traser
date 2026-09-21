export default async function setup() {
  const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3001";
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(
      `Cannot reach ${baseUrl}. Start the dev server with \`npm run dev\` before running tests.`
    );
  }
}
