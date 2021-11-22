import { TLogLevelName } from 'tslog'
import { LogType } from '../providers/ts-log-provider'
import { FlowScannerConfig } from 'flow-scanner-lib/lib/config/flow-scanner-config'

export type DbConfig = {
  host: string
  port: number
  user: string
  password: string | undefined
  database: string
  awsCredentialsSecretName: string | undefined
  useSsl: boolean | 'rds'
}

export type SettingsConfig = {
  type: 'memory'
} | {
  type: 'sqlite'
  sqlite: {
    file: string
  }
} | {
  type: 'db'
  db: {
    connection: string
    tableName: string
  }
}

export type SqsConfig = {
  queueUrl: string
  messageGroupId: string
}

export type SnsConfig = {
  topicArn: string
  messageGroupId: string
}

export type HttpConfig = {
  endpoint: string
  sharedSecret: string | undefined
  uniqueChecker?: UniqueCheckerConfig
}

export type UniqueCheckerConfig = {
  type: 'sqlite'
  sqlite: {
    file: string
    groupId?: string
  }
} | {
  type: 'db'
  db: {
    connection: string
    tableName: string
    groupId?: string
  }
}

export type EventBroadcasterConfig = {
  type: 'console'
} | {
  type: 'http'
  http: HttpConfig
} | {
  type: 'sqs'
  sqs: SqsConfig
} | {
  type: 'sns'
  sns: SnsConfig
}

export type MetricsConfig = {
  type: 'cloudwatch'
  cloudwatch: {
    metricNamespace: string
    metricEnv: string
  }
}

export type AwsConfig = {
  useIam: boolean
  accessKeyId: string
  secretAccessKey: string
  region: string
}

export interface AppConfig extends FlowScannerConfig {
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
}
