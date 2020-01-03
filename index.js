const { spawn } = require("child_process");
const rimraf = require("rimraf");

run("nomad-dart");

function run(prefix, destinationPath) {
  // Turn on instrumentation via environment variable
  process.env.BROCCOLI_VIZ = "1";

  serialTimes2(5, num => buildTimings(false, prefix, num, destinationPath))
    .then(out => {
      console.log(out.join("\n"));
      return serialTimes2(5, num =>
        buildTimings(true, prefix, num, destinationPath)
      );
    })
    .then(out => {
      console.log(out.join("\n"));
      return serialTimes2(5, num =>
        serveTimings("app/styles/app.scss", prefix, num, destinationPath)
      );
    })
    .then(out => console.log(out.join("\n")));
}

// Get timings for builds using the ember build command
function buildTimings(isProd, prefix, suffix, destinationPath) {
  let name = type =>
    `${prefix}-build-${type}-${isProd ? "prod" : "dev"}-${suffix}.json`;

  rimraf.sync("./dist");

  emberExec(`build ${isProd ? "--prod" : ""}`)
    .then(() => save(destinationPath, name("cold")))
    .then(() => emberExec(`build ${isProd ? "--prod" : ""}`))
    .then(() => save(destinationPath, name("warm")));
}

// Get timings for builds and rebuildings using the ember serve command
function serveTimings(touchPath, prefix, suffix, destinationPath) {
  return Promise.resolve(`
  rm -rf ./tmp
  ember serve
  copying instrumentation file to ${prefix}-serve-build-${suffix}.json
  touch ${touchPath}
  copying instrumentation file to ${prefix}-serve-rebuld-${suffix}.json
  `);
  // rm -rf /tmp
  // ember serve (how to handle the long-running process???)
  // save file
  // touch touchPath
  // save file (buildNo 1)
  // stop server
  // ember serve
  // save file
  // touch touchPath
  // save file
}

// Save an instrumentation file to {path}
function save(path, name, buildNo = 0) {
  console.log(
    `Saving file instrumentation.build.${buildNo}.json to ${path}/${name}`
  );
  return Promise.resolve("");
  // cp instrumentation.build.{buildNo}.json path
}

// Execute the ember command with {cmd} as the subcommand and flags
function emberExec(cmd) {
  return new Promise((resolve, reject) => {
    console.log(`EXEC: ember ${cmd}`);
    const runner = spawn("ember", cmd.split(" "));
    const stdout = [];
    const stderr = [];
    runner.stdout.on("data", d => stdout.push(d.toString()));
    runner.stderr.on("data", d => stderr.push(d.toString()));
    runner.on("exit", () =>
      resolve({ stdout: stdout.join(""), stderr: stderr.join("") })
    );
  });
}

// Run asynchronous function {fn} serially {count} times, passing
// in the run number as an argument to fn.
function serialTimes(count, fn) {
  let num = 0;
  return new Array(count).fill(null).reduce(promise => {
    return promise.then(returns => fn(num++).then(ret => returns.concat(ret)));
  }, Promise.resolve([]));
}
