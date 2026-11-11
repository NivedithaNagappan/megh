// Build and pack the local @meghjs/core, then install it with the other
// frameworks. Packing (rather than linking) gives Megh the same single copy of
// class-validator and class-transformer that the benchmark servers use.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const core = path.resolve(__dirname, "../packages/core");
const out = path.join(__dirname, ".megh");
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

run("npm run build", core);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const packed = execSync(`npm pack --silent --pack-destination "${out}"`, {
  cwd: core,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .pop();
fs.renameSync(path.join(out, packed), path.join(out, "meghjs-core.tgz"));
fs.rmSync(path.join(__dirname, "node_modules/@meghjs/core"), {
  recursive: true,
  force: true,
});
run("npm install --no-audit --no-fund", __dirname);
