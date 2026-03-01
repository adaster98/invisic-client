/**
 * Quick Translate - Isolated Child Process Worker
 *
 * Runs @xenova/transformers in WASM mode for text translation.
 * Forked as plain Node.js (not Electron) — cannot read .asar archives.
 * All node_modules must be unpacked via asarUnpack in package.json.
 */

const Module = require("module");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// -- Module resolution fallbacks (NODE_PATH is primary, set by backend.js) --

const appRoot = process.env.KLOAK_APP_ROOT || process.cwd();

console.error(`[QT Worker] appRoot (KLOAK_APP_ROOT): ${appRoot}`);
console.error(`[QT Worker] cwd: ${process.cwd()}`);
console.error(`[QT Worker] __dirname: ${__dirname}`);

function tryAddModulePath(label, nmPath) {
  if (fs.existsSync(nmPath)) {
    if (!Module.globalPaths.includes(nmPath)) {
      Module.globalPaths.unshift(nmPath);
    }
    console.error(`[QT Worker] ✓ Found modules (${label}): ${nmPath}`);
    return true;
  }
  console.error(`[QT Worker] ✗ Not found (${label}): ${nmPath}`);
  return false;
}

let found = false;

if (appRoot.includes(".asar")) {
  found =
    tryAddModulePath(
      "asar.unpacked",
      path.join(appRoot.replace(/\.asar$/, ".asar.unpacked"), "node_modules"),
    ) || found;
}

if (!found) {
  found = tryAddModulePath("appRoot", path.join(appRoot, "node_modules"));
}

if (!found) {
  found = tryAddModulePath("cwd", path.join(process.cwd(), "node_modules"));
}

if (!found) {
  let searchDir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(searchDir, "node_modules");
    if (tryAddModulePath(`walk-up-${i}`, candidate)) {
      found = true;
      break;
    }
    const parent = path.dirname(searchDir);
    if (parent === searchDir) break;
    searchDir = parent;
  }
}

if (!found) {
  console.error(
    "[QT Worker] ⚠ WARNING: Could not find node_modules in any location!",
  );
}

// -- ESM loader: stub out 'sharp' (image library, not needed for translation) --
// Uses Module.register() because sharp is a static ESM import that CJS hooks can't intercept.
try {
  const { register } = require("node:module");
  register(
    "data:text/javascript," +
      encodeURIComponent(
        "export function resolve(s,c,n){" +
          'if(s==="sharp")return{url:"data:text/javascript,export default{}",shortCircuit:true};' +
          "return n(s,c)}",
      ),
  );
  console.error("[QT Worker] ✓ Registered ESM loader (sharp → stub)");
} catch (e) {
  console.error("[QT Worker] ⚠ Module.register() unavailable:", e.message);
}

// -- Redirect missing .node files to a dummy path instead of throwing --
const _originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  try {
    return _originalResolveFilename.apply(this, arguments);
  } catch (err) {
    if (request.endsWith(".node") && parent && parent.filename) {
      const dummyPath = path.resolve("/blocked-native/binding.node");
      console.error(
        `[QT Worker] Redirected missing native binary: ${request} (from ${parent.filename})`,
      );
      return dummyPath;
    }
    throw err;
  }
};

// -- Block all native .node binary loading (only WASM is needed) --
const _originalDlopen = process.dlopen;
process.dlopen = function (module, filename, flags) {
  if (filename && filename.endsWith(".node")) {
    console.error(`[QT Worker] Blocked native binary: ${filename}`);
    module.exports = {};
    return;
  }
  return _originalDlopen.apply(this, arguments);
};

// -- Force WASM backend: spoof release name so onnxruntime-web is selected --
const _originalReleaseName = process.release.name;
process.release.name = "electron-wasm";

let translatorPipeline = null;

process.send({ type: "alive" });

process.on("message", async (msg) => {
  try {
    if (msg.type === "init") {
      await handleInit();
    } else if (msg.type === "translate") {
      await handleTranslate(msg);
    }
  } catch (err) {
    process.send({ type: "error", error: err.message, stack: err.stack });
  }
});

async function handleInit() {
  process.send({
    type: "log",
    text: "Worker: Loading @xenova/transformers (forced WASM mode)...",
  });

  // require.resolve() finds the package via CJS (honors NODE_PATH),
  // then import() loads it via ESM (where the sharp stub hook lives).
  const transformersPath = require.resolve("@xenova/transformers");
  const { pipeline, env } = await import(pathToFileURL(transformersPath).href);

  process.release.name = _originalReleaseName;

  env.allowLocalModels = false;
  env.allowRemoteModels = true;

  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.simd = true;
    env.backends.onnx.wasm.proxy = false;
  }

  process.send({
    type: "log",
    text: "Worker: Starting model pipeline (WASM backend)...",
  });

  translatorPipeline = await pipeline(
    "translation",
    "Xenova/nllb-200-distilled-600M",
    {
      progress_callback: (x) => {
        if (x.status === "progress") {
          process.send({
            type: "progress",
            percent: Math.round(x.progress),
            file: x.file,
          });
        } else if (x.status === "done") {
          process.send({ type: "log", text: `Worker: Loaded ${x.file}` });
        }
      },
      quantized: true,
    },
  );

  process.send({ type: "ready" });
}

async function handleTranslate(msg) {
  if (!translatorPipeline) {
    process.send({
      type: "result",
      id: msg.id,
      error: "Pipeline not initialized",
    });
    return;
  }

  const output = await translatorPipeline(msg.text, {
    src_lang: msg.src || "eng_Latn",
    tgt_lang: msg.tgt,
  });

  process.send({
    type: "result",
    id: msg.id,
    text: output[0].translation_text,
  });
}

process.on("uncaughtException", (err) => {
  try {
    process.send({
      type: "error",
      error: `Uncaught: ${err.message}`,
      stack: err.stack,
    });
  } catch (e) {
    console.error("[QT Worker] Fatal:", err);
  }
  process.exit(1);
});
