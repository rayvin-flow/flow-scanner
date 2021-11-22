import { TLogLevelName } from 'tslog'
import dotenv from 'dotenv'
import { parseBool, parseStringArray } from '../helpers/string-helpers'
import { LogType } from '../providers/ts-log-provider'
import { AppConfig, AwsConfig, DbConfig, EventBroadcasterConfig, MetricsConfig, SettingsConfig, UniqueCheckerConfig } from './app-config'

dotenv.config()

export class EnvAppConfig implements AppConfig {
  readonly flowAccessNode: string
  readonly maxFlowRequestsPerSecond: number
  readonly cadenceEventTypes: string[]
  readonly defaultStartBlockHeight: number | undefined

  readonly appLogType: LogType
  readonly appLogLevel: TLogLevelName

  readonly settingsConfig: SettingsConfig
  readonly eventBroadcasters: EventBroadcasterConfig[]
  readonly metricsConfig: MetricsConfig | undefined
  readonly awsConfig: AwsConfig | undefined
  readonly dbConnections: {[key: string]: DbConfig}

  constructor () {
    const requiredEnv = [
      'FLOW_ACCESS_NODE',
      'CADENCE_EVENT_TYPES',
    ]

    for (const v of requiredEnv) {
      if (!process.env[v]) {
        console.error(`${v} environment variable is required`)
        process.exit(-1)
      }
    }

    this.flowAccessNode = process.env.FLOW_ACCESS_NODE!
    this.maxFlowRequestsPerSecond = process.env.MAX_FLOW_REQUESTS_PER_SECOND ? parseInt(process.env.MAX_FLOW_REQUESTS_PER_SECOND) : 10
    this.cadenceEventTypes = parseStringArray(process.env.CADENCE_EVENT_TYPES)
    this.defaultStartBlockHeight = process.env.DEFAULT_START_BLOCK_HEIGHT ? parseInt(process.env.DEFAULT_START_BLOCK_HEIGHT) : undefined

    this.appLogLevel = (process.env.APP_LOG_LEVEL ?? 'debug') as TLogLevelName
    this.appLogType = (process.env.APP_LOG_TYPE ?? 'json') as LogType

    this.awsConfig = process.env.AWS_ACCESS_KEY_ID
      ? {
        useIam: parseBool(process.env.AWS_USE_IAM),
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        region: process.env.AWS_REGION ?? '',
      }
      : undefined

    if (process.env.DB_CONNECTIONS_JSON) {
      // read JSON data for db connection config
      this.dbConnections = JSON.parse(process.env.DB_CONNECTIONS_JSON)
    } else {
      // use flat db connection config
      this.dbConnections = process.env.DB_HOST
        ? {
          'db': {
            host: process.env.DB_HOST ?? '',
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
            user: process.env.DB_USER ?? '',
            password: process.env.DB_PASSWORD,
            awsCredentialsSecretName: process.env.DB_AWS_CREDENTIALS_SECRET_NAME,
            database: process.env.DB_DATABASE ?? '',
            useSsl: (process.env.DB_USE_SSL ?? '').toLowerCase() === 'rds' ? 'rds' : parseBool(process.env.DB_USE_SSL),
          }
        }
        : {}
    }

    if (process.env.SETTINGS_PROVIDER_JSON) {
      // read JSON settings provider config
      this.settingsConfig = JSON.parse(process.env.SETTINGS_PROVIDER_JSON)
    } else {
      // use flat settings provider  config
      if (process.env.SETTINGS_PROVIDER === 'sqlite') {
        this.settingsConfig = {
          type: 'sqlite',
          sqlite: {
            file: process.env.SQLITE_SETTINGS_FILE!,
          }
        }
      } else if (process.env.SETTINGS_PROVIDER === 'db') {
        this.settingsConfig = {
          type: 'db',
          db: {
            connection: 'db',
            tableName: process.env.DB_SETTINGS_TABLE_NAME!,
          }
        }
      } else if (!process.env.SETTINGS_PROVIDER || process.env.SETTINGS_PROVIDER === 'memory') {
        this.settingsConfig = {
          type: 'memory',
        }
      } else {
        // unknown settings provider
        throw new Error(`Unknown settings provider: ${process.env.SETTINGS_PROVIDER}`)
      }
    }

    this.eventBroadcasters = []

    if (process.env.SQS_EVENT_BROADCASTER_QUEUE_URL) {
      this.eventBroadcasters.push({
        type: 'sqs',
        sqs: {
          queueUrl: process.env.SQS_EVENT_BROADCASTER_QUEUE_URL,
          messageGroupId: process.env.SQS_EVENT_BROADCASTER_MESSAGE_GROUP_ID || 'flow-scanner-events',
        }
      })
    }

    if (process.env.SNS_EVENT_BROADCASTER_TOPIC_ARN) {
      this.eventBroadcasters.push({
        type: 'sns',
        sns: {
          topicArn: process.env.SNS_EVENT_BROADCASTER_TOPIC_ARN,
          messageGroupId: process.env.SNS_EVENT_BROADCASTER_MESSAGE_GROUP_ID || 'flow-scanner-events',
        }
      })
    }

    if (process.env.HTTP_EVENT_BROADCASTER_ENDPOINT) {
      let uniqueChecker: UniqueCheckerConfig | undefined = undefined
      if (process.env.SQLITE_UNIQUE_CHECKER_FILE) {
        uniqueChecker = {
          type: 'sqlite',
          sqlite: {
            file: process.env.SQLITE_UNIQUE_CHECKER_FILE,
            groupId: process.env.UNIQUE_CHECKER_GROUP_ID,
          },
        }
      } else if (process.env.DB_UNIQUE_CHECKER_TABLE_NAME) {
        uniqueChecker = {
          type: 'db',
          db: {
            connection: 'db',
            tableName: process.env.DB_UNIQUE_CHECKER_TABLE_NAME,
            groupId: process.env.UNIQUE_CHECKER_GROUP_ID,
          },
        }
      }

      this.eventBroadcasters.push({
        type: 'http',
        http: {
          endpoint: process.env.HTTP_EVENT_BROADCASTER_ENDPOINT,
          sharedSecret: process.env.HTTP_EVENT_BROADCASTER_SHARED_SECRET,
          uniqueChecker,
        },
      })
    }

    if (process.env.METRICS_PROVIDER === 'cloudwatch') {
      this.metricsConfig = {
        type: 'cloudwatch',
        cloudwatch: {
          metricNamespace: process.env.CLOUDWATCH_METRICS_NAMESPACE!,
          metricEnv: process.env.CLOUDWATCH_METRICS_ENV!,
        },
      }
    }
  }
}
