import axios from "axios";

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export default class JwtProvider {
    constructor() {
        this.jwt = null;
        this.jwtExpiration = null;
        this.clientId = null;
        this.clientSecret = null;

        /*
         * CloudFormation took the path to the secret (in Secrets Manager) and stored that in an environment variable,
         * so let's go ahead and pull that out now.
        */
        this.auth0SecretName = process.env.auth0SecretName;
    }

    async getAuth0Credentials(refresh) {
        /*
         * This is our function that is responsible for talking to secrets manager to fetch the client id/client secret.
         *
         * Unlike with JWTs, we can't keep track of when the client secret "expires" because they don't have a fixed lifetime,
         * and could potentially be revoked at anytime.  Therefore, cache invalidation happens when a downstream function
         * has an authentication failure while trying to use the client id and client secret - it will ask us to refresh
         * the credentials, and so we'll invalidate the cache then.
         *
         * For more details though, since we're caching the JWT itself (and those usually live for at least a few hours), we
         * could completely skip the cache of the auth0 credentials and just fetch them new from Secrets Manager everytime
         * we needed a new JWT.  However, I'm leaving in the caching to give an idea of strategies for cache invalidation
         * (e.g. when a call to a remote server fails), since caching is likely to be required for other services.
         */
        if (!refresh && this.clientId && this.clientSecret) {
            console.log("Returning Auth0 credentials from cache");
            return {clientId: this.clientId, clientSecret: this.clientSecret}
        }
        const client = new SecretsManagerClient();

        console.log("Fetching auth0 credentials from Secrets Manager");
        const response = await client.send(
            new GetSecretValueCommand({SecretId: this.auth0SecretName}),
        );

        // check and unpack our Auth0 credentials
        const auth0Credentials = JSON.parse(response.SecretString);
        if (!auth0Credentials.id) {
            throw Error(`I fetched ${auth0SecretName} from Auth0 but it didn't contain 'id'.  I really need that.`)
        }
        if (!auth0Credentials.secret) {
            throw Error(`I fetched ${auth0SecretName} from Auth0 but it didn't contain 'secret'.  I really need that.`)
        }

        this.clientId = auth0Credentials.id;
        this.clientSecret = auth0Credentials.secret;
        return {clientId: this.clientId, clientSecret: this.clientSecret}
    }

    async getJwt(refresh) {
        /*
         * Fetches a JWT from OCI!
         *
         * We'll first fetch the client credentials via the getAuth0Credentials function and then use those to call
         * OCI and request a JWT.  If our call to OCI fails then we'll assume our cached credentials are no longer
         * valid.  Hence, we'll ask for a new set of client credentials from getAuth0Credentials and try the call
         * to OCI again.
         */
        if (this.jwt && this.jwtExpiration > new Date()) {
            console.log("Returning JWT from cache");
            return this.jwt;
        }

        const clientCredentials = await this.getAuth0Credentials();
        console.log("fetching JWT from OCI");

        let response;
        try {
            response = await axios.post(
                "https://oauth.cimpress.io/v2/token",
                {
                    "grant_type": "client_credentials",
                    "client_id": clientCredentials.clientId,
                    "client_secret": clientCredentials.clientSecret,
                    "audience": "https://api.cimpress.io/",
                }
            )
        } catch (error) {
            /*
             * I could be smart and look more carefully at the error message, but in general if this fails
             * I'm just going to assume that my credentials are invalid and I need to get new credentials from
             * SecretsManager and try again.  Of course, we only want to retry once or we'll end up in an
             * endless loop.
             */
            if (!refresh) {
                console.log(`Call to OCI failed with ${error}, retrying`);
                return getJwt(true);
            } else {
                throw error;
            }
        }

        this.jwt = response.data.access_token;
        this.jwtExpiration = new Date();
        // subtract 100 seconds from our JWT life to add some buffer
        this.jwtExpiration.setSeconds(this.jwtExpiration.getSeconds() + (response.data.expires_in-100));
        return this.jwt;
    }
}
