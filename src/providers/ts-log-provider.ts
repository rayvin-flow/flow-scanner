import { Logger } from 'tslog'
import { AppConfigProvider } from './app-config-provider'

export enum LogType {
  json = 'json',
  pretty = 'pretty',
  hidden = 'hidden',
}

let logger: Logger | undefined

export const tsLogProvider = (configProvider: AppConfigProvider) => () => {
  if (!logger) {
    const config = configProvider()
    logger = new Logger({
      minLevel: config.appLogLevel,
      type: config.appLogType,
    })
  }

  return logger
}
