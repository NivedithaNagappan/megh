// Start each server in turn, check it answers correctly, then load it with
// autocannon. Each scenario gets a warm-up, then RUNS timed runs; the median
// is kept. Results go to the console and to results.json.
//
//   ONLY=megh,fastify  DURATION=10  RUNS=3  CONNECTIONS=100  PORT=3999
const { spawn } = require("child_process");
const autocannon = require("autocannon");
const fs = require("fs");
const os = require("os");

const SERVERS = (
  process.env.ONLY || "fastify,megh,nest-fastify,express,nest-express"
).split(",");
const DURATION = Number(process.env.DURATION || 10);
const RUNS = Number(process.env.RUNS || 3);
const CONNECTIONS = Number(process.env.CONNECTIONS || 100);
const PORT = Number(process.env.PORT || 3999);

const base = `http://127.0.0.1:${PORT}`;
const json = { "content-type": "application/json" };
const valid = JSON.stringify({
  name: "Ada",
  email: "ada@example.com",
  age: 36,
});

const SCENARIOS = [
  { name: "GET /hello (JSON)", path: "/hello" },
  { name: "GET /users/:id?fields= (params)", path: "/users/42?fields=name" },
  {
    name: "POST /users (validated body)",
    path: "/users",
    method: "POST",
    headers: json,
    body: valid,
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base + "/hello");
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("server did not start");
}

// Every server must do the same work: reject an invalid body and an unknown
// property with 400, and pass path and query values through as strings.
async function check() {
  const post = (body) =>
    fetch(base + "/users", { method: "POST", headers: json, body });
  const ok = await post(valid);
  const bad = await post(JSON.stringify({ name: "", email: "no", age: 999 }));
  const extra = await post(
    JSON.stringify({ ...JSON.parse(valid), admin: true }),
  );
  const params = await (await fetch(base + "/users/42?fields=name")).json();

  const problems = [];
  if (ok.status !== 200 && ok.status !== 201)
    problems.push(`valid body got ${ok.status}`);
  if (bad.status !== 400) problems.push(`invalid body got ${bad.status}`);
  if (extra.status !== 400)
    problems.push(`unknown property got ${extra.status}`);
  if (params.id !== "42" || params.fields !== "name")
    problems.push(`params gave ${JSON.stringify(params)}`);
  if (problems.length) throw new Error(problems.join("; "));
}

const load = (sc, duration) =>
  new Promise((resolve, reject) =>
    autocannon(
      {
        url: base + sc.path,
        method: sc.method ?? "GET",
        ...(sc.headers && { headers: sc.headers }),
        ...(sc.body && { body: sc.body }),
        connections: CONNECTIONS,
        duration,
      },
      (err, res) => (err ? reject(err) : resolve(res)),
    ),
  );

(async () => {
  const results = {};
  for (const server of SERVERS) {
    const child = spawn(process.execPath, [`dist/${server}.js`, String(PORT)], {
      stdio: "ignore",
      env: { ...process.env, NODE_ENV: "production" },
    });
    try {
      await waitUp();
      await check();
      console.log(`\n== ${server}`);
      results[server] = {};
      for (const sc of SCENARIOS) {
        await load(sc, 3); // warm-up
        const runs = [];
        for (let i = 0; i < RUNS; i++) {
          const r = await load(sc, DURATION);
          runs.push({
            rps: r.requests.average,
            p99: r.latency.p99,
            errors: r.errors + r.non2xx + r.timeouts,
          });
        }
        const out = {
          rps: Math.round(median(runs.map((r) => r.rps))),
          p99: median(runs.map((r) => r.p99)),
          errors: runs.reduce((sum, r) => sum + r.errors, 0),
        };
        results[server][sc.name] = out;
        console.log(
          `  ${sc.name.padEnd(34)} ${String(out.rps).padStart(7)} req/s` +
            `   p99 ${out.p99} ms   errors ${out.errors}`,
        );
      }
    } catch (err) {
      console.error(`\n== ${server} FAILED: ${err.message}`);
      process.exitCode = 1;
    } finally {
      child.kill();
      await sleep(500);
    }
  }

  const meta = {
    date: new Date().toISOString(),
    node: process.version,
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    platform: `${os.platform()} ${os.release()}`,
    connections: CONNECTIONS,
    duration: DURATION,
    runs: RUNS,
  };
  fs.writeFileSync("results.json", JSON.stringify({ meta, results }, null, 2));
  console.log("\n", meta);
})();
