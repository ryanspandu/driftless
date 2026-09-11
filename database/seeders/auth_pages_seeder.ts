import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'

/**
 * Starting points for the auth screens, as ordinary builder documents.
 *
 * Seeded as **drafts** on purpose. These are examples an operator opens, styles
 * and publishes — publishing a sign-in page nobody asked for would put two live
 * URLs on their site the moment they seed. They stay invisible until published,
 * and the override picker only offers published pages, so nothing here can
 * take over `/login` by accident.
 *
 * Idempotent by path: a second run leaves an edited page alone rather than
 * overwriting the operator's work.
 */

/** Puck needs an id on every block; it is not derived from position. */
function block(type: string, props: Record<string, unknown> = {}) {
  return { type, props: { id: `${type}-${newUlid().toLowerCase().slice(-10)}`, ...props } }
}

/**
 * A container block, tagged so its slot wrapper can be neutralised.
 *
 * Puck renders every slot's children inside an unstyled `<div>` of its own.
 * Left alone, a container's `display: flex` lays out that one wrapper instead
 * of the children, and a percentage height resolves against a box nobody
 * authored. `sb-flow` pairs with the `display: contents` rule in {@link CSS} to
 * make the wrapper transparent. Same trick, and same reason, as
 * `staticbloom_home_seeder`.
 */
function box(type: string, props: Record<string, unknown> = {}) {
  const className = ['sb-flow', props.className].filter(Boolean).join(' ')
  return block(type, { ...props, className })
}

const CSS = `
.sb-flow>div:only-child{display:contents}
.sb-auth{display:flex;min-height:100vh}
.sb-auth-aside{display:none}
.sb-auth-main{display:flex;align-items:center;justify-content:center;flex:1;padding:48px 24px}
@media (min-width:960px){
  .sb-auth-aside{display:flex;flex-direction:column;justify-content:flex-end;width:44%;padding:40px}
  .sb-auth-main{width:56%}
}
`.trim()

/** Wrap a block tree as a Puck document with its stylesheet on the root. */
function doc(content: unknown[]) {
  return {
    root: {
      props: {
        codeSnippets: [
          { id: newUlid(), name: 'Auth page styles', lang: 'css', code: CSS, enabled: true },
        ],
      },
    },
    zones: {},
    content,
  }
}

/** The marketing half. Its image is left empty so the media picker fills it. */
function aside(headline: string) {
  return box('Container', {
    className: 'sb-auth-aside',
    bg: '#1E1B4B',
    textColor: '#FFFFFF',
    content: [
      block('Text', { text: 'You can easily', textSize: '14px' }),
      block('Heading', { text: headline, level: '2', textSize: '34px', lineHeight: '1.2' }),
    ],
  })
}

/** The form half: a heading, a line of context, and the working block. */
function main(title: string, subtitle: string, formBlock: unknown) {
  return box('Container', {
    className: 'sb-auth-main',
    content: [
      box('Container', {
        maxWidth: '380px',
        width: '100%',
        content: [
          block('Heading', { text: title, level: '1', textSize: '28px' }),
          block('Paragraph', { text: subtitle, textSize: '14px', margin: '4px 0 24px 0' }),
          formBlock,
        ],
      }),
    ],
  })
}

export default class extends BaseSeeder {
  async run() {
    await this.ensurePage({
      path: 'sign-in',
      title: 'Sign in',
      content: doc([
        box('Section', {
          className: 'sb-auth',
          content: [
            aside('Get access to your hub for content, clarity, and control.'),
            main(
              'Sign in',
              'Access drafts, published pages, and media in one place.',
              block('LoginForm')
            ),
          ],
        }),
      ]),
    })

    await this.ensurePage({
      path: 'sign-up',
      title: 'Sign up',
      content: doc([
        box('Section', {
          className: 'sb-auth',
          content: [
            aside('Start building pages your whole team can edit.'),
            main('Create account', 'It takes less than a minute.', block('RegisterForm')),
          ],
        }),
      ]),
    })
  }

  /** Create the page unless something already lives at that path. */
  private async ensurePage(input: {
    path: string
    title: string
    content: Record<string, unknown>
  }) {
    const existing = await Page.query().where('path', input.path).first()
    if (existing) return

    await Page.create({
      id: newUlid(),
      title: input.title,
      path: input.path,
      status: 'DRAFT',
      renderMode: 'SSR',
      kind: 'BUILDER',
      content: input.content,
      seo: { title: input.title, noindex: true },
      /**
       * No site header or footer. A sign-in screen owns the viewport — site
       * navigation above a login form invites the visitor to wander off the one
       * thing they came here to do.
       */
      hideHeader: true,
      hideFooter: true,
    } as never)
  }
}
