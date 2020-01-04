const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");

run("nomad-dart", "~/path");

function run(prefix, destinationPath) {
  // Turn on instrumentation via environment variable
  process.env.BROCCOLI_VIZ = "1";

  serialTimes(
    5,
    num => buildTimings(false, prefix, num, destinationPath),
    "Development Build"
  )
    .then(out => {
      console.log(out.join("\n"));
      return serialTimes(
        5,
        num => buildTimings(true, prefix, num, destinationPath),
        "Production Build"
      );
    })
    .then(out => {
      console.log(out.join("\n"));
      return serialTimes(
        5,
        num =>
          serveTimings("./app/styles/app.scss", prefix, num, destinationPath),
        "Serve Build & Rebuild"
      );
    })
    .then(out => console.log(out.join("\n")));
}

// Get timings for builds using the ember build command
function buildTimings(isProd, prefix, suffix, destinationPath) {
  clearInstrumentationFiles();
  rimraf.sync("./dist");

  const name = type =>
    `${prefix}-build-${type}-${isProd ? "prod" : "dev"}-${suffix}.json`;
  const cmd = `build ${isProd ? "--prod" : ""}`;

  return emberExec(cmd)
    .waitForExit()
    .then(() => save(destinationPath, name("cold")))
    .then(() => emberExec(cmd).waitForExit())
    .then(() => save(destinationPath, name("warm")));
}

// Get timings for builds and rebuildings using the ember serve command
function serveTimings(touchPath, prefix, suffix, destinationPath) {
  clearInstrumentationFiles();
  rimraf.sync("./tmp");

  const name = type => `${prefix}-serve-${type}-${suffix}.json`;

  let ember = emberExec("serve");

  return ember
    .waitForBuild()
    .then(() => save(destinationPath, name("build")))
    .then(() => wait(2000))
    .then(() => {
      console.log(`Provoking rebuild by touching ${touchPath}`);
      spawnSync("touch", [touchPath]);
      return ember.waitForBuild();
    })
    .then(() => save(destinationPath, name("rebuild"), 1))
    .then(() => ember.kill());
}

// Save an instrumentation file to {path}
function save(newPath, name, buildNo = 0) {
  const file = `instrumentation.build.${buildNo}.json`;
  console.log(`Saving file ${file} to ${newPath}/${name}`);
  fs.copyFileSync(file, path.join(newPath, name));
  return Promise.resolve("");
}

function clearInstrumentationFiles() {
  rimraf.sync("./instrumentation.*");
}

// Execute the ember command with {cmd} as the subcommand and flags
function emberExec(cmd) {
  console.log(`EXEC: ember ${cmd}`);
  return new EmberExec(cmd);
}

// Run asynchronous function {fn} serially {count} times, passing
// in the run number as an argument to fn.
function serialTimes(count, fn, label = "Serial Times") {
  let num = 0;
  return new Array(count).fill(null).reduce(promise => {
    return promise.then(returns => {
      console.log(`${label} (run ${num})`);
      return fn(num++).then(ret => returns.concat(ret));
    });
  }, Promise.resolve([]));
}

function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

class TimeBomb {
  constructor(fn, duration = 60000) {
    this.fn = fn;
    this.duration = duration;
    this.current = 0;

    this.interval = setInterval(() => {
      this.current += 50;
      if (this.current >= this.duration) {
        this.detonate();
      }
    }, 50);
  }

  reset() {
    this.current = 0;
  }

  detonate() {
    clearInterval(this.interval);
    this.fn();
  }

  stop() {
    clearInterval(this.interval);
  }
}

class EmberExec {
  constructor(cmd) {
    this.stdout = [];
    this.stderr = [];

    this.runner = spawn("ember", cmd.split(" "));

    this.exitPromise = new Promise((resolve, reject) => {
      this.exitResolve = resolve;
      this.exitReject = reject;
    });

    this.buildPromise = new Promise((resolve, reject) => {
      this.buildResolve = resolve;
      this.buildReject = reject;
    });

    this.timeBomb = new TimeBomb(() => {
      const msg = "Timed out after not receiving output for 120s";
      this.exitReject(msg);
      this.buildReject(msg);
    }, 120000);

    this.runner.stdout.on("data", d => {
      this.timeBomb.reset();

      // Special handling for ember serve which does not exit
      const str = d.toString();
      this.stdout.push(str);

      // Is this safe? Is it possible for this message to be
      // split across two data frames?
      if (str.includes("Build successful (")) {
        // Serve finished building, resolve and reset the build promise
        this.buildResolve();
        this.buildPromise = new Promise((resolve, reject) => {
          this.buildResolve = resolve;
          this.buildReject = reject;
        });
      }
    });

    this.runner.stderr.on("data", d => {
      this.timeBomb.reset();
      this.stderr.push(d.toString());
    });

    this.runner.on("exit", () => {
      this.timeBomb.stop();
      this.exitResolve({
        stdout: this.stdout.join(""),
        stderr: this.stderr.join("")
      });
    });
  }

  waitForExit() {
    return this.exitPromise;
  }

  waitForBuild() {
    return this.buildPromise;
  }

  kill() {
    this.runner.kill();
    return this.exitPromise;
  }
}
