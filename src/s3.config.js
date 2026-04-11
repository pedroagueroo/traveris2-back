// ============================================================================
// S3 CONFIG — AWS S3 Client + Multer-S3 upload
// ============================================================================
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'sa-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET = process.env.AWS_S3_BUCKET || 'traveris-archivos-test';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIMETYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

/**
 * Crea un middleware multer configurado para S3
 * @param {string} carpeta - Subcarpeta en S3 (ej: 'clientes', 'reservas', 'logos')
 */
function crearUpload(carpeta) {
  return multer({
    storage: multerS3({
      s3,
      bucket: BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const nombre = `${carpeta}/${uuidv4()}${ext}`;
        cb(null, nombre);
      }
    }),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
      }
    }
  });
}

/**
 * Elimina un archivo de S3
 * @param {string} key - Key del archivo en S3
 */
async function eliminarDeS3(key) {
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key
    }));
    console.log(`🗑️ Archivo eliminado de S3: ${key}`);
  } catch (err) {
    console.error(`❌ Error eliminando de S3: ${key}`, err);
    throw err;
  }
}

module.exports = { s3, BUCKET, crearUpload, eliminarDeS3 };
