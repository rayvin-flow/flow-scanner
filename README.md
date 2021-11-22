`flow-scanner` is a standalone service that can monitor the Flow blockchain for one or more Cadence event types and broadcast those events to one or more consumers. You can run it as a standalone service using the CLI, a Docker container, or use the underlying [flow-scanner-lib](https://github.com/rayvin-flow/flow-scanner-lib) to integrate it into your own application.

---

### Quickstart

You can install the preconfigured standalone CLI version of `flow-scanner` from NPM:

```shell
npm install -g @rayvin-flow/flow-scanner
```

Check out the [Environment Variables](#environment-variables) documentation below for configuration settings. Once your environment has been configured, you can start the scanner:

```shell
flow-scanner
```

Alternatively, a Docker image is also provided:

The Docker Hub repository can be found at [rayvinflow/flow-scanner](https://hub.docker.com/r/rayvinflow/flow-scanner). The current stable version uses the `1.x` tag.

Launch docker image with some default configuration values (check the [Environment Variables](#environment-variables) section for more info):

```shell
docker run -e FLOW_ACCESS_NODE=https://access-mainnet-beta.onflow.org -e CADENCE_EVENT_TYPES=A.c1e4f4f4c4257510.TopShotMarketV3.MomentListed -e APP_LOG_LEVEL=debug -e APP_LOG_TYPE=pretty rayvinflow/flow-scanner:1.x
```

You can also use an `.env` file (or any other method of setting environment variables for the docker container):
```shell
docker run --env-file=.env rayvinflow/flow-scanner:1.x
```

If you want to build your own docker image, you can follow the instructions below:

* Clone this repository
* Copy the `.env.example` file to `.env` and modify the appropriate entries (additional info on this below)
* Run `npm install` to install all dependencies
* Build the docker image using `docker-compose build`
* Launch the Docker container using `docker-compose up` (There is an equivalent command in the Makefile `make up`, or you can use `make up-d` to start and detach from the docker container)
* By default, the docker container is watching for changes to the code and will relaunch if any files are modified (using nodemon). If you do not want this, you can launch the container using `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up` (or `make up-prod`) to launch in production mode

`flow-scanner` is easily customized, so check out the [Development](#development) section below for more information.

---

### Environment Variables

All configuration values are read from the environment (using [dotenv](https://github.com/motdotla/dotenv/)). This will look for a `.env` file in the root of the project, and if you are deploying to AWS (or another cloud provider) then you can set environment variables however is applicable. All available environment variables are dsecribed below, but here is a quick example to configure Top Shot marketplace listings to be broadcast to an HTTP endpoint:

```dotenv
FLOW_ACCESS_NODE="https://access-mainnet-beta.onflow.org"
CADENCE_EVENT_TYPES="A.c1e4f4f4c4257510.TopShotMarketV3.MomentListed"
HTTP_EVENT_BROADCASTER_ENDPOINT="http://localhost/your-http-endpoint"
```

#### Required

| Name | Type | Value |
| :--- | --- | --- |
| `FLOW_ACCESS_NODE` | string | The flow access node to use for API requests (ie: https://access-mainnet-beta.onflow.org for mainnet)
| `CADENCE_EVENT_TYPES` | string, comma-separated | List of the Cadence event types that should be monitored |

#### Optional

| Name | Type | Value |
| :--- | --- | --- |
|`MAX_FLOW_REQUESTS_PER_SECOND` | integer | Maximum number of API requests per second that will be made to the Flow API |
|`DEFAULT_START_BLOCK_HEIGHT` |  integer | The block height to start scanning for events. Please note that the scanner currently only supports reading from the current spork, so you will not be able to go any further back than that. Make sure to set this to a reasonable starting number. The settings provider (if one was configured) will be used to store the processed block height and resume from there after the first run. |
|`APP_LOG_TYPE` | `pretty`, `json`, `hidden` | The format that will be used for console logging. This reference implementation uses [ts-log](https://github.com/kallaspriit/ts-log) for logging |
|`APP_LOG_LEVEL` | `debug`, `info`, `warn`, `error` |  Minimum level of messages that will be logged |

#### Aws Configuration

If you will be using AWS services (SNS, SQS, CloudWatch), then you will need to provide access credentials.

| Name | Type | Value |
| :--- | --- | --- |
|`AWS_ACCESS_KEY_ID` | string | AWS credentials if using AWS services |
|`AWS_SECRET_ACCESS_KE` | string |  AWS credentials if using AWS services |
|`AWS_REGION` | string | Region of AWS resources if using AWS services |
|`AWS_USE_IAM` | `true` `false` | USE IAM role rather than credentials to connect to AWS resources |

#### Database Connection

If you are going to be using a database connection (for the settings provider or unique checker), you must define the connection configuration. [Knex](https://github.com/knex/knex) is used for connecting to the database, and the mysql2 driver is the default. You can use any database that Knex supports, but you will need to modify the application in order to add the necessary driver and update the configuration. 

| Name | Type | Value |
| :--- | --- | --- |
|`DB_HOST`| string | Hostname for the database connection |
|`DB_PORT`| integer | Database port |
|`DB_USER`| string | Database user |
|`DB_PASSWORD`| string | Database password |
|`DB_DATABASE`| string | Name of the database |
|`DB_USE_SSL`| boolean | Use SSL for the database connection |

#### Settings Provider

The settings provider will be used to persist the block height that has been processed by the scanner. If you restart the scanner, it will resume at the last processed block height. You can also use the `memory` settings service, which will store the currently processed block height in-memory and it will not be persisted across application executions.

#### Settings Provider (sqlite)

| Name | Type | Value |
| :--- | --- | --- |
|`SETTINGS_PROVIDER`|`sqlite`| Type of settings provider to use |
|`SQLITE_SETTINGS_FILE` | string | Path to the SQLite file to use if using the SQLite settings provider |

#### Settings Provider (db)

If you are using the `db` settings provider, you need to specify the table name to store settings data. The table must already exist, and have the following schema (this example uses a table name of "settings"):

```sql
CREATE TABLE `settings` (
  `key` VARCHAR(32) NOT NULL,
  `value` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`key`)
);
```

| Name | Type | Value |
| :--- | --- | --- |
|`SETTINGS_PROVIDER`|`db`| Type of settings provider to use |
|`DB_SETTINGS_TABLE_NAME` | string |  |

#### Event Broadcaster

An event broadcaster is used to send the events that are scanned from the blockchain to a consumer. You can configure one or more of the event broadcasters described below. If you do not configure an event broadcaster, then all events are logged to the console.

#### Event Broadcaster (sqs)

If you want to use the AWS SQS event broadcaster, make sure you have configured the AWS credentials described above.

| Name | Type | Value |
| :--- | --- | --- |
|`SQS_EVENT_BROADCASTER_QUEUE_URL` | string | Required. Queue URL for the SQS queue to broadcast events to  |
|`SQS_EVENT_BROADCASTER_MESSAGE_GROUP_ID` | string | Optional. Message group ID used for message deduplication. By default, this is "flow-scanner-events" |

The SQS message will be JSON string in the following format:

```typescript
type Message = {
  chunkIndex: number // if there are more than 256 events in a transaction, it will be broken into chunks and sent as multiple messages
  chunkCount: number // number of chunks in this transaction
  blockHeight: number // block height of the transaction
  transactionId: string // id of the transaction
  events: [
    blockId: string // id of the block for this event
    blockHeight: number // block height for this event
    blockTimestamp: number // UNIX timestamp for the event
    type: string // Cadence event type
    transactionId: string // id of the transaction
    transactionIndex: number // index of the transaction
    eventIndex: number // index of the event in the transaction
    data: any // decoded payload for the event
  ]
}
```

#### Event Broadcaster (sns)

If you want to use the AWS SNS event broadcaster, make sure you have configured the AWS credentials described above.

| Name | Type | Value |
| :--- | --- | --- |
|`SNS_EVENT_BROADCASTER_TOPIC_ARN` | string | Topic ARN for the AWS SNS topic to broadcast events to  |
|`SNS_EVENT_BROADCASTER_MESSAGE_GROUP_ID` | string | Optional. Message group ID used for message deduplication. By default, this is "flow-scanner-events" |

The SNS message will be JSON string in the following format:

```typescript
type Message = {
  chunkIndex: number // if there are more than 256 events in a transaction, it will be broken into chunks and sent as multiple messages
  chunkCount: number // number of chunks in this transaction
  blockHeight: number // block height of the transaction
  transactionId: string // id of the transaction
  events: {
    blockId: string // id of the block for this event
    blockHeight: number // block height for this event
    blockTimestamp: number // UNIX timestamp for the event
    type: string // Cadence event type
    transactionId: string // id of the transaction
    transactionIndex: number // index of the transaction
    eventIndex: number // index of the event in the transaction
    data: any // decoded payload for the event
  }[]
}
```

#### Event Broadcaster (http)

If you want to broadcast events to an HTTP/s endpoint, define the following environment variables. 

| Name | Type | Value |
| :--- | --- | --- |
|`HTTP_EVENT_BROADCASTER_ENDPOINT` | string | Required. Endpoint to broadcast events to |
|`HTTP_EVENT_BROADCASTER_SHARED_SECRET` | string | Optional. If this is defined, it will be used to generate an HMAC-SHA512 hash to include with the payload for message verification. Details are included below. |

The HTTP event broadcaster will send a POST request to the configured endpoint. It will continually attempt delivery until a 200 response is received. The body of the request will be following JSON string:

```typescript
type Payload = {
  // this is the payload containing the events
  payload: {
    timestamp: number // UNIX timestamp that this payload was sent
    data: {
      transactionId: string // id of the Flow transaction
      blockHeight: number // Flow block height
      events: {
        blockId: string // id of the block for this event
        blockHeight: number // block height for this event
        blockTimestamp: number // UNIX timestamp for the event
        type: string // Cadence event type
        transactionId: string // id of the transaction
        transactionIndex: number // index of the transaction
        eventIndex: number // index of the event in the transaction
        data: any // decoded payload for the event
      }[]
    }
  }
  // this is only included if you have enabled message signing (details below)
  hmac?: {
    nonce: string // nonce to use when verifying the signature
    hash: string // HMAC-SHA512 hash (see below for verification instructions)
  }
}
```

If your HTTP endpoint is publicly accessible, you may want to enable message verification to make sure you are only processing data that you trust. If you have enabled messaging signing using the `HTTP_EVENT_BROADCASTER_SHARED_SECRET` environment variable, you can verify the payload using the [crypto-js](https://github.com/brix/crypto-js) library (or any equivalent library).

```typescript
import sha256 from 'crypto-js/sha256'
import Base64 from 'crypto-js/enc-base64'
import hmacSHA512 from 'crypto-js/hmac-sha512'

// this should be the body of the request sent to your endpoint
const payload = ...
// this should match the shared secret you defined in the HTTP_EVENT_BROADCASTER_SHARED_SECRET environment variable
const sharedSecret = ...

const message = JSON.stringify(payload.payload)
const hashDigest = sha256(payload.hmac.nonce + message)
const hmacDigest = Base64.stringify(hmacSHA512(message + hashDigest, sharedSecret))

if (payload.hmac.hash === hmacDigest) {
  // the message has been verified
}

```

#### HTTP Event Broadcaster Message Deduplication

The SNS and SQS event broadcasters use message deduplication to prevent the delivery of the same events more than once. If you are using HTTP, you can use one of the following providers to perform message deduplication before messages are sent.

#### Message Deduplication (sqlite)

You can use a SQLite database to eliminate the need for an external database server. The required database/tables will be created automatically at runtime.

| Name | Type | Value |
| :--- | --- | --- |
|`SQLITE_UNIQUE_CHECKER_FILE` | string | Path to SQLite file to use for deduplication data |
|`UNIQUE_CHECKER_GROUP_ID` | string | If multiple unique checkers are using the same sqlite file, then uniqueness will be limited to entries with the same group ID. This can be a string up to 16 characters in length |

#### Message Deduplication (db)

If you are using the `db` message deduplication, you need to specify the table name to store deduplication data. The table must already exist, and have the following schema (this example uses a table name of "deduplication"):

```sql
CREATE TABLE `deduplication` (
  `key` VARCHAR(128) NOT NULL,
  `lock_id` VARCHAR(64) NULL,
  `lock_timestamp` INT UNSIGNED NULL,
  `consumed` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`key`)
);
```

| Name | Type | Value |
| :--- | --- | --- |
|`DB_UNIQUE_CHECKER_TABLE_NAME` | string | Name of the table to use to store deduplication data.  |
|`UNIQUE_CHECKER_GROUP_ID` | string | If multiple unique checkers are using the same table, then uniqueness will be limited to entries with the same group ID. This can be a string up to 16 characters in length |

#### CloudWatch Metrics

![Screen Shot 2021-10-30 at 11 32 56 AM](https://user-images.githubusercontent.com/1111667/139554353-3beb8ea0-0640-4e3d-a442-ec11458743e7.png)

The scanner can optionally submit metrics for collection and reporting. Integration with AWS CloudWatch is included out-of-the-box.

| Name | Type | Value |
| :--- | --- | --- |
|`METRICS_PROVIDER` | `cloudwatch` | Only `cloudwatch` is implemented for now, but this can be extended |
|`CLOUDWATCH_METRICS_NAMESPACE` | string | Namespace to use for CloudWatch metrics |
|`CLOUDWATCH_METRICS_ENV` | string | Environment to use for CloudWatch metrics |

The following metrics are reported:

| Name | Description |
| :--- | :--- |
| FlowApiRequests | How many Flow API requests were made |
| FlowBlockHeightRequests| How many requests were made for the current block height from the Flow API  |
| FlowBlockHeightRequestDuration | How long the request for the block height took (in ms) |
| FlowBlockHeightRequestErrors | How many errors occurred while requesting the current block height from Flow |
| FlowEventRequests | How many requests were made for events from the Flow API |
| FlowEventRequestDuration | How long the request for events took (in ms) |
| FlowEventRequestErrors | How many errors occurred while requesting events  |
| FlowEventRequestFailures | How many failures occurred while requesting events (all retries exceeded) |
| ProcessBlockDuration | How long it took to process a block once all events were received (in ms) |
| BlocksProcessed | How many blocks have been processed (all events received and events were broadcast) |
| EventsBroadcasted | How many events have been broadcast |
| ProcessedBlockHeight | The current block height that has been processed |

---

### Development

`flow-scanner` is designed to be easily customized to fit into any solution. It is a wrapper around [flow-scanner-lib](https://github.com/rayvin-flow/flow-scanner-lib), so check out the docs in that repository for detailed info about the implementation and how to customize the features. A high-level overview of the `flow-scanner` repository is included below.

### Directory structure

`./config/env-config.ts` This file is responsible for reading all environment variables and putting them into a structured format

`./helpers` - Helper utility functions

`./providers` - Providers for the configuration and logging features

`./main.ts` - The main application code (explained in more detail below)

`./server.ts` - The entry point for the application

`./bin/cli.js` - Entry point for the CLI (when installed through `npm install`)

### Customization

The default implementation of `flow-scanner` is mostly just building a configuration based on the environment variables and passing them to the `FlowScanner` from [flow-scanner-lib](https://github.com/rayvin-flow/flow-scanner-lib). You can review `main.ts` to check out that implementation. Review the docs for [flow-scanner-lib](https://github.com/rayvin-flow/flow-scanner-lib) to read more about extending and customizing the scanner.
