import { test } from '@japa/runner'
import { detectSupervisorMode, type SupervisorInputs } from '#services/supervisor'

/**
 * Mode detection decides what the install dialog promises an operator about
 * their site. Every case here is one sentence a real person reads and plans
 * around, so the mapping is worth pinning down rather than eyeballing.
 *
 * `detectSupervisorMode` takes its inputs as an argument precisely so this can
 * be a pure-function test: reaching for `process.env` and `node:cluster`
 * directly would have made it untestable without a real supervisor.
 */
function inputs(over: Partial<SupervisorInputs> = {}): SupervisorInputs {
  return {
    env: {},
    pid: 4242,
    managedByPm2: false,
    isClusterWorker: false,
    socketActivated: false,
    ...over,
  }
}

test.group('Supervisor mode', () => {
  test('nothing supervising it is "none"', ({ assert }) => {
    assert.equal(detectSupervisorMode(inputs()), 'none')
  })

  test('PM2 in fork mode', ({ assert }) => {
    assert.equal(detectSupervisorMode(inputs({ managedByPm2: true })), 'pm2-fork')
  })

  test('PM2 in cluster mode', ({ assert }) => {
    assert.equal(
      detectSupervisorMode(inputs({ managedByPm2: true, isClusterWorker: true })),
      'pm2-cluster'
    )
  })

  test('plain systemd', ({ assert }) => {
    assert.equal(detectSupervisorMode(inputs({ env: { INVOCATION_ID: 'abc' } })), 'systemd')
  })

  test('socket activation wins over plain systemd', ({ assert }) => {
    /**
     * The ordering case, and the one that would silently regress. A
     * socket-activated unit *also* has INVOCATION_ID, so checking systemd first
     * would report every socket-activated install as `gap` — telling operators
     * their site goes down when it does not.
     */
    assert.equal(
      detectSupervisorMode(inputs({ env: { INVOCATION_ID: 'abc' }, socketActivated: true })),
      'systemd-socket'
    )
  })

  test('pid 1 is a container', ({ assert }) => {
    assert.equal(detectSupervisorMode(inputs({ pid: 1 })), 'container')
  })

  test('PM2 is reported ahead of the container check', ({ assert }) => {
    // PM2 inside a container is common, and the PM2 answer is the specific one.
    assert.equal(detectSupervisorMode(inputs({ pid: 1, managedByPm2: true })), 'pm2-fork')
  })

  test('an unrecognised supervisor can declare itself', ({ assert }) => {
    assert.equal(
      detectSupervisorMode(inputs({ env: { DRIFTLESS_SUPERVISED: '1' } })),
      'declared'
    )
  })

  test('DRIFTLESS_SUPERVISED=0 does not count as declared', ({ assert }) => {
    assert.equal(detectSupervisorMode(inputs({ env: { DRIFTLESS_SUPERVISED: '0' } })), 'none')
  })
})
