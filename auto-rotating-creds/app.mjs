import axios from "axios";

import JwtProvider from './JwtProvider.mjs';

/*
 * Anything declared outside of the lambda handler function will be cached by the Lambda invocation between calls.
 * There are lots of ways to make use of this in practice, but with JavaScript what we'll do is declare our
 * authentication manager as a class which we instantiate directly in our app.js file, outside of the lambda handler.
 * The lambda handler will then make use of the instance in question and/or pass it along to other function as needed.
 *
 * Of course, if you're not operating in a serverless-environment, then you would just have to adapt this for
 * whatever the caching strategy is in your system/architecture.
 */
const jwtProvider = new JwtProvider();

export const lambdaHandler = async (event, context) => {
    const jwt = await jwtProvider.getJwt();

    const response = await axios.get(
        'https://api.cork.cimpress.cloud/sot/v2/accounts/480437182633',
        {
            headers: {
                accept: "application/json",
                authorization: `Bearer ${jwt}`,
            }
        }
    )

    return {
        'statusCode': 200,
        'body': JSON.stringify({
            message: response.data.accountName,
        })
    }
};
