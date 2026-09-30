import * as fs from 'node:fs';
import * as path from 'node:path';
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnStage, HttpApi, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  AccountRecovery,
  FeaturePlan,
  OAuthScope,
  ProviderAttribute,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolIdentityProviderGoogle,
} from 'aws-cdk-lib/aws-cognito';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { SecretValue } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { GravityService, REPO_ROOT } from './gravity-service';

export interface GravityStackProps extends StackProps {
  /** Comma-separated family emails. Initial value of the SSM allowlist. */
  allowedEmails: string;
  googleClientId: string;
  googleClientSecret: string;
  /**
   * OAuth client ID for the Google Health API (a separate client from the sign-in one, same Google Cloud project).
   * Optional: without it the Health page reports "not set up" and nothing can be connected. The matching client secret
   * is never in CloudFormation: create it by hand as the SecureString /gravity/health/google-client-secret (see README).
   */
  googleHealthClientId?: string;
  /** Built web app (apps/web/dist). Falls back to an empty folder for synth-only runs. */
  webDist?: string;
}

export const ALLOWLIST_PARAM = '/gravity/allowed-emails';
export const HEALTH_SECRET_PARAM = '/gravity/health/google-client-secret';

export class GravityStack extends Stack {
  constructor(scope: Construct, id: string, props: GravityStackProps) {
    super(scope, id, props);
    const region = this.region;

    // ---- Allowlist: the single source of truth for who may ever enter -------------------------------------------
    const allowlist = new StringParameter(this, 'Allowlist', {
      parameterName: ALLOWLIST_PARAM,
      stringValue: props.allowedEmails,
      description: 'Comma-separated emails allowed into Gravity. Checked at sign-up, at every token issue, and on every API call.',
    });

    // ---- Identity: Google-only Cognito pool, no self sign-up, allowlist enforced in two triggers ----------------
    const trigger = (name: string, file: string) =>
      new NodejsFunction(this, name, {
        entry: path.join(REPO_ROOT, 'services', 'auth', 'src', file),
        projectRoot: REPO_ROOT,
        depsLockFilePath: path.join(REPO_ROOT, 'package-lock.json'),
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        memorySize: 128,
        timeout: Duration.seconds(5),
        logGroup: new LogGroup(this, name + 'Logs', { retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
        environment: { ALLOWLIST_PARAM: allowlist.parameterName },
        bundling: { minify: true, sourceMap: false, target: 'node22' },
      });
    const preSignUp = trigger('PreSignUp', 'presignup.ts');
    const preToken = trigger('PreToken', 'pretoken.ts');
    allowlist.grantRead(preSignUp);
    allowlist.grantRead(preToken);

    const pool = new UserPool(this, 'Pool', {
      userPoolName: 'gravity',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      featurePlan: FeaturePlan.LITE,
      accountRecovery: AccountRecovery.NONE,
      removalPolicy: RemovalPolicy.RETAIN,
      lambdaTriggers: { preSignUp, preTokenGeneration: preToken },
    });
    const google = new UserPoolIdentityProviderGoogle(this, 'Google', {
      userPool: pool,
      clientId: props.googleClientId,
      clientSecretValue: SecretValue.unsafePlainText(props.googleClientSecret),
      scopes: ['openid', 'email', 'profile'],
      // email_verified must be mapped, or federated users are created unverified and the API (correctly) rejects them.
      attributeMapping: {
        email: ProviderAttribute.GOOGLE_EMAIL,
        emailVerified: ProviderAttribute.other('email_verified'),
        fullname: ProviderAttribute.GOOGLE_NAME,
      },
    });
    const domainPrefix = 'gravity-' + this.account;
    const domain = pool.addDomain('Domain', { cognitoDomain: { domainPrefix } });
    const hosted = domainPrefix + '.auth.' + region + '.amazoncognito.com';

    // ---- API (bare first; authorized routes are attached once the client exists, which breaks a dependency cycle) --
    const api = new HttpApi(this, 'Api', {
      apiName: 'gravity',
      corsPreflight: { allowOrigins: [], allowMethods: [CorsHttpMethod.ANY] }, // same-origin via CloudFront; no CORS
    });
    const stage = api.defaultStage!.node.defaultChild as CfnStage;
    stage.addPropertyOverride('DefaultRouteSettings', { ThrottlingBurstLimit: 40, ThrottlingRateLimit: 20 });

    // ---- Site: private S3 behind CloudFront, /api/* to API Gateway -------------------------------------------------
    const bucket = new Bucket(this, 'Site', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const headers = new ResponseHeadersPolicy(this, 'Headers', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self' https://*.amazoncognito.com https://cognito-idp." + region + '.amazonaws.com',
            "worker-src 'self'",
            "manifest-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        },
        strictTransportSecurity: { override: true, accessControlMaxAge: Duration.days(730), includeSubdomains: true, preload: true },
        contentTypeOptions: { override: true },
        frameOptions: { override: true, frameOption: HeadersFrameOption.DENY },
        referrerPolicy: { override: true, referrerPolicy: HeadersReferrerPolicy.NO_REFERRER },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()', override: true },
          { header: 'X-Robots-Tag', value: 'noindex, nofollow', override: true },
        ],
      },
    });
    // Rewrite extension-less paths to the SPA entry (a CloudFront Function, so API 403/404s are never rewritten).
    const spa = new CfFunction(this, 'SpaRewrite', {
      code: FunctionCode.fromInline(
        "function handler(e){var r=e.request;if(r.uri.indexOf('.')===-1){r.uri='/index.html';}return r;}",
      ),
    });
    const apiHost = Fn.select(2, Fn.split('/', api.apiEndpoint));
    const dist = new Distribution(this, 'Cdn', {
      comment: 'gravity',
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: spa, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new HttpOrigin(apiHost),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
      },
    });
    const siteUrl = 'https://' + dist.distributionDomainName;

    // ---- Cognito app client (needs the CloudFront URL for its callbacks) ------------------------------------------
    const client = new UserPoolClient(this, 'Client', {
      userPool: pool,
      generateSecret: false,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.GOOGLE],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [siteUrl + '/auth/callback', 'http://localhost:5174/auth/callback'],
        logoutUrls: [siteUrl + '/', 'http://localhost:5174/'],
      },
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });
    client.node.addDependency(google);

    // ---- Services ---------------------------------------------------------------------------------------------
    const authorizer = new HttpJwtAuthorizer('Cognito', 'https://cognito-idp.' + region + '.amazonaws.com/' + pool.userPoolId, {
      jwtAudience: [client.userPoolClientId],
    });
    const core = new GravityService(this, 'Core', { name: 'core', api, authorizer, allowlist });

    const health = new GravityService(this, 'Health', {
      name: 'health',
      api,
      authorizer,
      allowlist,
      readTables: [{ table: core.table, envName: 'CORE_TABLE' }],
      timeout: Duration.seconds(28),
      environment: {
        HEALTH_REDIRECT_URIS: [siteUrl, 'http://localhost:5174'].map((o) => o + '/app/health/callback').join(','),
        GOOGLE_HEALTH_SECRET_PARAM: HEALTH_SECRET_PARAM,
        ...(props.googleHealthClientId?.trim() ? { GOOGLE_HEALTH_CLIENT_ID: props.googleHealthClientId.trim() } : {}),
      },
    });
    // Refresh tokens live in SSM SecureStrings (free, unlike Secrets Manager); the function may only touch its own prefix.
    health.fn.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:PutParameter', 'ssm:DeleteParameter'],
        resources: [this.formatArn({ service: 'ssm', resource: 'parameter', resourceName: 'gravity/health/*' })],
      }),
    );
    // Keep data fresh without anyone opening the site. Also finishes any history import that was left half-done.
    new Rule(this, 'HealthSync', { schedule: Schedule.rate(Duration.hours(4)), targets: [new LambdaFunction(health.fn)] });

    new GravityService(this, 'Journal', {
      name: 'journal',
      api,
      authorizer,
      allowlist,
      readTables: [
        { table: core.table, envName: 'CORE_TABLE' },
        { table: health.table, envName: 'HEALTH_TABLE' },
      ],
    });

    // ---- Publish the SPA + runtime config ----------------------------------------------------------------------
    const webDist = props.webDist && fs.existsSync(props.webDist) ? props.webDist : path.join(REPO_ROOT, 'infra', 'empty-site');
    fs.mkdirSync(webDist, { recursive: true });
    new BucketDeployment(this, 'Deploy', {
      destinationBucket: bucket,
      distribution: dist,
      distributionPaths: ['/*'],
      sources: [
        Source.asset(webDist),
        Source.jsonData('config.json', {
          mode: 'cognito',
          cognito: { region, userPoolId: pool.userPoolId, clientId: client.userPoolClientId, domain: hosted },
        }),
      ],
      memoryLimit: 256,
    });

    new CfnOutput(this, 'SiteUrl', { value: siteUrl });
    new CfnOutput(this, 'GoogleRedirectUri', { value: 'https://' + hosted + '/oauth2/idpresponse', description: 'Add this to your Google OAuth client' });
    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new CfnOutput(this, 'CognitoDomain', { value: domain.domainName });
  }
}
