/**
 * Scaffolds a first-party module skeleton under `modules/<name>/` — the wiring
 * (manifest, routes, controller, admin page) ready to grow. Add your own
 * models / migrations / services as the module needs them.
 *
 * Usage:  node ace make:module project-management --label="Project Management" --icon=Kanban
 */
import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'

function toPascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase() + s.slice(1))
    .join('')
}

function toTitle(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase() + s.slice(1))
    .join(' ')
}

export default class MakeModule extends BaseCommand {
  static commandName = 'make:module'
  static description = 'Scaffold a first-party module skeleton under modules/<name>'
  static options: CommandOptions = { startApp: false }

  @args.string({ description: 'Module name in kebab-case, e.g. project-management' })
  declare name: string

  @flags.string({ description: 'Human label for the sidebar (defaults to a title-cased name)' })
  declare label?: string

  @flags.string({ description: 'Phosphor icon name for the sidebar nav (default: Cube)' })
  declare icon?: string

  async run() {
    const name = this.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
    if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
      this.logger.error('Module name must be kebab-case and start with a letter.')
      this.exitCode = 1
      return
    }

    const dir = `modules/${name}`
    if (existsSync(dir)) {
      this.logger.error(`modules/${name} already exists.`)
      this.exitCode = 1
      return
    }

    const label = this.label?.trim() || toTitle(name)
    const icon = this.icon?.trim() || 'Cube'

    const files: Record<string, string> = {
      [`${dir}/module.ts`]: moduleTemplate(name, label, icon),
      [`${dir}/routes.ts`]: routesTemplate(name),
      [`${dir}/controllers/${name.replace(/-/g, '_')}_controller.ts`]: controllerTemplate(name),
      [`${dir}/ui/admin/index.tsx`]: uiTemplate(label),
    }

    await mkdir(`${dir}/controllers`, { recursive: true })
    await mkdir(`${dir}/ui/admin`, { recursive: true })
    for (const [path, contents] of Object.entries(files)) {
      await writeFile(path, contents, 'utf8')
      this.logger.success(`create ${path}`)
    }

    this.logger.info('')
    this.logger.info('Next steps:')
    // No registry edit: `modules/registry.ts` discovers any folder holding a
    // `module.ts` whose declared name matches the folder.
    this.logger.info(`  1. Add models / migrations / services under modules/${name}/ as needed.`)
    this.logger.info(`  2. Optional: ui/labels.ts for breadcrumbs, ui/puck/blocks.tsx for builder`)
    this.logger.info(`     blocks, tests/ for its own specs — all discovered by convention.`)
    this.logger.info(`  3. Restart dev (a fresh module folder needs a build to bundle its UI).`)
  }
}

function moduleTemplate(name: string, label: string, icon: string): string {
  const perm = name.replace(/-/g, '_')
  return `import { defineModule } from '#modules/types'
import { registerRoutes } from '#modules/${name}/routes'

export default defineModule({
  name: '${name}',
  label: '${label}',
  description: '${label} module.',
  version: '1.0.0',
  /**
   * Which Driftless versions this works with. Discovery refuses a package
   * outside the range rather than letting it fail later.
   */
  engines: { driftless: '>=1.0.0 <2.0.0' },
  /**
   * Off until "node ace modules:install ${name}" has run its migrations and
   * rebuilt the front-end. A module that switches itself on at the next boot
   * would be live before any of that happened.
   */
  autoEnable: false,
  permissions: [
    { name: '${perm}:read', description: 'View ${label}.' },
    { name: '${perm}:manage', description: 'Manage ${label}.' },
  ],
  nav: {
    label: '${label}',
    icon: '${icon}',
    order: 50,
    href: '/admin/${name}',
    permission: '${perm}:read',
  },
  registerRoutes,
})
`
}

function routesTemplate(name: string): string {
  const perm = name.replace(/-/g, '_')
  const file = `${name.replace(/-/g, '_')}_controller`
  /**
   * The controller const is named after the module, and every route gets an
   * explicit `.as()`.
   *
   * Adonis derives a route's name from the lazy-controller *variable* name, so
   * a template that always emitted `const Ctrl` gave every module the same
   * `ctrl.page` name — and the router rejects duplicates at boot. That made the
   * second module anyone ever scaffolded crash the application on startup.
   */
  const ctrl = `${toPascal(name)}Ctrl`
  return `import type { HttpRouterService } from '@adonisjs/core/types'
import type { NamedMiddleware } from '#modules/types'

const ${ctrl} = () => import('#modules/${name}/controllers/${file}')

export function registerRoutes(router: HttpRouterService, middleware: NamedMiddleware) {
  router
    .get('/admin/${name}', [${ctrl}, 'page'])
    .as('${perm}.page')
    .use(middleware.auth())
    .use(middleware.moduleEnabled({ name: '${name}' }))

  router
    .group(() => {
      router.get('/api/admin/${name}', [${ctrl}, 'index']).as('${perm}.index')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: '${perm}:read' }))
    .use(middleware.moduleEnabled({ name: '${name}' }))
}
`
}

function controllerTemplate(name: string): string {
  return `import type { HttpContext } from '@adonisjs/core/http'
import { renderPage } from '#helpers/inertia_render'

export default class ${toPascal(name)}Controller {
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/${name}/admin/index', {})
  }

  async index({ response }: HttpContext) {
    return response.json([])
  }
}
`
}

function uiTemplate(label: string): string {
  return `import { PageHeader } from '~/components/admin/page-header'

export default function ${toPascal(label)}AdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="${label}" subtitle="${label} module." />
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Your ${label} module is wired up. Start building here.
      </div>
    </div>
  )
}
`
}
