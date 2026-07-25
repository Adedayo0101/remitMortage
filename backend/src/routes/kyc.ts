import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import logger from "../utils/logger.js";
import { loadConfig } from "../config.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { encryptKycUpload, KycUploadRequest } from "../middleware/kycEncryption.js";
import { storeEncryptedDocument, getEncryptedDocument } from "../services/kycStorage.js";
import { decryptBuffer } from "../services/kmsEncryption.js";
import { issueKycAccessToken, verifyKycAccessToken } from "../services/kycAccessToken.js";

export const kycRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
const uploadSingle = upload.single("document");

const ALLOWED_KYC_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** Gates operator-only endpoints (token issuance, decryption) behind the shared admin API key. */
function requireOperatorKey(req: Request, res: Response, next: NextFunction) {
  const config = loadConfig();
  const key = req.headers["x-admin-api-key"];
  if (!key || key !== config.adminApiKey) {
    res.status(401).json({ error: "unauthorized", message: "Valid operator API key required" });
    return;
  }
  next();
}

/**
 * @openapi
 * /api/kyc/{address}/upload:
 *   post:
 *     summary: Upload a borrower KYC document
 *     description: >-
 *       Accepts a multipart KYC document (passport, payroll stub, credit
 *       rating, etc.), envelope-encrypts it in-memory before it ever touches
 *       storage, and persists only the ciphertext to the private document
 *       bucket. The caller must be authenticated as the borrower whose
 *       address is in the path.
 *     tags:
 *       - KYC
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Document encrypted and stored.
 *       400:
 *         description: Missing file, oversized file, or unsupported file type.
 *       403:
 *         description: Authenticated wallet does not match the path address.
 */
kycRouter.post(
  "/:address/upload",
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    uploadSingle(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({
            error: "file_too_large",
            message: "KYC document exceeds the 10MB limit.",
          });
          return;
        }
        res.status(400).json({ error: "upload_failed", message: err.message });
        return;
      } else if (err) {
        res.status(500).json({ error: "upload_failed", message: err.message });
        return;
      }
      next();
    });
  },
  encryptKycUpload,
  async (req: AuthenticatedRequest & KycUploadRequest, res: Response) => {
    try {
      const address = String(req.params.address);
      if (req.user?.walletAddress !== address) {
        res.status(403).json({
          error: "forbidden",
          message: "You may only upload documents for your own address.",
        });
        return;
      }
      if (!req.file || !req.kycEnvelope) {
        res.status(400).json({
          error: "missing_file",
          message: "No document was uploaded. Please attach a file to the request.",
        });
        return;
      }
      if (!ALLOWED_KYC_MIME_TYPES.includes(req.file.mimetype)) {
        res.status(400).json({
          error: "invalid_file_type",
          message: "Only PDF, JPEG, and PNG documents are accepted.",
        });
        return;
      }

      const record = await storeEncryptedDocument(
        address,
        req.file.originalname,
        req.file.mimetype,
        req.kycEnvelope
      );

      res.status(201).json({ documentId: record.documentId, uploadedAt: record.uploadedAt });
    } catch (error) {
      logger.error("[KYC] Upload error", { error });
      res.status(500).json({
        error: "upload_failed",
        message: (error as Error).message || "Failed to store KYC document.",
      });
    }
  }
);

/**
 * @openapi
 * /api/kyc/access-token:
 *   post:
 *     summary: Issue a temporary decryption token for a KYC document
 *     description: Operator-only. Issues a short-lived, single-document IAM-style token.
 *     tags:
 *       - KYC
 *     responses:
 *       200:
 *         description: Temporary access token issued.
 *       401:
 *         description: Missing or invalid operator API key.
 *       404:
 *         description: Document not found.
 */
kycRouter.post("/access-token", requireOperatorKey, async (req: Request, res: Response) => {
  const { documentId, operatorId } = req.body ?? {};
  if (!documentId || !operatorId) {
    res.status(400).json({
      error: "missing_field",
      message: "documentId and operatorId are required",
    });
    return;
  }

  const record = await getEncryptedDocument(String(documentId));
  if (!record) {
    res.status(404).json({ error: "document_not_found" });
    return;
  }

  const { token, expiresIn } = issueKycAccessToken(String(operatorId), String(documentId));
  res.json({ token, expiresIn });
});

/**
 * @openapi
 * /api/kyc/{documentId}/decrypt:
 *   get:
 *     summary: Decrypt a stored KYC document
 *     description: >-
 *       Operator-only. Requires a temporary access token (issued via
 *       POST /api/kyc/access-token) scoped to this exact document.
 *     tags:
 *       - KYC
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Decrypted document streamed back.
 *       401:
 *         description: Missing operator key or missing/invalid/expired access token.
 *       404:
 *         description: Document not found.
 */
kycRouter.get("/:documentId/decrypt", requireOperatorKey, async (req: Request, res: Response) => {
  const documentId = String(req.params.documentId);
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Temporary access token required" });
    return;
  }

  try {
    verifyKycAccessToken(token, documentId);
  } catch {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired access token" });
    return;
  }

  try {
    const record = await getEncryptedDocument(documentId);
    if (!record) {
      res.status(404).json({ error: "document_not_found" });
      return;
    }

    const plaintext = decryptBuffer(record.envelope);
    res.setHeader("Content-Type", record.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${record.originalName}"`);
    res.send(plaintext);
  } catch (error) {
    logger.error("[KYC] Decrypt error", { error, documentId });
    res.status(500).json({
      error: "decrypt_failed",
      message: (error as Error).message || "Failed to decrypt KYC document.",
    });
  }
});
