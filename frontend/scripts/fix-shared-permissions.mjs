import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')

function lookupUnixIdentity(command, args, parser) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })

  if (result.status !== 0) {
    return null
  }

  return parser(result.stdout.trim())
}

function resolveSharedIdentity(ownerName, groupName) {
  if (process.platform !== 'linux' || process.getuid?.() !== 0) {
    return null
  }

  const owner = `${ownerName || 'salesboat'}`.trim() || 'salesboat'
  const group = `${groupName || owner}`.trim() || owner
  const uid = lookupUnixIdentity('id', ['-u', owner], (value) => Number.parseInt(value, 10))
  const gid = lookupUnixIdentity('getent', ['group', group], (value) => {
    const segments = value.split(':')
    return Number.parseInt(segments[2] ?? '', 10)
  })

  if (!Number.isInteger(uid) || !Number.isInteger(gid)) {
    return null
  }

  return { uid, gid, owner, group }
}

function applyPathPermissions(targetPath, identity, summary) {
  if (!fs.existsSync(targetPath)) {
    return
  }

  const stat = fs.lstatSync(targetPath)
  if (stat.isSymbolicLink()) {
    return
  }

  const isDirectory = stat.isDirectory()
  const desiredMode = isDirectory ? 0o2775 : 0o664

  if (identity && (stat.uid !== identity.uid || stat.gid !== identity.gid)) {
    fs.chownSync(targetPath, identity.uid, identity.gid)
    summary.chownCount += 1
  }

  if ((stat.mode & 0o7777) !== desiredMode) {
    fs.chmodSync(targetPath, desiredMode)
    summary.chmodCount += 1
  }

  if (!isDirectory) {
    return
  }

  for (const entryName of fs.readdirSync(targetPath)) {
    applyPathPermissions(path.join(targetPath, entryName), identity, summary)
  }
}

export function syncSharedPermissions(targetPaths, options = {}) {
  const ownerName = options.ownerName ?? process.env.SALESBOAT_SHARED_OWNER ?? 'salesboat'
  const groupName = options.groupName ?? process.env.SALESBOAT_SHARED_GROUP ?? ownerName
  const identity = resolveSharedIdentity(ownerName, groupName)
  const summary = {
    owner: identity?.owner ?? '',
    group: identity?.group ?? '',
    chownCount: 0,
    chmodCount: 0,
    targets: []
  }

  for (const rawTargetPath of targetPaths) {
    const targetPath = path.resolve(rawTargetPath)
    summary.targets.push(targetPath)

    try {
      applyPathPermissions(targetPath, identity, summary)
    } catch (error) {
      console.warn(`[shared-perms] Failed to normalize ${targetPath}: ${error.message}`)
    }
  }

  return summary
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = syncSharedPermissions([
    path.join(frontendDir, 'public', 'gltf'),
    path.join(frontendDir, 'dist')
  ])

  const ownerGroup = summary.owner && summary.group
    ? `${summary.owner}:${summary.group}`
    : 'current-user'

  console.log(
    `[shared-perms] normalized ${summary.targets.length} target(s) for ${ownerGroup}; chown=${summary.chownCount}, chmod=${summary.chmodCount}`
  )
}
