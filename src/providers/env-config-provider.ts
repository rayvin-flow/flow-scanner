import { EnvAppConfig } from '../config/env-config'
import { AppConfigProvider } from './app-config-provider'

export const envConfigProvider: AppConfigProvider = () => new EnvAppConfig()
