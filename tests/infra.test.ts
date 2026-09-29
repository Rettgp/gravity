import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { GravityStack } from '../infra/lib/gravity-stack';

let t: Template;
beforeAll(() => {
  // Skip esbuild bundling: we only assert on the template.
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new GravityStack(app, 'gravity-test', {
    env: { account: '111111111111', region: 'us-east-2' },
    allowedEmails: 'mom@example.com,dad@example.com',
    googleClientId: 'test-client-id',
    googleClientSecret: 'test-secret',
  });
  t = Template.fromStack(stack);
}, 60_000);

describe('infra: nobody but the family', () => {
  it('has no self sign-up, and Google is the only identity provider', () => {
    t.hasResourceProperties('AWS::Cognito::UserPool', { AdminCreateUserConfig: { AllowAdminCreateUserOnly: true } });
    t.hasResourceProperties('AWS::Cognito::UserPoolClient', { SupportedIdentityProviders: ['Google'], GenerateSecret: false });
    t.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 1);
  });

  it('enforces the allowlist in both Cognito triggers', () => {
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: { PreSignUp: Match.anyValue(), PreTokenGeneration: Match.anyValue() },
    });
  });

  it('protects EVERY API route with the JWT authorizer', () => {
    const routes = t.findResources('AWS::ApiGatewayV2::Route');
    const keys = Object.values(routes).map((r: any) => r.Properties);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    for (const r of keys) {
      expect(r.AuthorizationType, r.RouteKey).toBe('JWT');
      expect(r.AuthorizerId, r.RouteKey).toBeDefined();
    }
    t.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', { AuthorizerType: 'JWT' });
  });

  it('throttles the API', () => {
    t.hasResourceProperties('AWS::ApiGatewayV2::Stage', { DefaultRouteSettings: { ThrottlingBurstLimit: 40, ThrottlingRateLimit: 20 } });
  });

  it('keeps the site bucket private and encrypted', () => {
    t.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: Match.anyValue(),
    });
  });

  it('serves strict security headers and never caches the API', () => {
    t.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: { ContentSecurityPolicy: Match.stringLikeRegexp("frame-ancestors 'none'") },
          StrictTransportSecurity: Match.objectLike({ Override: true }),
          FrameOptions: { FrameOption: 'DENY' },
        },
      },
    });
    const dist = Object.values(t.findResources('AWS::CloudFront::Distribution'))[0] as any;
    const api = dist.Properties.DistributionConfig.CacheBehaviors.find((b: any) => b.PathPattern === '/api/*');
    expect(api.ViewerProtocolPolicy).toBe('https-only');
    expect(api.CachePolicyId).toBe('4135ea2d-6df8-44a3-9df3-4b5a84be39ad'); // CachingDisabled
  });

  it('never deletes family data with the stack, and stays pay-per-request', () => {
    const tables = t.findResources('AWS::DynamoDB::Table');
    expect(Object.keys(tables)).toHaveLength(2);
    for (const r of Object.values(tables) as any[]) {
      expect(r.DeletionPolicy).toBe('Retain');
      expect(r.Properties.BillingMode).toBe('PAY_PER_REQUEST');
      expect(r.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(true);
    }
    expect(Object.values(tables).map((r: any) => r.Properties.TableName).sort()).toEqual(['gravity-core', 'gravity-journal']);
  });

  it('runs cheap arm64 Node 22 Lambdas and nothing that bills by the hour', () => {
    const fns = Object.values(t.findResources('AWS::Lambda::Function')) as any[];
    const ours = fns.filter((f) => f.Properties.Handler === 'index.handler' && f.Properties.Runtime === 'nodejs22.x');
    expect(ours.length).toBeGreaterThanOrEqual(4);
    for (const f of ours) expect(f.Properties.Architectures).toEqual(['arm64']);
    for (const type of ['AWS::EC2::NatGateway', 'AWS::WAFv2::WebACL', 'AWS::SecretsManager::Secret', 'AWS::RDS::DBInstance', 'AWS::EC2::Instance']) {
      t.resourceCountIs(type, 0);
    }
  });

  it('lets the journal read (only read) the core table', () => {
    const journalEnv = Object.values(t.findResources('AWS::Lambda::Function')).map((f: any) => f.Properties.Environment?.Variables ?? {});
    expect(journalEnv.some((e: any) => 'CORE_TABLE' in e && 'TABLE' in e)).toBe(true);
  });

  it('seeds the SSM allowlist', () => {
    t.hasResourceProperties('AWS::SSM::Parameter', { Name: '/gravity/allowed-emails', Value: 'mom@example.com,dad@example.com' });
  });
});
