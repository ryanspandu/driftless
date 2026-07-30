import { BaseSchema } from '@adonisjs/lucid/schema'

/** Products, variants, images, categories and digital assets. */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_categories', (table) => {
      table.string('id').primary()
      table.string('slug', 160).notNullable().unique()
      table.string('name').notNullable()
      table.text('description').nullable()
      table.string('image_url').nullable()
      table
        .string('parent_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_categories')
        .onDelete('SET NULL')
      table.integer('position').notNullable().defaultTo(0)
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
      table.index(['parent_id', 'position'], 'ecom_categories_tree_index')
    })

    this.schema.createTable('ecommerce_products', (table) => {
      table.string('id').primary()
      table.string('slug', 200).notNullable().unique()
      table.string('title').notNullable()
      table.string('subtitle').nullable()

      // TipTap JSON, matching how the CMS stores rich text.
      table.jsonb('description').notNullable().defaultTo('{}')

      // physical → needs shipping and an address; digital → download grants.
      table.string('type', 16).notNullable().defaultTo('physical')
      table.string('status', 16).notNullable().defaultTo('draft') // draft|active|archived

      // Denormalised from the default variant so listings can sort and filter
      // without joining. Authoritative price always lives on the variant.
      table.bigInteger('price_from_amount').nullable()
      table.string('currency', 3).notNullable().defaultTo('USD')

      table.jsonb('seo').notNullable().defaultTo('{}')
      // Option axes, e.g. [{name:'Size',values:['S','M']}]. The cross-product
      // of these is what variants enumerate.
      table.jsonb('options').notNullable().defaultTo('[]')

      table.boolean('featured').notNullable().defaultTo(false)
      table.integer('position').notNullable().defaultTo(0)

      table
        .integer('created_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['status', 'position'], 'ecom_products_status_index')
      table.index(['type'], 'ecom_products_type_index')
    })

    this.schema.createTable('ecommerce_product_variants', (table) => {
      table.string('id').primary()
      table
        .string('product_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_products')
        .onDelete('CASCADE')

      table.string('title').notNullable() // e.g. "Large / Blue"
      // Nullable because not every store uses SKUs; unique when present so a
      // typo cannot silently create a duplicate.
      table.string('sku', 96).nullable().unique()

      // Money as integer minor units. Never a float, never NUMERIC (which
      // node-postgres returns as a string).
      table.bigInteger('price_amount').notNullable().defaultTo(0)
      table.bigInteger('compare_at_amount').nullable()
      /**
       * Cost of goods. Internal margin data — this column must never appear in
       * a storefront DTO, and there is a test that walks every public response
       * asserting exactly that.
       */
      table.bigInteger('cost_amount').nullable()

      table.integer('weight_grams').nullable()
      table.jsonb('option_values').notNullable().defaultTo('{}') // {Size:'L',Colour:'Blue'}

      // Stock is split so a reservation during checkout is visible without
      // decrementing what is actually on the shelf. Available = on_hand - reserved.
      table.integer('stock_on_hand').notNullable().defaultTo(0)
      table.integer('stock_reserved').notNullable().defaultTo(0)
      table.boolean('track_inventory').notNullable().defaultTo(true)
      table.boolean('allow_backorder').notNullable().defaultTo(false)

      table.string('image_url').nullable()
      table.integer('position').notNullable().defaultTo(0)

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['product_id', 'position'], 'ecom_variants_product_index')
    })

    this.schema.createTable('ecommerce_product_images', (table) => {
      table.string('id').primary()
      table
        .string('product_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_products')
        .onDelete('CASCADE')
      // Media is referenced by URL string throughout this codebase rather than
      // by `media.id`; following that convention keeps the existing picker
      // components usable unchanged.
      table.string('media_url').notNullable()
      table.string('alt').nullable()
      table.integer('position').notNullable().defaultTo(0)
      table.timestamps(true, true)
      table.index(['product_id', 'position'], 'ecom_product_images_index')
    })

    this.schema.createTable('ecommerce_product_categories', (table) => {
      table
        .string('product_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_products')
        .onDelete('CASCADE')
      table
        .string('category_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_categories')
        .onDelete('CASCADE')
      table.primary(['product_id', 'category_id'])
    })

    /**
     * Downloadable files for digital products.
     *
     * `storage_path` points outside the public static root — a file served
     * straight off disk would make the paywall decorative.
     */
    this.schema.createTable('ecommerce_digital_assets', (table) => {
      table.string('id').primary()
      table
        .string('variant_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_product_variants')
        .onDelete('CASCADE')
      table.string('filename').notNullable()
      table.string('storage_path').notNullable()
      table.string('mime_type', 128).nullable()
      table.bigInteger('size_bytes').nullable()
      // 0 = unlimited.
      table.integer('max_downloads').notNullable().defaultTo(0)
      table.integer('link_ttl_hours').notNullable().defaultTo(72)
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
      table.index(['variant_id'], 'ecom_digital_assets_variant_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_digital_assets')
    this.schema.dropTable('ecommerce_product_categories')
    this.schema.dropTable('ecommerce_product_images')
    this.schema.dropTable('ecommerce_product_variants')
    this.schema.dropTable('ecommerce_products')
    this.schema.dropTable('ecommerce_categories')
  }
}
