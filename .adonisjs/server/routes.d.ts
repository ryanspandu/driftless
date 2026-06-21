import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'legacy.signup.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'admin.store': { paramsTuple?: []; params?: {} }
    'admin.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public.page': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'public.page': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'public.page': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'legacy.signup.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'admin.store': { paramsTuple?: []; params?: {} }
  }
  PUT: {
    'admin.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'admin.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}