import appPool from './assets/app-pool.svg'
import application from './assets/application.svg'
import client from './assets/client.svg'
import database from './assets/database.svg'
import entryGateway from './assets/entry-gateway.svg'
import layerArrRouting from './assets/layer-arr-routing.svg'
import layerAuthentication from './assets/layer-authentication.svg'
import layerIpRestrictions from './assets/layer-ip-restrictions.svg'
import layerRedirect from './assets/layer-redirect.svg'
import layerRequestFiltering from './assets/layer-request-filtering.svg'
import layerUrlRewrite from './assets/layer-url-rewrite.svg'
import serverFarm from './assets/server-farm.svg'
import serverNode from './assets/server-node.svg'
import siteFtp from './assets/site-ftp.svg'
import siteWeb from './assets/site-web.svg'
import virtualDirectory from './assets/virtual-directory.svg'
import warningBadge from './assets/warning-badge.svg'

/** Static isometric artwork bundled with the application, keyed by asset name. */
export const diagramAssets: Record<string, string> = {
  'app-pool': appPool,
  application,
  client,
  database,
  'entry-gateway': entryGateway,
  'layer-arr-routing': layerArrRouting,
  'layer-authentication': layerAuthentication,
  'layer-ip-restrictions': layerIpRestrictions,
  'layer-redirect': layerRedirect,
  'layer-request-filtering': layerRequestFiltering,
  'layer-url-rewrite': layerUrlRewrite,
  'server-farm': serverFarm,
  'server-node': serverNode,
  'site-ftp': siteFtp,
  'site-web': siteWeb,
  'virtual-directory': virtualDirectory,
  'warning-badge': warningBadge,
}

export const assetUrl = (name: string) => diagramAssets[name] ?? diagramAssets['app-pool']
