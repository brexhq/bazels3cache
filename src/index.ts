import * as fs from "fs";
import * as child_process from "child_process";
import * as http from "http";
import * as https from "https";
import * as AWS from "aws-sdk";
import * as debug_ from "debug";
import * as minimist from "minimist";
import * as winston from "winston";
import { Args, Config, getConfig, validateConfig } from "./config";
import { Cache } from "./memorycache";
import { debug } from "./debug";
import { startServer } from "./server";
import { initLogging } from "./logging";

function fatalError(error: string) {
    console.error(`bazels3cache: ${error}`); // the user should see this
    winston.error(error);                    // this goes to the log
    process.exit(1);
}

function main(args: Args) {
    process.on("uncaughtException", function (err) {
        fatalError("" + err);
        process.exit(1); // hard stop; can't rely on just process.exitCode
    });

    const config = getConfig(args);
    initLogging(config); // Do this early, because when logging doesn't work, we're flying blind
    validateConfig(config); // throws if config is invalid

    const chain = new AWS.CredentialProviderChain(null);
    chain.resolvePromise()
        .then(credentials => {
            AWS.config.update({
                httpOptions: {
                    agent: new https.Agent({
                        keepAlive: true,
                        keepAliveMsecs: 60000
                    })
                },
                credentials: credentials
            });
            return new AWS.S3({
                apiVersion: "2006-03-01",
                credentials: credentials
            });
        })
        .catch((err: AWS.AWSError) => {
            const message = `Could not resolve AWS credentials: ${err.message}`;
            return fatalError(message);
        })
        .then((s3: AWS.S3) => {
            if (s3) {
                return startServer(s3, config);
            }
        })
        .catch(err => {
            const message = err.message || "" + err;
            return fatalError(message);
        })
}

main(minimist<Args>(process.argv.slice(2)));
