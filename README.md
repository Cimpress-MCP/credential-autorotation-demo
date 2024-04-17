# credential-autorotation-demo

This repo demonstrates how to build an application that works with auto-rotating credentials.  This requires two primary changes:

 1. Enabling auto-rotation via Secrets Manager and deploying a lambda to perform the rotation.
 2. Adjusting the application to fetch/cache/re-fetch secrets from secrets manager rather than the environment.

# Motivation

The key goal here is to have the application fetch credentials directly from the secrets manager.  In doing so, you implicitly de-couple the lifecycle of your secrets from the lifecycle of your application, making automatic rotation possible.  In addition you end up with applications that bootstrap themselves, which makes it easier to run applications in new environments.  After all, if your application can fetch it's own secrets, then you no longer have to copy and paste secrets somewhere new to run your application in a new environment.  The next time a new teammate needs to run your application locally, you just grant them access to the secrets manager, and the application can use their access to fetch secrets and launch itself.  It saves you time in the long run and reduces the risk of breaking applications when it's time to rotate credentials!

# Conceptual Overview

This application builds a simple API endpoint (using a Lambda) that makes an API call to a 3rd party application (the AWS Source of Truth API) and returns some data from the response.  To make this API call, it fetches auto-rotating credentials from Secrets Manager (specifically, an Auth0 client id and client secret), exchanges those for a JWT, and then uses the JWT to make the call.  The JWT and the Auth0 client credentials are both cached in memory and automatically refreshed as needed.  Since JWTs cannot be revoked, the JWT is refreshed based on age (before it expires).

For the Auth0 credentials, there is no way to know a-priori when they will expire.  Even if you could time it around expected rotations (which would generally be a dangerous approach), you still can't account for ad-hoc rotations which might happen for a variety of reasons.  Thus, we fetch new Auth0 credentials from Secrets Manager anytime we use them to fetch a JWT and receive an authentication failure.  In short, if we use the Auth0 credentials and a call fails, we assume that they have been rotated, fetch a new set of credentials from Secrets Manager, and then retry our call with the new credentials.  As a result of this change, we can safely rotate the credentials at anytime without having to worry about interrupting any in-flight requests or restarting the application.  Credential rotation becomes a safe activity that can be fully automated and executed whenever you need to without worries of interrupting production.

The alternate strategy is usually to load secrets out of the environment, but this means that you can't rotate secrets without re-launching your application, which makes it much more difficult to automate credential rotation.

# Application Design

This demo uses [AWS SAM](https://aws.amazon.com/serverless/sam/) to deploy all the necessary components for the demo:

 1. A secret in secrets manager
 2. A KMS to encrypt the secret
 3. [The platform rotator](https://github.com/Cimpress-MCP/Platform-Client-Secret-Rotator), a ready-to-go serverless application that can rotate Auth0 credentials.
 4. The lambda with an implicit API Gateway to make it available to the world
 5. A small node application that handles caching and calls a 3rd party service.

# Launching the demo

 1. Install AWS SAM and the AWS CLI
 2. Get CLI access to the AWS account you want to deploy to
 3. Edit `template.yaml` and but your Auth0 client id on line 48
 4. `sam build --region [aws-region]`
 5. `sam deploy`
 6. Login into the AWS console (UI) and find your secret in AWS secrets manager. Edit it, and copy and paste the client secret for the Auth0 M2M client.  Save!
 7. The deploy step will have spit out a URL.  Hit that with curl/postman/whatever to execute it.  It should spit back a simple string:
 8. In the AWS console, find your secret again, go to the Rotation tab, and hit "Rotate secret immediately".  Your secret should rotate!
 9. Hit the lambda URL with curl/postman/whatever again, and the application still works!

```
{"message": "aws-devinfosec"}
```

And you're done!
