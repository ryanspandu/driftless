import type { Server } from 'node:http'

/**
 * The file descriptor systemd hands the first socket on. Fixed by the protocol:
 * inherited descriptors start at 3, immediately after stdin/stdout/stderr.
 */
const SD_LISTEN_FDS_START = 3

/**
 * Deliberately no imports beyond `node:http` types.
 *
 * This runs from the server callback, before the application container exists,
 * so it cannot reach for anything that resolves through it. That is also why
 * the flag lives here and `supervisor.ts` reads it, rather than the other way
 * round — the dependency only points one way.
 */
let socketActivated = false

export function isSocketActivated(): boolean {
  return socketActivated
}

/**
 * Adopt a listening socket passed down by systemd, if there is one.
 *
 * This is what makes a restart cost visitors *latency* instead of *errors*.
 * systemd holds the listening socket across the restart, so connections that
 * arrive while the process is down sit in the kernel's accept queue and are
 * answered once we come back. Nothing is refused. It is not zero downtime —
 * the client waits out a full boot — but it is the difference between a slow
 * page and a broken one.
 *
 * Returns whether the socket was adopted.
 */
export function adoptListenFd(server: Server): boolean {
  /**
   * The guard, and it comes before anything is touched.
   *
   * systemd sets `LISTEN_PID` to the pid it passed the descriptors to. Any
   * child that inherits the environment sees the same `LISTEN_FDS` and would
   * happily bind fd 3 — which in this application means the installer
   * subprocess stealing the web server's listening socket. Checking the pid is
   * the protocol's answer and it is not optional.
   */
  if (Number(process.env.LISTEN_PID) !== process.pid) return false
  if (Number(process.env.LISTEN_FDS) < 1) return false

  /** Record it before the next step destroys the evidence. */
  socketActivated = true

  /**
   * Scrub the handover variables, per the systemd convention.
   *
   * Doing it here rather than at spawn time makes it structural: by the time
   * any child of this process exists, the environment it would inherit no
   * longer describes a socket to claim.
   */
  delete process.env.LISTEN_FDS
  delete process.env.LISTEN_PID

  const originalListen = server.listen.bind(server)

  /**
   * Override the *instance's* `listen`, not the prototype.
   *
   * Ignitor calls `nodeHttpServer.listen(port, host)` unconditionally after the
   * server callback returns, and there is no hook between the two. Listening
   * ahead of it is not an option either — `net.Server.prototype.listen` throws
   * `ERR_SERVER_ALREADY_LISTEN` synchronously once `_handle` is set. So the only
   * shape that works is to redirect the call Ignitor is already going to make.
   *
   * `exclusive: true` additionally bypasses Node's `listenInCluster`, which
   * would otherwise try to round-robin the descriptor through a primary that
   * does not exist. That keeps this correct even if someone runs a
   * socket-activated unit under PM2 cluster by mistake.
   */
  server.listen = function listenFromSystemd() {
    return originalListen({ fd: SD_LISTEN_FDS_START, exclusive: true })
  } as typeof server.listen

  return true
}
