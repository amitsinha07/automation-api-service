import express, { NextFunction, Response } from "express";
import { ValidationController } from "../controllers/validation-controller";
import { CommunicationController } from "../controllers/communication-controller";
import { DataController } from "../controllers/data-controller";
import logger from "@ondc/automation-logger";
import { v4 as uuidV4 } from "uuid";
import { SessionController } from "../controllers/session-controller";
import { ApiServiceRequest } from "../types/request-types";
import { TransactionCacheService } from "../services/session-service-rewrite";
import otelTracing from "../services/tracing-service";
import { getL1Key, getLoggerMetaData } from "../utils/loggingUtils";
import { sendLogsToNo } from "../services/No-service";
import { l1ValidationsStore } from "../models/storage-interface-implementations";
import { performL1validationsSave } from "../validations/L1-validations";
import { callbackController } from "../controllers/form-controller";

const router = express();
// router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const validationController = new ValidationController();
const commController = new CommunicationController();
const dbController = new DataController();
const sessionController = new SessionController();

// GET /{base}/buyer/callback
// Derives its own subscriberUrl, looks up the stored workbench URL, writes
// form_completed:{sessionId}, and 302-redirects the browser back.
router.get("/callback", callbackController);

router.post(
    "/:action",
    otelTracing(
        "body.context.transaction_id",
        "body.session_id",
        "body.context.bap_id",
        "body.context.bpp_id",
    ),
    validationController.validateRequestBodyNp,
    sessionController.receiveNewRequestFromNp,
    sessionController.createTransaction,
    modifyExpressSend,
    validationController.validateSignatureNp,
    validationController.validateL0,
    validationController.validateL1,
    validationController.validateL1Custom,
    validationController.validateContextFromNp,
    commController.forwardToMockServer,
);

function modifyExpressSend(
    req: ApiServiceRequest,
    res: Response,
    next: NextFunction,
) {
    if (!res.locals.isSendWrapped) {
        res.locals.isSendWrapped = true; // Flag to indicate the wrapping is done
        const originalSend = res.send;
        res.send = function (body) {
            if (!res.locals.isCacheUpdated) {
                res.locals.isCacheUpdated = true; // Flag to ensure cache update happens only once
                const statusCode = res.statusCode;
                const payloadID = uuidV4();
                new TransactionCacheService().updateTransactionCache(
                    payloadID,
                    req.body,
                    body,
                    req?.requestProperties?.subscriberUrl,
                );

                const action =
                    req.requestProperties?.action || "unknown_action";
                try {
                    dbController.savePayloadInDb(
                        req,
                        body,
                        false,
                        statusCode,
                        payloadID,
                    );
                    performL1validationsSave(
                        action,
                        getL1Key(req),
                        req.body,
                        l1ValidationsStore,
                    ).catch((err) => {
                        logger.error(
                            "Error in performing L1 validations save",
                            getLoggerMetaData(req),
                            err as Error,
                        );
                    });
                    sendLogsToNo(req, body);
                    logger.info(
                        "Now responding back to the client",
                        getLoggerMetaData(req),
                        {
                            response: body,
                            code: statusCode,
                        },
                    );
                } catch (err) {
                    logger.error(
                        "Error in saving payload or sending logs to NO",
                        getLoggerMetaData(req),
                        err as Error,
                    );
                }
            }
            return originalSend.call(this, body); // Call the original send method
        };
    }
    next();
}

export default router;
