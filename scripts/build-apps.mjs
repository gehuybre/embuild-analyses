#!/usr/bin/env node

import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")

function parseArgs(argv) {
  const args = {}
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith("--")) continue
    const key = current.slice(2)
    const next = argv[index + 1]
    const hasNext = index + 1 < argv.length
    if (!hasNext || next.startsWith("--")) {
      args[key] = "true"
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

function run(command, args, dryRun) {
  console.log(`$ ${command} ${args.join(" ")}`)
  if (dryRun) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} terminated with signal ${signal}`))
        return
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`))
        return
      }

      resolve()
    })
  })
}

async function runQueue(queue, concurrency, dryRun) {
  let nextIndex = 0
  let failed = false

  const worker = async () => {
    while (!failed) {
      const index = nextIndex
      nextIndex += 1
      const slug = queue[index]
      if (!slug) {
        return
      }

      try {
        await run("pnpm", ["--filter", slug, "build"], dryRun)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    () => worker(),
  )

  await Promise.all(workers)
}

async function main() {
  const args = parseArgs(process.argv)
  const apps = JSON.parse(args["apps-json"] || "[]")
  const missingOutOnly = args["missing-out-only"] === "true"
  const dryRun = args["dry-run"] === "true"
  const requestedConcurrency = Number.parseInt(
    args.concurrency || process.env.BUILD_APPS_CONCURRENCY || "1",
    10,
  )
  const concurrency = Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
    ? requestedConcurrency
    : 1

  if (!Array.isArray(apps)) {
    console.error("--apps-json must be a JSON array of app slugs")
    process.exit(1)
  }

  const queue = apps.filter((slug) => {
    if (!missingOutOnly) return true
    return !existsSync(join(ROOT, "apps", slug, "out"))
  })

  if (!queue.length) {
    console.log(missingOutOnly ? "All requested app outputs already exist." : "No apps requested.")
    return
  }

  console.log(`Building ${queue.length} app(s) with concurrency ${concurrency}.`)

  try {
    await runQueue(queue, concurrency, dryRun)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

void main()
