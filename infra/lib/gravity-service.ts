import * as path from 'node:path';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { HttpApi, HttpMethod, type IHttpRouteAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IStringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

export interface GravityServiceProps {
  /** Service name: route prefix /api/<name>/*, folder services/<name>, table gravity-<name>. */
  name: string;
  api: HttpApi;
  authorizer: IHttpRouteAuthorizer;
  allowlist: IStringParameter;
  /** Give the function read-only access to another service's table (e.g. journal reads profiles from core). */
  readTables?: { table: Table; envName: string }[];
  /** Extra environment variables for the function. */
  environment?: Record<string, string>;
  /** Defaults to 10s. API Gateway itself gives up after 29s. */
  timeout?: Duration;
}

/**
 * One microservice = one Lambda + one on-demand DynamoDB table + one route prefix.
 * Adding a service to the family dashboard is: services/<name>/, one `new GravityService(...)`, one web module.
 */
export class GravityService extends Construct {
  readonly table: Table;
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: GravityServiceProps) {
    super(scope, id);
    const { name, api, authorizer, allowlist, readTables = [], environment = {}, timeout = Duration.seconds(10) } = props;

    this.table = new Table(this, 'Table', {
      tableName: 'gravity-' + name,
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN, // family data is never deleted by a stack teardown
    });

    this.fn = new NodejsFunction(this, 'Fn', {
      entry: path.join(REPO_ROOT, 'services', name, 'src', 'handler.ts'),
      projectRoot: REPO_ROOT,
      depsLockFilePath: path.join(REPO_ROOT, 'package-lock.json'),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout,
      logGroup: new LogGroup(this, 'Logs', { retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
      environment: { TABLE: this.table.tableName, ALLOWLIST_PARAM: allowlist.parameterName, ...environment },
      bundling: { minify: true, sourceMap: false, target: 'node22' },
    });
    this.table.grantReadWriteData(this.fn);
    allowlist.grantRead(this.fn);
    for (const r of readTables) {
      r.table.grantReadData(this.fn);
      this.fn.addEnvironment(r.envName, r.table.tableName);
    }

    api.addRoutes({
      path: '/api/' + name + '/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration(name + 'Integration', this.fn),
      authorizer,
    });
  }
}
