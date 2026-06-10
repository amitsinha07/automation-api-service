import { TransactionCacheService } from "./session-service-rewrite";
import logger from "@ondc/automation-logger";
import { RedisService } from "ondc-automation-cache-lib";
export async function htmlFormService(
	transactionId: string,
	subscriberUrl: string,
	formId: string,
	loggerMeta: any,
	formType: "HTML_FORM" | "DYNAMIC_FORM",
	submissionId?: string,
	error?: any

) {
	logger.info("Processing form submission", loggerMeta, {
		transactionId,
		subscriberUrl,
		submissionId,
		formId,
		formType

	});
	const transactService = new TransactionCacheService();
	const transactionData = await transactService.tryLoadTransaction(
		transactionId,
		subscriberUrl
	);
	if (!transactionData) {
		throw new Error("Transaction data not found");
	}
	transactionData.apiList.push({
		entryType: "FORM",
		formId: formId,
		submissionId: submissionId,
		error: error,
		timestamp: new Date().toISOString(),
		formType
	});
	await transactService.overrideTransaction(
		subscriberUrl,
		transactionId,
		transactionData
	);
	logger.info("transactionData=>>>>>>>>>>>", transactionData);
	logger.info("HTML form submission processed successfully", loggerMeta, {
		transactionId,
		subscriberUrl,
		submissionId,
		formId,
	});
}

// Key prefixes and TTL form a cross-service contract with the
// automation-frontend backend's checkFormCompletion poller — keep in sync.
const FORM_COMPLETED_PREFIX = "form_completed";
const LATEST_FORM_PREFIX = "latest_form";
const FORM_COMPLETION_TTL_SECONDS = 3600;

export async function callbackFormService(
	transaction_id: string,
	form_id: string,
	success: boolean | string,
	message: string,
	loggerMeta: any
): Promise<void> {
	const completionKey = `${FORM_COMPLETED_PREFIX}:${transaction_id}:${form_id}`;
	const pointerKey = `${LATEST_FORM_PREFIX}:${transaction_id}`;
	// Completion data must be written before the pointer so that a pointer
	// read by the poller always references existing data.
	await RedisService.setKey(
		completionKey,
		JSON.stringify({
			completed: true,
			form_id,
			success: success ?? false,
			message: message ?? "",
			timestamp: new Date().toISOString(),
		}),
		FORM_COMPLETION_TTL_SECONDS
	);
	await RedisService.setKey(pointerKey, form_id, FORM_COMPLETION_TTL_SECONDS);
	logger.info("Completion flag set in Redis", loggerMeta, {
		transaction_id,
		form_id,
		completionKey,
		pointerKey,
	});
}
