import { main } from './main'
import { envConfigProvider } from './providers/env-config-provider'

main(envConfigProvider()).then()
