#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { HealthcareAiStack } from "../lib/healthcare-stack";

const app = new cdk.App();

new HealthcareAiStack(app, "HealthcareAiDemo", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-west-2",
  },
  description: "Healthcare AI Demo - AWS + Snowflake Cortex AI Functions",
});
