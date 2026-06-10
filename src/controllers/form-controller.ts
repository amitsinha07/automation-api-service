import { Request, Response } from "express";
import logger from "@ondc/automation-logger";
import { getLoggerMetaData } from "../utils/loggingUtils";
import { htmlFormService, callbackFormService } from "../services/form-service";

export async function htmlFormController(req: Request, res: Response) {
	try {
		logger.info("Received form submission", getLoggerMetaData(req));
		const formData = req.body;
		if (!formData || typeof formData !== "object") {
			res.status(400).send("Invalid form data");
			return;
		}
		if (
			typeof formData.transaction_id !== "string" ||
			typeof formData.subscriber_url !== "string" ||
			typeof formData.form_action_id !== "string"
		) {
			logger.error("Invalid form submission", getLoggerMetaData(req), {
				formData,
			});
			res.status(400).send(
				`Missing required form fields: transaction_id, subscriber_url, or form_action_id
                should be strings`
			);
			return;
		}
		logger.info("formDataaa", formData);
		await htmlFormService(
			formData.transaction_id,
			formData.subscriber_url,
			formData.form_action_id,
			getLoggerMetaData(req),
			formData.form_type,
			formData.submissionId,
			formData.error
		);
		res.status(200).send("Form submitted successfully");
	} catch (error) {
		logger.error(
			"Error processing form submission",
			getLoggerMetaData(req),
			error
		);
		res.status(500).send("Internal Server Error");
	}
}

export async function callbackController(req: Request, res: Response) {
	try {
		const { transaction_id, success, message, form_id } = req.body ?? {};

		logger.info("Callback received", getLoggerMetaData(req), {
			transaction_id,
			success,
			message,
			form_id,
		});

		if (!transaction_id || !form_id) {
			res.status(400).json({
				success: false,
				message: "Missing required fields: transaction_id and form_id",
			});
			return;
		}

		// success may arrive as a boolean or the strings "true"/"false"
		const normalizedSuccess = success === true || success === "true";

		await callbackFormService(
			transaction_id,
			form_id,
			normalizedSuccess,
			message,
			getLoggerMetaData(req)
		);

		res.status(200).json({
			success: true,
			message: "Callback received and recorded",
			transaction_id,
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		logger.error("Error in callback", getLoggerMetaData(req), error);
		res.status(500).json({
			success: false,
			message: `Error processing callback: ${error.message}`,
		});
	}
}
