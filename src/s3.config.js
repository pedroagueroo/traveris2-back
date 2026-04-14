// ============================================================================
// S3 CONFIG — AWS S3 Client + Multer-S3 upload (with local fallback)
// ============================================================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

let uploadFactory;

try {
  const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const multerS3 = require('multer-s3');
  const { v4: uuidv4 } = require('uuid');

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

  uploadFactory = function crearUpload(carpeta) {
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
  };

  async function eliminarDeS3(key) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      console.log(`🗑️ Archivo eliminado de S3: ${key}`);
    } catch (err) {
      console.error(`❌ Error eliminando de S3: ${key}`, err);
    }
  }

  module.exports = { s3, BUCKET, crearUpload: uploadFactory, eliminarDeS3 };

} catch (err) {
  // Fallback to local storage if S3 deps aren't available
  console.log('⚠️ S3 no disponible, usando almacenamiento local');

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  uploadFactory = function crearUpload(carpeta) {
    const dir = path.join(uploadsDir, carpeta);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    return multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, dir),
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          cb(null, `${Date.now()}-${Math.random().toString(36).substr(2,9)}${ext}`);
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 }
    });
  };

  module.exports = {
    s3: null,
    BUCKET: null,
    crearUpload: uploadFactory,
    eliminarDeS3: async () => {}
  };
}
