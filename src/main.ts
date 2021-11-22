import { FlowScanner } from 'flow-scanner-lib'
import { delay } from 'flow-scanner-lib/lib/helpers/delay'
import { tsLogProvider } from './providers/ts-log-provider'
import { ConsoleEventBroadcaster } from 'flow-scanner-lib/lib/broadcaster/console-event-broadcaster'
import { MemorySettingsService } from 'flow-scanner-lib/lib/settings/memory-settings-service'
import { AppConfig, DbConfig, EventBroadcasterConfig } from './config/app-config'
import { SettingsServiceInterface } from 'flow-scanner-lib/lib/settings/settings-service'
import { DbSettingsService } from 'flow-scanner-lib/lib/settings/db-settings-service'
import { SqliteSettingsService } from 'flow-scanner-lib/lib/settings/sqlite-settings-service'
import { EventBroadcasterInterface } from 'flow-scanner-lib/lib/broadcaster/event-broadcaster'
import { Knex } from 'knex'
import { HttpEventBroadcaster } from 'flow-scanner-lib/lib/broadcaster/http-event-broadcaster'
import { LogProvider } from 'flow-scanner-lib/lib/providers/log-provider'
import { SqsEventBroadcaster } from 'flow-scanner-lib/lib/broadcaster/sqs-event-broadcaster'
import AWS, { CloudWatch, SNS, SQS } from 'aws-sdk'
import { UniqueEventBroadcaster } from 'flow-scanner-lib/lib/broadcaster/unique-event-broadcaster'
import { UniqueCheckerInterface } from 'flow-scanner-lib/lib/unique-checker/unique-checker'
import { SqliteUniqueChecker } from 'flow-scanner-lib/lib/unique-checker/sqlite-unique-checker'
import { DbUniqueChecker } from 'flow-scanner-lib/lib/unique-checker/db-unique-checker'
import { SnsEventBroadcaster } from 'flow-scanner-lib/lib/broadcaster/sns-event-broadcaster'
import { MulticastEventBroadcaster } from 'flow-scanner-lib/lib/broadcaster/multicast-event-broadcaster'
import { MetricServiceInterface } from 'flow-scanner-lib/lib/metrics/metric-service'
import { CloudwatchMetricService } from 'flow-scanner-lib/lib/metrics/cloudwatch-metric-service'

const createKnexConfig = (config: DbConfig): Knex.Config => {
  return {
    client: 'mysql2',
    connection: {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      timezone: '+00:00',
      dateStrings: true,
      ssl: config.useSsl === 'rds' ? 'Amazon RDS' : (config.useSsl ? true : undefined),
      charset: 'utf8mb4',
    },
  }
}

const createEventBroadcaster = (config: EventBroadcasterConfig, dbConnections: {[key: string]: DbConfig}, logProvider: LogProvider, startupMessages: string[]): EventBroadcasterInterface => {
  if (config.type === 'console') {
    return new ConsoleEventBroadcaster()
  } else if (config.type === 'http') {
    const httpBroadcaster = new HttpEventBroadcaster({
      endpoint: config.http.endpoint,
      hmacSharedSecret: config.http.sharedSecret,
    }, logProvider)

    if (config.http.uniqueChecker) {
      let uniqueChecker: UniqueCheckerInterface<any>

      if (config.http.uniqueChecker.type === 'sqlite') {
        uniqueChecker = new SqliteUniqueChecker(config.http.uniqueChecker.sqlite.file, config.http.uniqueChecker.sqlite.groupId)
      } else if (config.http.uniqueChecker.type === 'db') {
        uniqueChecker = new DbUniqueChecker(createKnexConfig(dbConnections[config.http.uniqueChecker.db.connection]!), config.http.uniqueChecker.db.tableName, config.http.uniqueChecker.db.groupId)
      } else {
        throw new Error(`Invalid unique checker type`)
      }

      startupMessages.push(`Using event broadcaster: http ${config.http.sharedSecret ? 'signed' : 'unsigned'} [unique: ${config.http.uniqueChecker.type}] (${config.http.endpoint})`)

      return new UniqueEventBroadcaster(async () => uniqueChecker, httpBroadcaster, logProvider)
    } else {
      startupMessages.push(`Using event broadcaster: http ${config.http.sharedSecret ? 'signed' : 'unsigned'} (${config.http.endpoint})`)
      return httpBroadcaster
    }
  } else if (config.type === 'sqs') {
    startupMessages.push(`Using event broadcaster: sqs (${config.sqs.queueUrl}, ${config.sqs.messageGroupId})`)
    return new SqsEventBroadcaster(config.sqs.queueUrl, config.sqs.messageGroupId, logProvider, new SQS())
  } else if (config.type === 'sns') {
    startupMessages.push(`Using event broadcaster: sns (${config.sns.topicArn}, ${config.sns.messageGroupId})`)
    return new SnsEventBroadcaster(config.sns.topicArn, config.sns.messageGroupId, logProvider, new SNS())
  } else {
    throw new Error('Invalid event broadcaster type')
  }
}

export const main = async (config: AppConfig) => {
  if (config.awsConfig) {
    AWS.config.update({
      credentials: config.awsConfig.useIam
        ? undefined
        : {
          accessKeyId: config.awsConfig.accessKeyId,
          secretAccessKey: config.awsConfig.secretAccessKey,
        },
      region: config.awsConfig.region,
    })
  }

  const configProvider = () => config
  // create the providers specific to this implementation
  const logProvider = tsLogProvider(configProvider) // ts-log logger

  const startupMessages: string[] = []

  // make sure we have cadence event types to listen for
  if (!config.cadenceEventTypes.length) {
    logProvider().error(`CADENCE_EVENT_TYPES environment variable is required`)
    process.exit(-1)
  }

  logProvider().info(`Starting flow-scanner, listening for the following event types:\n${config.cadenceEventTypes.map(e => `  - ${e}`).join('\n')}`)

  let settingsService: SettingsServiceInterface

  if (config.settingsConfig.type === 'memory') {
    settingsService = new MemorySettingsService()
    startupMessages.push('Using settings provider: memory')
  } else if (config.settingsConfig.type === 'sqlite') {
    settingsService = new SqliteSettingsService(config.settingsConfig.sqlite.file)
    startupMessages.push(`Using settings provider: sqlite (${config.settingsConfig.sqlite.file})`)
  } else if (config.settingsConfig.type === 'db') {
    settingsService = new DbSettingsService(createKnexConfig(config.dbConnections[config.settingsConfig.db.connection]!), config.settingsConfig.db.tableName)
    startupMessages.push('Using settings provider: db')
  } else {
    throw new Error('Invalid settings service config provided')
  }

  let eventBroadcaster: EventBroadcasterInterface

  if (!config.eventBroadcasters.length) {
    startupMessages.push('Using event broadcaster: console')
    eventBroadcaster = new ConsoleEventBroadcaster()
  } else if (config.eventBroadcasters.length === 1) {
    // just one event broadcaster, set it up normally
    eventBroadcaster = createEventBroadcaster(config.eventBroadcasters[0], config.dbConnections, logProvider, startupMessages)
  } else {
    // multiple event broadcasters configured, create multicast broadcaster
    eventBroadcaster = new MulticastEventBroadcaster(config.eventBroadcasters.map(e => async () => createEventBroadcaster(e, config.dbConnections, logProvider, startupMessages)), logProvider)
  }

  let metricService: CloudwatchMetricService | undefined

  if (config.metricsConfig?.type === 'cloudwatch') {
    // configure cloudwatch metrics
    metricService = new CloudwatchMetricService(config.metricsConfig.cloudwatch.metricNamespace, config.metricsConfig.cloudwatch.metricEnv, logProvider, new CloudWatch())
    startupMessages.push('Enabled CloudWatch metrics')
  }

  logProvider().info(`Using configuration:\n${startupMessages.map(e => `  - ${e}`).join('\n')}`)

  // create the scanner instance
  const flowScanner = new FlowScanner(
    config.cadenceEventTypes, // event types to monitor
    // pass in the configured providers
    {
      configProvider,
      logProvider: tsLogProvider(configProvider),
      eventBroadcasterProvider: async () => eventBroadcaster,
      settingsServiceProvider: async () => settingsService,
      metricServiceProvider: metricService ? ((metricService: MetricServiceInterface) => async () => metricService)(metricService) : undefined,
    })

  // start the scanner
  await flowScanner.start()

  let stop = false

  // listen for SIGTERM to stop the scanner
  process.on('SIGTERM', () => {
    logProvider().warn('SIGTERM received, shutting down')
    stop = true
  })

  process.on('SIGINT', () => {
    logProvider().warn('SIGINT received, shutting down')
    stop = true
  })

  // loop until the application is terminated
  while (!stop) {
    await delay(1000)
  }

  // stop the scanner
  await flowScanner.stop()

  if (metricService) {
    await metricService.stop()
  }

  await delay(5000)
  process.exit(0)
}
