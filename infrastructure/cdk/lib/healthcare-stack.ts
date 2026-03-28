import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

export class HealthcareAiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------
    // 1. S3 Bucket for healthcare files (PDFs, WAVs)
    // ---------------------------------------------------------------
    const dataBucket = new s3.Bucket(this, "HealthcareDataBucket", {
      bucketName: `healthcare-ai-demo-${this.account}`,
      eventBridgeEnabled: true,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---------------------------------------------------------------
    // 2. SNS Topic for file notifications
    // ---------------------------------------------------------------
    const fileTopic = new sns.Topic(this, "FileNotificationTopic", {
      topicName: "healthcare-file-notifications",
      displayName: "Healthcare File Notifications",
    });

    // ---------------------------------------------------------------
    // 3. EventBridge Rule: S3 Object Created -> SNS
    // ---------------------------------------------------------------
    new events.Rule(this, "S3ObjectCreatedRule", {
      ruleName: "healthcare-s3-file-created",
      description: "Route S3 object creation events to SNS for processing",
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [dataBucket.bucketName] },
          object: {
            key: [{ prefix: "documents/" }, { prefix: "audio/" }],
          },
        },
      },
      targets: [new eventsTargets.SnsTopic(fileTopic)],
    });

    // ---------------------------------------------------------------
    // 4. Secrets Manager - Snowflake credentials
    // ---------------------------------------------------------------
    // These secrets should be created manually with actual values
    const snowflakePrivateKey = new secretsmanager.Secret(
      this,
      "SnowflakePrivateKey",
      {
        secretName: "healthcare-ai/snowflake-private-key",
        description: "RSA private key for Snowflake key-pair auth",
      }
    );

    const snowflakePat = new secretsmanager.Secret(this, "SnowflakePAT", {
      secretName: "healthcare-ai/snowflake-pat",
      description: "Snowflake Programmatic Access Token for Cortex Agent API",
    });

    // ---------------------------------------------------------------
    // 5. Lambda: File Processor (SNS -> Snowflake)
    // ---------------------------------------------------------------
    const fileProcessorLambda = new lambda.Function(
      this,
      "FileProcessorLambda",
      {
        functionName: "healthcare-file-processor",
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "handler.lambda_handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/file-processor"),
          {
            bundling: {
              image: lambda.Runtime.PYTHON_3_12.bundlingImage,
              command: [
                "bash",
                "-c",
                "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output",
              ],
            },
          }
        ),
        timeout: cdk.Duration.minutes(5),
        memorySize: 256,
        environment: {
          SNOWFLAKE_ACCOUNT: "YOUR_ACCOUNT",  // Replace before deploy
          SNOWFLAKE_USER: "HEALTHCARE_ADMIN",
          SNOWFLAKE_PRIVATE_KEY_SECRET: snowflakePrivateKey.secretName,
          SNOWFLAKE_DATABASE: "HEALTHCARE_AI_DEMO",
          SNOWFLAKE_SCHEMA: "CORE",
          SNOWFLAKE_WAREHOUSE: "HEALTHCARE_AI_WH",
        },
      }
    );

    snowflakePrivateKey.grantRead(fileProcessorLambda);
    fileTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(fileProcessorLambda)
    );

    // ---------------------------------------------------------------
    // 6. Cognito User Pool
    // ---------------------------------------------------------------
    const userPool = new cognito.UserPool(this, "HealthcareUserPool", {
      userPoolName: "healthcare-ai-users",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient("HealthcareAppClient", {
      userPoolClientName: "healthcare-web-app",
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          "http://localhost:5173/callback",
          "http://localhost:5173/",
        ],
        logoutUrls: [
          "http://localhost:5173/",
        ],
      },
    });

    const userPoolDomain = userPool.addDomain("HealthcareDomain", {
      cognitoDomain: {
        domainPrefix: `healthcare-ai-${this.account}`,
      },
    });

    // ---------------------------------------------------------------
    // 7. Lambda: API Proxy (API Gateway -> Cortex Agent)
    // ---------------------------------------------------------------
    const apiProxyLambda = new lambda.Function(this, "ApiProxyLambda", {
      functionName: "healthcare-api-proxy",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../lambda/api-proxy"),
        {
          bundling: {
            image: lambda.Runtime.PYTHON_3_12.bundlingImage,
            command: [
              "bash",
              "-c",
              "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output",
            ],
          },
        }
      ),
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      environment: {
        SNOWFLAKE_ACCOUNT: "YOUR_ACCOUNT",  // Replace before deploy
        SNOWFLAKE_PAT_SECRET: snowflakePat.secretName,
        SNOWFLAKE_DATABASE: "HEALTHCARE_AI_DEMO",
        SNOWFLAKE_SCHEMA: "CORE",
        SNOWFLAKE_AGENT_NAME: "HEALTHCARE_ASSISTANT",
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_REGION: this.region,
      },
    });

    snowflakePat.grantRead(apiProxyLambda);

    // ---------------------------------------------------------------
    // 8. Lambda: Presigned URL Generator
    // ---------------------------------------------------------------
    const presignedUrlLambda = new lambda.Function(
      this,
      "PresignedUrlLambda",
      {
        functionName: "healthcare-presigned-url",
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "index.handler",
        code: lambda.Code.fromInline(`
import json
import boto3
import os
import uuid

s3_client = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]

def handler(event, context):
    body = json.loads(event.get("body", "{}"))
    file_name = body.get("fileName", "unknown")
    file_type = body.get("fileType", "pdf")

    # Route to the appropriate prefix
    prefix = "documents" if file_type in ("pdf", "docx", "png", "jpg") else "audio"
    key = f"{prefix}/{uuid.uuid4().hex[:8]}_{file_name}"

    url = s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key},
        ExpiresIn=300,
    )

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps({"uploadUrl": url, "key": key}),
    }
`),
        timeout: cdk.Duration.seconds(10),
        environment: { BUCKET_NAME: dataBucket.bucketName },
      }
    );

    dataBucket.grantPut(presignedUrlLambda);

    // ---------------------------------------------------------------
    // 9. API Gateway
    // ---------------------------------------------------------------
    const api = new apigateway.RestApi(this, "HealthcareApi", {
      restApiName: "healthcare-ai-api",
      description: "Healthcare AI Demo API",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Amz-Date",
          "X-Api-Key",
        ],
      },
    });

    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      {
        cognitoUserPools: [userPool],
        authorizerName: "healthcare-cognito-auth",
      }
    );

    // POST /agent/query
    const agentResource = api.root.addResource("agent").addResource("query");
    agentResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(apiProxyLambda),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // POST /upload/presigned
    const uploadResource = api.root
      .addResource("upload")
      .addResource("presigned");
    uploadResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(presignedUrlLambda),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // ---------------------------------------------------------------
    // 10. S3 Bucket for Frontend Static Hosting
    // ---------------------------------------------------------------
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `healthcare-ai-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---------------------------------------------------------------
    // 11. CloudFront Distribution
    // ---------------------------------------------------------------
    const oai = new cloudfront.OriginAccessIdentity(this, "FrontendOAI", {
      comment: "Healthcare AI Frontend",
    });
    frontendBucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(
      this,
      "FrontendDistribution",
      {
        defaultBehavior: {
          origin: new cloudfrontOrigins.S3Origin(frontendBucket, {
            originAccessIdentity: oai,
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.minutes(5),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.minutes(5),
          },
        ],
      }
    );

    // ---------------------------------------------------------------
    // Stack Outputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, "DataBucketName", {
      value: dataBucket.bucketName,
      description: "S3 bucket for healthcare files",
    });
    new cdk.CfnOutput(this, "FrontendBucketName", {
      value: frontendBucket.bucketName,
      description: "S3 bucket for frontend static files",
    });
    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront URL for the frontend",
    });
    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: api.url,
      description: "API Gateway base URL",
    });
    new cdk.CfnOutput(this, "CognitoUserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });
    new cdk.CfnOutput(this, "CognitoAppClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito App Client ID",
    });
    new cdk.CfnOutput(this, "CognitoDomain", {
      value: userPoolDomain.domainName,
      description: "Cognito domain prefix",
    });
  }
}
