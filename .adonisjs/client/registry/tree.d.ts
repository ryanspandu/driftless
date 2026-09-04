/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  home: typeof routes['home']
  public: {
    post: typeof routes['public.post']
    offline: typeof routes['public.offline']
    page: typeof routes['public.page']
  }
  analytics: {
    collect: typeof routes['analytics.collect']
    report: typeof routes['analytics.report']
  }
  forms: {
    submit: typeof routes['forms.submit']
    page: typeof routes['forms.page']
    list: typeof routes['forms.list']
    updateStatus: typeof routes['forms.update_status']
    destroy: typeof routes['forms.destroy']
  }
  pagesPublic: {
    previewByToken: typeof routes['pages_public.preview_by_token']
    preview: typeof routes['pages_public.preview']
    show: typeof routes['pages_public.show']
  }
  publicContent: {
    index: typeof routes['public_content.index']
    show: typeof routes['public_content.show']
  }
  publicCms: {
    records: typeof routes['public_cms.records']
    record: typeof routes['public_cms.record']
  }
  publicTemplates: {
    show: typeof routes['public_templates.show']
  }
  media: {
    serve: typeof routes['media.serve']
    serveLegacy: typeof routes['media.serveLegacy']
    page: typeof routes['media.page']
    index: typeof routes['media.index']
    trash: typeof routes['media.trash']
    store: typeof routes['media.store']
    replace: typeof routes['media.replace']
    update: typeof routes['media.update']
    restore: typeof routes['media.restore']
    forceDestroy: typeof routes['media.force_destroy']
    destroy: typeof routes['media.destroy']
  }
  seo: {
    robots: typeof routes['seo.robots']
    sitemap: typeof routes['seo.sitemap']
  }
  health: {
    public: typeof routes['health.public']
    admin: typeof routes['health.admin']
  }
  settings: {
    getAuthConfig: typeof routes['settings.get_auth_config']
    settingsPage: typeof routes['settings.settings_page']
    appearanceSettingsPage: typeof routes['settings.appearance_settings_page']
    generalSettingsPage: typeof routes['settings.general_settings_page']
    websiteSettingsPage: typeof routes['settings.website_settings_page']
    applicationSettingsPage: typeof routes['settings.application_settings_page']
    integrationsPage: typeof routes['settings.integrations_page']
    integrationsGooglePage: typeof routes['settings.integrations_google_page']
    integrationsCaptchaPage: typeof routes['settings.integrations_captcha_page']
    integrationsGaPage: typeof routes['settings.integrations_ga_page']
    integrationsClarityPage: typeof routes['settings.integrations_clarity_page']
    getWebSettings: typeof routes['settings.get_web_settings']
    updateWebSettings: typeof routes['settings.update_web_settings']
    getIntegrationSettings: typeof routes['settings.get_integration_settings']
    updateIntegrationSettings: typeof routes['settings.update_integration_settings']
    getPageCode: typeof routes['settings.get_page_code']
    updatePageCode: typeof routes['settings.update_page_code']
    getBreakpoints: typeof routes['settings.get_breakpoints']
    updateBreakpoints: typeof routes['settings.update_breakpoints']
    apiTokensPage: typeof routes['settings.api_tokens_page']
    navConfig: typeof routes['settings.nav_config']
  }
  googleAuth: {
    status: typeof routes['google_auth.status']
    start: typeof routes['google_auth.start']
    callback: typeof routes['google_auth.callback']
  }
  newAccount: {
    create: typeof routes['new_account.create']
    store: typeof routes['new_account.store']
  }
  session: {
    create: typeof routes['session.create']
    store: typeof routes['session.store']
    twoFactor: {
      challenge: typeof routes['session.two_factor.challenge']
      verify: typeof routes['session.two_factor.verify']
    }
    destroy: typeof routes['session.destroy']
    me: typeof routes['session.me']
    updateProfile: typeof routes['session.update_profile']
  }
  passwordReset: {
    create: typeof routes['password_reset.create']
    store: typeof routes['password_reset.store']
    edit: typeof routes['password_reset.edit']
    update: typeof routes['password_reset.update']
  }
  legacy: {
    signup: {
      store: typeof routes['legacy.signup.store']
    }
  }
  twoFactor: {
    enroll: typeof routes['two_factor.enroll']
    confirm: typeof routes['two_factor.confirm']
    disable: typeof routes['two_factor.disable']
  }
  dashboard: {
    index: typeof routes['dashboard.index']
    analyticsPage: typeof routes['dashboard.analytics_page']
    profilePage: typeof routes['dashboard.profile_page']
  }
  redirects: {
    page: typeof routes['redirects.page']
    list: typeof routes['redirects.list']
    store: typeof routes['redirects.store']
    update: typeof routes['redirects.update']
    destroy: typeof routes['redirects.destroy']
  }
  users: {
    page: typeof routes['users.page']
    generatePassword: typeof routes['users.generate_password']
    index: typeof routes['users.index']
    trash: typeof routes['users.trash']
    store: typeof routes['users.store']
    restore: typeof routes['users.restore']
    forceDestroy: typeof routes['users.force_destroy']
    update: typeof routes['users.update']
    destroy: typeof routes['users.destroy']
  }
  roles: {
    page: typeof routes['roles.page']
    newPage: typeof routes['roles.new_page']
    detailPage: typeof routes['roles.detail_page']
    index: typeof routes['roles.index']
    trash: typeof routes['roles.trash']
    show: typeof routes['roles.show']
    store: typeof routes['roles.store']
    restore: typeof routes['roles.restore']
    forceDestroy: typeof routes['roles.force_destroy']
    update: typeof routes['roles.update']
    destroy: typeof routes['roles.destroy']
  }
  permissions: {
    page: typeof routes['permissions.page']
    newPage: typeof routes['permissions.new_page']
    detailPage: typeof routes['permissions.detail_page']
    index: typeof routes['permissions.index']
    trash: typeof routes['permissions.trash']
    show: typeof routes['permissions.show']
    store: typeof routes['permissions.store']
    restore: typeof routes['permissions.restore']
    forceDestroy: typeof routes['permissions.force_destroy']
    update: typeof routes['permissions.update']
    destroy: typeof routes['permissions.destroy']
  }
  content: {
    page: typeof routes['content.page']
    newPage: typeof routes['content.new_page']
    editPage: typeof routes['content.edit_page']
    index: typeof routes['content.index']
    trash: typeof routes['content.trash']
    checkSlug: typeof routes['content.check_slug']
    store: typeof routes['content.store']
    restore: typeof routes['content.restore']
    forceDestroy: typeof routes['content.force_destroy']
    update: typeof routes['content.update']
    destroy: typeof routes['content.destroy']
  }
  pages: {
    page: typeof routes['pages.page']
    edit: typeof routes['pages.edit']
    index: typeof routes['pages.index']
    trash: typeof routes['pages.trash']
    collections: typeof routes['pages.collections']
    codeComponents: typeof routes['pages.code_components']
    importOne: typeof routes['pages.import_one']
    bulk: typeof routes['pages.bulk']
    store: typeof routes['pages.store']
    restore: typeof routes['pages.restore']
    forceDestroy: typeof routes['pages.force_destroy']
    revisions: typeof routes['pages.revisions']
    restoreRevision: typeof routes['pages.restore_revision']
    saveDraft: typeof routes['pages.save_draft']
    publish: typeof routes['pages.publish']
    discardDraft: typeof routes['pages.discard_draft']
    previewToken: typeof routes['pages.preview_token']
    clearPreviewToken: typeof routes['pages.clear_preview_token']
    duplicate: typeof routes['pages.duplicate']
    exportOne: typeof routes['pages.export_one']
    show: typeof routes['pages.show']
    update: typeof routes['pages.update']
    destroy: typeof routes['pages.destroy']
  }
  templates: {
    page: typeof routes['templates.page']
    edit: typeof routes['templates.edit']
    index: typeof routes['templates.index']
    store: typeof routes['templates.store']
    duplicate: typeof routes['templates.duplicate']
    setDefault: typeof routes['templates.set_default']
    show: typeof routes['templates.show']
    update: typeof routes['templates.update']
    destroy: typeof routes['templates.destroy']
  }
  cms: {
    collectionsPage: typeof routes['cms.collections_page']
    collectionsNewPage: typeof routes['cms.collections_new_page']
    collectionDetailPage: typeof routes['cms.collection_detail_page']
    collectionsIndex: typeof routes['cms.collections_index']
    collectionsTrash: typeof routes['cms.collections_trash']
    collectionsShow: typeof routes['cms.collections_show']
    collectionsStore: typeof routes['cms.collections_store']
    collectionsRestore: typeof routes['cms.collections_restore']
    collectionsForceDestroy: typeof routes['cms.collections_force_destroy']
    collectionsUpdate: typeof routes['cms.collections_update']
    collectionsDestroy: typeof routes['cms.collections_destroy']
    fieldsStore: typeof routes['cms.fields_store']
    fieldsUpdate: typeof routes['cms.fields_update']
    fieldsReorder: typeof routes['cms.fields_reorder']
    fieldsDestroy: typeof routes['cms.fields_destroy']
    componentsPage: typeof routes['cms.components_page']
    componentsIndex: typeof routes['cms.components_index']
    componentsStore: typeof routes['cms.components_store']
    componentsUpdate: typeof routes['cms.components_update']
    componentsDestroy: typeof routes['cms.components_destroy']
    recordsPage: typeof routes['cms.records_page']
    newRecordPage: typeof routes['cms.new_record_page']
    recordDetailPage: typeof routes['cms.record_detail_page']
    recordsIndex: typeof routes['cms.records_index']
    recordsTrash: typeof routes['cms.records_trash']
    recordsShow: typeof routes['cms.records_show']
    recordsStore: typeof routes['cms.records_store']
    recordsRestore: typeof routes['cms.records_restore']
    recordsForceDestroy: typeof routes['cms.records_force_destroy']
    recordsUpdate: typeof routes['cms.records_update']
    recordsDestroy: typeof routes['cms.records_destroy']
    revisionsIndex: typeof routes['cms.revisions_index']
    revisionsRestore: typeof routes['cms.revisions_restore']
  }
  mailSettings: {
    page: typeof routes['mail_settings.page']
    show: typeof routes['mail_settings.show']
    update: typeof routes['mail_settings.update']
    sendTest: typeof routes['mail_settings.send_test']
    events: typeof routes['mail_settings.events']
    updateEvent: typeof routes['mail_settings.update_event']
    deliveries: typeof routes['mail_settings.deliveries']
  }
  apiTokens: {
    index: typeof routes['api_tokens.index']
    store: typeof routes['api_tokens.store']
    destroy: typeof routes['api_tokens.destroy']
  }
  schema: {
    pending: typeof routes['schema.pending']
    install: typeof routes['schema.install']
    uninstallModule: typeof routes['schema.uninstall_module']
  }
  moduleInstall: {
    deployment: typeof routes['module_install.deployment']
    detected: typeof routes['module_install.detected']
    latest: typeof routes['module_install.latest']
    show: typeof routes['module_install.show']
  }
  module: {
    install: typeof routes['module.install']
  }
  modules: {
    menu: typeof routes['modules.menu']
    index: typeof routes['modules.index']
    toggle: typeof routes['modules.toggle']
  }
  v1: {
    content: {
      index: typeof routes['v1.content.index']
      show: typeof routes['v1.content.show']
      store: typeof routes['v1.content.store']
      update: typeof routes['v1.content.update']
      destroy: typeof routes['v1.content.destroy']
    }
    cms: {
      index: typeof routes['v1.cms.index']
      show: typeof routes['v1.cms.show']
      store: typeof routes['v1.cms.store']
      update: typeof routes['v1.cms.update']
      destroy: typeof routes['v1.cms.destroy']
    }
  }
  admin: {
    page: typeof routes['admin.page']
    index: typeof routes['admin.index']
    store: typeof routes['admin.store']
    update: typeof routes['admin.update']
    destroy: typeof routes['admin.destroy']
  }
  ecommerce: {
    webhooks: {
      stripe: typeof routes['ecommerce.webhooks.stripe']
      paypal: typeof routes['ecommerce.webhooks.paypal']
    }
    dashboard: {
      page: typeof routes['ecommerce.dashboard.page']
    }
    products: {
      page: typeof routes['ecommerce.products.page']
      categories: typeof routes['ecommerce.products.categories']
      new: typeof routes['ecommerce.products.new']
      detail: typeof routes['ecommerce.products.detail']
    }
    orders: {
      page: typeof routes['ecommerce.orders.page']
      new: typeof routes['ecommerce.orders.new']
      detail: typeof routes['ecommerce.orders.detail']
    }
    customers: {
      page: typeof routes['ecommerce.customers.page']
    }
    settings: {
      page: typeof routes['ecommerce.settings.page']
    }
    api: {
      orders: {
        index: typeof routes['ecommerce.api.orders.index']
        show: typeof routes['ecommerce.api.orders.show']
        status: typeof routes['ecommerce.api.orders.status']
        cancel: typeof routes['ecommerce.api.orders.cancel']
        ship: typeof routes['ecommerce.api.orders.ship']
        note: typeof routes['ecommerce.api.orders.note']
        store: typeof routes['ecommerce.api.orders.store']
        refund: typeof routes['ecommerce.api.orders.refund']
      }
      sales: typeof routes['ecommerce.api.sales']
      abandonedCarts: typeof routes['ecommerce.api.abandonedCarts']
      currencies: {
        index: typeof routes['ecommerce.api.currencies.index']
        update: typeof routes['ecommerce.api.currencies.update']
      }
      shipping: {
        index: typeof routes['ecommerce.api.shipping.index']
        update: typeof routes['ecommerce.api.shipping.update']
      }
      storefront: {
        seed: typeof routes['ecommerce.api.storefront.seed']
      }
      customers: {
        index: typeof routes['ecommerce.api.customers.index']
        store: typeof routes['ecommerce.api.customers.store']
        status: typeof routes['ecommerce.api.customers.status']
      }
      exports: {
        orders: typeof routes['ecommerce.api.exports.orders']
        orderItems: typeof routes['ecommerce.api.exports.orderItems']
        customers: typeof routes['ecommerce.api.exports.customers']
        products: typeof routes['ecommerce.api.exports.products']
      }
      grants: {
        index: typeof routes['ecommerce.api.grants.index']
        revoke: typeof routes['ecommerce.api.grants.revoke']
      }
      gateways: {
        index: typeof routes['ecommerce.api.gateways.index']
        update: typeof routes['ecommerce.api.gateways.update']
        verify: typeof routes['ecommerce.api.gateways.verify']
      }
      products: {
        index: typeof routes['ecommerce.api.products.index']
        show: typeof routes['ecommerce.api.products.show']
        store: typeof routes['ecommerce.api.products.store']
        import: typeof routes['ecommerce.api.products.import']
        update: typeof routes['ecommerce.api.products.update']
        destroy: typeof routes['ecommerce.api.products.destroy']
      }
      variants: {
        store: typeof routes['ecommerce.api.variants.store']
        update: typeof routes['ecommerce.api.variants.update']
        destroy: typeof routes['ecommerce.api.variants.destroy']
      }
      assets: {
        index: typeof routes['ecommerce.api.assets.index']
        store: typeof routes['ecommerce.api.assets.store']
        update: typeof routes['ecommerce.api.assets.update']
        destroy: typeof routes['ecommerce.api.assets.destroy']
      }
      variantPrices: {
        index: typeof routes['ecommerce.api.variantPrices.index']
        update: typeof routes['ecommerce.api.variantPrices.update']
      }
      categories: {
        index: typeof routes['ecommerce.api.categories.index']
        store: typeof routes['ecommerce.api.categories.store']
        update: typeof routes['ecommerce.api.categories.update']
        destroy: typeof routes['ecommerce.api.categories.destroy']
      }
      settings: {
        show: typeof routes['ecommerce.api.settings.show']
        update: typeof routes['ecommerce.api.settings.update']
      }
      discounts: {
        index: typeof routes['ecommerce.api.discounts.index']
        store: typeof routes['ecommerce.api.discounts.store']
        update: typeof routes['ecommerce.api.discounts.update']
        destroy: typeof routes['ecommerce.api.discounts.destroy']
      }
      affiliates: {
        index: typeof routes['ecommerce.api.affiliates.index']
        accounts: typeof routes['ecommerce.api.affiliates.accounts']
        store: typeof routes['ecommerce.api.affiliates.store']
        approve: typeof routes['ecommerce.api.affiliates.approve']
        reject: typeof routes['ecommerce.api.affiliates.reject']
        update: typeof routes['ecommerce.api.affiliates.update']
      }
      commissions: {
        index: typeof routes['ecommerce.api.commissions.index']
        pay: typeof routes['ecommerce.api.commissions.pay']
        export: typeof routes['ecommerce.api.commissions.export']
      }
      withdrawals: {
        index: typeof routes['ecommerce.api.withdrawals.index']
        process: typeof routes['ecommerce.api.withdrawals.process']
      }
      stats: typeof routes['ecommerce.api.stats']
    }
    discounts: {
      page: typeof routes['ecommerce.discounts.page']
    }
    affiliates: {
      page: typeof routes['ecommerce.affiliates.page']
    }
    commissions: {
      page: typeof routes['ecommerce.commissions.page']
    }
    withdrawals: {
      page: typeof routes['ecommerce.withdrawals.page']
    }
  }
  shop: {
    products: {
      index: typeof routes['shop.products.index']
      show: typeof routes['shop.products.show']
    }
    categories: typeof routes['shop.categories']
    geo: {
      index: typeof routes['shop.geo.index']
      cities: typeof routes['shop.geo.cities']
    }
    availability: typeof routes['shop.availability']
    cart: {
      show: typeof routes['shop.cart.show']
      add: typeof routes['shop.cart.add']
      update: typeof routes['shop.cart.update']
      remove: typeof routes['shop.cart.remove']
      clear: typeof routes['shop.cart.clear']
      discount: {
        apply: typeof routes['shop.cart.discount.apply']
        remove: typeof routes['shop.cart.discount.remove']
      }
    }
    me: typeof routes['shop.me']
    order: {
      status: typeof routes['shop.order.status']
    }
    checkout: typeof routes['shop.checkout'] & {
      config: typeof routes['shop.checkout.config']
    }
    account: typeof routes['shop.account'] & {
      register: typeof routes['shop.account.register']
      login: typeof routes['shop.account.login']
      twoFactor: {
        verify: typeof routes['shop.account.two_factor.verify']
        enroll: typeof routes['shop.account.two_factor.enroll']
        confirm: typeof routes['shop.account.two_factor.confirm']
        disable: typeof routes['shop.account.two_factor.disable']
      }
      logout: typeof routes['shop.account.logout']
      orders: typeof routes['shop.account.orders']
      order: typeof routes['shop.account.order'] & {
        download: typeof routes['shop.account.order.download']
      }
      profile: typeof routes['shop.account.profile']
      password: typeof routes['shop.account.password']
      addresses: typeof routes['shop.account.addresses'] & {
        create: typeof routes['shop.account.addresses.create']
        update: typeof routes['shop.account.addresses.update']
        delete: typeof routes['shop.account.addresses.delete']
      }
      affiliate: {
        overview: typeof routes['shop.account.affiliate.overview']
        apply: typeof routes['shop.account.affiliate.apply']
        payout: typeof routes['shop.account.affiliate.payout']
        withdraw: typeof routes['shop.account.affiliate.withdraw']
      }
      page: {
        login: typeof routes['shop.account.page.login']
        register: typeof routes['shop.account.page.register']
      }
    }
    referral: typeof routes['shop.referral']
    currencies: typeof routes['shop.currencies']
    shipping: {
      options: typeof routes['shop.shipping.options']
    }
    currency: {
      set: typeof routes['shop.currency.set']
    }
    discount: {
      check: typeof routes['shop.discount.check']
    }
    front: typeof routes['shop.front']
    unsubscribe: typeof routes['shop.unsubscribe']
    product: typeof routes['shop.product']
    download: typeof routes['shop.download']
    page: {
      cart: typeof routes['shop.page.cart']
      checkout: typeof routes['shop.page.checkout']
      order: typeof routes['shop.page.order']
    }
  }
  mcp: {
    page: typeof routes['mcp.page']
    tokens: {
      index: typeof routes['mcp.tokens.index']
      store: typeof routes['mcp.tokens.store']
      destroy: typeof routes['mcp.tokens.destroy']
    }
    audit: typeof routes['mcp.audit']
    rpc: typeof routes['mcp.rpc']
    catalog: typeof routes['mcp.catalog']
    collections: {
      index: typeof routes['mcp.collections.index']
      show: typeof routes['mcp.collections.show']
      store: typeof routes['mcp.collections.store']
      update: typeof routes['mcp.collections.update']
      destroy: typeof routes['mcp.collections.destroy']
      fields: {
        add: typeof routes['mcp.collections.fields.add']
        update: typeof routes['mcp.collections.fields.update']
        delete: typeof routes['mcp.collections.fields.delete']
        reorder: typeof routes['mcp.collections.fields.reorder']
      }
    }
    pages: {
      index: typeof routes['mcp.pages.index']
      validate: typeof routes['mcp.pages.validate']
      show: typeof routes['mcp.pages.show']
      store: typeof routes['mcp.pages.store']
      update: typeof routes['mcp.pages.update']
      content: typeof routes['mcp.pages.content']
      publish: typeof routes['mcp.pages.publish']
      discard: typeof routes['mcp.pages.discard']
    }
    templates: {
      index: typeof routes['mcp.templates.index']
      show: typeof routes['mcp.templates.show']
      store: typeof routes['mcp.templates.store']
      update: typeof routes['mcp.templates.update']
      destroy: typeof routes['mcp.templates.destroy']
      default: typeof routes['mcp.templates.default']
    }
    appearance: typeof routes['mcp.appearance']
    breakpoints: typeof routes['mcp.breakpoints']
    globalcode: typeof routes['mcp.globalcode']
    media: {
      index: typeof routes['mcp.media.index']
      store: typeof routes['mcp.media.store']
    }
  }
  ctrl: {
    page: typeof routes['ctrl.page']
    index: typeof routes['ctrl.index']
    assignees: typeof routes['ctrl.assignees']
    store: typeof routes['ctrl.store']
    move: typeof routes['ctrl.move']
    update: typeof routes['ctrl.update']
    destroy: typeof routes['ctrl.destroy']
  }
}
