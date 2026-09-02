import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'home': { paramsTuple?: []; params?: {} }
    'analytics.collect': { paramsTuple?: []; params?: {} }
    'forms.submit': { paramsTuple?: []; params?: {} }
    'media.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'media.serveLegacy': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.two_factor.challenge': { paramsTuple?: []; params?: {} }
    'session.two_factor.verify': { paramsTuple?: []; params?: {} }
    'password_reset.create': { paramsTuple?: []; params?: {} }
    'password_reset.store': { paramsTuple?: []; params?: {} }
    'password_reset.edit': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'password_reset.update': { paramsTuple?: []; params?: {} }
    'legacy.signup.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'v1.content.index': { paramsTuple?: []; params?: {} }
    'v1.content.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.content.store': { paramsTuple?: []; params?: {} }
    'v1.content.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.content.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.index': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'v1.cms.show': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'v1.cms.store': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'v1.cms.update': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'v1.cms.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'admin.store': { paramsTuple?: []; params?: {} }
    'admin.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public.page': { paramsTuple?: []; params?: {} }
    'ecommerce.webhooks.stripe': { paramsTuple?: []; params?: {} }
    'ecommerce.webhooks.paypal': { paramsTuple?: []; params?: {} }
    'shop.products.index': { paramsTuple?: []; params?: {} }
    'shop.products.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'shop.categories': { paramsTuple?: []; params?: {} }
    'shop.geo.index': { paramsTuple?: []; params?: {} }
    'shop.geo.cities': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'shop.availability': { paramsTuple?: []; params?: {} }
    'shop.cart.show': { paramsTuple?: []; params?: {} }
    'shop.me': { paramsTuple?: []; params?: {} }
    'shop.order.status': { paramsTuple?: []; params?: {} }
    'shop.checkout.config': { paramsTuple?: []; params?: {} }
    'shop.cart.add': { paramsTuple?: []; params?: {} }
    'shop.cart.update': { paramsTuple?: []; params?: {} }
    'shop.cart.remove': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'shop.cart.clear': { paramsTuple?: []; params?: {} }
    'shop.cart.discount.apply': { paramsTuple?: []; params?: {} }
    'shop.cart.discount.remove': { paramsTuple?: []; params?: {} }
    'shop.checkout': { paramsTuple?: []; params?: {} }
    'shop.account.register': { paramsTuple?: []; params?: {} }
    'shop.account.login': { paramsTuple?: []; params?: {} }
    'shop.account.two_factor.verify': { paramsTuple?: []; params?: {} }
    'shop.account.logout': { paramsTuple?: []; params?: {} }
    'shop.account.orders': { paramsTuple?: []; params?: {} }
    'shop.account.order': { paramsTuple: [ParamValue]; params: {'number': ParamValue} }
    'shop.account.order.download': { paramsTuple: [ParamValue,ParamValue]; params: {'number': ParamValue,'grantId': ParamValue} }
    'shop.account.profile': { paramsTuple?: []; params?: {} }
    'shop.account.password': { paramsTuple?: []; params?: {} }
    'shop.account.addresses': { paramsTuple?: []; params?: {} }
    'shop.account.addresses.create': { paramsTuple?: []; params?: {} }
    'shop.account.addresses.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'shop.account.addresses.delete': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'shop.account.affiliate.overview': { paramsTuple?: []; params?: {} }
    'shop.account.affiliate.apply': { paramsTuple?: []; params?: {} }
    'shop.account.affiliate.payout': { paramsTuple?: []; params?: {} }
    'shop.account.affiliate.withdraw': { paramsTuple?: []; params?: {} }
    'shop.account.two_factor.enroll': { paramsTuple?: []; params?: {} }
    'shop.account.two_factor.confirm': { paramsTuple?: []; params?: {} }
    'shop.account.two_factor.disable': { paramsTuple?: []; params?: {} }
    'shop.referral': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'shop.currencies': { paramsTuple?: []; params?: {} }
    'shop.shipping.options': { paramsTuple?: []; params?: {} }
    'shop.currency.set': { paramsTuple?: []; params?: {} }
    'shop.discount.check': { paramsTuple?: []; params?: {} }
    'shop.front': { paramsTuple?: []; params?: {} }
    'shop.unsubscribe': { paramsTuple?: []; params?: {} }
    'shop.account': { paramsTuple?: []; params?: {} }
    'shop.account.page.login': { paramsTuple?: []; params?: {} }
    'shop.account.page.register': { paramsTuple?: []; params?: {} }
    'shop.product': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'shop.download': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'shop.page.cart': { paramsTuple?: []; params?: {} }
    'shop.page.checkout': { paramsTuple?: []; params?: {} }
    'shop.page.order': { paramsTuple?: []; params?: {} }
    'ecommerce.dashboard.page': { paramsTuple?: []; params?: {} }
    'ecommerce.products.page': { paramsTuple?: []; params?: {} }
    'ecommerce.products.categories': { paramsTuple?: []; params?: {} }
    'ecommerce.products.new': { paramsTuple?: []; params?: {} }
    'ecommerce.products.detail': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.orders.page': { paramsTuple?: []; params?: {} }
    'ecommerce.orders.new': { paramsTuple?: []; params?: {} }
    'ecommerce.orders.detail': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.customers.page': { paramsTuple?: []; params?: {} }
    'ecommerce.settings.page': { paramsTuple?: []; params?: {} }
    'ecommerce.api.orders.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.orders.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.ship': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.note': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.sales': { paramsTuple?: []; params?: {} }
    'ecommerce.api.abandonedCarts': { paramsTuple?: []; params?: {} }
    'ecommerce.api.currencies.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.shipping.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.storefront.seed': { paramsTuple?: []; params?: {} }
    'ecommerce.api.shipping.update': { paramsTuple?: []; params?: {} }
    'ecommerce.api.currencies.update': { paramsTuple?: []; params?: {} }
    'ecommerce.api.customers.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.customers.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.customers.status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.exports.orders': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.orderItems': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.customers': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.products': { paramsTuple?: []; params?: {} }
    'ecommerce.api.grants.index': { paramsTuple: [ParamValue]; params: {'orderId': ParamValue} }
    'ecommerce.api.grants.revoke': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.refund': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.gateways.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.gateways.update': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway': ParamValue,'mode': ParamValue} }
    'ecommerce.api.gateways.verify': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway': ParamValue,'mode': ParamValue} }
    'ecommerce.api.products.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.products.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.products.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.products.import': { paramsTuple?: []; params?: {} }
    'ecommerce.api.products.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.products.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.variants.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.variants.update': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.variants.destroy': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.assets.index': { paramsTuple: [ParamValue]; params: {'productId': ParamValue} }
    'ecommerce.api.assets.store': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.assets.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.assets.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.variantPrices.index': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.variantPrices.update': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.categories.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.categories.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.categories.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.categories.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.settings.show': { paramsTuple?: []; params?: {} }
    'ecommerce.api.settings.update': { paramsTuple?: []; params?: {} }
    'ecommerce.discounts.page': { paramsTuple?: []; params?: {} }
    'ecommerce.affiliates.page': { paramsTuple?: []; params?: {} }
    'ecommerce.commissions.page': { paramsTuple?: []; params?: {} }
    'ecommerce.withdrawals.page': { paramsTuple?: []; params?: {} }
    'ecommerce.api.discounts.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.discounts.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.discounts.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.discounts.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.affiliates.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.accounts': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.approve': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.affiliates.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.affiliates.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.commissions.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.withdrawals.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.commissions.pay': { paramsTuple?: []; params?: {} }
    'ecommerce.api.commissions.export': { paramsTuple?: []; params?: {} }
    'ecommerce.api.withdrawals.process': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.stats': { paramsTuple?: []; params?: {} }
    'ctrl.page': { paramsTuple?: []; params?: {} }
    'ctrl.index': { paramsTuple?: []; params?: {} }
    'ctrl.assignees': { paramsTuple?: []; params?: {} }
    'ctrl.store': { paramsTuple?: []; params?: {} }
    'ctrl.move': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ctrl.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ctrl.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  GET: {
    'home': { paramsTuple?: []; params?: {} }
    'media.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'media.serveLegacy': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.two_factor.challenge': { paramsTuple?: []; params?: {} }
    'password_reset.create': { paramsTuple?: []; params?: {} }
    'password_reset.edit': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'v1.content.index': { paramsTuple?: []; params?: {} }
    'v1.content.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.index': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'v1.cms.show': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'public.page': { paramsTuple?: []; params?: {} }
    'shop.products.index': { paramsTuple?: []; params?: {} }
    'shop.products.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'shop.categories': { paramsTuple?: []; params?: {} }
    'shop.geo.index': { paramsTuple?: []; params?: {} }
    'shop.geo.cities': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'shop.cart.show': { paramsTuple?: []; params?: {} }
    'shop.me': { paramsTuple?: []; params?: {} }
    'shop.order.status': { paramsTuple?: []; params?: {} }
    'shop.checkout.config': { paramsTuple?: []; params?: {} }
    'shop.account.orders': { paramsTuple?: []; params?: {} }
    'shop.account.order': { paramsTuple: [ParamValue]; params: {'number': ParamValue} }
    'shop.account.order.download': { paramsTuple: [ParamValue,ParamValue]; params: {'number': ParamValue,'grantId': ParamValue} }
    'shop.account.addresses': { paramsTuple?: []; params?: {} }
    'shop.account.affiliate.overview': { paramsTuple?: []; params?: {} }
    'shop.referral': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'shop.currencies': { paramsTuple?: []; params?: {} }
    'shop.front': { paramsTuple?: []; params?: {} }
    'shop.unsubscribe': { paramsTuple?: []; params?: {} }
    'shop.account': { paramsTuple?: []; params?: {} }
    'shop.account.page.login': { paramsTuple?: []; params?: {} }
    'shop.account.page.register': { paramsTuple?: []; params?: {} }
    'shop.product': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'shop.download': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'shop.page.cart': { paramsTuple?: []; params?: {} }
    'shop.page.checkout': { paramsTuple?: []; params?: {} }
    'shop.page.order': { paramsTuple?: []; params?: {} }
    'ecommerce.dashboard.page': { paramsTuple?: []; params?: {} }
    'ecommerce.products.page': { paramsTuple?: []; params?: {} }
    'ecommerce.products.categories': { paramsTuple?: []; params?: {} }
    'ecommerce.products.new': { paramsTuple?: []; params?: {} }
    'ecommerce.products.detail': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.orders.page': { paramsTuple?: []; params?: {} }
    'ecommerce.orders.new': { paramsTuple?: []; params?: {} }
    'ecommerce.orders.detail': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.customers.page': { paramsTuple?: []; params?: {} }
    'ecommerce.settings.page': { paramsTuple?: []; params?: {} }
    'ecommerce.api.orders.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.orders.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.sales': { paramsTuple?: []; params?: {} }
    'ecommerce.api.abandonedCarts': { paramsTuple?: []; params?: {} }
    'ecommerce.api.currencies.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.shipping.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.customers.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.orders': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.orderItems': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.customers': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.products': { paramsTuple?: []; params?: {} }
    'ecommerce.api.grants.index': { paramsTuple: [ParamValue]; params: {'orderId': ParamValue} }
    'ecommerce.api.gateways.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.products.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.products.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.assets.index': { paramsTuple: [ParamValue]; params: {'productId': ParamValue} }
    'ecommerce.api.variantPrices.index': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.categories.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.settings.show': { paramsTuple?: []; params?: {} }
    'ecommerce.discounts.page': { paramsTuple?: []; params?: {} }
    'ecommerce.affiliates.page': { paramsTuple?: []; params?: {} }
    'ecommerce.commissions.page': { paramsTuple?: []; params?: {} }
    'ecommerce.withdrawals.page': { paramsTuple?: []; params?: {} }
    'ecommerce.api.discounts.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.accounts': { paramsTuple?: []; params?: {} }
    'ecommerce.api.commissions.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.withdrawals.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.commissions.export': { paramsTuple?: []; params?: {} }
    'ecommerce.api.stats': { paramsTuple?: []; params?: {} }
    'ctrl.page': { paramsTuple?: []; params?: {} }
    'ctrl.index': { paramsTuple?: []; params?: {} }
    'ctrl.assignees': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'home': { paramsTuple?: []; params?: {} }
    'media.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'media.serveLegacy': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.two_factor.challenge': { paramsTuple?: []; params?: {} }
    'password_reset.create': { paramsTuple?: []; params?: {} }
    'password_reset.edit': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'v1.content.index': { paramsTuple?: []; params?: {} }
    'v1.content.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.index': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'v1.cms.show': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'public.page': { paramsTuple?: []; params?: {} }
    'shop.products.index': { paramsTuple?: []; params?: {} }
    'shop.products.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'shop.categories': { paramsTuple?: []; params?: {} }
    'shop.geo.index': { paramsTuple?: []; params?: {} }
    'shop.geo.cities': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'shop.cart.show': { paramsTuple?: []; params?: {} }
    'shop.me': { paramsTuple?: []; params?: {} }
    'shop.order.status': { paramsTuple?: []; params?: {} }
    'shop.checkout.config': { paramsTuple?: []; params?: {} }
    'shop.account.orders': { paramsTuple?: []; params?: {} }
    'shop.account.order': { paramsTuple: [ParamValue]; params: {'number': ParamValue} }
    'shop.account.order.download': { paramsTuple: [ParamValue,ParamValue]; params: {'number': ParamValue,'grantId': ParamValue} }
    'shop.account.addresses': { paramsTuple?: []; params?: {} }
    'shop.account.affiliate.overview': { paramsTuple?: []; params?: {} }
    'shop.referral': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'shop.currencies': { paramsTuple?: []; params?: {} }
    'shop.front': { paramsTuple?: []; params?: {} }
    'shop.unsubscribe': { paramsTuple?: []; params?: {} }
    'shop.account': { paramsTuple?: []; params?: {} }
    'shop.account.page.login': { paramsTuple?: []; params?: {} }
    'shop.account.page.register': { paramsTuple?: []; params?: {} }
    'shop.product': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'shop.download': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'shop.page.cart': { paramsTuple?: []; params?: {} }
    'shop.page.checkout': { paramsTuple?: []; params?: {} }
    'shop.page.order': { paramsTuple?: []; params?: {} }
    'ecommerce.dashboard.page': { paramsTuple?: []; params?: {} }
    'ecommerce.products.page': { paramsTuple?: []; params?: {} }
    'ecommerce.products.categories': { paramsTuple?: []; params?: {} }
    'ecommerce.products.new': { paramsTuple?: []; params?: {} }
    'ecommerce.products.detail': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.orders.page': { paramsTuple?: []; params?: {} }
    'ecommerce.orders.new': { paramsTuple?: []; params?: {} }
    'ecommerce.orders.detail': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.customers.page': { paramsTuple?: []; params?: {} }
    'ecommerce.settings.page': { paramsTuple?: []; params?: {} }
    'ecommerce.api.orders.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.orders.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.sales': { paramsTuple?: []; params?: {} }
    'ecommerce.api.abandonedCarts': { paramsTuple?: []; params?: {} }
    'ecommerce.api.currencies.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.shipping.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.customers.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.orders': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.orderItems': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.customers': { paramsTuple?: []; params?: {} }
    'ecommerce.api.exports.products': { paramsTuple?: []; params?: {} }
    'ecommerce.api.grants.index': { paramsTuple: [ParamValue]; params: {'orderId': ParamValue} }
    'ecommerce.api.gateways.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.products.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.products.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.assets.index': { paramsTuple: [ParamValue]; params: {'productId': ParamValue} }
    'ecommerce.api.variantPrices.index': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.categories.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.settings.show': { paramsTuple?: []; params?: {} }
    'ecommerce.discounts.page': { paramsTuple?: []; params?: {} }
    'ecommerce.affiliates.page': { paramsTuple?: []; params?: {} }
    'ecommerce.commissions.page': { paramsTuple?: []; params?: {} }
    'ecommerce.withdrawals.page': { paramsTuple?: []; params?: {} }
    'ecommerce.api.discounts.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.accounts': { paramsTuple?: []; params?: {} }
    'ecommerce.api.commissions.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.withdrawals.index': { paramsTuple?: []; params?: {} }
    'ecommerce.api.commissions.export': { paramsTuple?: []; params?: {} }
    'ecommerce.api.stats': { paramsTuple?: []; params?: {} }
    'ctrl.page': { paramsTuple?: []; params?: {} }
    'ctrl.index': { paramsTuple?: []; params?: {} }
    'ctrl.assignees': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'analytics.collect': { paramsTuple?: []; params?: {} }
    'forms.submit': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.two_factor.verify': { paramsTuple?: []; params?: {} }
    'password_reset.store': { paramsTuple?: []; params?: {} }
    'password_reset.update': { paramsTuple?: []; params?: {} }
    'legacy.signup.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'v1.content.store': { paramsTuple?: []; params?: {} }
    'v1.cms.store': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'admin.store': { paramsTuple?: []; params?: {} }
    'ecommerce.webhooks.stripe': { paramsTuple?: []; params?: {} }
    'ecommerce.webhooks.paypal': { paramsTuple?: []; params?: {} }
    'shop.availability': { paramsTuple?: []; params?: {} }
    'shop.cart.add': { paramsTuple?: []; params?: {} }
    'shop.cart.discount.apply': { paramsTuple?: []; params?: {} }
    'shop.checkout': { paramsTuple?: []; params?: {} }
    'shop.account.register': { paramsTuple?: []; params?: {} }
    'shop.account.login': { paramsTuple?: []; params?: {} }
    'shop.account.two_factor.verify': { paramsTuple?: []; params?: {} }
    'shop.account.logout': { paramsTuple?: []; params?: {} }
    'shop.account.addresses.create': { paramsTuple?: []; params?: {} }
    'shop.account.affiliate.apply': { paramsTuple?: []; params?: {} }
    'shop.account.affiliate.withdraw': { paramsTuple?: []; params?: {} }
    'shop.account.two_factor.enroll': { paramsTuple?: []; params?: {} }
    'shop.account.two_factor.confirm': { paramsTuple?: []; params?: {} }
    'shop.account.two_factor.disable': { paramsTuple?: []; params?: {} }
    'shop.shipping.options': { paramsTuple?: []; params?: {} }
    'shop.currency.set': { paramsTuple?: []; params?: {} }
    'shop.discount.check': { paramsTuple?: []; params?: {} }
    'ecommerce.api.orders.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.ship': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.storefront.seed': { paramsTuple?: []; params?: {} }
    'ecommerce.api.customers.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.grants.revoke': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.refund': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.gateways.verify': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway': ParamValue,'mode': ParamValue} }
    'ecommerce.api.products.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.products.import': { paramsTuple?: []; params?: {} }
    'ecommerce.api.variants.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.assets.store': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.categories.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.discounts.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.store': { paramsTuple?: []; params?: {} }
    'ecommerce.api.affiliates.approve': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.affiliates.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.commissions.pay': { paramsTuple?: []; params?: {} }
    'ecommerce.api.withdrawals.process': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ctrl.store': { paramsTuple?: []; params?: {} }
  }
  PUT: {
    'v1.content.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.update': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'shop.cart.update': { paramsTuple?: []; params?: {} }
    'shop.account.profile': { paramsTuple?: []; params?: {} }
    'shop.account.password': { paramsTuple?: []; params?: {} }
    'shop.account.addresses.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'shop.account.affiliate.payout': { paramsTuple?: []; params?: {} }
    'ecommerce.api.orders.status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.orders.note': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.shipping.update': { paramsTuple?: []; params?: {} }
    'ecommerce.api.currencies.update': { paramsTuple?: []; params?: {} }
    'ecommerce.api.customers.status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.gateways.update': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway': ParamValue,'mode': ParamValue} }
    'ecommerce.api.products.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.variants.update': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.assets.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.variantPrices.update': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.categories.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.settings.update': { paramsTuple?: []; params?: {} }
    'ecommerce.api.discounts.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.affiliates.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ctrl.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'v1.content.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'shop.cart.remove': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'shop.cart.clear': { paramsTuple?: []; params?: {} }
    'shop.cart.discount.remove': { paramsTuple?: []; params?: {} }
    'shop.account.addresses.delete': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.products.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.variants.destroy': { paramsTuple: [ParamValue]; params: {'variantId': ParamValue} }
    'ecommerce.api.assets.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.categories.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ecommerce.api.discounts.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ctrl.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
    'ctrl.move': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}