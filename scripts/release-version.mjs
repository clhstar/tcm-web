#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJsonPath = resolve(rootDir, 'package.json')
const usage = `Usage:
  pnpm release
  pnpm release -- --patch
  pnpm release -- --minor
  pnpm release -- --major
  pnpm release -- --version=0.2.0
  pnpm release -- --dry-run

Default behavior bumps the patch version, commits package.json, creates a vx.x.x tag,
then pushes main and the tag to origin. Tests are intentionally not run.`

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage)
    process.exit(0)
  }

  release(options)
} catch (error) {
  console.error(`\nRelease aborted: ${error.message}`)
  process.exit(error.status ?? 1)
}

function release(options) {
  ensureNodeVersion()
  ensureMainBranch()
  ensureGitClean()

  run('git', ['fetch', '--tags', 'origin', 'main'])
  if (!options.dryRun) {
    run('git', ['pull', '--ff-only', 'origin', 'main'])
    ensureGitClean()
  }

  const packageJson = readPackageJson()
  const currentVersion = packageJson.version
  const latestTagVersion = readLatestTagVersion()
  const baseVersion =
    latestTagVersion && compareVersions(latestTagVersion, currentVersion) > 0 ? latestTagVersion : currentVersion
  const nextVersion = options.version ?? bumpVersion(baseVersion, options.bump)
  const tagName = `v${nextVersion}`

  if (compareVersions(nextVersion, currentVersion) <= 0) {
    throw new Error(`Next version ${nextVersion} must be greater than current version ${currentVersion}.`)
  }
  if (latestTagVersion && compareVersions(nextVersion, latestTagVersion) <= 0) {
    throw new Error(`Next version ${nextVersion} must be greater than latest tag v${latestTagVersion}.`)
  }
  ensureTagAvailable(tagName)

  const head = output('git', ['rev-parse', '--short', 'HEAD']).trim()
  const latestTagLabel = latestTagVersion ? `latest tag v${latestTagVersion}` : 'no existing version tag'
  console.log(
    `Releasing ${packageJson.name ?? 'package'} ${currentVersion} -> ${nextVersion} from ${head} (${latestTagLabel}).`,
  )

  if (options.dryRun) {
    console.log(`Dry run only. Would commit "release: ${tagName}", create ${tagName}, then push main and ${tagName}.`)
    return
  }

  packageJson.version = nextVersion
  writePackageJson(packageJson)

  run('git', ['add', 'package.json'])
  run('git', ['commit', '-m', `release: ${tagName}`])
  run('git', ['tag', tagName])
  run('git', ['push', 'origin', 'main'])
  run('git', ['push', 'origin', tagName])

  console.log(`\nReleased ${tagName}.`)
}

function parseArgs(args) {
  const options = {
    bump: 'patch',
    bumpSpecified: false,
    dryRun: false,
    help: false,
    version: null,
  }

  for (const arg of args) {
    if (arg === '--') {
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--patch' || arg === '--minor' || arg === '--major') {
      if (options.bumpSpecified) {
        throw new Error('Choose only one of --patch, --minor, or --major.')
      }
      options.bump = arg.slice(2)
      options.bumpSpecified = true
      continue
    }
    if (arg.startsWith('--version=')) {
      options.version = arg.slice('--version='.length)
      continue
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage}`)
  }

  if (options.version && options.bumpSpecified) {
    throw new Error('Use either --version=x.x.x or a bump flag, not both.')
  }
  if (options.version) {
    parseVersion(options.version)
  }

  return options
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (!Number.isFinite(major) || major < 22) {
    throw new Error(`Node.js 22+ is required; current version is ${process.version}.`)
  }
}

function ensureMainBranch() {
  const branch = output('git', ['branch', '--show-current']).trim()
  if (branch !== 'main') {
    throw new Error(`Release must run on main, but current branch is ${branch || '(detached)'}.`)
  }
}

function ensureGitClean() {
  const status = output('git', ['status', '--porcelain']).trim()
  if (status) {
    throw new Error(`Working tree must be clean before releasing:\n${status}`)
  }
}

function ensureTagAvailable(tagName) {
  const matchingTags = output('git', ['tag', '--list', tagName]).trim()
  if (matchingTags) {
    throw new Error(`Tag ${tagName} already exists.`)
  }
}

function readLatestTagVersion() {
  const versions = output('git', ['tag', '--list', 'v*'])
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/^v/, ''))
    .filter((version) => isPlainSemver(version))
    .sort(compareVersions)

  return versions.at(-1) ?? null
}

function readPackageJson() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8'))
}

function writePackageJson(packageJson) {
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function bumpVersion(version, bump) {
  const parts = parseVersion(version)
  if (bump === 'major') return `${parts.major + 1}.0.0`
  if (bump === 'minor') return `${parts.major}.${parts.minor + 1}.0`
  return `${parts.major}.${parts.minor}.${parts.patch + 1}`
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Expected a plain semver version like 0.1.20, received: ${version}`)
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function isPlainSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version)
}

function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  return 0
}

function run(command, args) {
  console.log(`$ ${formatCommand(command, args)}`)
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
  })
}

function output(command, args) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(' ')
}

function shellQuote(value) {
  if (/^[a-zA-Z0-9_/:=@.,+-]+$/.test(value)) return value
  return JSON.stringify(value)
}
